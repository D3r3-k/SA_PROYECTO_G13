[← Regresar](../../README.md)

# Servicio FX

Microservicio gRPC que obtiene tipos de cambio desde el proveedor configurado y almacena resultados en Redis con TTL. El cliente externo no llama a este servicio directamente; las pruebas se hacen por el API Gateway.

## Variables de entorno

- `REDIS_URL`: URL interna de Redis, por ejemplo `redis://redis:6379/0`.
- `FX_CACHE_TTL`: TTL de la caché en segundos.
- `FX_API_BASE_URL`: URL base del proveedor FX, por defecto `https://api.frankfurter.dev/v2`.

## Archivos de interés

- `src/grpc_server.py`: servidor gRPC `FxService`.
- `src/provider.py`: integración con Frankfurter v2.
- `src/cache.py`: wrapper de Redis para `get/set` con TTL.

## Ejecutar localmente

```bash
docker compose -f infra/docker-compose.local.yml up --build -d redis fx-service api-gateway
```

## Probar por Gateway

Primero iniciar sesión y guardar cookies. Luego:

```bash
curl -i -b cookies.txt http://localhost:3000/api/rates/USD/GTQ
curl -i -b cookies.txt http://localhost:3000/api/rates/USD/GTQ
```

La primera llamada debe resolver desde proveedor y devolver `cached: false`; la segunda debe resolver desde Redis y devolver `cached: true`.
