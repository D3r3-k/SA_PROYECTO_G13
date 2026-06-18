"""
Pruebas unitarias e integración para payment-gateway-service.

Cubre:
- Algoritmo de Luhn (_luhn_is_valid)
- Limpieza de dígitos (_only_digits)
- Reglas de rechazo (_decline_reason)
- Validación de solicitud (_validate_request) — todos los campos
- Handler AuthorizePayment — aprobado, rechazado, declinado
- Handler Health
"""
import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone

import payment_pb2  # MagicMock configurado en conftest.py

from src.grpc_server import (
    _luhn_is_valid,
    _only_digits,
    _validate_request,
    _decline_reason,
    PaymentGatewayServiceServicer,
    SUPPORTED_CURRENCIES,
)


# ─── Tarjetas de prueba con Luhn válido ──────────────────────────────────────

VALID_CARDS = [
    "4532015112830366",  # Visa 16 dígitos
    "4111111111111111",  # Visa test clásica
    "5500005555555559",  # Mastercard
    "371449635398431",   # Amex 15 dígitos
    "6011111111111117",  # Discover
    "3566002020360505",  # JCB
    "4532015112830366",  # 16 dígitos
]

INVALID_CARDS = [
    "1234567890123456",
    "4532015112830367",  # último dígito modificado — checksum roto
    "9999999999999999",  # checksum inválido
]


# ─── _luhn_is_valid ───────────────────────────────────────────────────────────

class TestLuhnAlgorithm:
    @pytest.mark.parametrize("card", VALID_CARDS)
    def test_tarjetas_validas_pasan_luhn(self, card):
        assert _luhn_is_valid(card) is True

    @pytest.mark.parametrize("card", INVALID_CARDS)
    def test_tarjetas_invalidas_fallan_luhn(self, card):
        assert _luhn_is_valid(card) is False

    def test_digito_cero_es_valido(self):
        assert _luhn_is_valid("0") is True

    def test_checksum_divisible_entre_10(self):
        # 79927398713 es un número con Luhn válido conocido
        assert _luhn_is_valid("79927398713") is True

    def test_checksum_no_divisible_entre_10(self):
        assert _luhn_is_valid("79927398714") is False


# ─── _only_digits ─────────────────────────────────────────────────────────────

class TestOnlyDigits:
    def test_elimina_espacios_y_guiones(self):
        assert _only_digits("4111 1111 1111 1111") == "4111111111111111"
        assert _only_digits("4111-1111-1111-1111") == "4111111111111111"

    def test_cadena_vacia(self):
        assert _only_digits("") == ""

    def test_none_retorna_vacio(self):
        assert _only_digits(None) == ""

    def test_solo_digitos_sin_cambios(self):
        assert _only_digits("4532015112830366") == "4532015112830366"

    def test_elimina_letras(self):
        assert _only_digits("abc123def") == "123"


# ─── _decline_reason ─────────────────────────────────────────────────────────

class TestDeclineReason:
    def test_termina_en_0000_rechazada_por_emisor(self):
        assert _decline_reason("5500005555550000") == "payment declined by issuer"

    def test_termina_en_1111_fondos_insuficientes(self):
        assert _decline_reason("5500005555551111") == "insufficient funds"

    def test_tarjeta_normal_no_tiene_razon(self):
        assert _decline_reason("4532015112830366") is None

    def test_0000_con_prefijo_diferente(self):
        assert _decline_reason("4111111111110000") == "payment declined by issuer"

    def test_1111_con_prefijo_diferente(self):
        assert _decline_reason("4111111111111111") == "insufficient funds"

    def test_termina_en_otro_patron(self):
        assert _decline_reason("4532015112830366") is None


# ─── _validate_request ───────────────────────────────────────────────────────

def _make_request(**overrides):
    """Construye un request mock con valores válidos por defecto."""
    now = datetime.now(timezone.utc)
    defaults = dict(
        user_id="user-abc-123",
        email="cliente@example.com",
        plan_id=2,
        amount=9.99,
        currency="USD",
        card_number="4532015112830366",
        card_holder="Carlos García",
        exp_month=12,
        exp_year=now.year + 2,
        cvv="123",
    )
    defaults.update(overrides)
    return MagicMock(**defaults)


class TestValidateRequest:
    def test_solicitud_valida(self):
        ok, msg, _ = _validate_request(_make_request())
        assert ok is True
        assert msg == "ok"

    def test_user_id_vacio(self):
        ok, msg, _ = _validate_request(_make_request(user_id=""))
        assert ok is False
        assert "user_id" in msg

    def test_email_vacio(self):
        ok, msg, _ = _validate_request(_make_request(email=""))
        assert ok is False
        assert "email" in msg

    def test_plan_id_cero(self):
        ok, msg, _ = _validate_request(_make_request(plan_id=0))
        assert ok is False
        assert "plan_id" in msg

    def test_plan_id_negativo(self):
        ok, msg, _ = _validate_request(_make_request(plan_id=-1))
        assert ok is False

    def test_monto_cero(self):
        ok, msg, _ = _validate_request(_make_request(amount=0))
        assert ok is False
        assert "amount" in msg

    def test_monto_negativo(self):
        ok, msg, _ = _validate_request(_make_request(amount=-5.0))
        assert ok is False

    def test_moneda_no_soportada(self):
        ok, msg, _ = _validate_request(_make_request(currency="BTC"))
        assert ok is False
        assert "currency" in msg

    @pytest.mark.parametrize("currency", ["USD", "GTQ", "MXN", "EUR"])
    def test_monedas_soportadas(self, currency):
        ok, _, _ = _validate_request(_make_request(currency=currency))
        assert ok is True

    def test_moneda_en_minusculas_es_valida(self):
        ok, _, _ = _validate_request(_make_request(currency="usd"))
        assert ok is True

    def test_numero_tarjeta_demasiado_corto(self):
        ok, msg, _ = _validate_request(_make_request(card_number="123456789012"))  # 12
        assert ok is False
        assert "card_number" in msg

    def test_numero_tarjeta_demasiado_largo(self):
        ok, msg, _ = _validate_request(_make_request(card_number="12345678901234567890"))  # 20
        assert ok is False
        assert "card_number" in msg

    def test_numero_tarjeta_falla_luhn(self):
        ok, msg, _ = _validate_request(_make_request(card_number="1234567890123456"))
        assert ok is False
        assert "invalid" in msg

    def test_titular_vacio(self):
        ok, msg, _ = _validate_request(_make_request(card_holder=""))
        assert ok is False
        assert "card_holder" in msg

    def test_titular_solo_espacios(self):
        ok, msg, _ = _validate_request(_make_request(card_holder="   "))
        assert ok is False

    def test_mes_cero(self):
        ok, msg, _ = _validate_request(_make_request(exp_month=0))
        assert ok is False
        assert "exp_month" in msg

    def test_mes_trece(self):
        ok, msg, _ = _validate_request(_make_request(exp_month=13))
        assert ok is False

    def test_tarjeta_expirada_anio_pasado(self):
        ok, msg, _ = _validate_request(_make_request(exp_year=2020, exp_month=1))
        assert ok is False
        assert "expired" in msg

    def test_tarjeta_expirada_anio_actual_mes_pasado(self):
        now = datetime.now(timezone.utc)
        year = now.year if now.month > 1 else now.year - 1
        month = now.month - 1 if now.month > 1 else 12
        ok, msg, _ = _validate_request(_make_request(exp_year=year, exp_month=month))
        assert ok is False
        assert "expired" in msg

    def test_cvv_dos_digitos(self):
        ok, msg, _ = _validate_request(_make_request(cvv="12"))
        assert ok is False
        assert "cvv" in msg

    def test_cvv_cinco_digitos(self):
        ok, msg, _ = _validate_request(_make_request(cvv="12345"))
        assert ok is False

    def test_cvv_tres_digitos_valido(self):
        ok, _, _ = _validate_request(_make_request(cvv="123"))
        assert ok is True

    def test_cvv_cuatro_digitos_valido(self):
        ok, _, _ = _validate_request(_make_request(cvv="1234"))
        assert ok is True

    def test_numero_con_espacios_es_valido(self):
        ok, _, _ = _validate_request(_make_request(card_number="4532 0151 1283 0366"))
        assert ok is True

    def test_numero_con_guiones_es_valido(self):
        ok, _, _ = _validate_request(_make_request(card_number="4532-0151-1283-0366"))
        assert ok is True

    def test_retorna_card_number_sin_formato(self):
        _, _, card = _validate_request(_make_request(card_number="4532 0151 1283 0366"))
        assert card == "4532015112830366"


# ─── PaymentGatewayServiceServicer ───────────────────────────────────────────

class TestAuthorizePayment:
    @pytest.fixture
    def servicer(self):
        return PaymentGatewayServiceServicer()

    @pytest.fixture
    def ctx(self):
        return MagicMock()

    async def test_pago_aprobado(self, servicer, ctx):
        req = _make_request()
        with patch("src.grpc_server.get_approval_delay_ms", return_value=0):
            await servicer.AuthorizePayment(req, ctx)

        kw = payment_pb2.AuthorizePaymentResponse.call_args.kwargs
        assert kw["success"] is True
        assert kw["status"] == "approved"
        assert kw["message"] == "payment approved"
        assert kw["transaction_id"].startswith("sandbox-")
        assert kw["authorization_code"].startswith("QT")

    async def test_request_invalido_retorna_rejected(self, servicer, ctx):
        req = _make_request(user_id="")
        await servicer.AuthorizePayment(req, ctx)

        kw = payment_pb2.AuthorizePaymentResponse.call_args.kwargs
        assert kw["success"] is False
        assert kw["status"] == "rejected"

    async def test_tarjeta_declinada_por_emisor(self, servicer, ctx):
        req = _make_request()
        with (
            patch("src.grpc_server._validate_request", return_value=(True, "ok", "4111111111110000")),
            patch("src.grpc_server._decline_reason", return_value="payment declined by issuer"),
            patch("src.grpc_server.get_approval_delay_ms", return_value=0),
        ):
            await servicer.AuthorizePayment(req, ctx)

        kw = payment_pb2.AuthorizePaymentResponse.call_args.kwargs
        assert kw["success"] is False
        assert kw["status"] == "declined"
        assert "declined" in kw["message"]

    async def test_fondos_insuficientes(self, servicer, ctx):
        req = _make_request()
        with (
            patch("src.grpc_server._validate_request", return_value=(True, "ok", "4111111111111111")),
            patch("src.grpc_server._decline_reason", return_value="insufficient funds"),
            patch("src.grpc_server.get_approval_delay_ms", return_value=0),
        ):
            await servicer.AuthorizePayment(req, ctx)

        kw = payment_pb2.AuthorizePaymentResponse.call_args.kwargs
        assert kw["success"] is False
        assert kw["status"] == "declined"
        assert "insufficient" in kw["message"]

    async def test_card_last4_extraido_correctamente(self, servicer, ctx):
        req = _make_request(card_number="4532015112830366")
        with patch("src.grpc_server.get_approval_delay_ms", return_value=0):
            await servicer.AuthorizePayment(req, ctx)

        kw = payment_pb2.AuthorizePaymentResponse.call_args.kwargs
        assert kw["card_last4"] == "0366"

    async def test_monto_y_moneda_incluidos_en_respuesta(self, servicer, ctx):
        req = _make_request(amount=15.50, currency="GTQ")
        with patch("src.grpc_server.get_approval_delay_ms", return_value=0):
            await servicer.AuthorizePayment(req, ctx)

        kw = payment_pb2.AuthorizePaymentResponse.call_args.kwargs
        assert kw["amount"] == pytest.approx(15.50)
        assert kw["currency"] == "GTQ"

    async def test_transaction_id_es_unico_por_llamada(self, servicer, ctx):
        req = _make_request()
        with patch("src.grpc_server.get_approval_delay_ms", return_value=0):
            await servicer.AuthorizePayment(req, ctx)
            tx1 = payment_pb2.AuthorizePaymentResponse.call_args.kwargs["transaction_id"]

            payment_pb2.reset_mock()
            await servicer.AuthorizePayment(req, ctx)
            tx2 = payment_pb2.AuthorizePaymentResponse.call_args.kwargs["transaction_id"]

        assert tx1 != tx2


class TestHealth:
    async def test_health_retorna_ok(self):
        servicer = PaymentGatewayServiceServicer()
        await servicer.Health(MagicMock(), MagicMock())
        kw = payment_pb2.PaymentHealthResponse.call_args.kwargs
        assert kw["success"] is True
        assert kw["status"] == "ok"


# ─── SUPPORTED_CURRENCIES ─────────────────────────────────────────────────────

def test_monedas_soportadas_son_cuatro():
    assert SUPPORTED_CURRENCIES == {"USD", "GTQ", "MXN", "EUR"}
