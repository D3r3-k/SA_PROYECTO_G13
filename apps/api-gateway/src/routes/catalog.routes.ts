import { Router } from "express";
import { callCatalogMethod } from "../grpc/catalog.client";
import { authMiddleware } from "../middleware/auth.middleware";

export const catalogRoutes = Router();

type BasicResponse = {
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

catalogRoutes.post("/sync-minimum", authMiddleware, async (req, res) => {
  try {
    const response = await callCatalogMethod<Record<string, unknown>, BasicResponse>(
      "SyncMinimumCatalog",
      { force: Boolean(req.body?.force) }
    );

    if (!response.success) {
      return res.status(statusFromResponse(response)).json(response);
    }

    return res.status(201).json(response);
  } catch (error) {
    console.error("Sync catalog gRPC failed", error);
    return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
  }
});

catalogRoutes.get("/", authMiddleware, async (req, res) => {
  try {
    const response = await callCatalogMethod("ListContent", {
      type: asString(req.query.type),
      genre: asString(req.query.genre),
      limit: asInt(req.query.limit, 20),
      offset: asInt(req.query.offset, 0)
    });
    return res.json(response);
  } catch (error) {
    console.error("List catalog gRPC failed", error);
    return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
  }
});

catalogRoutes.get("/search", authMiddleware, async (req, res) => {
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
});

catalogRoutes.get("/:contentId", authMiddleware, async (req, res) => {
  try {
    const contentId = asString(req.params.contentId);

    const response = await callCatalogMethod<Record<string, string>, BasicResponse>(
      "GetContentDetail",
      { content_id: contentId }
    );

    if (!response.success) {
      return res.status(statusFromResponse(response)).json(response);
    }

    return res.json(response);
  } catch (error) {
    console.error("Get catalog detail gRPC failed", error);
    return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
  }
});

catalogRoutes.get("/:contentId/episodes", authMiddleware, async (req, res) => {
  try {
    const contentId = asString(req.params.contentId);

    const response = await callCatalogMethod("ListEpisodes", {
      content_id: contentId,
      season_number: asInt(req.query.season_number, 1)
    });

    return res.json(response);
  } catch (error) {
    console.error("List episodes gRPC failed", error);
    return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
  }
});
