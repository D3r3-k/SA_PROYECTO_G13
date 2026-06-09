import { Router } from "express";
import { adminMiddleware } from "../middleware/admin.middleware";
import { callSubscriptionMethod } from "../grpc/subscription.client";
import { callCatalogMethod } from "../grpc/catalog.client";

export const adminRoutes = Router();

type Plan = {
  id: number;
  name: string;
  price_usd: number;
  is_active: boolean;
};

type ListPlansResponse = {
  success: boolean;
  message: string;
  plans: Plan[];
};

type UpdatePlanResponse = {
  success: boolean;
  message: string;
  plan?: Plan;
};

type SyncResponse = {
  success: boolean;
  message: string;
  contents_synced?: number;
  episodes_synced?: number;
  provider?: string;
};

adminRoutes.get("/plans", adminMiddleware, async (_req, res) => {
  try {
    const response = await callSubscriptionMethod<Record<string, never>, ListPlansResponse>(
      "ListPlans",
      {}
    );
    return res.json(response);
  } catch (error) {
    console.error("Admin list plans failed", error);
    return res.status(503).json({ success: false, message: "Subscription Service unavailable" });
  }
});

adminRoutes.patch("/plans/:planId", adminMiddleware, async (req, res) => {
  const planId = Number(req.params.planId);
  const { name, price_usd } = req.body;

  if (!Number.isInteger(planId) || planId <= 0) {
    return res.status(400).json({ success: false, message: "planId must be a positive integer" });
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ success: false, message: "name is required" });
  }
  if (typeof price_usd !== "number" || price_usd < 0) {
    return res.status(400).json({ success: false, message: "price_usd must be a non-negative number" });
  }

  try {
    const response = await callSubscriptionMethod<
      { id: number; name: string; price_usd: number },
      UpdatePlanResponse
    >("UpdatePlan", { id: planId, name: name.trim(), price_usd });

    if (!response.success) {
      return res.status(400).json(response);
    }
    return res.json(response);
  } catch (error) {
    console.error("Admin update plan failed", error);
    return res.status(503).json({ success: false, message: "Subscription Service unavailable" });
  }
});

adminRoutes.post("/catalog/sync", adminMiddleware, async (req, res) => {
  try {
    const response = await callCatalogMethod<Record<string, unknown>, SyncResponse>(
      "SyncMinimumCatalog",
      { force: Boolean(req.body?.force) }
    );

    if (!response.success) {
      return res.status(400).json(response);
    }
    return res.status(201).json(response);
  } catch (error) {
    console.error("Admin sync catalog failed", error);
    return res.status(503).json({ success: false, message: "Catalog Service unavailable" });
  }
});
