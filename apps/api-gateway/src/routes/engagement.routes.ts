import { Router } from "express";
import {
  AuthenticatedRequest,
  authMiddleware
} from "../middleware/auth.middleware";
import { callEngagementMethod } from "../grpc/engagement.client";

export const engagementRoutes = Router();

type BasicResponse = {
  success: boolean;
  message: string;
};

const RATING_TO_PROTO: Record<string, string> = {
  thumbs_up: "THUMBS_UP",
  up: "THUMBS_UP",
  recommended: "THUMBS_UP",
  "pulgar_arriba": "THUMBS_UP",
  thumbs_down: "THUMBS_DOWN",
  down: "THUMBS_DOWN",
  not_recommended: "THUMBS_DOWN",
  "pulgar_abajo": "THUMBS_DOWN"
};

function profileId(req: AuthenticatedRequest): string {
  return String(req.body?.profile_id || req.query.profile_id || req.user?.profile_id || "");
}

function asInt(value: unknown, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function asString(value: unknown): string {
  if (Array.isArray(value)) {
    return String(value[0] || "");
  }

  return String(value || "");
}

function statusFromResponse(response: BasicResponse): number {
  const message = String(response.message || "").toLowerCase();
  if (message.includes("not found")) return 404;
  if (message.includes("required") || message.includes("must be")) return 400;
  return 400;
}

function normalizeRating(value: unknown): string {
  const raw = String(value || "").trim();
  if (raw === "THUMBS_UP" || raw === "THUMBS_DOWN") return raw;
  return RATING_TO_PROTO[raw.toLowerCase()] || "";
}

engagementRoutes.post(
  "/content/:contentId/rating",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    const currentProfileId = profileId(req);
    const rating = normalizeRating(req.body?.rating);

    if (!currentProfileId) {
      return res.status(400).json({ success: false, message: "profile_id is required" });
    }

    if (!rating) {
      return res.status(400).json({ success: false, message: "rating must be THUMBS_UP or THUMBS_DOWN" });
    }

    try {
      const response = await callEngagementMethod<Record<string, string>, BasicResponse>(
        "RateContent",
        {
          profile_id: currentProfileId,
          content_id: asString(req.params.contentId),
          rating
        }
      );

      if (!response.success) {
        return res.status(statusFromResponse(response)).json(response);
      }

      return res.status(201).json(response);
    } catch (error) {
      console.error("Rate content gRPC failed", error);
      return res.status(503).json({ success: false, message: "Engagement Service unavailable" });
    }
  }
);

engagementRoutes.get(
  "/content/:contentId/rating-summary",
  authMiddleware,
  async (req, res) => {
    try {
      const response = await callEngagementMethod("GetContentRatingSummary", {
        content_id: asString(req.params.contentId)
      });
      return res.json(response);
    } catch (error) {
      console.error("Rating summary gRPC failed", error);
      return res.status(503).json({ success: false, message: "Engagement Service unavailable" });
    }
  }
);

engagementRoutes.post(
  "/content/:contentId/progress",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    const currentProfileId = profileId(req);
    if (!currentProfileId) {
      return res.status(400).json({ success: false, message: "profile_id is required" });
    }

    try {
      const response = await callEngagementMethod<Record<string, unknown>, BasicResponse>(
        "SaveProgress",
        {
          profile_id: currentProfileId,
          content_id: asString(req.params.contentId),
          season_number: asInt(req.body?.season_number, 0),
          episode_number: asInt(req.body?.episode_number, 0),
          minute: asInt(req.body?.minute, 0)
        }
      );

      if (!response.success) {
        return res.status(statusFromResponse(response)).json(response);
      }

      return res.status(201).json(response);
    } catch (error) {
      console.error("Save progress gRPC failed", error);
      return res.status(503).json({ success: false, message: "Engagement Service unavailable" });
    }
  }
);

engagementRoutes.get(
  "/profiles/:profileId/history",
  authMiddleware,
  async (req, res) => {
    try {
      const response = await callEngagementMethod("GetRecentHistory", {
        profile_id: asString(req.params.profileId),
        limit: asInt(req.query.limit, 10)
      });
      return res.json(response);
    } catch (error) {
      console.error("Recent history gRPC failed", error);
      return res.status(503).json({ success: false, message: "Engagement Service unavailable" });
    }
  }
);

engagementRoutes.get(
  "/content/:contentId/resume",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    const currentProfileId = profileId(req);
    if (!currentProfileId) {
      return res.status(400).json({ success: false, message: "profile_id is required" });
    }

    try {
      const response = await callEngagementMethod("ResumeContent", {
        profile_id: currentProfileId,
        content_id: asString(req.params.contentId)
      });
      return res.json(response);
    } catch (error) {
      console.error("Resume content gRPC failed", error);
      return res.status(503).json({ success: false, message: "Engagement Service unavailable" });
    }
  }
);
