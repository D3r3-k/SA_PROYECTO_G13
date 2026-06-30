[← Regresar](../../README.md)

# Tests — api-gateway

## Qué se prueba

| Middleware | Tests |
|---|---|
| `auth.middleware.ts` — `authMiddleware` | Sin cookie → 401, token válido → next() + req.user, token inválido → 401, identity-service error → 503 |
| `admin.middleware.ts` — `requirePermission` | Sin usuario → 401, is_admin=true → acceso, rol admin → acceso, permiso exacto → acceso, sin permiso → 403, sin roles → 403, distintos permisos requeridos |

Cobertura objetivo: **≥ 75%**

## Setup inicial

```bash
cd apps/api-gateway
npm install   # Instala jest, ts-jest, @types/jest, @types/express
```

## Correr localmente

```bash
npm test

# Con cobertura
npm test -- --coverage

# Watch
npm test -- --watch
```

## Estructura

```
api-gateway/
├── src/
│   ├── __tests__/
│   │   ├── auth.middleware.test.ts
│   │   └── admin.middleware.test.ts
│   └── middleware/
│       ├── auth.middleware.ts
│       └── admin.middleware.ts
├── jest.config.ts
└── package.json  (incluye "test": "jest")
```

## Notas

- `auth.middleware.ts` llama internamente a `callIdentityMethod` (cliente gRPC). El test usa `jest.mock(...)` para interceptarlo.
- `admin.middleware.ts` / `requirePermission` es lógica pura (evalúa `req.user`) — no requiere mocks de gRPC.
- Si el import path del cliente gRPC difiere de `../../clients/identity.client`, ajustar la ruta en el mock del test.
