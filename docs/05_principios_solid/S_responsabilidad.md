[Regresar](../../README.md)

# Principio de Responsabilidad Única (SRP)

Cada módulo o clase debe tener una y solo una razón para cambiar, separando las responsabilidades de lógica de negocio, persistencia y comunicación.

---

## 1. ¿Dónde se aplicó?

**Ubicación en el proyecto:**
- [identity.server.ts](../../services/identity-service/src/grpc/identity.server.ts)
- [identity.service.ts](../../services/identity-service/src/services/identity.service.ts)
- [user.repository.ts](../../services/identity-service/src/repositories/user.repository.ts)
- [notification.publisher.ts](../../services/identity-service/src/events/notification.publisher.ts)

**Clases / módulos involucrados:**
- `startIdentityGrpcServer` — capa de transporte gRPC
- `identityService` — lógica de negocio
- `user.repository` / `profile.repository` — persistencia
- `notification.publisher` — publicación de eventos Redis

---

## 2. ¿Cómo se aplicó?

Se separaron las responsabilidades del Identity Service en cuatro módulos con propósito único:

- **identity.server.ts** — su única responsabilidad es inicializar el servidor gRPC, cargar el `.proto` y registrar el servicio. No contiene lógica de negocio.
- **identity.service.ts** — orquesta las reglas de negocio: valida email/password, coordina hash con bcrypt, firma tokens JWT y delega la persistencia al repositorio.
- **user.repository.ts** — su única responsabilidad es ejecutar las llamadas a PostgreSQL a través de los stored procedures (`sp_find_user_by_email`, `sp_register_user`). No conoce reglas de negocio.
- **notification.publisher.ts** — su única responsabilidad es publicar eventos en Redis con `RPUSH`. No sabe qué desencadenó el evento ni qué hace el consumidor.

```typescript
// identity.server.ts — solo transporte
export function startIdentityGrpcServer() {
  const server = new grpc.Server();
  server.addService(
    protoDescriptor.identity.IdentityService.service,
    identityService
  );
  server.bindAsync(address, grpc.ServerCredentials.createInsecure(), ...);
}
```

```typescript
// user.repository.ts — solo persistencia
export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const result = await pool.query<UserRecord>(
    `SELECT * FROM sp_find_user_by_email($1::varchar)`,
    [email]
  );
  return result.rows[0] ?? null;
}
```

```typescript
// notification.publisher.ts — solo publicación Redis
export async function publishNotificationEvent(payload: Record<string, unknown>) {
  await ensureRedisConnection();
  const event = { ...payload, created_at: new Date().toISOString() };
  await redisClient.rPush(queueName, JSON.stringify(event));
}
```

---

## 3. ¿Por qué se aplicó? (Justificación Técnica)

Al aislar cada responsabilidad en su propio módulo:
- Un cambio en los stored procedures de PostgreSQL solo afecta `user.repository.ts`, sin tocar la lógica de negocio ni el transporte gRPC.
- Si se cambia el broker de notificaciones de Redis a otro sistema, solo se modifica `notification.publisher.ts`.
- La lógica de negocio en `identity.service.ts` puede ser probada de forma aislada mockeando el repositorio y el publisher, sin levantar un servidor gRPC real ni una base de datos.

---
