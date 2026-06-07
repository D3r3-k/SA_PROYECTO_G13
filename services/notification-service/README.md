# Servicio de Notificaciones

Servicio que recibe payloads de notificación y los entrega por correo electrónico o los registra en consola si SMTP no está configurado.

Configuración (variables de entorno):

- `SMTP_HOST` — host SMTP (opcional)
- `SMTP_PORT` — puerto SMTP (opcional; por defecto `587`)
- `SMTP_USER` — usuario SMTP (opcional)
- `SMTP_PASSWORD` — contraseña SMTP (opcional)
- `SMTP_FROM` — dirección "From" para los correos (opcional)

Comportamiento:

- Si `SMTP_HOST` y `SMTP_FROM` están configurados, el servicio intentará enviar correos vía SMTP (STARTTLS cuando esté disponible).
- Si SMTP no está configurado o falla el envío, el servicio hace fallback a logging/console (útil en desarrollo).

Eventos soportados (contract):

- `registration` — correo de confirmación tras registro de usuario.
- `purchase` — recibo después de crear o actualizar una suscripción.
- `content-publication` — alerta cuando se publica nuevo contenido.

Plantilla y endpoints principales:

- El servicio renderiza una plantilla HTML en estilo oscuro y adapta el contenido según `type` y `metadata`.
- `GET /health` — healthcheck.
- `POST /notify` — acepta JSON con este esquema:

```json
{
  "type": "registration|purchase|content-publication|alert",
  "user_id": "string",
  "email": "user@example.com",
  "subject": "Asunto opcional",
  "message": "Cuerpo opcional",
  "metadata": { "any": "extra" }
}
```

- `POST /notify/raw` — acepta payload arbitrario (compatibilidad).

Ejecutar localmente (desde la raíz del repo):

```bash
docker compose -f infra/docker-compose.local.yml up --build -d notification-service
```

Ejemplo de uso (curl):

```bash
curl -s -X POST http://localhost:8002/notify \
  -H "Content-Type: application/json" \
  -d '{"type":"registration","user_id":"u1","email":"u1@example.com","subject":"Bienvenido","message":"Gracias por registrarte"}'
```

Notas:

- Configure `SMTP_*` en `.env` para activar envío real (no subir credenciales al repo).
- En desarrollo puede usar MailHog (puerto 8025) y no configurar SMTP.
- La plantilla HTML está diseñada para confirmaciones, recibos y alertas de contenido.
