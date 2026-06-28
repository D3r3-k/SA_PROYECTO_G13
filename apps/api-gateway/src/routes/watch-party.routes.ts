import { Router } from "express";
import { callCatalogMethod } from "../grpc/catalog.client";
import { AuthenticatedRequest, authMiddleware } from "../middleware/auth.middleware";
import {
  requireActiveSubscription,
  requirePremiumSubscription
} from "../middleware/subscription-policy";
import {
  createWatchPartyRoom,
  getWatchPartyRoom,
  serializeRoom
} from "../watch-party/rooms";

export const watchPartyRoutes = Router();

type CatalogResponse = {
  success: boolean;
  message: string;
};

function getBusinessStatus(message: string): number {
  const normalized = message.toLowerCase();
  if (normalized.includes("not found")) return 404;
  if (normalized.includes("required") || normalized.includes("invalid")) return 400;
  return 400;
}

watchPartyRoutes.post(
  "/rooms",
  authMiddleware,
  requirePremiumSubscription(),
  async (req: AuthenticatedRequest, res) => {
    const contentId = String(req.body.content_id || "").trim();

    if (!contentId) {
      return res.status(400).json({
        success: false,
        message: "content_id is required"
      });
    }

    try {
      const content = await callCatalogMethod<
        { content_id: string },
        CatalogResponse
      >("GetContentDetail", { content_id: contentId });

      if (!content.success) {
        return res.status(getBusinessStatus(content.message)).json(content);
      }

      const room = createWatchPartyRoom({
        hostUserId: req.user?.user_id || "",
        hostProfileId: req.user?.profile_id || "",
        contentId
      });

      return res.status(201).json({
        success: true,
        message: "Watch Party room created",
        code: room.code,
        room: serializeRoom(room),
        join_url: `/watch-party/${room.code}`,
        ws_path: `/api/watch-party/ws/${room.code}`
      });
    } catch (error) {
      console.error("Create Watch Party failed", error);
      return res.status(503).json({
        success: false,
        message: "Watch Party dependencies unavailable"
      });
    }
  }
);

watchPartyRoutes.get(
  "/rooms/:code",
  authMiddleware,
  requireActiveSubscription(),
  async (req: AuthenticatedRequest, res) => {
    const code = String(req.params.code || "").trim().toUpperCase();
    const room = getWatchPartyRoom(code);

    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Watch Party room not found"
      });
    }

    return res.json({
      success: true,
      message: "Watch Party room found",
      room: serializeRoom(room),
      is_host: room.host_user_id === req.user?.user_id
    });
  }
);
