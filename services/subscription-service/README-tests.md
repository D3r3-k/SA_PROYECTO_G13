[← Regresar](../../README.md)

# Tests — subscription-service

## Qué se prueba

| Handler | Tests |
|---|---|
| `_publish_subscription_notification` | Email vacío no publica, creación, actualización |
| `UpdatePlan` | Válido, id=0, nombre vacío, precio negativo, plan no existe |
| `ListPlans` | Lista exitosa, error DB |
| `CreateSubscription` | Válido + notif, user_id vacío, plan_id=0, ya suscrito, notif falla pero suscripción se crea |
| `UpdateSubscription` | Válido, subscription_id=0, plan_id=0, user_id vacío |
| `ListUserSubscriptions` | Por usuario, user_id vacío |
| `CancelSubscription` | Cancelado, no encontrado, subscription_id=0 |

Cobertura objetivo: **≥ 75%**

## Correr localmente

```bash
cd services/subscription-service

pip install pytest pytest-asyncio pytest-cov grpcio psycopg2-binary "redis>=5.0.0" python-dotenv

pytest --cov=src --cov-report=term-missing
```

## Estructura

```
subscription-service/
├── src/
│   ├── grpc_server.py             # Handlers gRPC
│   ├── repository.py              # Consultas DB
│   ├── notification_publisher.py  # Publicador Redis
│   └── db.py
├── tests/
│   ├── conftest.py     # Mock de subscription_pb2
│   └── test_grpc_handlers.py
└── pytest.ini
```

## Notas

- `publish_notification_event` se mockea para que los tests de `CreateSubscription`/`UpdateSubscription` no necesiten Redis.
- El repositorio (`list_plans`, `create_subscription`, etc.) se mockea con `patch`.
- `get_connection()` (DB) no se llama en los handlers bajo prueba (se mockea el repositorio directamente).
