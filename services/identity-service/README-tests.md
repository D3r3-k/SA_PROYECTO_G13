[← Regresar](../../README.md)

# Tests — identity-service

## Qué se prueba

| Módulo | Tests |
|---|---|
| `utils/token.ts` — `signIdentityToken` | Genera JWT 3 segmentos, incluye user_id/email/profile_id/roles, tokens únicos por usuario |
| `utils/token.ts` — `verifyIdentityToken` | Token válido, inválido, vacío, firma errónea, roles/permissions como arrays, falta user_id |
| `utils/password.ts` — `hashPassword` | Hash bcrypt, salt aleatorio, longitud 60 |
| `utils/password.ts` — `comparePassword` | Correcto, incorrecto, vacío, case-sensitive, hash inválido |
| `services/identity.service.ts` — `ValidateToken` | Token válido, inválido, vacío |
| `services/identity.service.ts` — `RegisterUser` | Email inválido, contraseña corta, email duplicado, registro exitoso |
| `services/identity.service.ts` — `Login` | Email vacío, usuario no existe, contraseña incorrecta |

Cobertura objetivo: **≥ 75%**

## Setup inicial (solo la primera vez)

```bash
cd services/identity-service
npm install   # Instala jest, ts-jest, @types/jest además de las deps existentes
```

## Correr localmente

```bash
# Todos los tests
npm test

# Con cobertura
npm test -- --coverage

# Watch mode (desarrollo)
npm test -- --watch
```

## Estructura

```
identity-service/
├── src/
│   ├── __tests__/
│   │   ├── token.test.ts           # Pruebas de utils/token.ts
│   │   ├── password.test.ts        # Pruebas de utils/password.ts
│   │   └── identity.service.test.ts  # Pruebas de handlers gRPC
│   ├── utils/
│   │   ├── token.ts
│   │   └── password.ts
│   └── services/identity.service.ts
├── jest.config.ts
└── package.json  (incluye "test": "jest")
```

## Notas

- Los tests de `identity.service.ts` mockean `user.repository` y `profile.repository` con `jest.mock()`.
- `utils/token.ts` y `utils/password.ts` son módulos puros — no requieren mocks.
- `JWT_SECRET` y `JWT_EXPIRES_IN` se setean en `process.env` directamente en los tests.
- Los handlers gRPC aceptan `(call, callback)` — los tests crean mocks de ambos.
