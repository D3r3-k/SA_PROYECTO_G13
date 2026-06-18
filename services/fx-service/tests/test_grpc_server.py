"""
Pruebas de integración para src/grpc_server.py (FxServiceServicer).
Mockea el cache (Redis) y el provider (HTTP) para aislar la lógica de cache-aside.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import src.grpc_server as grpc_module

import fx_pb2  # MagicMock configurado en conftest.py

from src.grpc_server import FxServiceServicer, _normalize_currency


# ─── _normalize_currency ──────────────────────────────────────────────────────

class TestNormalizeCurrency:
    def test_codigo_valido_tres_letras(self):
        assert _normalize_currency("usd") == "USD"
        assert _normalize_currency("gtq") == "GTQ"

    def test_codigo_con_espacios(self):
        assert _normalize_currency("  EUR  ") == "EUR"

    def test_codigo_dos_letras_lanza_error(self):
        with pytest.raises(ValueError, match="3 letters"):
            _normalize_currency("US")

    def test_codigo_cuatro_letras_lanza_error(self):
        with pytest.raises(ValueError, match="3 letters"):
            _normalize_currency("USDD")

    def test_codigo_con_digito_lanza_error(self):
        with pytest.raises(ValueError, match="3 letters"):
            _normalize_currency("US1")

    def test_cadena_vacia_lanza_error(self):
        with pytest.raises(ValueError):
            _normalize_currency("")


# ─── FxServiceServicer.GetRate ────────────────────────────────────────────────

@pytest.fixture
def servicer():
    return FxServiceServicer()


@pytest.fixture
def mock_cache():
    return AsyncMock()


class TestGetRate:
    async def test_cache_hit_retorna_datos_cacheados(self, servicer, mock_cache):
        cached_payload = {
            "base": "USD", "target": "GTQ",
            "rate": 7.8, "timestamp": 1700000000
        }
        mock_cache.get_json.return_value = cached_payload

        with patch.object(grpc_module, "cache", mock_cache):
            req = MagicMock(base="USD", target="GTQ")
            await servicer.GetRate(req, MagicMock())

        kw = fx_pb2.RateResponse.call_args.kwargs
        assert kw["success"] is True
        assert kw["cached"] is True
        assert kw["rate"] == pytest.approx(7.8)
        assert kw["base"] == "USD"
        assert kw["target"] == "GTQ"

    async def test_cache_miss_llama_provider_y_guarda(self, servicer, mock_cache):
        provider_payload = {
            "base": "USD", "target": "MXN",
            "rate": 17.5, "timestamp": 1700000001,
            "provider": "frankfurter"
        }
        mock_cache.get_json.return_value = None

        with (
            patch.object(grpc_module, "cache", mock_cache),
            patch("src.grpc_server.fetch_rate", return_value=provider_payload) as mock_fetch,
        ):
            req = MagicMock(base="usd", target="mxn")
            await servicer.GetRate(req, MagicMock())

        mock_fetch.assert_awaited_once()
        mock_cache.set_json.assert_awaited_once()
        kw = fx_pb2.RateResponse.call_args.kwargs
        assert kw["success"] is True
        assert kw["cached"] is False
        assert kw["rate"] == pytest.approx(17.5)

    async def test_cache_miss_error_de_provider_retorna_failure(self, servicer, mock_cache):
        from src.provider import FxProviderError
        mock_cache.get_json.return_value = None

        with (
            patch.object(grpc_module, "cache", mock_cache),
            patch("src.grpc_server.fetch_rate", side_effect=FxProviderError("timeout")),
        ):
            req = MagicMock(base="USD", target="EUR")
            await servicer.GetRate(req, MagicMock())

        kw = fx_pb2.RateResponse.call_args.kwargs
        assert kw["success"] is False
        assert "fx rate" in kw["message"]

    async def test_moneda_invalida_retorna_failure(self, servicer, mock_cache):
        with patch.object(grpc_module, "cache", mock_cache):
            req = MagicMock(base="INVALID", target="GTQ")
            await servicer.GetRate(req, MagicMock())

        kw = fx_pb2.RateResponse.call_args.kwargs
        assert kw["success"] is False
        assert "3 letters" in kw["message"]

    async def test_cache_error_al_guardar_no_falla_el_request(self, servicer, mock_cache):
        provider_payload = {
            "base": "USD", "target": "EUR",
            "rate": 0.93, "timestamp": 1700000002,
        }
        mock_cache.get_json.return_value = None
        mock_cache.set_json.side_effect = Exception("Redis down")

        with (
            patch.object(grpc_module, "cache", mock_cache),
            patch("src.grpc_server.fetch_rate", return_value=provider_payload),
        ):
            req = MagicMock(base="USD", target="EUR")
            await servicer.GetRate(req, MagicMock())

        # Debe retornar success=True aunque Redis falle al guardar
        kw = fx_pb2.RateResponse.call_args.kwargs
        assert kw["success"] is True

    async def test_cache_key_construida_correctamente(self, servicer, mock_cache):
        provider_payload = {"base": "GTQ", "target": "USD", "rate": 0.13, "timestamp": 0}
        mock_cache.get_json.return_value = None

        with (
            patch.object(grpc_module, "cache", mock_cache),
            patch("src.grpc_server.fetch_rate", return_value=provider_payload),
        ):
            req = MagicMock(base="gtq", target="usd")
            await servicer.GetRate(req, MagicMock())

        # Verifica que la clave usa los códigos normalizados
        mock_cache.get_json.assert_awaited_once_with("fx:rate:GTQ:USD")


# ─── FxServiceServicer.Health ─────────────────────────────────────────────────

class TestHealth:
    async def test_health_redis_ok(self, servicer):
        mock_cache = AsyncMock()
        mock_cache.ping.return_value = True

        with patch.object(grpc_module, "cache", mock_cache):
            await servicer.Health(MagicMock(), MagicMock())

        kw = fx_pb2.FxHealthResponse.call_args.kwargs
        assert kw["success"] is True
        assert kw["status"] == "ok"
        assert kw["redis"] is True

    async def test_health_redis_down_retorna_degraded(self, servicer):
        mock_cache = AsyncMock()
        mock_cache.ping.return_value = False

        with patch.object(grpc_module, "cache", mock_cache):
            await servicer.Health(MagicMock(), MagicMock())

        kw = fx_pb2.FxHealthResponse.call_args.kwargs
        assert kw["status"] == "degraded"
        assert kw["redis"] is False
