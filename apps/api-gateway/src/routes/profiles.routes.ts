import { Router } from "express";
import { env } from "../config/env";
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

type SelectProfileResponse = ProfileResponse & {
  token: string;
};

type ListProfilesResponse = {
  profiles: ProfileResponse[];
};

function setAuthCookie(res: any, token: string) {
  res.cookie(env.cookieName, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: "/"
  });
}

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
        selected_profile_id: req.user?.profile_id || "",
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
        SelectProfileResponse
      >("SelectProfile", {
        user_id: req.user?.user_id || "",
        profile_id: profileId
      });

      if (!response.success) {
        return res.status(getBusinessStatus(response.message)).json(response);
      }

      if (!response.token) {
        return res.status(502).json({
          success: false,
          message: "Identity Service did not return a session token"
        });
      }

      setAuthCookie(res, response.token);

      return res.json({
        success: true,
        message: response.message,
        profile_id: response.profile_id,
        user_id: response.user_id,
        name: response.name,
        avatar_url: response.avatar_url
      });
    } catch (error) {
      console.error("Select profile failed", error);

      return res.status(503).json({
        success: false,
        message: "Identity Service unavailable"
      });
    }
  }
);