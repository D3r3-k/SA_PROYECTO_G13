# subscription-service

Servicio de planes y suscripciones con FastAPI y PostgreSQL.

El servicio crea y actualiza suscripciones usando el `user_id` UUID que devuelve Identity.
Después de cada alta o cambio de plan, consulta al API Gateway para resolver el email del usuario y dispara automáticamente el recibo por el Notification Service.

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
Invoke-RestMethod -Method Post -Uri http://localhost:8002/subscriptions -ContentType "application/json" -Body '{"user_id":"ee6b528d-cf4b-483b-aab2-30f2dd09eb82","plan_id":1}'
```

Consultar suscripciones por usuario:

```powershell
Invoke-RestMethod -Uri http://localhost:8002/users/ee6b528d-cf4b-483b-aab2-30f2dd09eb82/subscriptions
```

Eliminar suscripción:

```powershell
Invoke-RestMethod -Method Delete -Uri http://localhost:8002/subscriptions/1
```

Las tablas `plans` y `subscriptions` se crean automáticamente al iniciar el servicio.
La columna `subscriptions.user_id` se maneja como texto para aceptar los UUID de Identity.

## Migraciones y notas operativas

Antes de realizar cambios en la base de datos de suscripciones en entornos de prueba o producción, sigue estos pasos:

1. Realizar backup completo de la base de datos:

```powershell
docker compose -f infra/docker-compose.local.yml exec -T subscription-db pg_dump -U postgres -d subscriptions_db > subscription_db_backup.sql
```

2. Si necesitas aplicar scripts SQL manuales (por ejemplo para cambiar tipos), ejecútalos con `psql` dentro del contenedor o mediante herramienta de migraciones que uses. Ejemplo:

```powershell
docker compose -f infra/docker-compose.local.yml exec -T subscription-db psql -U postgres -d subscriptions_db -f /migrations/001_make_user_id_text.sql
```

3. Verificar que los servicios consumidores envían `user_id` como UUID (cadena). Si algún consumidor envía enteros, actualizar el cliente para enviar UUIDs.

4. Si surge un problema, restaurar desde el backup:

```powershell
cat subscription_db_backup.sql | docker compose -f infra/docker-compose.local.yml exec -T subscription-db psql -U postgres -d subscriptions_db
```

Contacto: informar a `@tomas` y `@derek` antes de aplicar migraciones en `subscription-db`.
