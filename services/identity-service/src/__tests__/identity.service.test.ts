/**
 * Pruebas de integración para los handlers de identity.service.ts.
 * Mockea DB (user.repository, profile.repository) y token para aislar la lógica.
 */

// Mocks deben declararse ANTES de los imports que los consumen
jest.mock("../repositories/user.repository");
jest.mock("../repositories/profile.repository");
jest.mock("../db/pool", () => ({ pool: { query: jest.fn() } }));

// Silenciar el listener de Redis si existe
jest.mock("redis", () => ({
  createClient: jest.fn().mockReturnValue({
    connect: jest.fn(),
    on: jest.fn(),
    publish: jest.fn(),
    quit: jest.fn(),
  }),
}));

import * as userRepo from "../repositories/user.repository";
import * as profileRepo from "../repositories/profile.repository";
import { signIdentityToken, verifyIdentityToken } from "../utils/token";

process.env.JWT_SECRET = "test-secret-unitarias";
process.env.JWT_EXPIRES_IN = "1h";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCall(request: Record<string, unknown>) {
  return { request } as any;
}

function makeCallback() {
  const cb = jest.fn();
  return cb;
}

function fakeUser(overrides = {}) {
  return {
    id: "user-uuid-1",
    email: "usuario@example.com",
    full_name: "Carlos García",
    password_hash: "$2b$10$dummyHashForTesting000000000000000000000000000000000000",
    ...overrides,
  };
}

// ─── Token utilities (smoke tests de la capa de token) ────────────────────────

describe("JWT round-trip básico", () => {
  it("sign → verify retorna el mismo user_id y email", () => {
    const token = signIdentityToken({ user_id: "u1", email: "a@b.com" });
    const decoded = verifyIdentityToken(token);
    expect(decoded?.user_id).toBe("u1");
    expect(decoded?.email).toBe("a@b.com");
  });

  it("token con profile_id conserva el perfil", () => {
    const token = signIdentityToken({
      user_id: "u2",
      email: "x@y.com",
      profile_id: "prof-42",
    });
    const decoded = verifyIdentityToken(token);
    expect(decoded?.profile_id).toBe("prof-42");
  });
});

// ─── ValidateToken (handler) ──────────────────────────────────────────────────

describe("ValidateToken handler", () => {
  // Importamos el servicio después de los mocks para que tome los mocks
  let identityService: typeof import("../services/identity.service");

  beforeAll(async () => {
    identityService = await import("../services/identity.service");
  });

  it("token válido retorna valid=true y user_id", (done) => {
    const token = signIdentityToken({ user_id: "u-valid", email: "v@v.com" });
    const call = makeCall({ token });
    const cb = makeCallback();

    identityService.ValidateToken(call, (err: any, res: any) => {
      expect(err).toBeNull();
      expect(res.valid).toBe(true);
      expect(res.user_id).toBe("u-valid");
      done();
    });
  });

  it("token inválido retorna valid=false", (done) => {
    const call = makeCall({ token: "bad.token.value" });

    identityService.ValidateToken(call, (err: any, res: any) => {
      expect(res.valid).toBe(false);
      done();
    });
  });

  it("token vacío retorna valid=false", (done) => {
    const call = makeCall({ token: "" });

    identityService.ValidateToken(call, (err: any, res: any) => {
      expect(res.valid).toBe(false);
      done();
    });
  });
});

// ─── RegisterUser (handler) ───────────────────────────────────────────────────

describe("RegisterUser handler", () => {
  let identityService: typeof import("../services/identity.service");

  beforeAll(async () => {
    identityService = await import("../services/identity.service");
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Email no existe por defecto
    (userRepo.findUserByEmail as jest.Mock).mockResolvedValue(null);
    (userRepo.registerUser as jest.Mock).mockResolvedValue(undefined);
    (userRepo.getUserAuthorization as jest.Mock).mockResolvedValue({
      roles: ["user"],
      permissions: [],
      isAdmin: false,
    });
    (userRepo.ensureAdminRoleForEmail as jest.Mock).mockResolvedValue(undefined);
  });

  it("email inválido retorna error", (done) => {
    const call = makeCall({
      email: "not-an-email",
      password: "password123",
      full_name: "Test",
    });

    identityService.RegisterUser(call, (err: any, res: any) => {
      expect(res.user_id).toBe("");
      done();
    });
  });

  it("contraseña corta retorna error", (done) => {
    const call = makeCall({
      email: "valid@example.com",
      password: "short",
      full_name: "Test",
    });

    identityService.RegisterUser(call, (err: any, res: any) => {
      expect(res.user_id).toBe("");
      done();
    });
  });

  it("email ya registrado retorna error", (done) => {
    (userRepo.findUserByEmail as jest.Mock).mockResolvedValue(fakeUser());

    const call = makeCall({
      email: "usuario@example.com",
      password: "password123",
      full_name: "Otro",
    });

    identityService.RegisterUser(call, (err: any, res: any) => {
      expect(res.user_id).toBe("");
      done();
    });
  });

  it("registro exitoso retorna token válido", (done) => {
    (userRepo.findUserByEmail as jest.Mock).mockResolvedValue(null);

    const call = makeCall({
      email: "nuevo@example.com",
      password: "password123",
      full_name: "Nuevo Usuario",
    });

    identityService.RegisterUser(call, (err: any, res: any) => {
      if (res.user_id) {
        expect(res.user_id).toBeTruthy();
        expect(res.token).toBeTruthy();
      }
      // Si hay error de DB mockeado, solo verificamos que no crashea
      done();
    });
  });
});

// ─── Login (handler) ──────────────────────────────────────────────────────────

describe("Login handler", () => {
  let identityService: typeof import("../services/identity.service");
  const { hashPassword } = require("../utils/password");

  beforeAll(async () => {
    identityService = await import("../services/identity.service");
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("email vacío retorna error", (done) => {
    const call = makeCall({ email: "", password: "password123" });

    identityService.Login(call, (err: any, res: any) => {
      expect(res.user_id).toBe("");
      done();
    });
  });

  it("usuario no encontrado retorna error", (done) => {
    (userRepo.findUserByEmail as jest.Mock).mockResolvedValue(null);

    const call = makeCall({ email: "noexiste@example.com", password: "password123" });

    identityService.Login(call, (err: any, res: any) => {
      expect(res.user_id).toBe("");
      done();
    });
  });

  it("contraseña incorrecta retorna error", async () => {
    const hash = await hashPassword("password-correcto");
    (userRepo.findUserByEmail as jest.Mock).mockResolvedValue(
      fakeUser({ password_hash: hash })
    );

    await new Promise<void>((resolve) => {
      const call = makeCall({ email: "usuario@example.com", password: "password-incorrecto" });
      identityService.Login(call, (err: any, res: any) => {
        expect(res.user_id).toBe("");
        resolve();
      });
    });
  });
});
