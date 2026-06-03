import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface AuthenticatedRequest extends Request {
  user?: {
    user_id: string;
    email?: string;
  };
}

export function authMiddleware(
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
    const payload = jwt.verify(token, env.jwtSecret) as {
      user_id: string;
      email?: string;
    };

    req.user = {
      user_id: payload.user_id,
      email: payload.email
    };

    return next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token"
    });
  }
}