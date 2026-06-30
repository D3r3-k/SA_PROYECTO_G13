[← Regresar](../../README.md)

# Servicio de Notificaciones

Microservicio de notificaciones por correo. En el flujo productivo consume eventos desde Redis y envía correos mediante SMTP o Mailhog.

## Flujo productivo

```text
identity-service/subscription-service -> Redis RPUSH notification:queue
notification-service -> Redis BLPOP notification:queue -> SMTP/Mailhog
```

El método gRPC `Send` se conserva como compatibilidad y encolador administrativo, pero `identity-service` y `subscription-service` no lo usan directamente.

## Variables de entorno

- `REDIS_URL`: URL interna de Redis.
- `NOTIFICATION_QUEUE_NAME`: cola Redis, por defecto `notification:queue`.
- `SMTP_HOST`: host SMTP. En local: `mailhog`.
- `SMTP_PORT`: puerto SMTP. En local: `1025`.
- `SMTP_USERNAME`: usuario SMTP, vacío para Mailhog.
- `SMTP_PASSWORD`: contraseña SMTP, vacía para Mailhog.
- `SMTP_FROM`: remitente.
- `SMTP_STARTTLS`: `false` para Mailhog, `true` para SMTP real con STARTTLS.

## Eventos soportados

- `registration`: confirmación de registro.
- `purchase_receipt`: recibo de compra.
- `subscription_update`: actualización de suscripción.
- `content-publication`: alerta de nueva publicación.

## Ejecutar localmente

```bash
docker compose -f infra/docker-compose.local.yml up --build -d redis mailhog notification-service
```

## Prueba administrativa con Redis

```bash
docker compose -f infra/docker-compose.local.yml exec redis redis-cli RPUSH notification:queue \
  '{"type":"registration","user_id":"u1","email":"u1@example.com","subject":"Bienvenido","body":"Gracias por registrarte","metadata":{"full_name":"Usuario"}}'
```

Luego revisar logs y Mailhog:

```bash
docker logs sa_notification_service
```

Mailhog UI: `http://localhost:8025`.
