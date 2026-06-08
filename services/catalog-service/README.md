# Catalog Service

Microservicio de catalogo en Go expuesto por gRPC.

## Funcionalidad

- Healthcheck gRPC.
- Sincronizacion desde Internet Archive: 5 peliculas y 10 series, con hasta 15 capitulos por serie.
- Guarda URLs directas del archivo multimedia, usando `https://archive.org/download/{identifier}/{filename}`.
- No guarda ni retorna la pagina HTML de Archive como recurso de reproduccion.
- Listado de catalogo.
- Busqueda por texto, tipo y genero.
- Detalle de contenido con reparto.
- Listado de episodios para series.

## Fuente externa

El servicio consume la Metadata API de Internet Archive:

```txt
https://archive.org/metadata/{identifier}
```

De la respuesta toma unicamente archivos de video con extension `.mp4` y construye una URL directa de descarga/reproduccion:

```txt
https://archive.org/download/{identifier}/{filename}
```

Esa es la URL que debe usar el frontend en un `<video src="...">`, no la pagina `https://archive.org/details/...`.

## Variables

```env
CATALOG_GRPC_PORT=50055
DATABASE_URL=postgresql://catalog_user:catalog_password@catalog-db:5432/catalog_db
ARCHIVE_METADATA_BASE_URL=https://archive.org/metadata
ARCHIVE_DOWNLOAD_BASE_URL=https://archive.org/download
ARCHIVE_IMAGE_BASE_URL=https://archive.org/services/img
ARCHIVE_MOVIE_TARGET=5
ARCHIVE_SERIES_TARGET=10
ARCHIVE_MOVIE_IDENTIFIERS=charlie-chaplin-the-champion-1915,charliechaplin_theimmigrant_20190819,night_of_the_living_dead,TheGeneral,Nosferatu1922
ARCHIVE_SERIES_IDENTIFIER=BarbecueForTwo1960
ARCHIVE_SERIES_IDENTIFIERS=BarbecueForTwo1960,Popeye_forPresident,popeye-meets-ali-baba-1937,PopeyePopeyeTheSailorMeetsSindbadTheSailor1936,PopeyeAncientFistory,popeye-private-eye-popeye-1954,popeye-little-sweepea-1936,popeye-greek-mirthology-1954,popeye-i-dont-scare-1956,popeye-spree-lunch-1957
ARCHIVE_SERIES_EPISODE_IDENTIFIERS=
ARCHIVE_SERIES_TITLE=Serie Internet Archive
ARCHIVE_SERIES_EPISODE_LIMIT=15
ARCHIVE_ALLOW_FALLBACK=false
```

Puedes cargar una serie de dos formas:

1. `ARCHIVE_SERIES_IDENTIFIER`: un solo item de Archive que contenga archivos de video `.mp4`, hasta el limite configurado.
2. `ARCHIVE_SERIES_EPISODE_IDENTIFIERS`: identifiers separados por coma, uno por capitulo, hasta el limite configurado.

## Base de datos

La logica de persistencia esta versionada en `migrations/001_init.sql`.

Objetos principales:

- `sp_upsert_content_from_external`
- `sp_insert_sync_audit`
- `fn_catalog_list`
- `fn_catalog_detail`
- `fn_catalog_cast`
- `fn_catalog_episodes`
- `vw_catalog_card`
- `vw_content_detail`
- `trg_catalog_updated_at`


## Nota de listado de catalogo

`GET /api/catalog` retorna hasta 100 contenidos sin paginacion por defecto para facilitar la demo del set sincronizado completo: 5 peliculas y 10 series. Los filtros `type` y `genre` se mantienen. La busqueda `GET /api/catalog/search` conserva parametros de paginacion.


## Caratulas de contenido

El catalog-service llena `poster_path` con una imagen obtenida desde los metadatos de archive.org cuando existe. Si el item no trae un archivo de imagen claro, usa la URL publica `ARCHIVE_IMAGE_BASE_URL/{identifier}` para exponer una caratula generada por Internet Archive. El frontend debe renderizar `poster_path` como imagen y usar `media_url` solo para reproducir video.
