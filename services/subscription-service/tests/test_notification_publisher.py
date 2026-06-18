"""
Pruebas unitarias para src/notification_publisher.py.
Mockea Redis para no requerir servidor real.
"""
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

import src.notification_publisher as publisher_module
from src.notification_publisher import get_redis_client, publish_notification_event


@pytest.fixture(autouse=True)
def reset_redis_client():
    original = publisher_module.redis_client
    publisher_module.redis_client = None
    yield
    publisher_module.redis_client = original


# ─── get_redis_client ────────────────────────────────────────────────────────

class TestGetRedisClient:
    async def test_crea_cliente_si_no_existe(self):
        mock_redis = MagicMock()
        with patch("src.notification_publisher.Redis") as mock_redis_cls:
            mock_redis_cls.from_url.return_value = mock_redis
            client = await get_redis_client()
        assert client is mock_redis
        mock_redis_cls.from_url.assert_called_once()

    async def test_reutiliza_cliente_existente(self):
        mock_redis = MagicMock()
        publisher_module.redis_client = mock_redis

        with patch("src.notification_publisher.Redis") as mock_redis_cls:
            client = await get_redis_client()

        mock_redis_cls.from_url.assert_not_called()
        assert client is mock_redis


# ─── publish_notification_event ───────────────────────────────────────────────

class TestPublishNotificationEvent:
    async def test_publica_evento_en_redis(self):
        mock_redis = AsyncMock()
        publisher_module.redis_client = mock_redis

        payload = {"type": "purchase_receipt", "email": "u@example.com"}
        await publish_notification_event(payload)

        mock_redis.rpush.assert_called_once()
        queue_name = mock_redis.rpush.call_args[0][0]
        assert "notification" in queue_name

    async def test_evento_incluye_created_at(self):
        import json
        mock_redis = AsyncMock()
        publisher_module.redis_client = mock_redis

        await publish_notification_event({"type": "test"})

        json_payload = mock_redis.rpush.call_args[0][1]
        event = json.loads(json_payload)
        assert "created_at" in event
        assert event["type"] == "test"
