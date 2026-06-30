import { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "./auth.middleware";
import { callSubscriptionMethod } from "../grpc/subscription.client";

export type PlanTier = "none" | "basic" | "standard" | "premium";

export type Subscription = {
  id: number;
  user_id: string;
  plan_id: number;
  plan_name: string;
  price_usd: number;
  status: string;
  started_at: string;
  updated_at: string;
};

type ListUserSubscriptionsResponse = {
  success: boolean;
  message: string;
  subscriptions: Subscription[];
};

export type ActiveSubscription = Subscription & {
  plan_tier: PlanTier;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function normalizePlanTier(planName: string): PlanTier {
  const value = normalize(planName);

  if (value.includes("premium")) return "premium";
  if (value.includes("standard") || value.includes("estandar")) return "standard";
  if (value.includes("basic") || value.includes("basico")) return "basic";

  return "none";
}

export async function getActiveSubscriptionForUser(
  userId: string
): Promise<ActiveSubscription | null> {
  if (!userId) return null;

  const response = await callSubscriptionMethod<
    { user_id: string },
    ListUserSubscriptionsResponse
  >("ListUserSubscriptions", { user_id: userId });

  if (!response.success) {
    throw new Error(response.message || "could not validate active subscription");
  }

  const active = response.subscriptions.find(
    (subscription) => normalize(subscription.status) === "active"
  );

  if (!active) return null;

  return {
    ...active,
    plan_tier: normalizePlanTier(active.plan_name)
  };
}

export function requireActiveSubscription() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.user?.is_admin) {
        return next();
      }

      const active = await getActiveSubscriptionForUser(req.user?.user_id || "");

      if (!active) {
        return res.status(403).json({
          success: false,
          code: "ACTIVE_SUBSCRIPTION_REQUIRED",
          message: "An active subscription is required to access this resource"
        });
      }

      req.activeSubscription = active;
      return next();
    } catch (error) {
      console.error("Subscription validation failed", error);
      return res.status(503).json({
        success: false,
        message: "Subscription Service unavailable"
      });
    }
  };
}

export function requirePremiumSubscription() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const active = await getActiveSubscriptionForUser(req.user?.user_id || "");

      if (!active) {
        return res.status(403).json({
          success: false,
          code: "ACTIVE_SUBSCRIPTION_REQUIRED",
          message: "An active subscription is required to access this resource"
        });
      }

      if (active.plan_tier !== "premium") {
        return res.status(403).json({
          success: false,
          code: "PREMIUM_PLAN_REQUIRED",
          message: "A Premium subscription is required to create a Watch Party"
        });
      }

      req.activeSubscription = active;
      return next();
    } catch (error) {
      console.error("Subscription validation failed", error);
      return res.status(503).json({
        success: false,
        message: "Subscription Service unavailable"
      });
    }
  };
}

export function requireStandardDownloadSubscription() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const active = await getActiveSubscriptionForUser(req.user?.user_id || "");

      if (!active) {
        return res.status(403).json({
          success: false,
          code: "ACTIVE_SUBSCRIPTION_REQUIRED",
          message: "Se requiere una suscripción Standard activa para descargar contenido"
        });
      }

      if (active.plan_tier !== "standard") {
        return res.status(403).json({
          success: false,
          code: "STANDARD_PLAN_REQUIRED",
          message: "La descarga de contenido está habilitada únicamente para el Plan Estándar. Los planes Básico y Premium no pueden descargar."
        });
      }

      req.activeSubscription = active;
      return next();
    } catch (error) {
      console.error("Subscription validation failed", error);
      return res.status(503).json({
        success: false,
        message: "Subscription Service unavailable"
      });
    }
  };
}
