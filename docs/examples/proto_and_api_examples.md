[← Regresar](../../README.md)

# Ejemplos de payloads y comandos

El cliente externo siempre prueba por el API Gateway. Internamente, el Gateway usa gRPC hacia los servicios principales y las notificaciones viajan por Redis.

```text
Cliente -> HTTP/cookies -> API Gateway -> gRPC -> identity/subscription/fx
identity/subscription -> Redis notification:queue -> notification-service -> SMTP/Mailhog
```

## Evento Redis - registro

```json
{
  "type": "registration",
  "user_id": "ee6b528d-cf4b-483b-aab2-30f2dd09eb82",
  "email": "usuario@example.com",
  "subject": "Confirmación de registro en Quetxal TV",
  "body": "Tu cuenta ya quedó activa.",
  "metadata": {
    "full_name": "Juan Pérez",
    "cta_text": "Iniciar sesión"
  }
}
```

## Evento Redis - recibo de compra

```json
{
  "type": "purchase_receipt",
  "user_id": "ee6b528d-cf4b-483b-aab2-30f2dd09eb82",
  "email": "usuario@example.com",
  "subject": "Recibo de compra - Quetxal TV",
  "body": "Tu suscripción al plan Premium fue creada correctamente.",
  "metadata": {
    "action": "created",
    "plan_id": "3",
    "plan_name": "Premium",
    "price_usd": "12.0",
    "subscription_id": "1"
  }
}
```

## Comandos HTTP por Gateway

Registro:

```bash
curl -i -c cookies.txt -b cookies.txt \
  -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test1@quetxaltv.com","password":"Password123","full_name":"Usuario Prueba"}'
```

Login:

```bash
curl -i -c cookies.txt -b cookies.txt \
  -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test1@quetxaltv.com","password":"Password123"}'
```

FX:

```bash
curl -i -b cookies.txt http://localhost:3000/api/rates/USD/GTQ
curl -i -b cookies.txt http://localhost:3000/api/rates/USD/GTQ
```

Planes y suscripción:

```bash
curl -i -b cookies.txt http://localhost:3000/api/plans

curl -i -b cookies.txt \
  -X POST http://localhost:3000/api/subscriptions \
  -H "Content-Type: application/json" \
  -d '{"plan_id":1}'
```

Mailhog UI: `http://localhost:8025`.
