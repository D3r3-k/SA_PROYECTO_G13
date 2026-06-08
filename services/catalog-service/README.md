# Catalog Service

Microservicio en Go responsable del catalogo de peliculas y series.

## Funcionalidades

- Healthcheck gRPC.
- Sincronizacion minima desde TMDB: 2 peliculas y 1 serie con 5 episodios.
- Fallback local si no existe `TMDB_API_KEY`, para que el proyecto levante en local.
- Listado, busqueda y filtros por tipo/genero/titulo.
- Detalle con ficha tecnica y reparto.
- Listado de episodios por temporada.

## Variables

Ver `.env.example`.

## Endpoints expuestos por Gateway

- `POST /api/catalog/sync-minimum`
- `GET /api/catalog`
- `GET /api/catalog/search?q=&type=&genre=`
- `GET /api/catalog/:contentId`
- `GET /api/catalog/:contentId/episodes?season_number=1`

## Persistencia versionada

La estructura de base de datos y la logica SQL del dominio estan versionadas en:

```txt
services/catalog-service/migrations/001_init.sql
```

El servicio aplica estos archivos al iniciar. El codigo Go no contiene DDL ni SQL transaccional complejo; solamente llama procedimientos y funciones versionadas:

- `sp_upsert_content_from_external`
- `sp_insert_sync_audit`
- `fn_catalog_list`
- `fn_catalog_detail`
- `fn_catalog_cast`
- `fn_catalog_episodes`

Si se requiere cambiar reglas de catalogo, busqueda, detalle, generos, reparto o episodios, modificar primero el archivo SQL de migracion y luego reiniciar el servicio.
