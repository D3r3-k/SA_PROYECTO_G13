import { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { callIdentityMethod } from "../grpc/identity.client";

export interface AuthenticatedRequest extends Request {
  user?: {
    user_id: string;
    email: string;
    profile_id: string;
    roles: string[];
    permissions: string[];
    is_admin: boolean;
  };
}

type ValidateTokenResponse = {
  valid: boolean;
  user_id: string;
  email: string;
  profile_id: string;
  roles?: string[];
  permissions?: string[];
  is_admin?: boolean;
};

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const token = req.cookies?.[env.cookieName];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Missing authentication cookie"
    });
  }

  try {
    const response = await callIdentityMethod<
      { token: string },
      ValidateTokenResponse
    >("ValidateToken", { token });

    if (!response.valid) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token"
      });
    }

    const roles = Array.isArray(response.roles) ? response.roles.map(String) : [];
    const permissions = Array.isArray(response.permissions)
      ? response.permissions.map(String)
      : [];

    req.user = {
      user_id: response.user_id,
      email: response.email,
      profile_id: response.profile_id || "",
      roles,
      permissions,
      is_admin: Boolean(response.is_admin || roles.includes("admin"))
    };

    return next();
  } catch (error) {
    console.error("Failed to validate token with Identity Service", error);

    return res.status(503).json({
      success: false,
      message: "Identity Service unavailable"
    });
  }
}
