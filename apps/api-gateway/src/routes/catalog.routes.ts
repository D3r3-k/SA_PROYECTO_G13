import { Router } from "express";
import { callCatalogMethod } from "../grpc/catalog.client";
import { requireActiveSubscription, requireStandardDownloadSubscription } from "../middleware/subscription-policy";
import { evaluateParentalControl } from "../policies/parental-control";
import {
  AuthenticatedRequest,
  authMiddleware
} from "../middleware/auth.middleware";

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


function downloadBlockedResponse(res: any, policy: { reason: string; pinRequired: boolean }) {
  return res.status(403).json({
    success: false,
    code: "PARENTAL_PIN_REQUIRED",
    message: policy.reason,
    parental_control: {
      blocked: true,
      pin_required: policy.pinRequired,
      reason: policy.reason
    }
  });
}

function downloadPayload(content: ContentCard, extra: Record<string, unknown> = {}) {
  return {
    success: true,
    message: "Descarga generada para el plan Estandar.",
    grant: {
      content_id: content.content_id,
      title: content.title,
      type: content.type,
      maturity_rating: content.maturity_rating || "ALL",
      media_url: content.media_url || "",
      media_mime_type: content.media_mime_type || "video/mp4",
      poster_path: content.poster_path || "",
      source_page_url: content.source_page_url || "",
      authorized_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      ...extra
    }
  };
}

catalogRoutes.get(
  "/:contentId/download",
  authMiddleware,
  requireStandardDownloadSubscription(),
  async (req: AuthenticatedRequest, res) => {
    try {
      const contentId = asString(req.params.contentId);
      const response = await callCatalogMethod<Record<string, string>, ContentDetailResponse>(
        "GetContentDetail",
        { content_id: contentId }
      );

      if (!response.success || !response.content) {
        return res.status(statusFromResponse(response)).json(response);
      }

      const policy = await evaluateParentalControl(req, response.content.maturity_rating || "ALL");
      if (policy.blocked) return downloadBlockedResponse(res, policy);

      if (response.content.type !== "movie") {
        return res.status(400).json({
          success: false,
          code: "EPISODE_DOWNLOAD_REQUIRED",
          message: "Las series deben descargarse episodio por episodio"
        });
      }

      if (!response.content.media_url) {
        return res.status(404).json({
          success: false,
          code: "DOWNLOAD_MEDIA_NOT_AVAILABLE",
          message: "No hay ningún video descargable disponible para este contenido"
        });
      }

      return res.json(downloadPayload(response.content));
    } catch (error) {
      console.error("Generate movie download grant failed", error);
      return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
    }
  }
);

catalogRoutes.get(
  "/:contentId/episodes/:episodeId/download",
  authMiddleware,
  requireStandardDownloadSubscription(),
  async (req: AuthenticatedRequest, res) => {
    try {
      const contentId = asString(req.params.contentId);
      const episodeId = asString(req.params.episodeId);
      const seasonNumber = asInt(req.query.season_number, 1);

      const detail = await callCatalogMethod<Record<string, string>, ContentDetailResponse>(
        "GetContentDetail",
        { content_id: contentId }
      );

      if (!detail.success || !detail.content) {
        return res.status(statusFromResponse(detail)).json(detail);
      }

      const policy = await evaluateParentalControl(req, detail.content.maturity_rating || "ALL");
      if (policy.blocked) return downloadBlockedResponse(res, policy);

      const response = await callCatalogMethod<
        { content_id: string; season_number: number },
        ListEpisodesResponse
      >("ListEpisodes", {
        content_id: contentId,
        season_number: seasonNumber
      });

      if (!response.success) {
        return res.status(statusFromResponse(response)).json(response);
      }

      const episode = (response.episodes || []).find((item) => item.episode_id === episodeId);
      if (!episode) {
        return res.status(404).json({
          success: false,
          code: "EPISODE_NOT_FOUND",
          message: "Episodio no encontrado para este contenido y temporada"
        });
      }

      if (!episode.media_url) {
        return res.status(404).json({
          success: false,
          code: "DOWNLOAD_MEDIA_NOT_AVAILABLE",
          message: "No hay ningún video descargable disponible para este episodio"
        });
      }

      return res.json(downloadPayload(detail.content, {
        media_url: episode.media_url,
        media_mime_type: episode.media_mime_type || "video/mp4",
        episode: {
          episode_id: episode.episode_id,
          season_number: episode.season_number,
          episode_number: episode.episode_number,
          title: episode.title,
          runtime_minutes: episode.runtime_minutes
        }
      }));
    } catch (error) {
      console.error("Generate episode download grant failed", error);
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

      const policy = await evaluateParentalControl(
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

      const policy = await evaluateParentalControl(
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
