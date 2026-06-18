"""
Pruebas unitarias e integración para notification-service.
Cubre _build_notification_content, _send_email y los handlers gRPC.
"""
import json
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
import src.grpc_server as grpc_module

import notification_pb2  # MagicMock de conftest.py

from src.grpc_server import (
    _build_notification_content,
    _send_email,
    _process_notification,
    NotificationServiceServicer,
)


# ─── _build_notification_content ─────────────────────────────────────────────

class TestBuildNotificationContent:
    def test_tipo_registration_con_nombre(self):
        payload = {
            "type": "registration",
            "metadata": {"full_name": "María López"},
        }
        result = _build_notification_content(payload)
        assert "María López" in result["body"]
        assert "Quetxal TV" in result["subject"]

    def test_tipo_registration_sin_nombre(self):
        payload = {"type": "registration", "metadata": {}}
        result = _build_notification_content(payload)
        assert "activa" in result["body"]

    def test_tipo_purchase_receipt(self):
        payload = {
            "type": "purchase_receipt",
            "metadata": {"action": "created", "plan_name": "Premium", "price_usd": "9.99"},
        }
        result = _build_notification_content(payload)
        assert "Recibo" in result["subject"]
        assert "Premium" in result["body"]
        assert "9.99" in result["body"]

    def test_tipo_subscription_update(self):
        payload = {
            "type": "subscription_update",
            "metadata": {"action": "updated", "plan_name": "Basic", "price_usd": "4.99"},
        }
        result = _build_notification_content(payload)
        assert "Actualización" in result["subject"]
        assert "Basic" in result["body"]

    def test_tipo_purchase_sin_precio_no_lo_incluye(self):
        payload = {
            "type": "purchase",
            "metadata": {"plan_name": "Free", "price_usd": ""},
        }
        result = _build_notification_content(payload)
        assert "USD" not in result["body"]

    def test_tipo_content_publication(self):
        payload = {
            "type": "content-publication",
            "metadata": {"content_title": "El Principito", "category": "Drama"},
        }
        result = _build_notification_content(payload)
        assert "El Principito" in result["body"]
        assert "publicación" in result["subject"].lower()

    def test_tipo_publication_alias(self):
        payload = {
            "type": "publication",
            "metadata": {"content_title": "Mi Película"},
        }
        result = _build_notification_content(payload)
        assert "Mi Película" in result["body"]

    def test_tipo_content_alias(self):
        payload = {
            "type": "content",
            "metadata": {"content_title": "Serie X"},
        }
        result = _build_notification_content(payload)
        assert "Serie X" in result["body"]

    def test_tipo_desconocido_usa_subject_del_payload(self):
        payload = {
            "type": "custom_event",
            "subject": "Asunto personalizado",
            "body": "Cuerpo personalizado",
        }
        result = _build_notification_content(payload)
        assert result["subject"] == "Asunto personalizado"
        assert result["body"] == "Cuerpo personalizado"

    def test_tipo_desconocido_sin_subject_usa_generico(self):
        payload = {"type": "unknown_type"}
        result = _build_notification_content(payload)
        assert "Quetxal TV" in result["subject"]

    def test_subject_y_body_sobrescriben_defaults(self):
        payload = {
            "type": "registration",
            "subject": "Mi asunto",
            "body": "Mi cuerpo",
            "metadata": {"full_name": "Carlos"},
        }
        result = _build_notification_content(payload)
        assert result["subject"] == "Mi asunto"
        assert result["body"] == "Mi cuerpo"

    def test_tipo_en_mayusculas_normalizado(self):
        payload = {"type": "REGISTRATION", "metadata": {}}
        result = _build_notification_content(payload)
        assert "activa" in result["body"]

    def test_retorna_strings(self):
        payload = {"type": "registration", "metadata": {}}
        result = _build_notification_content(payload)
        assert isinstance(result["subject"], str)
        assert isinstance(result["body"], str)


# ─── _send_email ─────────────────────────────────────────────────────────────

class TestSendEmail:
    async def test_smtp_no_configurado_retorna_false(self):
        with (
            patch.object(grpc_module, "SMTP_HOST", None),
            patch.object(grpc_module, "SMTP_FROM", None),
        ):
            result = await _send_email("dest@example.com", "Asunto", "Cuerpo")
        assert result is False

    async def test_smtp_host_configurado_pero_from_vacio_retorna_false(self):
        with (
            patch.object(grpc_module, "SMTP_HOST", "smtp.gmail.com"),
            patch.object(grpc_module, "SMTP_FROM", None),
        ):
            result = await _send_email("dest@example.com", "Asunto", "Cuerpo")
        assert result is False

    async def test_aiosmtplib_no_instalado_retorna_false(self):
        with (
            patch.object(grpc_module, "SMTP_HOST", "smtp.gmail.com"),
            patch.object(grpc_module, "SMTP_FROM", "no-reply@quetxal.tv"),
            patch.object(grpc_module, "aiosmtplib", None),
        ):
            result = await _send_email("dest@example.com", "Asunto", "Cuerpo")
        assert result is False

    async def test_envio_exitoso_retorna_true(self):
        mock_aiosmtplib = MagicMock()
        mock_aiosmtplib.send = AsyncMock(return_value=None)

        with (
            patch.object(grpc_module, "SMTP_HOST", "smtp.gmail.com"),
            patch.object(grpc_module, "SMTP_FROM", "no-reply@quetxal.tv"),
            patch.object(grpc_module, "aiosmtplib", mock_aiosmtplib),
        ):
            result = await _send_email("dest@example.com", "Asunto", "Cuerpo")
        assert result is True

    async def test_excepcion_smtp_retorna_false(self):
        mock_aiosmtplib = MagicMock()
        mock_aiosmtplib.send = AsyncMock(side_effect=Exception("SMTP connection error"))

        with (
            patch.object(grpc_module, "SMTP_HOST", "smtp.gmail.com"),
            patch.object(grpc_module, "SMTP_FROM", "no-reply@quetxal.tv"),
            patch.object(grpc_module, "aiosmtplib", mock_aiosmtplib),
        ):
            result = await _send_email("dest@example.com", "Asunto", "Cuerpo")
        assert result is False


# ─── _process_notification ────────────────────────────────────────────────────

class TestProcessNotification:
    async def test_envio_de_email_cuando_smtp_configurado(self):
        payload = {
            "email": "usuario@example.com",
            "type": "registration",
            "metadata": {"full_name": "Pedro"},
        }
        with patch("src.grpc_server._send_email", return_value=True) as mock_send:
            await _process_notification(payload)
        mock_send.assert_awaited_once()
        args = mock_send.call_args[0]
        assert args[0] == "usuario@example.com"

    async def test_usa_campo_to_si_no_hay_email(self):
        payload = {
            "to": "alternativo@example.com",
            "type": "registration",
            "metadata": {},
        }
        with patch("src.grpc_server._send_email", return_value=False) as mock_send:
            await _process_notification(payload)
        mock_send.assert_awaited_once()
        args = mock_send.call_args[0]
        assert args[0] == "alternativo@example.com"


# ─── NotificationServiceServicer.Send ────────────────────────────────────────

class TestSendRPC:
    @pytest.fixture
    def servicer(self):
        return NotificationServiceServicer()

    async def test_encola_mensaje_en_redis(self, servicer):
        mock_redis = AsyncMock()
        req = MagicMock(
            type="registration",
            user_id="user-1",
            email="u@example.com",
            subject="",
            body="",
            metadata={},
        )

        with patch.object(grpc_module, "redis_client", mock_redis):
            await servicer.Send(req, MagicMock())

        mock_redis.rpush.assert_awaited_once()
        queue_name, raw_payload = mock_redis.rpush.call_args[0]
        assert queue_name == grpc_module.NOTIFICATION_QUEUE_NAME
        payload = json.loads(raw_payload)
        assert payload["type"] == "registration"
        assert payload["email"] == "u@example.com"

    async def test_retorna_message_id_valido(self, servicer):
        mock_redis = AsyncMock()
        req = MagicMock(
            type="purchase_receipt", user_id="u-1", email="u@e.com",
            subject="", body="", metadata={},
        )

        with patch.object(grpc_module, "redis_client", mock_redis):
            await servicer.Send(req, MagicMock())

        kw = notification_pb2.NotifyResponse.call_args.kwargs
        assert kw["accepted"] is True
        assert len(kw["message_id"]) == 36  # UUID format
        assert kw["message"] == "notification queued"


# ─── NotificationServiceServicer.Health ──────────────────────────────────────

class TestHealthRPC:
    @pytest.fixture
    def servicer(self):
        return NotificationServiceServicer()

    async def test_health_redis_ok(self, servicer):
        mock_redis = AsyncMock()
        mock_redis.ping.return_value = True

        with patch.object(grpc_module, "redis_client", mock_redis):
            await servicer.Health(MagicMock(), MagicMock())

        kw = notification_pb2.NotificationHealthResponse.call_args.kwargs
        assert kw["success"] is True
        assert kw["status"] == "ok"
        assert kw["redis"] is True

    async def test_health_redis_down(self, servicer):
        mock_redis = AsyncMock()
        mock_redis.ping.side_effect = Exception("Connection refused")

        with patch.object(grpc_module, "redis_client", mock_redis):
            await servicer.Health(MagicMock(), MagicMock())

        kw = notification_pb2.NotificationHealthResponse.call_args.kwargs
        assert kw["status"] == "degraded"
        assert kw["redis"] is False

    async def test_health_smtp_configurado(self, servicer):
        mock_redis = AsyncMock()
        mock_redis.ping.return_value = True

        with (
            patch.object(grpc_module, "redis_client", mock_redis),
            patch.object(grpc_module, "SMTP_HOST", "smtp.gmail.com"),
            patch.object(grpc_module, "SMTP_FROM", "no-reply@quetxal.tv"),
        ):
            await servicer.Health(MagicMock(), MagicMock())

        kw = notification_pb2.NotificationHealthResponse.call_args.kwargs
        assert kw["smtp"] is True
