import { Router } from "express";
import {
  AuthenticatedRequest,
  authMiddleware
} from "../middleware/auth.middleware";
import { callIdentityMethod } from "../grpc/identity.client";

export const profileRoutes = Router();

type ProfileResponse = {
  success: boolean;
  message: string;
  profile_id: string;
  user_id: string;
  name: string;
  avatar_url: string;
};

type ListProfilesResponse = {
  profiles: ProfileResponse[];
};

function getBusinessStatus(message: string): number {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("required") ||
    normalizedMessage.includes("not found") ||
    normalizedMessage.includes("more than 5 profiles")
  ) {
    return 400;
  }

  return 400;
}

profileRoutes.post(
  "/",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const response = await callIdentityMethod<
        {
          user_id: string;
          name: string;
          avatar_url: string;
        },
        ProfileResponse
      >("CreateProfile", {
        user_id: req.user?.user_id || "",
        name: req.body.name,
        avatar_url: req.body.avatar_url || ""
      });

      if (!response.success) {
        return res.status(getBusinessStatus(response.message)).json(response);
      }

      return res.status(201).json(response);
    } catch (error) {
      console.error("Create profile failed", error);

      return res.status(503).json({
        success: false,
        message: "Identity Service unavailable"
      });
    }
  }
);

profileRoutes.get(
  "/",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const response = await callIdentityMethod<
        {
          user_id: string;
        },
        ListProfilesResponse
      >("ListProfiles", {
        user_id: req.user?.user_id || ""
      });

      return res.json({
        success: true,
        profiles: response.profiles
      });
    } catch (error) {
      console.error("List profiles failed", error);

      return res.status(503).json({
        success: false,
        message: "Identity Service unavailable"
      });
    }
  }
);

profileRoutes.post(
  "/:profileId/select",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { profileId } = req.params;

      if (typeof profileId !== "string") {
        return res.status(400).json({
          success: false,
          message: "Invalid profile id"
        });
      }

      const response = await callIdentityMethod<
        {
          user_id: string;
          profile_id: string;
        },
        ProfileResponse
      >("SelectProfile", {
        user_id: req.user?.user_id || "",
        profile_id: profileId
      });

      if (!response.success) {
        return res.status(getBusinessStatus(response.message)).json(response);
      }

      return res.json(response);
    } catch (error) {
      console.error("Select profile failed", error);

      return res.status(503).json({
        success: false,
        message: "Identity Service unavailable"
      });
    }
  }
);