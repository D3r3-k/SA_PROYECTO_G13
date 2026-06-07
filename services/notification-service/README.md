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
