# Tests — fx-service

## Qué se prueba

| Módulo | Tipo | Tests |
|---|---|---|
| `RedisCache.get_json` | Unitario | Cache hit, cache miss, cadena vacía |
| `RedisCache.set_json` | Unitario | Serialización JSON + TTL |
| `RedisCache.ping` | Unitario | Redis OK, Redis caído |
| `_normalize_currency` | Unitario | 3 letras válidas, inválidas |
| `GetRate` (cache-aside) | Integración | Hit, miss→fetch→store, error provider, cache error no falla |
| `Health` | Integración | Redis OK, Redis degraded |

Cobertura objetivo: **≥ 75%**

## Correr localmente

```bash
cd services/fx-service

pip install pytest pytest-asyncio pytest-cov grpcio "redis>=4.6.0" httpx python-dotenv

# Todos los tests
pytest

# Solo cache
pytest tests/test_cache.py -v

# Solo grpc_server
pytest tests/test_grpc_server.py -v

# Con cobertura
pytest --cov=src --cov-report=term-missing
```

## Estructura

```
fx-service/
├── src/
│   ├── grpc_server.py   # Lógica cache-aside
│   ├── cache.py         # RedisCache
│   ├── provider.py      # fetch_rate (HTTP frankfurter.dev)
│   └── config.py
├── tests/
│   ├── conftest.py      # Mock de fx_pb2 / fx_pb2_grpc
│   ├── test_cache.py
│   └── test_grpc_server.py
└── pytest.ini
```

## Notas

- `RedisCache` se prueba **parcheando** `redis.asyncio.from_url` para devolver un cliente async mock — no se necesita Redis real.
- La lógica cache-aside de `GetRate` se prueba **parchando** el objeto `cache` del módulo con un `AsyncMock`.
- `fetch_rate` (HTTP) se mockea con `patch("src.grpc_server.fetch_rate", ...)`.
