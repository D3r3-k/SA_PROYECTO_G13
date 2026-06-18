# Tests — notification-service

## Qué se prueba

| Módulo / Handler | Tests |
|---|---|
| `_build_notification_content` | registration (con/sin nombre), purchase_receipt, subscription_update, content-publication, publication, content, tipo desconocido, subject/body override, mayúsculas |
| `_send_email` | SMTP no configurado, aiosmtplib no instalado, envío exitoso, excepción SMTP |
| `_process_notification` | Envía email, usa campo `to` si no hay `email` |
| `Send` RPC | Encola en Redis, retorna message_id UUID válido |
| `Health` RPC | Redis OK, Redis caído, SMTP configurado |

Cobertura objetivo: **≥ 75%**

## Correr localmente

```bash
cd services/notification-service

pip install pytest pytest-asyncio pytest-cov grpcio "redis>=5.0.0" aiosmtplib python-dotenv

pytest --cov=src --cov-report=term-missing
```

## Estructura

```
notification-service/
├── src/
│   └── grpc_server.py   # Toda la lógica
├── tests/
│   ├── conftest.py      # Mock de notification_pb2
│   └── test_notification.py
└── pytest.ini
```

## Notas

- `redis_client` (variable de módulo) se mockea con `patch.object(grpc_module, "redis_client", AsyncMock())`.
- `aiosmtplib` se mockea con `patch.object(grpc_module, "aiosmtplib", ...)` — no se necesita servidor SMTP real.
- `SMTP_HOST` y `SMTP_FROM` se parche con `patch.object` para simular SMTP configurado/no configurado.
