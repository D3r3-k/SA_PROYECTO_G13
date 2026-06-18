/**
 * Pruebas unitarias para admin.middleware.ts (requirePermission).
 * La lógica es pura (no llama a gRPC), solo valida req.user.
 */
import { Request, Response, NextFunction } from "express";
import { requirePermission } from "../middleware/admin.middleware";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReqWithUser(user: Record<string, unknown> | null): Partial<Request> {
  return { user } as any;
}

function makeMockRes(): Partial<Response> {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const next: NextFunction = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── requirePermission ────────────────────────────────────────────────────────

describe("requirePermission", () => {
  const middleware = requirePermission("catalog:admin");

  it("sin usuario retorna 401", () => {
    const req = makeReqWithUser(null);
    const res = makeMockRes();

    middleware(req as Request, res as Response, next);

    expect((res as any).status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("usuario admin (is_admin=true) puede acceder", () => {
    const req = makeReqWithUser({
      user_id: "u-1",
      email: "a@a.com",
      is_admin: true,
      roles: [],
      permissions: [],
    });
    const res = makeMockRes();

    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect((res as any).status).not.toHaveBeenCalled();
  });

  it("usuario con rol admin puede acceder", () => {
    const req = makeReqWithUser({
      user_id: "u-2",
      email: "b@b.com",
      is_admin: false,
      roles: ["admin"],
      permissions: [],
    });
    const res = makeMockRes();

    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it("usuario con el permiso exacto puede acceder", () => {
    const req = makeReqWithUser({
      user_id: "u-3",
      email: "c@c.com",
      is_admin: false,
      roles: ["user"],
      permissions: ["catalog:admin"],
    });
    const res = makeMockRes();

    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it("usuario sin permiso retorna 403", () => {
    const req = makeReqWithUser({
      user_id: "u-4",
      email: "d@d.com",
      is_admin: false,
      roles: ["user"],
      permissions: ["catalog:read"],
    });
    const res = makeMockRes();

    middleware(req as Request, res as Response, next);

    expect((res as any).status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("usuario sin roles ni permisos retorna 403", () => {
    const req = makeReqWithUser({
      user_id: "u-5",
      email: "e@e.com",
      is_admin: false,
      roles: [],
      permissions: [],
    });
    const res = makeMockRes();

    middleware(req as Request, res as Response, next);

    expect((res as any).status).toHaveBeenCalledWith(403);
  });

  it("diferentes permisos requeridos se evalúan independientemente", () => {
    const auditMiddleware = requirePermission("audit:read");
    const req = makeReqWithUser({
      user_id: "u-6",
      email: "f@f.com",
      is_admin: false,
      roles: [],
      permissions: ["audit:read"],
    });
    const res = makeMockRes();

    auditMiddleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });
});
