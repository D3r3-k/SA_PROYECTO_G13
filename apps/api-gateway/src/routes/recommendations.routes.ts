import { Router } from "express";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.middleware";
import { callRecommendationMethod } from "../grpc/recommendation.client";

export const recommendationRoutes = Router();

type RecommendedContent = {
  content_id: string;
  title: string;
  genres: string[];
};

type GetRecommendationsResponse = {
  success: boolean;
  message: string;
  items: RecommendedContent[];
};

function asInt(value: unknown, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

recommendationRoutes.get(
  "/",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    const profileId = String(req.user?.profile_id || "");

    if (!profileId) {
      return res.status(400).json({ success: false, message: "No active profile in session" });
    }

    const limit = asInt(req.query.limit, 10);

    try {
      const response = await callRecommendationMethod<
        { profile_id: string; limit: number },
        GetRecommendationsResponse
      >("GetRecommendations", { profile_id: profileId, limit });

      if (!response.success) {
        return res.status(400).json(response);
      }

      return res.json(response);
    } catch (error) {
      console.error("GetRecommendations gRPC failed", error);
      return res.status(503).json({ success: false, message: "Recommendation Service unavailable" });
    }
  }
);
