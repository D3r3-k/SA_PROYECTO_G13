# Ejemplos de payloads y comandos

Este documento contiene ejemplos JSON para los nuevos mensajes `.proto` y ejemplos de uso HTTP para facilitar las pruebas.

## Notification - `NotifyRequest` (ejemplo: registro)

```json
{
  "type": "registration",
  "user_id": "ee6b528d-cf4b-483b-aab2-30f2dd09eb82",
  "email": "usuario@example.com",
  "subject": "Bienvenido a Quetxal TV",
  "message": "Gracias por registrarte. Activa tu cuenta.",
  "metadata": {
    "full_name": "Juan Pérez"
  }
}
```

## Notification - `NotifyRequest` (ejemplo: recibo de compra)

```json
{
  "type": "purchase",
  "user_id": "ee6b528d-cf4b-483b-aab2-30f2dd09eb82",
  "email": "usuario@example.com",
  "subject": "Recibo de compra - Plan Premium",
  "message": "Gracias por tu compra. Se ha activado tu suscripción.",
  "metadata": {
    "plan_name": "Premium",
    "amount_usd": 9.99,
    "subscription_id": "sub_0001"
  }
}
```

## Catalog - `ContentPublication` (ejemplo)

```json
{
  "content_id": "c_12345",
  "title": "Nuevo episodio - La Aventura",
  "category": "Series",
  "url": "https://cdn.example.com/content/c_12345",
  "published_at": "2026-06-06T12:00:00Z",
  "metadata": {
    "seasons": 1,
    "episode": 1
  }
}
```

## Subscription Event (ejemplo `SubscriptionEvent`)

```json
{
  "subscription_id": "3",
  "user_id": "ee6b528d-cf4b-483b-aab2-30f2dd09eb82",
  "plan_id": "1",
  "action": "created",
  "timestamp": 1686067200
}
```

## Comandos HTTP rápidos

- Enviar notificación (curl):

```bash
curl -s -X POST http://localhost:8003/notify \
  -H "Content-Type: application/json" \
  -d '{"type":"registration","user_id":"u1","email":"u1@example.com","subject":"Bienvenido","message":"Gracias"}'
```

- Crear suscripción (PowerShell):

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8002/subscriptions -ContentType "application/json" -Body '{"user_id":"ee6b528d-cf4b-483b-aab2-30f2dd09eb82","plan_id":1}'
```

- Consultar tasa FX (PowerShell):

```powershell
Invoke-RestMethod -Uri http://localhost:8001/rates/USD/GTQ
```

## Postman

Se recomienda crear una colección con las peticiones anteriores y variables de entorno para `baseUrl` y `user_id`. Si quieres, genero el JSON de una colección Postman básica.
