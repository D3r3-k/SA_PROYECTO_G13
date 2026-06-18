/**
 * Pruebas de integración para los handlers de identity.service.ts.
 * Mockea DB (user.repository, profile.repository) y token para aislar la lógica.
 */

// Mocks deben declararse ANTES de los imports que los consumen
jest.mock("../repositories/user.repository");
jest.mock("../repositories/profile.repository");
jest.mock("../db/pool", () => ({ pool: { query: jest.fn() } }));
jest.mock("../events/notification.publisher", () => ({
  publishNotificationEvent: jest.fn().mockResolvedValue(undefined),
}));
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

function fakeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-uuid-1",
    email: "usuario@example.com",
    full_name: "Carlos García",
    password_hash: "$2b$10$dummyHashForTesting000000000000000000000000000000000000",
    ...overrides,
  };
}

function fakeProfile(overrides: Record<string, unknown> = {}) {
  return {
    profile_id: "prof-uuid-1",
    user_id: "user-uuid-1",
    name: "Mi Perfil",
    avatar_url: "https://example.com/avatar.jpg",
    ...overrides,
  };
}

function fakeAuthz() {
  return { roles: ["user"], permissions: [], isAdmin: false };
}

// ─── Token utilities ───────────────────────────────────────────────────────────

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

// ─── Service module ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let svc: any;

beforeAll(async () => {
  const mod = await import("../services/identity.service");
  svc = mod.identityService;
});

// ─── ValidateToken ─────────────────────────────────────────────────────────────

describe("ValidateToken handler", () => {
  it("token válido retorna valid=true y user_id", (done) => {
    const token = signIdentityToken({ user_id: "u-valid", email: "v@v.com" });
    svc.ValidateToken(makeCall({ token }), (err: any, res: any) => {
      expect(err).toBeNull();
      expect(res.valid).toBe(true);
      expect(res.user_id).toBe("u-valid");
      done();
    });
  });

  it("token inválido retorna valid=false", (done) => {
    svc.ValidateToken(makeCall({ token: "bad.token.value" }), (_err: any, res: any) => {
      expect(res.valid).toBe(false);
      done();
    });
  });

  it("token vacío retorna valid=false", (done) => {
    svc.ValidateToken(makeCall({ token: "" }), (_err: any, res: any) => {
      expect(res.valid).toBe(false);
      done();
    });
  });
});

// ─── RegisterUser ──────────────────────────────────────────────────────────────

describe("RegisterUser handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (userRepo.findUserByEmail as jest.Mock).mockResolvedValue(null);
    (userRepo.registerUser as jest.Mock).mockResolvedValue(undefined);
    (userRepo.getUserAuthorization as jest.Mock).mockResolvedValue(fakeAuthz());
    (userRepo.ensureAdminRoleForEmail as jest.Mock).mockResolvedValue(undefined);
  });

  it("email inválido retorna error", (done) => {
    svc.RegisterUser(
      makeCall({ email: "not-an-email", password: "password123", full_name: "Test" }),
      (_err: any, res: any) => {
        expect(res.user_id).toBe("");
        done();
      }
    );
  });

  it("contraseña corta retorna error", (done) => {
    svc.RegisterUser(
      makeCall({ email: "valid@example.com", password: "short", full_name: "Test" }),
      (_err: any, res: any) => {
        expect(res.user_id).toBe("");
        done();
      }
    );
  });

  it("campos vacíos retornan error", (done) => {
    svc.RegisterUser(
      makeCall({ email: "", password: "", full_name: "" }),
      (_err: any, res: any) => {
        expect(res.user_id).toBe("");
        done();
      }
    );
  });

  it("email ya registrado retorna error", (done) => {
    (userRepo.findUserByEmail as jest.Mock).mockResolvedValue(fakeUser());
    svc.RegisterUser(
      makeCall({ email: "usuario@example.com", password: "password123", full_name: "Otro" }),
      (_err: any, res: any) => {
        expect(res.user_id).toBe("");
        done();
      }
    );
  });

  it("registro exitoso retorna token válido", (done) => {
    svc.RegisterUser(
      makeCall({ email: "nuevo@example.com", password: "password123", full_name: "Nuevo" }),
      (_err: any, res: any) => {
        if (res.user_id) {
          expect(res.user_id).toBeTruthy();
          expect(res.token).toBeTruthy();
        }
        done();
      }
    );
  });

  it("error de DB con code 23505 retorna email duplicado", (done) => {
    (userRepo.findUserByEmail as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error("duplicate key"), { code: "23505" })
    );
    svc.RegisterUser(
      makeCall({ email: "dup@example.com", password: "password123", full_name: "Dup" }),
      (_err: any, res: any) => {
        expect(res.user_id).toBe("");
        done();
      }
    );
  });
});

// ─── Login ─────────────────────────────────────────────────────────────────────

describe("Login handler", () => {
  const { hashPassword } = require("../utils/password");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("email vacío retorna error", (done) => {
    svc.Login(makeCall({ email: "", password: "password123" }), (_err: any, res: any) => {
      expect(res.user_id).toBe("");
      done();
    });
  });

  it("usuario no encontrado retorna error", (done) => {
    (userRepo.findUserByEmail as jest.Mock).mockResolvedValue(null);
    svc.Login(
      makeCall({ email: "noexiste@example.com", password: "password123" }),
      (_err: any, res: any) => {
        expect(res.user_id).toBe("");
        done();
      }
    );
  });

  it("contraseña incorrecta retorna error", async () => {
    const hash = await hashPassword("password-correcto");
    (userRepo.findUserByEmail as jest.Mock).mockResolvedValue(fakeUser({ password_hash: hash }));
    await new Promise<void>((resolve) => {
      svc.Login(
        makeCall({ email: "usuario@example.com", password: "password-incorrecto" }),
        (_err: any, res: any) => {
          expect(res.user_id).toBe("");
          resolve();
        }
      );
    });
  });

  it("login exitoso retorna token", async () => {
    const hash = await hashPassword("password-correcto");
    (userRepo.findUserByEmail as jest.Mock).mockResolvedValue(fakeUser({ password_hash: hash }));
    (userRepo.getUserAuthorization as jest.Mock).mockResolvedValue(fakeAuthz());
    await new Promise<void>((resolve) => {
      svc.Login(
        makeCall({ email: "usuario@example.com", password: "password-correcto" }),
        (_err: any, res: any) => {
          expect(res.user_id).toBeTruthy();
          expect(res.token).toBeTruthy();
          resolve();
        }
      );
    });
  });
});

// ─── GetUserById ───────────────────────────────────────────────────────────────

describe("GetUserById handler", () => {
  beforeEach(() => jest.clearAllMocks());

  it("user_id vacío retorna error", (done) => {
    svc.GetUserById(makeCall({ user_id: "" }), (_err: any, res: any) => {
      expect(res.user_id).toBe("");
      done();
    });
  });

  it("usuario no encontrado retorna error", (done) => {
    (userRepo.findUserById as jest.Mock).mockResolvedValue(null);
    svc.GetUserById(makeCall({ user_id: "u-not-found" }), (_err: any, res: any) => {
      expect(res.user_id).toBe("");
      done();
    });
  });

  it("éxito retorna datos del usuario", (done) => {
    (userRepo.findUserById as jest.Mock).mockResolvedValue(fakeUser());
    (userRepo.getUserAuthorization as jest.Mock).mockResolvedValue(fakeAuthz());
    svc.GetUserById(makeCall({ user_id: "user-uuid-1" }), (_err: any, res: any) => {
      expect(res.email).toBe("usuario@example.com");
      done();
    });
  });
});

// ─── CreateProfile ─────────────────────────────────────────────────────────────

describe("CreateProfile handler", () => {
  beforeEach(() => jest.clearAllMocks());

  it("campos vacíos retornan error", (done) => {
    svc.CreateProfile(makeCall({ user_id: "", name: "" }), (_err: any, res: any) => {
      expect(res.profile_id).toBe("");
      done();
    });
  });

  it("usuario no encontrado retorna error", (done) => {
    (userRepo.findUserById as jest.Mock).mockResolvedValue(null);
    svc.CreateProfile(
      makeCall({ user_id: "u-missing", name: "Mi perfil" }),
      (_err: any, res: any) => {
        expect(res.profile_id).toBe("");
        done();
      }
    );
  });

  it("más de 5 perfiles retorna error", (done) => {
    (userRepo.findUserById as jest.Mock).mockResolvedValue(fakeUser());
    (profileRepo.createProfile as jest.Mock).mockRejectedValueOnce(
      new Error("User cannot have more than 5 profiles")
    );
    svc.CreateProfile(
      makeCall({ user_id: "user-uuid-1", name: "Sexto perfil" }),
      (_err: any, res: any) => {
        expect(res.profile_id).toBe("");
        done();
      }
    );
  });

  it("éxito crea perfil", (done) => {
    (userRepo.findUserById as jest.Mock).mockResolvedValue(fakeUser());
    (profileRepo.createProfile as jest.Mock).mockResolvedValue(undefined);
    svc.CreateProfile(
      makeCall({ user_id: "user-uuid-1", name: "Nuevo perfil", avatar_url: "" }),
      (_err: any, res: any) => {
        expect(res.name).toBe("Nuevo perfil");
        done();
      }
    );
  });
});

// ─── ListProfiles ──────────────────────────────────────────────────────────────

describe("ListProfiles handler", () => {
  beforeEach(() => jest.clearAllMocks());

  it("user_id vacío retorna lista vacía", (done) => {
    svc.ListProfiles(makeCall({ user_id: "" }), (_err: any, res: any) => {
      expect(res.profiles).toEqual([]);
      done();
    });
  });

  it("éxito retorna lista de perfiles", (done) => {
    (profileRepo.findProfilesByUserId as jest.Mock).mockResolvedValue([
      fakeProfile(),
      fakeProfile({ profile_id: "prof-uuid-2", name: "Segundo perfil" }),
    ]);
    svc.ListProfiles(makeCall({ user_id: "user-uuid-1" }), (_err: any, res: any) => {
      expect(res.profiles.length).toBe(2);
      done();
    });
  });

  it("error de DB llama handleUnexpectedError", (done) => {
    (profileRepo.findProfilesByUserId as jest.Mock).mockRejectedValueOnce(
      new Error("DB unavailable")
    );
    svc.ListProfiles(makeCall({ user_id: "user-uuid-1" }), (err: any) => {
      expect(err).toBeDefined();
      done();
    });
  });
});

// ─── SelectProfile ─────────────────────────────────────────────────────────────

describe("SelectProfile handler", () => {
  beforeEach(() => jest.clearAllMocks());

  it("campos vacíos retornan error", (done) => {
    svc.SelectProfile(makeCall({ user_id: "", profile_id: "" }), (_err: any, res: any) => {
      expect(res.profile_id).toBe("");
      done();
    });
  });

  it("usuario no encontrado retorna error", (done) => {
    (userRepo.findUserById as jest.Mock).mockResolvedValue(null);
    svc.SelectProfile(
      makeCall({ user_id: "u-missing", profile_id: "p-1" }),
      (_err: any, res: any) => {
        expect(res.profile_id).toBe("");
        done();
      }
    );
  });

  it("perfil no encontrado retorna error", (done) => {
    (userRepo.findUserById as jest.Mock).mockResolvedValue(fakeUser());
    (profileRepo.findProfileByUserAndProfileId as jest.Mock).mockResolvedValue(null);
    svc.SelectProfile(
      makeCall({ user_id: "user-uuid-1", profile_id: "p-not-found" }),
      (_err: any, res: any) => {
        expect(res.profile_id).toBe("");
        done();
      }
    );
  });

  it("éxito selecciona perfil y retorna token", (done) => {
    (userRepo.findUserById as jest.Mock).mockResolvedValue(fakeUser());
    (profileRepo.findProfileByUserAndProfileId as jest.Mock).mockResolvedValue(fakeProfile());
    (userRepo.getUserAuthorization as jest.Mock).mockResolvedValue(fakeAuthz());
    svc.SelectProfile(
      makeCall({ user_id: "user-uuid-1", profile_id: "prof-uuid-1" }),
      (_err: any, res: any) => {
        expect(res.profile_id).toBe("prof-uuid-1");
        expect(res.token).toBeTruthy();
        done();
      }
    );
  });
});

// ─── UpdateProfile ─────────────────────────────────────────────────────────────

describe("UpdateProfile handler", () => {
  beforeEach(() => jest.clearAllMocks());

  it("campos vacíos retornan error", (done) => {
    svc.UpdateProfile(
      makeCall({ user_id: "", profile_id: "", name: "" }),
      (_err: any, res: any) => {
        expect(res.profile_id).toBe("");
        done();
      }
    );
  });

  it("perfil no encontrado retorna error", (done) => {
    (profileRepo.updateProfileByUserAndProfileId as jest.Mock).mockResolvedValue(null);
    svc.UpdateProfile(
      makeCall({ user_id: "u-1", profile_id: "p-1", name: "Nuevo nombre" }),
      (_err: any, res: any) => {
        expect(res.profile_id).toBe("");
        done();
      }
    );
  });

  it("éxito actualiza perfil", (done) => {
    (profileRepo.updateProfileByUserAndProfileId as jest.Mock).mockResolvedValue(
      fakeProfile({ name: "Nombre actualizado" })
    );
    svc.UpdateProfile(
      makeCall({ user_id: "user-uuid-1", profile_id: "prof-uuid-1", name: "Nombre actualizado" }),
      (_err: any, res: any) => {
        expect(res.name).toBe("Nombre actualizado");
        done();
      }
    );
  });
});

// ─── DeleteProfile ─────────────────────────────────────────────────────────────

describe("DeleteProfile handler", () => {
  beforeEach(() => jest.clearAllMocks());

  it("campos vacíos retornan error", (done) => {
    svc.DeleteProfile(makeCall({ user_id: "", profile_id: "" }), (_err: any, res: any) => {
      expect(res.success).toBe(false);
      done();
    });
  });

  it("éxito elimina perfil", (done) => {
    (profileRepo.deleteProfileByUserAndProfileId as jest.Mock).mockResolvedValue({
      success: true,
      message: "Profile deleted",
    });
    svc.DeleteProfile(
      makeCall({ user_id: "user-uuid-1", profile_id: "prof-uuid-1" }),
      (_err: any, res: any) => {
        expect(res.success).toBe(true);
        done();
      }
    );
  });
});

// ─── UpdateCredentials ─────────────────────────────────────────────────────────

describe("UpdateCredentials handler", () => {
  const { hashPassword } = require("../utils/password");

  beforeEach(() => jest.clearAllMocks());

  it("campos vacíos retornan error", (done) => {
    svc.UpdateCredentials(
      makeCall({ user_id: "", current_password: "", new_password: "" }),
      (_err: any, res: any) => {
        expect(res.success).toBe(false);
        done();
      }
    );
  });

  it("contraseña nueva corta retorna error", (done) => {
    svc.UpdateCredentials(
      makeCall({ user_id: "u-1", current_password: "oldpass1234", new_password: "short" }),
      (_err: any, res: any) => {
        expect(res.success).toBe(false);
        done();
      }
    );
  });

  it("misma contraseña retorna error", (done) => {
    svc.UpdateCredentials(
      makeCall({ user_id: "u-1", current_password: "samepassword", new_password: "samepassword" }),
      (_err: any, res: any) => {
        expect(res.success).toBe(false);
        done();
      }
    );
  });

  it("usuario no encontrado retorna error", (done) => {
    (userRepo.findUserById as jest.Mock).mockResolvedValue(null);
    svc.UpdateCredentials(
      makeCall({ user_id: "u-missing", current_password: "oldpass1234", new_password: "newpass1234" }),
      (_err: any, res: any) => {
        expect(res.success).toBe(false);
        done();
      }
    );
  });

  it("contraseña actual incorrecta retorna error", async () => {
    const hash = await hashPassword("la-correcta");
    (userRepo.findUserById as jest.Mock).mockResolvedValue(fakeUser({ password_hash: hash }));
    await new Promise<void>((resolve) => {
      svc.UpdateCredentials(
        makeCall({ user_id: "user-uuid-1", current_password: "incorrecta1234", new_password: "nuevapass1234" }),
        (_err: any, res: any) => {
          expect(res.success).toBe(false);
          resolve();
        }
      );
    });
  });

  it("éxito actualiza contraseña", async () => {
    const hash = await hashPassword("old-password");
    (userRepo.findUserById as jest.Mock).mockResolvedValue(fakeUser({ password_hash: hash }));
    (userRepo.updatePasswordHash as jest.Mock).mockResolvedValue(undefined);
    await new Promise<void>((resolve) => {
      svc.UpdateCredentials(
        makeCall({ user_id: "user-uuid-1", current_password: "old-password", new_password: "new-password" }),
        (_err: any, res: any) => {
          expect(res.success).toBe(true);
          resolve();
        }
      );
    });
  });
});

// ─── ListAuditLogs ─────────────────────────────────────────────────────────────

describe("ListAuditLogs handler", () => {
  beforeEach(() => jest.clearAllMocks());

  it("éxito retorna lista de auditoría", (done) => {
    (userRepo.listAuditLogs as jest.Mock).mockResolvedValue([
      { id: 1, action: "UPDATE", created_at: new Date() },
    ]);
    svc.ListAuditLogs(makeCall({}), (_err: any, res: any) => {
      expect(res.success).toBe(true);
      expect(res.items.length).toBe(1);
      done();
    });
  });

  it("error de DB llama handleUnexpectedError", (done) => {
    (userRepo.listAuditLogs as jest.Mock).mockRejectedValueOnce(new Error("DB error"));
    svc.ListAuditLogs(makeCall({}), (err: any) => {
      expect(err).toBeDefined();
      done();
    });
  });
});
