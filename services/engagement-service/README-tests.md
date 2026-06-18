# Tests — engagement-service

## Qué se prueba

| Handler | Tests |
|---|---|
| `RateContent` | Válido, profile_id vacío, content_id vacío, rating inválido, error DB |
| `GetContentRatingSummary` | Válido, content_id vacío, error DB |
| `SaveProgress` | Válido, profile_id vacío, minuto negativo, minuto cero OK, error DB |
| `GetRecentHistory` | Historial lleno, profile_id vacío, error DB |
| `ResumeContent` | Encontrado, no encontrado, IDs vacíos, error DB |

Cobertura objetivo: **≥ 75%**

## Correr localmente

```bash
cd services/engagement-service

pip install pytest pytest-asyncio pytest-cov grpcio psycopg2-binary python-dotenv protobuf

pytest --cov=src --cov-report=term-missing
```

## Estructura

```
engagement-service/
├── src/
│   ├── grpc_server.py   # Handlers gRPC
│   ├── repository.py    # Consultas DB (mockeado en tests)
│   └── db.py            # Pool PostgreSQL (no se usa en tests)
├── tests/
│   ├── conftest.py      # Mock de engagement_pb2 (THUMBS_DOWN=1, THUMBS_UP=2)
│   └── test_grpc_handlers.py
└── pytest.ini
```

## Notas

- `engagement_pb2.THUMBS_DOWN = 1` y `engagement_pb2.THUMBS_UP = 2` se configuran en `conftest.py` para que el check de rating en el handler funcione correctamente.
- Las funciones del repositorio (`save_rating`, `rating_summary`, etc.) se mockean con `unittest.mock.patch` — no se necesita PostgreSQL.
- `google.protobuf.timestamp_pb2` es del paquete `protobuf` estándar (se instala con pip).
