import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { callFxMethod } from "../grpc/fx.client";

export const fxRoutes = Router();

type RateResponse = {
  success: boolean;
  message: string;
  base: string;
  target: string;
  rate: number;
  timestamp: number;
  cached: boolean;
};

function getSingleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] || "";
  }

  return value || "";
}

fxRoutes.get("/rates/:base/:target", authMiddleware, async (req, res) => {
  const base = getSingleParam(req.params.base).trim().toUpperCase();
  const target = getSingleParam(req.params.target).trim().toUpperCase();

  if (!base || !target) {
    return res.status(400).json({
      success: false,
      message: "base and target are required"
    });
  }

  try {
    const response = await callFxMethod<
      { base: string; target: string },
      RateResponse
    >("GetRate", {
      base,
      target
    });

    if (!response.success) {
      return res.status(400).json(response);
    }

    return res.json(response);
  } catch (error) {
    console.error("FX gRPC failed", error);

    return res.status(503).json({
      success: false,
      message: "FX Service unavailable"
    });
  }
});