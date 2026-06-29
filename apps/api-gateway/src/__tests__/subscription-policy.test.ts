/*
 * Pruebas unitarias para subscription-policy.ts.
 */

jest.mock("../grpc/subscription.client", () => ({
  callSubscriptionMethod: jest.fn(),
}));

import { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.middleware";
import {
  getActiveSubscriptionForUser,
  normalizePlanTier,
  requireActiveSubscription,
  requirePremiumSubscription,
  requireStandardDownloadSubscription,
} from "../middleware/subscription-policy";

const { callSubscriptionMethod } = require("../grpc/subscription.client") as {
  callSubscriptionMethod: jest.Mock;
};

function makeRes(): Partial<Response> {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function makeReq(user?: Partial<AuthenticatedRequest["user"]>): AuthenticatedRequest {
  return {
    user: user as AuthenticatedRequest["user"],
  } as AuthenticatedRequest;
}

function activeSubscription(planName = "Plan Premium") {
  return {
    id: 1,
    user_id: "u-1",
    plan_id: 3,
    plan_name: planName,
    price_usd: 15,
    status: "ACTIVE",
    started_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
  };
}

const next: NextFunction = jest.fn();

describe("normalizePlanTier", () => {
  it("normaliza planes con mayúsculas y acentos", () => {
    expect(normalizePlanTier("Plan Básico")).toBe("basic");
    expect(normalizePlanTier("Plan Estándar")).toBe("standard");
    expect(normalizePlanTier("PLAN PREMIUM")).toBe("premium");
    expect(normalizePlanTier("desconocido")).toBe("none");
  });
});

describe("getActiveSubscriptionForUser", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retorna null si no hay userId", async () => {
    await expect(getActiveSubscriptionForUser("")).resolves.toBeNull();
    expect(callSubscriptionMethod).not.toHaveBeenCalled();
  });

  it("retorna la suscripción activa con plan_tier", async () => {
    callSubscriptionMethod.mockResolvedValueOnce({
      success: true,
      message: "ok",
      subscriptions: [
        { ...activeSubscription("Plan Básico"), status: "cancelled" },
        activeSubscription("Plan Estándar"),
      ],
    });

    const result = await getActiveSubscriptionForUser("u-1");

    expect(callSubscriptionMethod).toHaveBeenCalledWith("ListUserSubscriptions", {
      user_id: "u-1",
    });
    expect(result?.plan_tier).toBe("standard");
  });

  it("retorna null cuando no existe suscripción activa", async () => {
    callSubscriptionMethod.mockResolvedValueOnce({
      success: true,
      message: "ok",
      subscriptions: [{ ...activeSubscription(), status: "cancelled" }],
    });

    await expect(getActiveSubscriptionForUser("u-1")).resolves.toBeNull();
  });

  it("lanza error cuando subscription-service responde success=false", async () => {
    callSubscriptionMethod.mockResolvedValueOnce({
      success: false,
      message: "service rejected request",
      subscriptions: [],
    });

    await expect(getActiveSubscriptionForUser("u-1")).rejects.toThrow(
      "service rejected request"
    );
  });
});

describe("requireActiveSubscription", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("permite acceso directo a administradores", async () => {
    const req = makeReq({ user_id: "admin", is_admin: true });
    const res = makeRes();

    await requireActiveSubscription()(req, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(callSubscriptionMethod).not.toHaveBeenCalled();
  });

  it("permite usuario con suscripción activa", async () => {
    callSubscriptionMethod.mockResolvedValueOnce({
      success: true,
      message: "ok",
      subscriptions: [activeSubscription("Plan Básico")],
    });

    const req = makeReq({ user_id: "u-1", is_admin: false });
    const res = makeRes();

    await requireActiveSubscription()(req, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.activeSubscription?.plan_tier).toBe("basic");
  });

  it("bloquea usuario sin suscripción activa", async () => {
    callSubscriptionMethod.mockResolvedValueOnce({
      success: true,
      message: "ok",
      subscriptions: [],
    });

    const req = makeReq({ user_id: "u-1", is_admin: false });
    const res = makeRes();

    await requireActiveSubscription()(req, res as Response, next);

    expect((res as any).status).toHaveBeenCalledWith(403);
    expect((res as any).json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ACTIVE_SUBSCRIPTION_REQUIRED" })
    );
  });

  it("retorna 503 si falla subscription-service", async () => {
    callSubscriptionMethod.mockRejectedValueOnce(new Error("gRPC unavailable"));
    const req = makeReq({ user_id: "u-1", is_admin: false });
    const res = makeRes();

    await requireActiveSubscription()(req, res as Response, next);

    expect((res as any).status).toHaveBeenCalledWith(503);
  });
});

describe("requirePremiumSubscription", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("permite crear Watch Party a Premium activo", async () => {
    callSubscriptionMethod.mockResolvedValueOnce({
      success: true,
      message: "ok",
      subscriptions: [activeSubscription("Plan Premium")],
    });

    const req = makeReq({ user_id: "u-1", is_admin: false });
    const res = makeRes();

    await requirePremiumSubscription()(req, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.activeSubscription?.plan_tier).toBe("premium");
  });

  it("bloquea usuario sin suscripción activa", async () => {
    callSubscriptionMethod.mockResolvedValueOnce({
      success: true,
      message: "ok",
      subscriptions: [],
    });

    const req = makeReq({ user_id: "u-1", is_admin: false });
    const res = makeRes();

    await requirePremiumSubscription()(req, res as Response, next);

    expect((res as any).status).toHaveBeenCalledWith(403);
    expect((res as any).json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ACTIVE_SUBSCRIPTION_REQUIRED" })
    );
  });

  it("bloquea usuario Basic o Standard para crear Watch Party", async () => {
    callSubscriptionMethod.mockResolvedValueOnce({
      success: true,
      message: "ok",
      subscriptions: [activeSubscription("Plan Estándar")],
    });

    const req = makeReq({ user_id: "u-1", is_admin: false });
    const res = makeRes();

    await requirePremiumSubscription()(req, res as Response, next);

    expect((res as any).status).toHaveBeenCalledWith(403);
    expect((res as any).json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "PREMIUM_PLAN_REQUIRED" })
    );
  });

  it("retorna 503 si falla la validación de plan", async () => {
    callSubscriptionMethod.mockRejectedValueOnce(new Error("gRPC unavailable"));
    const req = makeReq({ user_id: "u-1", is_admin: false });
    const res = makeRes();

    await requirePremiumSubscription()(req, res as Response, next);

    expect((res as any).status).toHaveBeenCalledWith(503);
  });
});


describe("requireStandardDownloadSubscription", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("permite descarga solo a Plan Estándar activo", async () => {
    callSubscriptionMethod.mockResolvedValueOnce({
      success: true,
      message: "ok",
      subscriptions: [activeSubscription("Plan Estándar")],
    });

    const req = makeReq({ user_id: "u-1", is_admin: false });
    const res = makeRes();

    await requireStandardDownloadSubscription()(req, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(req.activeSubscription?.plan_tier).toBe("standard");
  });

  it("bloquea Plan Básico y Plan Premium para descarga", async () => {
    callSubscriptionMethod.mockResolvedValueOnce({
      success: true,
      message: "ok",
      subscriptions: [activeSubscription("Plan Premium")],
    });

    const req = makeReq({ user_id: "u-1", is_admin: false });
    const res = makeRes();

    await requireStandardDownloadSubscription()(req, res as Response, next);

    expect((res as any).status).toHaveBeenCalledWith(403);
    expect((res as any).json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "STANDARD_PLAN_REQUIRED" })
    );
  });
});
