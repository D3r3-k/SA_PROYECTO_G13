# Protocol Buffers

Esta carpeta contiene los contratos gRPC usados entre el API Gateway y los microservicios principales.

El frontend no consume estos contratos directamente; el frontend solo consume el API Gateway.

## Reglas rápidas

- Todo contrato `.proto` debe vivir en esta carpeta.
- Todo cambio a un contrato debe hacerse por Pull Request.
- Si un contrato ya lo usa otro servicio, se debe avisar antes de cambiarlo.
- Los contratos deben mantenerse simples y explícitos.
- Cada microservicio mantiene su propia base de datos.

## Decisiones generales

- El API Gateway consume `identity-service`, `fx-service` y `subscription-service` usando gRPC.
- El frontend no consume microservicios directamente.
- Identity Service genera y valida el JWT.
- API Gateway guarda y valida el JWT usando cookie segura.
- `profile_id` vive en Identity Service y se propaga desde el Gateway cuando aplique.
- Las notificaciones productivas no son llamadas directas entre microservicios principales y `notification-service`; se publican como eventos Redis.

## Contratos actuales

| Archivo | Servicio | Uso |
|---|---|---|
| `identity.proto` | Auth, usuarios y perfiles | Gateway -> Identity |
| `fx.proto` | Tasas de cambio | Gateway -> FX |
| `subscription.proto` | Planes y suscripciones | Gateway -> Subscription |
| `notification.proto` | Compatibilidad/admin de notificaciones | Admin/gRPC opcional; flujo productivo usa Redis |
| `catalog.proto` | Catálogo | Dominio catálogo |
| `engagement.proto` | Calificaciones e historial | Dominio engagement |

## Notas de integración

- `CreateSubscriptionRequest` y `UpdateSubscriptionRequest` incluyen `email` para que el Gateway pueda pasar el correo validado desde el JWT/cookie. Así `subscription-service` puede publicar el recibo en Redis sin consultar a Identity ni llamar a Notification por gRPC.
- `notification.proto` conserva `Send` para pruebas internas o herramientas administrativas. No debe usarse como flujo productivo desde `identity-service` ni `subscription-service`.
