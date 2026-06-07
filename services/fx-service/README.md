# Servicio FX

Servicio que obtiene tipos de cambio desde el proveedor configurado (por defecto: Frankfurter v2) y almacena resultados en caché en Redis.

Notas importantes:

- Frankfurter v2 soporta GTQ en su catálogo público y puede servir pares como `USD ↔ GTQ`, `EUR ↔ GTQ` y `EUR ↔ USD` a través de sus endpoints. El valor por defecto es `https://api.frankfurter.dev/v2`.
- Las consultas a pares soportados se cachean en Redis usando `FX_CACHE_TTL`.

Comportamiento y recomendaciones:

1. Si el endpoint principal no está disponible, el proveedor intenta el endpoint alternativo (`/rates?base=...&quotes=...`) antes de fallar.
2. Si no es posible obtener la tasa, el servicio responde con HTTP 502 y registra el error del proveedor.
3. Para pruebas deterministas, use `validate_fx.ps1` (incluido) que demuestra el flujo miss → fetch → hit.

Variables de entorno relevantes:

- `REDIS_URL`: URL de Redis (p. ej. `redis://redis:6379/0`).
- `FX_CACHE_TTL`: TTL de la caché en segundos.
- `FX_API_BASE_URL`: URL base del proveedor FX (por defecto `https://api.frankfurter.dev/v2`).

Archivos de interés:

- `src/app.py` — endpoints de FastAPI y lógica de caché.
- `src/provider.py` — implementación del proveedor (Frankfurter v2 por defecto).
- `src/cache.py` — wrapper de Redis usado para get/set con TTL.

Ejecutar localmente (desde la raíz del repositorio):

```powershell
docker compose -f infra/docker-compose.local.yml up --build -d redis postgres fx-service
```

Comprobar salud:

```powershell
Invoke-RestMethod -Uri http://localhost:8001/health
```

Ejemplo de consulta de tasa:

```powershell
Invoke-RestMethod -Uri http://localhost:8001/rates/USD/EUR
Invoke-RestMethod -Uri http://localhost:8001/rates/USD/EUR
```

La primera llamada debe ser `cache miss` y la segunda `cache hit` según los logs del contenedor.
