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
  is_child?: boolean;
  parental_pin?: string;
  parental_pin_configured?: boolean;
};

type SelectProfileResponse = ProfileResponse & {
  token: string;
};

type ListProfilesResponse = {
  profiles: ProfileResponse[];
};

type BasicResponse = {
  success: boolean;
  message: string;
};

function setAuthCookie(res: any, token: string) {
  res.cookie(env.cookieName, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: "/"
  });
}

function clearAuthCookie(res: any) {
  res.clearCookie(env.cookieName, {
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
          is_child: boolean;
          parental_pin: string;
        },
        ProfileResponse
      >("CreateProfile", {
        user_id: req.user?.user_id || "",
        name: req.body.name,
        avatar_url: req.body.avatar_url || "",
        is_child: Boolean(req.body.is_child),
        parental_pin: req.body.parental_pin || ""
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

      if (typeof profileId !== "string" || !profileId.trim()) {
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
        avatar_url: response.avatar_url,
        is_child: Boolean(response.is_child),
        parental_pin_configured: Boolean(response.parental_pin_configured)
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

profileRoutes.put(
  "/:profileId",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { profileId } = req.params;

      if (typeof profileId !== "string" || !profileId.trim()) {
        return res.status(400).json({
          success: false,
          message: "Invalid profile id"
        });
      }

      const response = await callIdentityMethod<
        {
          user_id: string;
          profile_id: string;
          name: string;
          avatar_url: string;
          is_child: boolean;
          parental_pin: string;
        },
        ProfileResponse
      >("UpdateProfile", {
        user_id: req.user?.user_id || "",
        profile_id: profileId,
        name: req.body.name,
        avatar_url: req.body.avatar_url || "",
        is_child: Boolean(req.body.is_child),
        parental_pin: req.body.parental_pin || ""
      });

      if (!response.success) {
        return res.status(getBusinessStatus(response.message)).json(response);
      }

      return res.json(response);
    } catch (error) {
      console.error("Update profile failed", error);

      return res.status(503).json({
        success: false,
        message: "Identity Service unavailable"
      });
    }
  }
);

profileRoutes.delete(
  "/:profileId",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const { profileId } = req.params;

      if (typeof profileId !== "string" || !profileId.trim()) {
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
        BasicResponse
      >("DeleteProfile", {
        user_id: req.user?.user_id || "",
        profile_id: profileId
      });

      if (!response.success) {
        return res.status(getBusinessStatus(response.message)).json(response);
      }

      if (req.user?.profile_id === profileId) {
        clearAuthCookie(res);

        return res.json({
          success: true,
          message:
            "Profile deleted. Active session was closed because the selected profile was deleted."
        });
      }

      return res.json(response);
    } catch (error) {
      console.error("Delete profile failed", error);

      return res.status(503).json({
        success: false,
        message: "Identity Service unavailable"
      });
    }
  }
);