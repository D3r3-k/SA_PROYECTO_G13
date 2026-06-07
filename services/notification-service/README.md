# Notification Service

This service accepts notification payloads and queues them for delivery. It supports an optional SMTP delivery mode and falls back to logging/console output when SMTP is not configured.

Configuration (env):

- `SMTP_HOST` — SMTP server hostname (optional)
- `SMTP_PORT` — SMTP server port (optional; default `587`)
- `SMTP_USER` — SMTP username (optional)
- `SMTP_PASSWORD` — SMTP password (optional)
- `SMTP_FROM` — From address to use when sending emails (optional)

Behavior:

- If `SMTP_HOST` (and `SMTP_FROM`) are set, the service will attempt to send emails using the provided SMTP server.
- If SMTP is not configured or sending fails, the service logs the payload to the console as a fallback (development-friendly).

To enable SMTP in local development, populate `services/notification-service/.env.example` values in your `.env` used by docker compose.

# notification-service

Servicio mínimo de notificaciones simulado.

Endpoints principales:

- `GET /health` — healthcheck
- `POST /notify` — acepta JSON con esquema:

```json
{
  "type": "registration|purchase|alert",
  "user_id": "string",
  "email": "user@example.com",
  "subject": "Asunto",
  "message": "Cuerpo del mensaje",
  "metadata": { "any": "extra" }
}
```

- `POST /notify/raw` — acepta payload arbitrario (compatibilidad)

Cómo ejecutar (local con Docker):

```bash
# desde la raíz del repo
docker compose -f infra/docker-compose.local.yml up --build notification-service
```

Ejemplo CURL:

```bash
curl -s -X POST http://localhost:8002/notify \
  -H "Content-Type: application/json" \
  -d '{"type":"registration","user_id":"u1","email":"u1@example.com","subject":"Bienvenido","message":"Gracias por registrarte"}'
```

Notas:

- El servicio simula envío registrando en logs. Para integrar un proveedor real, extienda `_send_notification`.
- Configure variables en `.env` (no subir `.env` al repo).
