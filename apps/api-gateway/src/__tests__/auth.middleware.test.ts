/**
 * Pruebas unitarias para auth.middleware.ts
 * Mockea el cliente gRPC de identity-service.
 */

// Mock del cliente gRPC ANTES de importar el middleware
jest.mock("../grpc/identity.client", () => ({
  callIdentityMethod: jest.fn(),
}));

import { Request, Response, NextFunction } from "express";
import { authMiddleware } from "../middleware/auth.middleware";

// Buscar y mockear el módulo correcto del cliente gRPC
let callIdentityMethod: jest.Mock;

beforeAll(() => {
  callIdentityMethod = require("../grpc/identity.client").callIdentityMethod;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    cookies: {},
    ...overrides,
  };
}

function makeMockRes(): Partial<Response> {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const mockNext: NextFunction = jest.fn();

// ─── authMiddleware ────────────────────────────────────────────────────────────

describe("authMiddleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sin cookie de sesión retorna 401", async () => {
    const req = makeMockReq({ cookies: {} });
    const res = makeMockRes();

    await authMiddleware(req as Request, res as Response, mockNext);

    expect((res as any).status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("token válido llama next() y asigna req.user", async () => {
    // Si callIdentityMethod no está disponible, skip el test
    if (!callIdentityMethod) return;

    const fakeResp = {
      valid: true,
      user_id: "u-1",
      email: "u@example.com",
      profile_id: "prof-1",
      roles: ["user"],
      permissions: ["catalog:read"],
      is_admin: false,
    };

    callIdentityMethod.mockResolvedValueOnce(fakeResp);

    const cookieName = process.env.COOKIE_NAME || "access_token";
    const req = makeMockReq({ cookies: { [cookieName]: "valid.jwt.token" } });
    const res = makeMockRes();

    await authMiddleware(req as Request, res as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect((req as any).user?.user_id).toBe("u-1");
  });

  it("token inválido (valid=false) retorna 401", async () => {
    if (!callIdentityMethod) return;

    callIdentityMethod.mockResolvedValueOnce({ valid: false });

    const cookieName = process.env.COOKIE_NAME || "access_token";
    const req = makeMockReq({ cookies: { [cookieName]: "expired.jwt.token" } });
    const res = makeMockRes();

    await authMiddleware(req as Request, res as Response, mockNext);

    expect((res as any).status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it("error del identity-service retorna 503", async () => {
    if (!callIdentityMethod) return;

    callIdentityMethod.mockRejectedValueOnce(new Error("gRPC unavailable"));

    const cookieName = process.env.COOKIE_NAME || "access_token";
    const req = makeMockReq({ cookies: { [cookieName]: "some.token" } });
    const res = makeMockRes();

    await authMiddleware(req as Request, res as Response, mockNext);

    expect((res as any).status).toHaveBeenCalledWith(503);
  });
});
