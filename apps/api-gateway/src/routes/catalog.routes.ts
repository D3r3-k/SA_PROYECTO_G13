import { Router } from "express";
import { callCatalogMethod } from "../grpc/catalog.client";
import { callIdentityMethod } from "../grpc/identity.client";
import {
  AuthenticatedRequest,
  authMiddleware
} from "../middleware/auth.middleware";
import { requireActiveSubscription } from "../middleware/subscription-policy";

export const catalogRoutes = Router();

type BasicResponse = {
  success: boolean;
  message: string;
};

type ContentCard = {
  content_id: string;
  external_id: string;
  type: string;
  maturity_rating?: string;
  title: string;
  overview: string;
  poster_path: string;
  release_date: string;
  genres?: Array<{ name: string }>;
  media_url?: string;
  media_mime_type?: string;
  source_page_url?: string;
  seasons_count?: number;
  episodes_count?: number;
  available_from?: string;
  deleted_at?: string;
};

type ContentDetailResponse = BasicResponse & {
  content?: ContentCard;
  cast?: unknown[];
  seasons_count?: number;
  episodes_count?: number;
};

type Episode = {
  episode_id: string;
  content_id: string;
  season_number: number;
  episode_number: number;
  title: string;
  overview: string;
  runtime_minutes: number;
  media_url?: string;
  media_mime_type?: string;
};

type ListEpisodesResponse = BasicResponse & {
  episodes: Episode[];
};

type VerifyParentalPinResponse = {
  success: boolean;
  message: string;
};

function asString(value: unknown): string {
  if (Array.isArray(value)) {
    return String(value[0] || "");
  }
  return String(value || "");
}

function asInt(value: unknown, fallback: number): number {
  const parsed = Number(asString(value));
  return Number.isInteger(parsed) ? parsed : fallback;
}

function statusFromResponse(response: BasicResponse): number {
  const message = String(response.message || "").toLowerCase();
  if (message.includes("not found")) return 404;
  if (message.includes("required") || message.includes("invalid")) return 400;
  return 400;
}

function normalizeRating(value: string | undefined): string {
  const normalized = String(value || "ALL").trim().toUpperCase().replace("-", "_");
  if (["PG13", "PG_13"].includes(normalized)) return "PG_13";
  if (normalized === "R") return "R";
  return "ALL";
}

function pinFromRequest(req: AuthenticatedRequest): string {
  const header = asString(req.headers["x-parental-pin"]);
  const query = asString(req.query.parental_pin);
  const body = req.body as Record<string, unknown> | undefined;
  return (header || query || asString(body?.parental_pin)).trim();
}

async function canUnlockParentalContent(
  req: AuthenticatedRequest,
  maturityRating: string
): Promise<{ blocked: boolean; reason: string; pinRequired: boolean }> {
  const rating = normalizeRating(maturityRating);

  if (!req.user?.profile_is_child || rating === "ALL") {
    return { blocked: false, reason: "", pinRequired: false };
  }

  const pin = pinFromRequest(req);

  if (!pin) {
    return {
      blocked: true,
      reason: `Content rated ${rating} requires the parental PIN for child profiles`,
      pinRequired: true
    };
  }

  const response = await callIdentityMethod<
    { user_id: string; profile_id: string; pin: string },
    VerifyParentalPinResponse
  >("VerifyParentalPin", {
    user_id: req.user.user_id,
    profile_id: req.user.profile_id,
    pin
  });

  if (!response.success) {
    return {
      blocked: true,
      reason: response.message || "Invalid parental PIN",
      pinRequired: true
    };
  }

  return { blocked: false, reason: "", pinRequired: false };
}

function stripPlaybackUrl(content?: ContentCard): ContentCard | undefined {
  if (!content) return content;
  return {
    ...content,
    media_url: ""
  };
}

function stripEpisodePlaybackUrls(episodes: Episode[]): Episode[] {
  return episodes.map((episode) => ({
    ...episode,
    media_url: ""
  }));
}

catalogRoutes.get(
  "/",
  authMiddleware,
  requireActiveSubscription(),
  async (req: AuthenticatedRequest, res) => {
    try {
      const response = await callCatalogMethod("ListContent", {
        type: asString(req.query.type),
        genre: asString(req.query.genre),
        limit: 100,
        offset: 0
      });
      return res.json(response);
    } catch (error) {
      console.error("List catalog gRPC failed", error);
      return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
    }
  }
);

catalogRoutes.get(
  "/search",
  authMiddleware,
  requireActiveSubscription(),
  async (req: AuthenticatedRequest, res) => {
    try {
      const response = await callCatalogMethod("SearchContent", {
        query: asString(req.query.q || req.query.query),
        type: asString(req.query.type),
        genre: asString(req.query.genre),
        limit: asInt(req.query.limit, 20),
        offset: asInt(req.query.offset, 0)
      });
      return res.json(response);
    } catch (error) {
      console.error("Search catalog gRPC failed", error);
      return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
    }
  }
);

catalogRoutes.get(
  "/:contentId",
  authMiddleware,
  requireActiveSubscription(),
  async (req: AuthenticatedRequest, res) => {
    try {
      const contentId = asString(req.params.contentId);

      const response = await callCatalogMethod<Record<string, string>, ContentDetailResponse>(
        "GetContentDetail",
        { content_id: contentId }
      );

      if (!response.success) {
        return res.status(statusFromResponse(response)).json(response);
      }

      const policy = await canUnlockParentalContent(
        req,
        response.content?.maturity_rating || "ALL"
      );

      if (policy.blocked) {
        return res.json({
          ...response,
          content: stripPlaybackUrl(response.content),
          parental_control: {
            blocked: true,
            pin_required: policy.pinRequired,
            reason: policy.reason
          }
        });
      }

      return res.json({
        ...response,
        parental_control: {
          blocked: false,
          pin_required: false,
          reason: ""
        }
      });
    } catch (error) {
      console.error("Get catalog detail gRPC failed", error);
      return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
    }
  }
);

catalogRoutes.get(
  "/:contentId/episodes",
  authMiddleware,
  requireActiveSubscription(),
  async (req: AuthenticatedRequest, res) => {
    try {
      const contentId = asString(req.params.contentId);

      const detail = await callCatalogMethod<Record<string, string>, ContentDetailResponse>(
        "GetContentDetail",
        { content_id: contentId }
      );

      if (!detail.success) {
        return res.status(statusFromResponse(detail)).json(detail);
      }

      const response = await callCatalogMethod<
        { content_id: string; season_number: number },
        ListEpisodesResponse
      >("ListEpisodes", {
        content_id: contentId,
        season_number: asInt(req.query.season_number, 1)
      });

      const policy = await canUnlockParentalContent(
        req,
        detail.content?.maturity_rating || "ALL"
      );

      if (policy.blocked) {
        return res.json({
          ...response,
          episodes: stripEpisodePlaybackUrls(response.episodes || []),
          parental_control: {
            blocked: true,
            pin_required: policy.pinRequired,
            reason: policy.reason
          }
        });
      }

      return res.json({
        ...response,
        parental_control: {
          blocked: false,
          pin_required: false,
          reason: ""
        }
      });
    } catch (error) {
      console.error("List episodes gRPC failed", error);
      return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
    }
  }
);
