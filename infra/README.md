# Infra - Docker Compose

El entorno local levanta la topología completa de Quetxal TV con un único punto de entrada externo: el API Gateway.

## Servicios expuestos al host

- API Gateway: `http://localhost:3000`
- Web frontend: `http://localhost:8080`

Redis, PostgreSQL y los microservicios gRPC quedan disponibles solo dentro de la red Docker `sa_net` mediante `expose`.

## Levantar local

```bash
docker compose -f infra/docker-compose.local.yml up --build -d
```

## Verificar estado

```bash
docker compose -f infra/docker-compose.local.yml ps
curl -i http://localhost:3000/api/health
```

## Flujo interno

```text
Cliente Web -> HTTP/cookies -> API Gateway -> gRPC -> identity-service
Cliente Web -> HTTP/cookies -> API Gateway -> gRPC -> subscription-service
Cliente Web -> HTTP/cookies -> API Gateway -> gRPC -> fx-service

identity-service/subscription-service -> Redis notification:queue
notification-service -> Redis BLPOP -> SMTP/Mailhog
```

Para nube, configurar variables de producción en el ambiente o en un `.env.cloud` no versionado y usar `infra/docker-compose.cloud.yml`.

## Catalog y Engagement agregados

Se agregaron cuatro contenedores nuevos al despliegue local y cloud:

- `catalog-db`: PostgreSQL propio del catalog-service.
- `catalog-service`: microservicio Go con gRPC para catalogo, busqueda, detalle, reparto y episodios.
- `engagement-db`: PostgreSQL propio del engagement-service.
- `engagement-service`: microservicio Python con gRPC para calificaciones, porcentaje de recomendacion, historial y reanudacion.

Variables nuevas requeridas en `infra/.env`:

```env
CATALOG_DB_NAME=catalog_db
CATALOG_DB_USER=catalog_user
CATALOG_DB_PASSWORD=catalog_password
CATALOG_GRPC_PORT=50055
CATALOG_DATABASE_URL=postgresql://catalog_user:catalog_password@catalog-db:5432/catalog_db
CATALOG_GRPC_URL=catalog-service:50055
ARCHIVE_METADATA_BASE_URL=https://archive.org/metadata
ARCHIVE_DOWNLOAD_BASE_URL=https://archive.org/download
ARCHIVE_MOVIE_TARGET=5
ARCHIVE_SERIES_TARGET=10
ARCHIVE_MOVIE_IDENTIFIERS=charlie-chaplin-the-champion-1915,charliechaplin_theimmigrant_20190819,night_of_the_living_dead,TheGeneral,Nosferatu1922
# Use one IA item with 3-5 video files OR 3-5 separate episode item identifiers.
ARCHIVE_SERIES_IDENTIFIER=BarbecueForTwo1960
ARCHIVE_SERIES_IDENTIFIERS=BarbecueForTwo1960,Popeye_forPresident,popeye-meets-ali-baba-1937,PopeyePopeyeTheSailorMeetsSindbadTheSailor1936,PopeyeAncientFistory,popeye-private-eye-popeye-1954,popeye-little-sweepea-1936,popeye-greek-mirthology-1954,popeye-i-dont-scare-1956,popeye-spree-lunch-1957
ARCHIVE_SERIES_EPISODE_IDENTIFIERS=
ARCHIVE_SERIES_TITLE=Serie Internet Archive
ARCHIVE_SERIES_EPISODE_LIMIT=5
ARCHIVE_ALLOW_FALLBACK=true

ENGAGEMENT_DB_NAME=engagement_db
ENGAGEMENT_DB_USER=engagement_user
ENGAGEMENT_DB_PASSWORD=engagement_password
ENGAGEMENT_GRPC_PORT=50056
ENGAGEMENT_DATABASE_URL=postgresql://engagement_user:engagement_password@engagement-db:5432/engagement_db
ENGAGEMENT_GRPC_URL=engagement-service:50056
```

Para consumir datos reales desde fuente externa, el `catalog-service` usa Internet Archive. No requiere API key. Configura identifiers de Archive en `ARCHIVE_MOVIE_IDENTIFIERS`, `ARCHIVE_SERIES_IDENTIFIERS`, `ARCHIVE_SERIES_IDENTIFIER` o `ARCHIVE_SERIES_EPISODE_IDENTIFIERS` y ejecuta desde Gateway.

```bash
curl -X POST http://localhost:3000/api/catalog/sync-minimum \
  -H "Content-Type: application/json" \
  -b "access_token=<cookie>" \
  -d '{"force": true}'
```

Si Internet Archive no responde y `ARCHIVE_ALLOW_FALLBACK=true`, el servicio usa un fallback local con URLs directas de `archive.org/download` para que la demo local no se bloquee.
