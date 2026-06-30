[← Regresar](../../README.md)

# subscription-service

Microservicio gRPC de planes y suscripciones con PostgreSQL propio.

El API Gateway llama a este servicio por gRPC y le envía `user_id` y `email` desde el JWT/cookie validado. Después de crear o actualizar una suscripción, el servicio publica un evento en Redis para que `notification-service` genere el correo. No llama directamente a `notification-service`.

## Variables de entorno

- `DATABASE_URL`: cadena de conexión a PostgreSQL de suscripciones.
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`: alternativa si no se usa `DATABASE_URL`.
- `REDIS_URL`: URL interna de Redis.
- `NOTIFICATION_QUEUE_NAME`: cola Redis, por defecto `notification:queue`.

## Ejecutar localmente

```bash
docker compose -f infra/docker-compose.local.yml up --build -d subscription-db redis subscription-service api-gateway
```

## Probar por Gateway

Después de registrarse o iniciar sesión y guardar cookies:

```bash
curl -i -b cookies.txt http://localhost:3000/api/plans

curl -i -b cookies.txt \
  -X POST http://localhost:3000/api/subscriptions \
  -H "Content-Type: application/json" \
  -d '{"plan_id":1}'
```

Resultado esperado:

```text
API Gateway -> gRPC -> subscription-service
subscription-service -> Redis notification:queue
notification-service -> Mailhog
```

Las tablas `plans` y `subscriptions` se crean automáticamente al iniciar el servicio. La columna `subscriptions.user_id` se maneja como texto para aceptar los UUID de Identity.
