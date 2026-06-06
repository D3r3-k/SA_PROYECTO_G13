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
