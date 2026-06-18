/**
 * Pruebas para src/utils/token.ts
 * Funciones puras de JWT — no requieren DB ni gRPC.
 */
import { signIdentityToken, verifyIdentityToken } from "../utils/token";

// Configurar JWT_SECRET y JWT_EXPIRES_IN antes de importar el módulo
process.env.JWT_SECRET = "test-secret-key-para-pruebas-unitarias";
process.env.JWT_EXPIRES_IN = "1h";

const BASE_PAYLOAD = {
  user_id: "user-abc-123",
  email: "test@example.com",
};

describe("signIdentityToken", () => {
  it("genera un JWT con tres segmentos", () => {
    const token = signIdentityToken(BASE_PAYLOAD);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3);
  });

  it("incluye user_id y email en el payload", () => {
    const token = signIdentityToken(BASE_PAYLOAD);
    const payload = verifyIdentityToken(token);
    expect(payload?.user_id).toBe(BASE_PAYLOAD.user_id);
    expect(payload?.email).toBe(BASE_PAYLOAD.email);
  });

  it("incluye profile_id cuando se proporciona", () => {
    const token = signIdentityToken({ ...BASE_PAYLOAD, profile_id: "prof-1" });
    const payload = verifyIdentityToken(token);
    expect(payload?.profile_id).toBe("prof-1");
  });

  it("incluye roles cuando se proporcionan", () => {
    const token = signIdentityToken({ ...BASE_PAYLOAD, roles: ["admin", "user"] });
    const payload = verifyIdentityToken(token);
    expect(payload?.roles).toContain("admin");
  });

  it("tokens diferentes para distintos usuarios", () => {
    const t1 = signIdentityToken({ user_id: "u1", email: "a@a.com" });
    const t2 = signIdentityToken({ user_id: "u2", email: "b@b.com" });
    expect(t1).not.toBe(t2);
  });
});

describe("verifyIdentityToken", () => {
  it("retorna payload para token válido", () => {
    const token = signIdentityToken(BASE_PAYLOAD);
    const result = verifyIdentityToken(token);
    expect(result).not.toBeNull();
    expect(result?.user_id).toBe(BASE_PAYLOAD.user_id);
    expect(result?.email).toBe(BASE_PAYLOAD.email);
  });

  it("retorna null para token inválido", () => {
    expect(verifyIdentityToken("invalid.token.here")).toBeNull();
  });

  it("retorna null para token vacío", () => {
    expect(verifyIdentityToken("")).toBeNull();
  });

  it("retorna null para token con firma incorrecta", () => {
    const token = signIdentityToken(BASE_PAYLOAD);
    const tampered = token.slice(0, -5) + "XXXXX";
    expect(verifyIdentityToken(tampered)).toBeNull();
  });

  it("normaliza roles como array de strings", () => {
    const token = signIdentityToken({ ...BASE_PAYLOAD, roles: ["admin"] });
    const result = verifyIdentityToken(token);
    expect(Array.isArray(result?.roles)).toBe(true);
  });

  it("normaliza permissions como array de strings", () => {
    const token = signIdentityToken({ ...BASE_PAYLOAD, permissions: ["catalog:read"] });
    const result = verifyIdentityToken(token);
    expect(Array.isArray(result?.permissions)).toBe(true);
  });

  it("retorna null si falta user_id en el payload", () => {
    // JWT con email pero sin user_id
    const jwt = require("jsonwebtoken");
    const badToken = jwt.sign(
      { email: "test@example.com" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    expect(verifyIdentityToken(badToken)).toBeNull();
  });
});
