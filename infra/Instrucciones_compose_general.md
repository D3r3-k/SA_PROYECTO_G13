# Docker Compose separado con bases de datos en GCP

Estos archivos permiten levantar cada capa de forma independiente:

- `docker-compose.services.yml`: Redis + microservicios gRPC. No levanta PostgreSQL local.
- `docker-compose.gateway.yml`: API Gateway HTTP.
- `docker-compose.frontend.yml`: Frontend Nginx.
- `.env.gcp.example`: plantilla para tus IPs, usuarios, bases de datos y passwords de GCP.

Editar `infra/.env.gcp` y reemplazar los valores `TMP_*` con tus datos reales de GCP.

Las variables clave son:

```env
IDENTITY_DB_HOST=IP_GCP
IDENTITY_DB_NAME=identity_db
IDENTITY_DB_USER=identity_user
IDENTITY_DB_PASSWORD=password

SUBSCRIPTION_DATABASE_URL=postgresql://usuario:password@IP_GCP:5432/subscription_db
CATALOG_DATABASE_URL=postgresql://usuario:password@IP_GCP:5432/catalog_db
ENGAGEMENT_DATABASE_URL=postgresql://usuario:password@IP_GCP:5432/engagement_db
```

> Importante: si el password tiene caracteres especiales como `@`, `#`, `/`, `:`, `%` o espacios, codificalo para URL en las variables `*_DATABASE_URL`.

## 2. Permitir conexiones desde Docker hacia GCP

En GCP/Cloud SQL/PostgreSQL validar:

- Autorizar la IP pública de la máquina donde correrá Docker.
- Permitir puerto `5432`.
- Tener creadas las bases de datos y usuarios.
- Ejecutar las migraciones necesarias si tus servicios no las ejecutan automáticamente.

## 3. Levantar por capas

Desde la raíz del proyecto:

```bash
docker compose --env-file infra/.env.gcp -f infra/docker-compose.services.yml up --build -d
```

Luego el gateway:

```bash
docker compose --env-file infra/.env.gcp -f infra/docker-compose.gateway.yml up --build -d
```

Luego el frontend:

```bash
docker compose --env-file infra/.env.gcp -f infra/docker-compose.frontend.yml up --build -d
```

## 4. Verificar

```bash
docker ps
curl -i http://localhost:3000/api/health
```


## 5. Apagar por capa

```bash
docker compose --env-file infra/.env.gcp -f infra/docker-compose.frontend.yml down
docker compose --env-file infra/.env.gcp -f infra/docker-compose.gateway.yml down
docker compose --env-file infra/.env.gcp -f infra/docker-compose.services.yml down
```

Si se apaga `services`, el gateway y frontend pueden seguir levantados, pero no responderan correctamente porque pierden sus dependencias gRPC.

## 6. Notas de red

Los tres compose usan la misma red Docker llamada `sa_net`.

- `docker-compose.services.yml` crea la red.
- `docker-compose.gateway.yml` y `docker-compose.frontend.yml` la reutilizan como externa.

Por eso primero se deben levantar los microservicios o crear la red manualmente:

```bash
docker network create sa_net
```

## 7. HTTPS / cookies

Para local sin HTTPS:

```env
FRONTEND_URL=http://localhost:8080
COOKIE_SECURE=false
COOKIE_SAME_SITE=lax
```

Para dominio con HTTPS:

```env
FRONTEND_URL=https://tu-dominio.com
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
```
