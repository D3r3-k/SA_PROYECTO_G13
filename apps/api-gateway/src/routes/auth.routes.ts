import { Router } from "express";
import { env } from "../config/env";
import {
  AuthenticatedRequest,
  authMiddleware
} from "../middleware/auth.middleware";
import { callIdentityMethod } from "../grpc/identity.client";

export const authRoutes = Router();

type AuthResponse = {
  success: boolean;
  message: string;
  user_id: string;
  token: string;
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
    normalizedMessage.includes("invalid credentials") ||
    normalizedMessage.includes("invalid or expired") ||
    normalizedMessage.includes("current password is incorrect")
  ) {
    return 401;
  }

  if (
    normalizedMessage.includes("required") ||
    normalizedMessage.includes("invalid email") ||
    normalizedMessage.includes("already registered") ||
    normalizedMessage.includes("password must")
  ) {
    return 400;
  }

  return 400;
}

authRoutes.post("/register", async (req, res) => {
  try {
    const response = await callIdentityMethod<
      {
        email: string;
        password: string;
        full_name: string;
      },
      AuthResponse
    >("RegisterUser", {
      email: req.body.email,
      password: req.body.password,
      full_name: req.body.full_name
    });

    if (!response.success) {
      return res.status(getBusinessStatus(response.message)).json(response);
    }

    setAuthCookie(res, response.token);

    return res.status(201).json({
      success: true,
      message: response.message,
      user_id: response.user_id
    });
  } catch (error) {
    console.error("Register failed", error);

    return res.status(503).json({
      success: false,
      message: "Identity Service unavailable"
    });
  }
});

authRoutes.post("/login", async (req, res) => {
  try {
    const response = await callIdentityMethod<
      {
        email: string;
        password: string;
      },
      AuthResponse
    >("Login", {
      email: req.body.email,
      password: req.body.password
    });

    if (!response.success) {
      return res.status(getBusinessStatus(response.message)).json(response);
    }

    setAuthCookie(res, response.token);

    return res.json({
      success: true,
      message: response.message,
      user_id: response.user_id
    });
  } catch (error) {
    console.error("Login failed", error);

    return res.status(503).json({
      success: false,
      message: "Identity Service unavailable"
    });
  }
});

authRoutes.post("/logout", (_req, res) => {
  clearAuthCookie(res);

  return res.json({
    success: true,
    message: "Logout successful"
  });
});

authRoutes.get("/me", authMiddleware, async (req: AuthenticatedRequest, res) => {
  return res.json({
    success: true,
    user: {
      user_id: req.user?.user_id,
      email: req.user?.email,
      profile_id: req.user?.profile_id || ""
    }
  });
});

authRoutes.put(
  "/credentials",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    try {
      const response = await callIdentityMethod<
        {
          user_id: string;
          current_password: string;
          new_password: string;
        },
        BasicResponse
      >("UpdateCredentials", {
        user_id: req.user?.user_id || "",
        current_password: req.body.current_password,
        new_password: req.body.new_password
      });

      if (!response.success) {
        return res.status(getBusinessStatus(response.message)).json(response);
      }

      clearAuthCookie(res);

      return res.json({
        success: true,
        message: "Credentials updated successfully. Please login again."
      });
    
    } catch (error) {
      console.error("Update credentials failed", error);

      return res.status(503).json({
        success: false,
        message: "Identity Service unavailable"
      });
    }
  }
);