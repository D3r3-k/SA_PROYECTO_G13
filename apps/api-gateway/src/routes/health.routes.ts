import { Router } from "express";

export const healthRoutes = Router();

healthRoutes.get("/", (_req, res) => {
  res.json({
    service: "api-gateway",
    status: "ok",
    timestamp: new Date().toISOString()
  });
});