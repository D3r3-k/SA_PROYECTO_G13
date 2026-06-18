# Tests — payment-gateway-service

## Qué se prueba

| Módulo | Tipo | Tests |
|---|---|---|
| `_luhn_is_valid` | Unitario | Tarjetas válidas/inválidas, checksum |
| `_only_digits` | Unitario | Espacios, guiones, None, letras |
| `_decline_reason` | Unitario | Sufijos 0000, 1111, normal |
| `_validate_request` | Unitario | 20+ casos: cada campo inválido |
| `AuthorizePayment` | Integración | Aprobado, rechazado, declinado, card_last4 |
| `Health` | Integración | Respuesta ok |

Cobertura objetivo: **≥ 75%**

## Correr localmente

```bash
cd services/payment-gateway-service

# Instalar dependencias de prueba (solo la primera vez)
pip install pytest pytest-asyncio pytest-cov grpcio python-dotenv

# Correr todos los tests
pytest

# Con reporte de cobertura
pytest --cov=src --cov-report=term-missing

# Un test específico
pytest tests/test_payment.py::TestLuhnAlgorithm -v
```

## Estructura

```
payment-gateway-service/
├── src/
│   ├── grpc_server.py    # Código bajo prueba
│   └── config.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py       # Mocks de payment_pb2 / payment_pb2_grpc
│   └── test_payment.py   # Todas las pruebas
└── pytest.ini            # asyncio_mode=auto, pythonpath=.
```

## Notas

- Los módulos `payment_pb2` y `payment_pb2_grpc` se **mockean** en `conftest.py` porque son generados por `protoc` dentro del Dockerfile y no existen en el entorno local de pruebas.
- Los tests async usan `asyncio_mode = auto` de `pytest-asyncio` — no necesitan decorador `@pytest.mark.asyncio`.
