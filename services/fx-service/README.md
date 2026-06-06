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
