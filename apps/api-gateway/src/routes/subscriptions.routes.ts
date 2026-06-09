import { Router } from "express";
import {
  AuthenticatedRequest,
  authMiddleware
} from "../middleware/auth.middleware";
import { callFxMethod } from "../grpc/fx.client";
import { callPaymentMethod } from "../grpc/payment.client";
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

type RateResponse = {
  success: boolean;
  message: string;
  base: string;
  target: string;
  rate: number;
  timestamp: number;
  cached: boolean;
};

type PaymentPayload = {
  card_number: string;
  card_holder: string;
  exp_month: number;
  exp_year: number;
  cvv: string;
};

type AuthorizePaymentRequest = PaymentPayload & {
  user_id: string;
  email: string;
  plan_id: number;
  amount: number;
  currency: string;
};

type PaymentResponse = {
  success: boolean;
  message: string;
  provider: string;
  status: string;
  transaction_id: string;
  authorization_code: string;
  amount: number;
  currency: string;
  card_last4: string;
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
  payment?: PaymentResponse;
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
    normalized.includes("invalid") ||
    normalized.includes("expired") ||
    normalized.includes("unsupported")
  ) {
    return 400;
  }

  if (
    normalized.includes("declined") ||
    normalized.includes("funds") ||
    normalized.includes("issuer")
  ) {
    return 402;
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

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getCurrency(req: AuthenticatedRequest): string {
  const body = req.body as Record<string, unknown>;
  const payment = body.payment as Record<string, unknown> | undefined;
  const currency = getString(body.currency) || getString(payment?.currency) || "USD";
  return currency.toUpperCase();
}

function getPaymentPayload(req: AuthenticatedRequest): PaymentPayload | null {
  const body = req.body as Record<string, unknown>;
  const source = (body.payment as Record<string, unknown> | undefined) || body;

  const payload: PaymentPayload = {
    card_number: getString(source.card_number),
    card_holder: getString(source.card_holder),
    exp_month: Number(source.exp_month),
    exp_year: Number(source.exp_year),
    cvv: getString(source.cvv)
  };

  if (
    !payload.card_number ||
    !payload.card_holder ||
    !Number.isInteger(payload.exp_month) ||
    !Number.isInteger(payload.exp_year) ||
    !payload.cvv
  ) {
    return null;
  }

  return payload;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function getPlanById(planId: number): Promise<Plan | null> {
  const response = await callSubscriptionMethod<Record<string, never>, ListPlansResponse>(
    "ListPlans",
    {}
  );

  if (!response.success) {
    throw new Error(response.message || "could not list plans");
  }

  return response.plans.find((plan) => Number(plan.id) === planId) || null;
}

async function convertAmountFromUsd(amountUsd: number, currency: string): Promise<number> {
  if (currency === "USD") {
    return roundMoney(amountUsd);
  }

  // OBTENER VALORES DE FX
  const response = await callFxMethod<{ base: string; target: string }, RateResponse>(
    "GetRate",
    {
      base: "USD",
      target: currency
    }
  );

  if (!response.success) {
    throw new Error(response.message || "could not convert amount");
  }

  return roundMoney(amountUsd * response.rate);
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
    const currency = getCurrency(req);
    const paymentPayload = getPaymentPayload(req);

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

    if (!paymentPayload) {
      return res.status(400).json({
        success: false,
        message: "payment data is required before creating a subscription"
      });
    }

    try {
      const plan = await getPlanById(planId);

      if (!plan) {
        return res.status(404).json({
          success: false,
          message: "plan not found"
        });
      }

      const amount = await convertAmountFromUsd(Number(plan.price_usd), currency);

      const payment = await callPaymentMethod<AuthorizePaymentRequest, PaymentResponse>(
        "AuthorizePayment",
        {
          ...paymentPayload,
          user_id: userId,
          email,
          plan_id: planId,
          amount,
          currency
        }
      );

      if (!payment.success) {
        return res.status(getBusinessStatus(payment.message)).json({
          success: false,
          message: payment.message,
          payment
        });
      }

      const response = await callSubscriptionMethod<
        CreateSubscriptionRequest,
        SubscriptionResponse
      >("CreateSubscription", {
        user_id: userId,
        plan_id: planId,
        email
      });

      if (!response.success) {
        return res.status(getBusinessStatus(response.message)).json({
          ...response,
          payment
        });
      }

      return res.status(201).json({
        ...response,
        payment
      });
    } catch (error) {
      console.error("Create subscription with payment failed", error);

      return res.status(503).json({
        success: false,
        message: "Payment or Subscription Service unavailable"
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