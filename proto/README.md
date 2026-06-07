# Protocol Buffers

Esta carpeta contiene los contratos gRPC usados entre el API Gateway y los microservicios.

El frontend no consume estos contratos directamente.  
El frontend solo consume el API Gateway.

## Reglas rápidas

- Todo contrato `.proto` debe vivir en esta carpeta.
- Todo cambio a un contrato debe hacerse por Pull Request.
- Si un contrato ya lo usa otro servicio, se debe avisar antes de cambiarlo.
- Los contratos deben mantenerse simples para avanzar rápido.
- Cada microservicio mantiene su propia base de datos.

## Decisiones generales

- El API Gateway consume los microservicios usando gRPC.
- El frontend no consume microservicios directamente.
- No se utilizará OAuth.
- Identity Service genera el JWT.
- API Gateway guarda y valida el JWT usando cookie segura.
- `profile_id` vive en Identity Service.
- Los demás servicios solo consumen `profile_id`.

## Contratos actuales

| Archivo | Servicio | Responsable |
|---|---|---|
| `identity.proto` | Auth, usuarios y perfiles | Tomas |
| `engagement.proto` | Calificaciones, historial y reanudación | Derek y victor |

## `identity.proto`

Responsable de autenticación, usuarios y perfiles.

Métodos principales:

- `RegisterUser`: registra usuario.
- `Login`: valida credenciales y devuelve JWT.
- `ValidateToken`: valida JWT.
- `CreateProfile`: crea perfil.
- `ListProfiles`: lista perfiles del usuario.
- `SelectProfile`: selecciona perfil.
- `UpdateCredentials`: actualiza credenciales.

Decisiones:

- Usa email y contraseña.
- No usa OAuth.
- Genera el JWT.
- Administra `profile_id`.
- Máximo 5 perfiles por usuario.
- Tiene base de datos propia.

## `engagement.proto`

Responsable de calificaciones, historial y progreso de reproducción.

Métodos principales:

- `RateContent`: califica contenido con pulgar arriba o abajo.
- `GetContentRatingSummary`: devuelve votos y porcentaje de recomendación.
- `SaveProgress`: guarda temporada, episodio y minuto exacto.
- `GetRecentHistory`: devuelve historial reciente.
- `ResumeContent`: devuelve el último punto guardado.

Decisiones:

- Usa `profile_id` recibido desde Gateway.
- No valida perfiles directamente contra Identity.
- Usa `content_id` recibido desde Catalog.
- No guarda título, portada ni metadata del catálogo.
- La calificación es pulgar arriba o pulgar abajo.
- El porcentaje de recomendación se calcula con:

```txt
thumbs_up_count / total_ratings * 100

## Cambios recientes añadidos por el equipo

- `notification.proto`: se añadieron campos en `NotifyRequest` (`type`, `user_id`, `email`, `metadata`) y en `NotifyResponse` (`message_id`) para soportar notificaciones automáticas (registro, recibo de compra, publicación de contenido). Los campos anteriores (`to`, `subject`, `body`) se mantienen para compatibilidad.
- `catalog.proto`: se añadió `ContentPublication` y `PublishResponse` para tipar eventos de publicación de contenido (titulo, categoría, url, `published_at`, `metadata`).
- `subscription.proto`: se añadió el mensaje `SubscriptionEvent` para representar eventos de suscripción (created/updated/cancelled).

IMPORTANTE: Estos cambios son adiciones no destructivas; si algún servicio consume estos contratos, avisa al equipo antes de fusionar para coordinar la actualización de clientes.