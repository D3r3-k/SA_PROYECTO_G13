"""
Pruebas unitarias para src/provider.py (fetch_rate).
Mockea httpx para no hacer llamadas HTTP reales.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from src.provider import fetch_rate, FxProviderError


def _mock_httpx_response(json_data: dict, status_code: int = 200):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data
    resp.raise_for_status = MagicMock()
    if status_code >= 400:
        from httpx import HTTPStatusError, Request, Response
        resp.raise_for_status.side_effect = HTTPStatusError(
            message="error", request=MagicMock(), response=resp
        )
    return resp


class TestFetchRate:
    async def test_misma_moneda_retorna_rate_1(self):
        result = await fetch_rate("https://api.example.com", "USD", "USD")
        assert result["rate"] == 1.0
        assert result["base"] == "USD"
        assert result["target"] == "USD"

    async def test_monedas_distintas_llama_http(self):
        fake_resp = _mock_httpx_response({"rate": 7.8})

        with patch("src.provider.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=fake_resp)
            mock_client_cls.return_value = mock_client

            result = await fetch_rate("https://api.example.com", "USD", "GTQ")

        assert "rate" in result
        assert result["base"] == "USD"
        assert result["target"] == "GTQ"

    async def test_error_http_lanza_fx_provider_error(self):
        with patch("src.provider.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            from httpx import HTTPError
            mock_client.get = AsyncMock(side_effect=HTTPError("connection error"))
            mock_client_cls.return_value = mock_client

            with pytest.raises(FxProviderError):
                await fetch_rate("https://api.example.com", "USD", "EUR")

    async def test_respuesta_misma_moneda_no_llama_http(self):
        with patch("src.provider.httpx.AsyncClient") as mock_client_cls:
            result = await fetch_rate("https://api.example.com", "EUR", "EUR")

        mock_client_cls.assert_not_called()
        assert result["rate"] == 1.0

    def test_fx_provider_error_es_runtime_error(self):
        err = FxProviderError("algo salió mal")
        assert isinstance(err, RuntimeError)
        assert str(err) == "algo salió mal"
