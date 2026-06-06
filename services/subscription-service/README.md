# subscription-service

Servicio de planes y suscripciones con FastAPI y PostgreSQL.

## Variables de entorno

Copiar `.env.example` a `.env` y ajustar los valores de base de datos si hace falta.

- `DATABASE_URL`: cadena de conexión a PostgreSQL.
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`: valores alternativos si no se usa `DATABASE_URL`.

## Ejecutar localmente

Desde la raíz del repo:

```powershell
docker compose -f infra/docker-compose.local.yml up --build -d postgres subscription-service
```

## Probar endpoints

Health:

```powershell
Invoke-RestMethod -Uri http://localhost:8002/health
```

Listar planes:

```powershell
Invoke-RestMethod -Uri http://localhost:8002/plans
```

Crear suscripción:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8002/subscriptions -ContentType "application/json" -Body '{"user_id":1,"plan_id":1}'
```

Consultar suscripciones por usuario:

```powershell
Invoke-RestMethod -Uri http://localhost:8002/subscriptions/1
```

Eliminar suscripción:

```powershell
Invoke-RestMethod -Method Delete -Uri http://localhost:8002/subscriptions/1
```

Las tablas `plans` y `subscriptions` se crean automáticamente al iniciar el servicio.
