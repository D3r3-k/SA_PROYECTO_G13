[← Regresar](../README.md)

# Pruebas funcionales locales

Estas pruebas validan el flujo completo con un único punto de entrada externo.

## Levantar stack

```bash
docker compose -f infra/docker-compose.local.yml up --build -d
```

## Ver estado y logs

```bash
docker compose -f infra/docker-compose.local.yml ps

docker logs api-gateway
docker logs identity-service
docker logs sa_subscription_service
docker logs sa_notification_service
docker logs sa_redis
```

## Health del Gateway

```bash
curl -i http://localhost:3000/api/health
```

## Registro

```bash
curl -i -c cookies.txt -b cookies.txt \
  -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test1@quetxaltv.com",
    "password": "Password123",
    "full_name": "Usuario Prueba"
  }'
```

Resultado esperado:

```text
identity-service registra el usuario
identity-service publica evento Redis registration
notification-service consume notification:queue
Mailhog recibe el correo
```

Revisar:

```bash
docker logs sa_notification_service
```

Mailhog UI: `http://localhost:8025`.

## Login y sesión

```bash
curl -i -c cookies.txt -b cookies.txt \
  -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test1@quetxaltv.com",
    "password": "Password123"
  }'

curl -i -b cookies.txt http://localhost:3000/api/auth/me
```

## FX con Redis cache

```bash
curl -i -b cookies.txt http://localhost:3000/api/rates/USD/GTQ
curl -i -b cookies.txt http://localhost:3000/api/rates/USD/GTQ
```

La primera respuesta debe devolver `cached: false`; la segunda, `cached: true`.

## Planes y suscripción

```bash
curl -i -b cookies.txt http://localhost:3000/api/plans

curl -i -b cookies.txt \
  -X POST http://localhost:3000/api/subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "plan_id": 1
  }'
```

Resultado esperado:

```text
API Gateway llama subscription-service por gRPC
subscription-service crea la suscripción
subscription-service publica evento Redis purchase_receipt
notification-service consume el evento
Mailhog recibe el recibo de compra
```
