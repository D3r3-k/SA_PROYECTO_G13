/**
 * Pruebas para src/utils/password.ts
 * Funciones puras de bcrypt — no requieren DB ni gRPC.
 */
import { hashPassword, comparePassword } from "../utils/password";

describe("hashPassword", () => {
  it("retorna un hash bcrypt que comienza con $2b$ o $2a$", async () => {
    const hash = await hashPassword("miPassword123");
    expect(hash).toMatch(/^\$2[ab]\$/);
  });

  it("distintas llamadas producen hashes diferentes (salt aleatorio)", async () => {
    const h1 = await hashPassword("mismaPassword");
    const h2 = await hashPassword("mismaPassword");
    expect(h1).not.toBe(h2);
  });

  it("el hash tiene la longitud esperada de bcrypt (60 caracteres)", async () => {
    const hash = await hashPassword("password");
    expect(hash).toHaveLength(60);
  });
});

describe("comparePassword", () => {
  let hash: string;

  beforeAll(async () => {
    hash = await hashPassword("password-correcto");
  });

  it("retorna true para contraseña correcta", async () => {
    const result = await comparePassword("password-correcto", hash);
    expect(result).toBe(true);
  });

  it("retorna false para contraseña incorrecta", async () => {
    const result = await comparePassword("password-incorrecto", hash);
    expect(result).toBe(false);
  });

  it("retorna false para cadena vacía", async () => {
    const result = await comparePassword("", hash);
    expect(result).toBe(false);
  });

  it("comparación es case-sensitive", async () => {
    const result = await comparePassword("PASSWORD-CORRECTO", hash);
    expect(result).toBe(false);
  });

  it("retorna false si el hash es inválido", async () => {
    const result = await comparePassword("password", "hash-invalido");
    expect(result).toBe(false);
  });
});
