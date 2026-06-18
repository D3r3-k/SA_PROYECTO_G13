"""
Pruebas unitarias para src/cache.py (RedisCache).
Mockea el cliente Redis async para no requerir un servidor real.
"""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.cache import RedisCache


@pytest.fixture
def mock_redis_client():
    client = AsyncMock()
    return client


@pytest.fixture
def cache(mock_redis_client):
    with patch("redis.asyncio.from_url", return_value=mock_redis_client):
        return RedisCache("redis://localhost:6379/0"), mock_redis_client


class TestGetJson:
    async def test_cache_hit_retorna_dict(self, cache):
        rc, mock_client = cache
        payload = {"base": "USD", "target": "GTQ", "rate": 7.8}
        mock_client.get.return_value = json.dumps(payload)

        result = await rc.get_json("fx:rate:USD:GTQ")

        mock_client.get.assert_awaited_once_with("fx:rate:USD:GTQ")
        assert result == payload

    async def test_cache_miss_retorna_none(self, cache):
        rc, mock_client = cache
        mock_client.get.return_value = None

        result = await rc.get_json("fx:rate:USD:GTQ")

        assert result is None

    async def test_cache_miss_cadena_vacia_retorna_none(self, cache):
        rc, mock_client = cache
        mock_client.get.return_value = ""

        result = await rc.get_json("nonexistent")

        assert result is None


class TestSetJson:
    async def test_serializa_y_guarda_con_ttl(self, cache):
        rc, mock_client = cache
        payload = {"rate": 7.8, "provider": "frankfurter"}

        await rc.set_json("fx:rate:USD:GTQ", payload, 3600)

        mock_client.set.assert_awaited_once_with(
            "fx:rate:USD:GTQ",
            json.dumps(payload),
            ex=3600
        )

    async def test_ttl_diferente(self, cache):
        rc, mock_client = cache

        await rc.set_json("mykey", {"value": 1}, 60)

        call_kwargs = mock_client.set.call_args
        assert call_kwargs.kwargs["ex"] == 60


class TestPing:
    async def test_ping_exitoso_retorna_true(self, cache):
        rc, mock_client = cache
        mock_client.ping.return_value = True

        result = await rc.ping()

        assert result is True

    async def test_ping_falla_retorna_false(self, cache):
        rc, mock_client = cache
        mock_client.ping.side_effect = Exception("Connection refused")

        result = await rc.ping()

        assert result is False

    async def test_ping_retorna_false_si_redis_responde_false(self, cache):
        rc, mock_client = cache
        mock_client.ping.return_value = False

        result = await rc.ping()

        assert result is False


class TestClose:
    async def test_close_llama_aclose(self, cache):
        rc, mock_client = cache

        await rc.close()

        mock_client.aclose.assert_awaited_once()
