# FX Service

This service fetches exchange rates from the configured provider (default: Frankfurter v2) and caches results in Redis.

Important notes:

- Frankfurter v2 supports GTQ in its public currency catalog and can serve `USD ↔ GTQ`, `EUR ↔ GTQ`, and `EUR ↔ USD` via the `/rate` endpoint. The service now defaults to `https://api.frankfurter.dev/v2`.
- Supported pairs are fetched from Frankfurter v2 and cached in Redis using the configured `FX_CACHE_TTL`.

Workarounds and recommendations:

1. If Frankfurter v2 is unavailable, the provider code falls back from `/rate/{base}/{quote}` to `/rates?base=...&quotes=...` within the same API.
2. If both Frankfurter endpoints fail or a pair is not supported, the service responds with HTTP 502 and logs the provider error.
3. For audit/evidence, use the included `validate_fx.ps1` which demonstrates miss → fetch → hit behavior for supported pairs.

Files of interest:

- `src/app.py` — FastAPI endpoints and Redis caching logic.
- `src/provider.py` — Provider implementation (uses Frankfurter v2 by default, with fallback within the provider).
- `src/cache.py` — Redis cache wrapper.
# fx-service

Servicio de tipos de cambio con caché en Redis.

## Variables de entorno

Copiar `.env.example` a `.env` y ajustar valores si es necesario.

- `REDIS_URL`: URL de Redis.
- `FX_CACHE_TTL`: TTL de la caché en segundos.
- `FX_API_BASE_URL`: API pública de divisas. Valor actual recomendado: `https://api.frankfurter.dev/v1`.

## Ejecutar localmente

Desde la raíz del repo:

```powershell
docker compose -f infra/docker-compose.local.yml up --build -d redis postgres fx-service
```

## Probar endpoints

Health:

```powershell
Invoke-RestMethod -Uri http://localhost:8001/health
```

Consultar una tasa:

```powershell
Invoke-RestMethod -Uri http://localhost:8001/rates/USD/EUR
Invoke-RestMethod -Uri http://localhost:8001/rates/USD/EUR
```

La primera llamada debería registrar `cache miss` y la segunda `cache hit` en los logs del contenedor.
