import { Router } from "express";
import { env } from "../config/env";

export const authRoutes = Router();

authRoutes.post("/register", async (_req, res) => {
  res.status(501).json({
    message: "Register endpoint pending IdentityService gRPC integration"
  });
});

authRoutes.post("/login", async (_req, res) => {
  res.status(501).json({
    message: "Login endpoint pending IdentityService gRPC integration"
  });
});

authRoutes.post("/logout", (_req, res) => {
  res.clearCookie(env.cookieName);
  res.json({
    success: true,
    message: "Logout successful"
  });
});

authRoutes.get("/me", async (_req, res) => {
  res.status(501).json({
    message: "Me endpoint pending token validation"
  });
});