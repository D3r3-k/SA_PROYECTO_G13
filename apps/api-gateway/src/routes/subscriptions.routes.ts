import { Router } from "express";
import {
  AuthenticatedRequest,
  authMiddleware
} from "../middleware/auth.middleware";
import { callSubscriptionMethod } from "../grpc/subscription.client";

export const subscriptionRoutes = Router();

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

type Subscription = {
  id: number;
  user_id: string;
  plan_id: number;
  plan_name: string;
  price_usd: number;
  status: string;
  started_at: string;
  updated_at: string;
};

type SubscriptionResponse = {
  success: boolean;
  message: string;
  subscription?: Subscription;
};

type ListUserSubscriptionsResponse = {
  success: boolean;
  message: string;
  subscriptions: Subscription[];
};

type BasicSubscriptionResponse = {
  success: boolean;
  message: string;
  subscription_id: number;
};

type CreateSubscriptionRequest = {
  user_id: string;
  plan_id: number;
  email: string;
};

type UpdateSubscriptionRequest = {
  subscription_id: number;
  plan_id: number;
  user_id: string;
  email: string;
};

type ListUserSubscriptionsRequest = {
  user_id: string;
};

type CancelSubscriptionRequest = {
  subscription_id: number;
};

function getBusinessStatus(message: string): number {
  const normalized = message.toLowerCase();

  if (normalized.includes("not found")) {
    return 404;
  }

  if (
    normalized.includes("required") ||
    normalized.includes("positive") ||
    normalized.includes("invalid")
  ) {
    return 400;
  }

  return 400;
}

function getAuthenticatedUser(req: AuthenticatedRequest): {
  userId: string;
  email: string;
} {
  return {
    userId: req.user?.user_id || "",
    email: req.user?.email || ""
  };
}

function getSubscriptionId(value: string | string[] | undefined): number {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return Number(rawValue);
}

subscriptionRoutes.get("/plans", authMiddleware, async (_req, res) => {
  try {
    const response = await callSubscriptionMethod<
      Record<string, never>,
      ListPlansResponse
    >("ListPlans", {});

    if (!response.success) {
      return res.status(getBusinessStatus(response.message)).json(response);
    }

    return res.json(response);
  } catch (error) {
    console.error("List plans gRPC failed", error);

    return res.status(503).json({
      success: false,
      message: "Subscription Service unavailable"
    });
  }
});

subscriptionRoutes.post(
  "/subscriptions",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    const { userId, email } = getAuthenticatedUser(req);
    const planId = Number(req.body.plan_id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user is required"
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Authenticated user email is required"
      });
    }

    if (!Number.isInteger(planId) || planId <= 0) {
      return res.status(400).json({
        success: false,
        message: "plan_id must be a positive integer"
      });
    }

    try {
      const response = await callSubscriptionMethod<
        CreateSubscriptionRequest,
        SubscriptionResponse
      >("CreateSubscription", {
        user_id: userId,
        plan_id: planId,
        email
      });

      if (!response.success) {
        return res.status(getBusinessStatus(response.message)).json(response);
      }

      return res.status(201).json(response);
    } catch (error) {
      console.error("Create subscription gRPC failed", error);

      return res.status(503).json({
        success: false,
        message: "Subscription Service unavailable"
      });
    }
  }
);

subscriptionRoutes.get(
  "/subscriptions",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    const { userId } = getAuthenticatedUser(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user is required"
      });
    }

    try {
      const response = await callSubscriptionMethod<
        ListUserSubscriptionsRequest,
        ListUserSubscriptionsResponse
      >("ListUserSubscriptions", {
        user_id: userId
      });

      if (!response.success) {
        return res.status(getBusinessStatus(response.message)).json(response);
      }

      return res.json(response);
    } catch (error) {
      console.error("List subscriptions gRPC failed", error);

      return res.status(503).json({
        success: false,
        message: "Subscription Service unavailable"
      });
    }
  }
);

subscriptionRoutes.put(
  "/subscriptions/:subscriptionId",
  authMiddleware,
  async (req: AuthenticatedRequest, res) => {
    const { userId, email } = getAuthenticatedUser(req);
    const subscriptionId = getSubscriptionId(req.params.subscriptionId);
    const planId = Number(req.body.plan_id);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user is required"
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Authenticated user email is required"
      });
    }

    if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) {
      return res.status(400).json({
        success: false,
        message: "subscriptionId must be a positive integer"
      });
    }

    if (!Number.isInteger(planId) || planId <= 0) {
      return res.status(400).json({
        success: false,
        message: "plan_id must be a positive integer"
      });
    }

    try {
      const response = await callSubscriptionMethod<
        UpdateSubscriptionRequest,
        SubscriptionResponse
      >("UpdateSubscription", {
        subscription_id: subscriptionId,
        plan_id: planId,
        user_id: userId,
        email
      });

      if (!response.success) {
        return res.status(getBusinessStatus(response.message)).json(response);
      }

      return res.json(response);
    } catch (error) {
      console.error("Update subscription gRPC failed", error);

      return res.status(503).json({
        success: false,
        message: "Subscription Service unavailable"
      });
    }
  }
);

subscriptionRoutes.delete(
  "/subscriptions/:subscriptionId",
  authMiddleware,
  async (req, res) => {
    const subscriptionId = getSubscriptionId(req.params.subscriptionId);

    if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) {
      return res.status(400).json({
        success: false,
        message: "subscriptionId must be a positive integer"
      });
    }

    try {
      const response = await callSubscriptionMethod<
        CancelSubscriptionRequest,
        BasicSubscriptionResponse
      >("CancelSubscription", {
        subscription_id: subscriptionId
      });

      if (!response.success) {
        return res.status(getBusinessStatus(response.message)).json(response);
      }

      return res.json(response);
    } catch (error) {
      console.error("Cancel subscription gRPC failed", error);

      return res.status(503).json({
        success: false,
        message: "Subscription Service unavailable"
      });
    }
  }
);