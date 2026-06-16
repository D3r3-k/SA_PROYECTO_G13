import { Router } from "express";
import { adminMiddleware } from "../middleware/admin.middleware";
import { callSubscriptionMethod } from "../grpc/subscription.client";
import { callCatalogMethod } from "../grpc/catalog.client";

export const adminRoutes = Router();

type Plan = {
  id: number;
  name: string;
  price_usd: number;
  is_active: boolean;
};

type ListPlansResponse = {
  success: boolean;
  message: string;
  plans: Plan[];
};

type UpdatePlanResponse = {
  success: boolean;
  message: string;
  plan?: Plan;
};

type SyncResponse = {
  success: boolean;
  message: string;
  contents_synced?: number;
  episodes_synced?: number;
  provider?: string;
};

type CreateContentResponse = {
  success: boolean;
  message: string;
  content_id: string;
  episodes: Array<{
    episode_id: string;
    season_number: number;
    episode_number: number;
    title: string;
  }>;
};

type UploadURLResponse = {
  success: boolean;
  message: string;
  upload_url: string;
  object_key: string;
  expires_in_minutes: number;
};

type BasicResponse = {
  success: boolean;
  message: string;
};

type DeleteContentResponse = {
  success: boolean;
  message: string;
  deleted_objects: number;
};

function logAdminError(message: string, error: unknown) {
  const details = error instanceof Error ? error.message : String(error);
  console.error(`[admin.routes.ts] Error: ${message}: ${details}`);
}

adminRoutes.get("/plans", adminMiddleware, async (_req, res) => {
  try {
    const response = await callSubscriptionMethod<Record<string, never>, ListPlansResponse>(
      "ListPlans",
      {}
    );
    return res.json(response);
  } catch (error) {
    logAdminError("Admin list plans failed", error);
    return res.status(503).json({ success: false, message: "Subscription Service unavailable" });
  }
});

adminRoutes.patch("/plans/:planId", adminMiddleware, async (req, res) => {
  const planId = Number(req.params.planId);
  const { name, price_usd } = req.body;

  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ success: false, message: "planId must be a positive integer" });
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ success: false, message: "name is required" });
  }
  if (typeof price_usd !== "number" || price_usd < 0) {
    return res.status(400).json({ success: false, message: "price_usd must be a non-negative number" });
  }

  try {
    const response = await callSubscriptionMethod<
      { id: number; name: string; price_usd: number },
      UpdatePlanResponse
    >("UpdatePlan", { id: planId, name: name.trim(), price_usd });

    if (!response.success) {
      return res.status(400).json(response);
    }
    return res.json(response);
  } catch (error) {
    logAdminError("Admin update plan failed", error);
    return res.status(503).json({ success: false, message: "Subscription Service unavailable" });
  }
});

adminRoutes.post("/catalog/sync", adminMiddleware, async (req, res) => {
  try {
    const response = await callCatalogMethod<Record<string, unknown>, SyncResponse>(
      "SyncMinimumCatalog",
      { force: Boolean(req.body?.force) }
    );

    if (!response.success) {
      return res.status(400).json(response);
    }
    return res.status(201).json(response);
  } catch (error) {
    logAdminError("Admin sync catalog failed", error);
    return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
  }
});

adminRoutes.post("/catalog/content", adminMiddleware, async (req, res) => {
  const body = req.body ?? {};
  const type = String(body.type ?? "").trim();
  const title = String(body.title ?? "").trim();

  if (type !== "movie" && type !== "series") {
    return res.status(400).json({ success: false, message: "type must be movie or series" });
  }
  if (!title) {
    return res.status(400).json({ success: false, message: "title is required" });
  }

  try {
    const response = await callCatalogMethod<Record<string, unknown>, CreateContentResponse>(
      "CreateContent",
      {
        type,
        title,
        overview: String(body.overview ?? "").trim(),
        release_date: String(body.releaseDate ?? body.release_date ?? "").trim(),
        genres: Array.isArray(body.genres) ? body.genres.map(String) : [],
        cast: Array.isArray(body.cast)
          ? body.cast.map((item: Record<string, unknown>, index: number) => ({
              actor_name: String(item.actorName ?? item.actor_name ?? "").trim(),
              character_name: String(item.characterName ?? item.character_name ?? "").trim(),
              order_index: Number(item.orderIndex ?? item.order_index ?? index)
            }))
          : [],
        episodes: Array.isArray(body.episodes)
          ? body.episodes.map((item: Record<string, unknown>) => ({
              season_number: Number(item.seasonNumber ?? item.season_number ?? 1),
              episode_number: Number(item.episodeNumber ?? item.episode_number ?? 0),
              title: String(item.title ?? "").trim(),
              overview: String(item.overview ?? "").trim(),
              runtime_minutes: Number(item.runtimeMinutes ?? item.runtime_minutes ?? 0)
            }))
          : []
      }
    );

    if (!response.success) {
      return res.status(400).json(response);
    }
    return res.status(201).json(response);
  } catch (error) {
    logAdminError("Admin create content failed", error);
    return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
  }
});

adminRoutes.delete("/catalog/content/:contentId", adminMiddleware, async (req, res) => {
  const contentId = String(req.params.contentId ?? "").trim();
  if (!contentId) {
    return res.status(400).json({ success: false, message: "contentId is required" });
  }

  try {
    const response = await callCatalogMethod<Record<string, string>, DeleteContentResponse>(
      "DeleteContent",
      { content_id: contentId }
    );

    if (!response.success) {
      return res.status(response.message === "content not found" ? 404 : 400).json(response);
    }
    return res.json(response);
  } catch (error) {
    logAdminError("Admin delete content failed", error);
    return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
  }
});

adminRoutes.post("/media/upload-url", adminMiddleware, async (req, res) => {
  const body = req.body ?? {};

  try {
    const response = await callCatalogMethod<Record<string, unknown>, UploadURLResponse>(
      "GenerateUploadUrl",
      {
        content_id: String(body.contentId ?? body.content_id ?? "").trim(),
        episode_id: String(body.episodeId ?? body.episode_id ?? "").trim(),
        media_type: String(body.mediaType ?? body.media_type ?? "").trim(),
        file_name: String(body.fileName ?? body.file_name ?? "").trim(),
        content_type: String(body.contentType ?? body.content_type ?? "").trim(),
        size_bytes: Number(body.sizeBytes ?? body.size_bytes ?? 0)
      }
    );

    if (!response.success) {
      return res.status(400).json(response);
    }
    return res.json(response);
  } catch (error) {
    logAdminError("Admin generate upload url failed", error);
    return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
  }
});

adminRoutes.post("/media/confirm", adminMiddleware, async (req, res) => {
  const body = req.body ?? {};

  try {
    const response = await callCatalogMethod<Record<string, unknown>, BasicResponse>(
      "ConfirmMedia",
      {
        content_id: String(body.contentId ?? body.content_id ?? "").trim(),
        episode_id: String(body.episodeId ?? body.episode_id ?? "").trim(),
        media_type: String(body.mediaType ?? body.media_type ?? "").trim(),
        object_key: String(body.objectKey ?? body.object_key ?? "").trim(),
        content_type: String(body.contentType ?? body.content_type ?? "").trim()
      }
    );

    if (!response.success) {
      return res.status(400).json(response);
    }
    return res.json(response);
  } catch (error) {
    logAdminError("Admin confirm media failed", error);
    return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
  }
});
