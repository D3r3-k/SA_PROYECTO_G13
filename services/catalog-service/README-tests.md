[← Regresar](../../README.md)

# Tests — catalog-service (Go)

## Qué se prueba

| Archivo | Tests |
|---|---|
| `media_store_test.go` (existente) | `buildObjectKey` (poster, movie_video, episode_video), `validateUploadRequest` (tipo inválido, sobrepeso) |
| `media_store_extended_test.go` (nuevo) | `buildObjectKey` con tipo desconocido → error, UUID único por llamada, conserva extensión; `validateUploadRequest` con todos los tipos de imagen/video válidos e inválidos, episode_video sin episode_id, content_id vacío |

Cobertura objetivo: **≥ 75%** sobre el package `service`

## Correr localmente

```bash
cd services/catalog-service

# Todos los tests
go test ./... -v

# Solo el package service
go test ./internal/service/... -v

# Con cobertura
go test ./internal/service/... -coverprofile=coverage.out -covermode=atomic
go tool cover -func=coverage.out
go tool cover -html=coverage.out   # Abre reporte HTML
```

## Estructura de tests

```
catalog-service/
└── internal/service/
    ├── media_store.go                  # Código bajo prueba
    ├── media_store_test.go             # Tests originales (BuildObjectKey, ValidateUpload)
    └── media_store_extended_test.go    # Tests adicionales (nuevos casos de borde)
```

## Notas

- Los tests están en el mismo package `service` (no `service_test`) para poder acceder a funciones no exportadas (`buildObjectKey`, `validateUploadRequest`).
- No se requiere PostgreSQL, GCS ni ninguna dependencia externa — solo se instancian structs directamente.
- Para alcanzar ≥ 75% de cobertura en el package completo, considerar agregar tests para `catalog_service.go` (funciones `adminInputToWrite`, `archiveSeeds`) usando interfaces mockeadas del repositorio.
