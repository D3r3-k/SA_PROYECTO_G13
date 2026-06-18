"""
Pruebas unitarias e integración para SubscriptionServiceServicer.
Mockea src.repository, src.db y src.notification_publisher.
"""
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from datetime import datetime

import subscription_pb2  # MagicMock de conftest.py

from src.grpc_server import SubscriptionServiceServicer, _publish_subscription_notification


@pytest.fixture
def servicer():
    return SubscriptionServiceServicer()


@pytest.fixture
def ctx():
    return MagicMock()


def _fake_subscription(**kwargs):
    defaults = dict(
        id=1,
        user_id="user-123",
        plan_id=2,
        plan_name="Premium",
        price_usd=9.99,
        status="active",
        started_at=datetime(2024, 1, 1),
        updated_at=datetime(2024, 1, 1),
    )
    defaults.update(kwargs)
    return defaults


def _fake_plan(**kwargs):
    defaults = dict(id=2, name="Premium", price_usd=9.99, is_active=True)
    defaults.update(kwargs)
    return defaults


# ─── _publish_subscription_notification ──────────────────────────────────────

class TestPublishNotification:
    async def test_no_publica_si_email_vacio(self):
        sub = _fake_subscription()
        with patch("src.grpc_server.publish_notification_event") as mock_pub:
            await _publish_subscription_notification(sub, "", "created")
        mock_pub.assert_not_called()

    async def test_publica_con_email_valido_creacion(self):
        sub = _fake_subscription()
        with patch("src.grpc_server.publish_notification_event") as mock_pub:
            await _publish_subscription_notification(sub, "user@example.com", "created")
        mock_pub.assert_called_once()
        payload = mock_pub.call_args[0][0]
        assert payload["type"] == "purchase_receipt"
        assert payload["email"] == "user@example.com"

    async def test_publica_con_email_valido_actualizacion(self):
        sub = _fake_subscription()
        with patch("src.grpc_server.publish_notification_event") as mock_pub:
            await _publish_subscription_notification(sub, "user@example.com", "updated")
        payload = mock_pub.call_args[0][0]
        assert payload["type"] == "subscription_update"


# ─── UpdatePlan ───────────────────────────────────────────────────────────────

class TestUpdatePlan:
    async def test_actualiza_plan_exitosamente(self, servicer, ctx):
        req = MagicMock(id=1, name="Premium Plus", price_usd=14.99,
                        actor_user_id="admin-1", actor_email="admin@example.com")

        with patch("src.grpc_server.update_plan", return_value=_fake_plan(name="Premium Plus")):
            await servicer.UpdatePlan(req, ctx)

        kw = subscription_pb2.UpdatePlanResponse.call_args.kwargs
        assert kw["success"] is True

    async def test_id_cero_retorna_error(self, servicer, ctx):
        req = MagicMock(id=0, name="Plan", price_usd=5.0)
        await servicer.UpdatePlan(req, ctx)

        kw = subscription_pb2.UpdatePlanResponse.call_args.kwargs
        assert kw["success"] is False
        assert "id" in kw["message"]

    async def test_nombre_vacio_retorna_error(self, servicer, ctx):
        req = MagicMock(id=1, name="", price_usd=5.0)
        await servicer.UpdatePlan(req, ctx)

        kw = subscription_pb2.UpdatePlanResponse.call_args.kwargs
        assert kw["success"] is False
        assert "name" in kw["message"]

    async def test_precio_negativo_retorna_error(self, servicer, ctx):
        req = MagicMock(id=1, name="Plan", price_usd=-1.0)
        await servicer.UpdatePlan(req, ctx)

        kw = subscription_pb2.UpdatePlanResponse.call_args.kwargs
        assert kw["success"] is False
        assert "price_usd" in kw["message"]

    async def test_plan_no_existe_retorna_error(self, servicer, ctx):
        req = MagicMock(id=999, name="Plan", price_usd=5.0)
        with patch("src.grpc_server.update_plan", side_effect=ValueError("not found")):
            await servicer.UpdatePlan(req, ctx)

        kw = subscription_pb2.UpdatePlanResponse.call_args.kwargs
        assert kw["success"] is False


# ─── ListPlans ────────────────────────────────────────────────────────────────

class TestListPlans:
    async def test_lista_planes_exitosamente(self, servicer, ctx):
        plans = [_fake_plan(), _fake_plan(id=3, name="Basic", price_usd=4.99)]

        with patch("src.grpc_server.list_plans", return_value=plans):
            await servicer.ListPlans(MagicMock(), ctx)

        kw = subscription_pb2.ListPlansResponse.call_args.kwargs
        assert kw["success"] is True
        assert len(kw["plans"]) == 2

    async def test_error_de_db_retorna_failure(self, servicer, ctx):
        with patch("src.grpc_server.list_plans", side_effect=Exception("DB error")):
            await servicer.ListPlans(MagicMock(), ctx)

        kw = subscription_pb2.ListPlansResponse.call_args.kwargs
        assert kw["success"] is False


# ─── CreateSubscription ───────────────────────────────────────────────────────

class TestCreateSubscription:
    async def test_crea_suscripcion_exitosamente(self, servicer, ctx):
        sub = _fake_subscription()
        req = MagicMock(user_id="user-1", plan_id=2, email="u@example.com")

        with (
            patch("src.grpc_server.create_subscription", return_value=sub),
            patch("src.grpc_server._publish_subscription_notification"),
        ):
            await servicer.CreateSubscription(req, ctx)

        kw = subscription_pb2.SubscriptionResponse.call_args.kwargs
        assert kw["success"] is True

    async def test_user_id_vacio_retorna_error(self, servicer, ctx):
        req = MagicMock(user_id="", plan_id=2)
        await servicer.CreateSubscription(req, ctx)

        kw = subscription_pb2.SubscriptionResponse.call_args.kwargs
        assert kw["success"] is False
        assert "user_id" in kw["message"]

    async def test_plan_id_cero_retorna_error(self, servicer, ctx):
        req = MagicMock(user_id="user-1", plan_id=0)
        await servicer.CreateSubscription(req, ctx)

        kw = subscription_pb2.SubscriptionResponse.call_args.kwargs
        assert kw["success"] is False
        assert "plan_id" in kw["message"]

    async def test_usuario_ya_suscrito_retorna_error(self, servicer, ctx):
        req = MagicMock(user_id="user-1", plan_id=2, email="u@example.com")

        with patch("src.grpc_server.create_subscription",
                   side_effect=ValueError("User already has an active subscription")):
            await servicer.CreateSubscription(req, ctx)

        kw = subscription_pb2.SubscriptionResponse.call_args.kwargs
        assert kw["success"] is False
        assert "active subscription" in kw["message"]

    async def test_notificacion_falla_pero_suscripcion_se_crea(self, servicer, ctx):
        sub = _fake_subscription()
        req = MagicMock(user_id="user-1", plan_id=2, email="u@example.com")

        with (
            patch("src.grpc_server.create_subscription", return_value=sub),
            patch("src.grpc_server._publish_subscription_notification",
                  side_effect=Exception("Redis down")),
        ):
            await servicer.CreateSubscription(req, ctx)

        kw = subscription_pb2.SubscriptionResponse.call_args.kwargs
        assert kw["success"] is True


# ─── UpdateSubscription ───────────────────────────────────────────────────────

class TestUpdateSubscription:
    async def test_actualiza_suscripcion_exitosamente(self, servicer, ctx):
        sub = _fake_subscription(plan_id=3)
        req = MagicMock(subscription_id=1, plan_id=3, user_id="user-1", email="u@example.com")

        with (
            patch("src.grpc_server.update_subscription_plan", return_value=sub),
            patch("src.grpc_server._publish_subscription_notification"),
        ):
            await servicer.UpdateSubscription(req, ctx)

        kw = subscription_pb2.SubscriptionResponse.call_args.kwargs
        assert kw["success"] is True

    async def test_subscription_id_cero_retorna_error(self, servicer, ctx):
        req = MagicMock(subscription_id=0, plan_id=3, user_id="user-1")
        await servicer.UpdateSubscription(req, ctx)

        kw = subscription_pb2.SubscriptionResponse.call_args.kwargs
        assert kw["success"] is False

    async def test_plan_id_cero_retorna_error(self, servicer, ctx):
        req = MagicMock(subscription_id=1, plan_id=0, user_id="user-1")
        await servicer.UpdateSubscription(req, ctx)

        kw = subscription_pb2.SubscriptionResponse.call_args.kwargs
        assert kw["success"] is False

    async def test_user_id_vacio_retorna_error(self, servicer, ctx):
        req = MagicMock(subscription_id=1, plan_id=3, user_id="")
        await servicer.UpdateSubscription(req, ctx)

        kw = subscription_pb2.SubscriptionResponse.call_args.kwargs
        assert kw["success"] is False


# ─── ListUserSubscriptions ────────────────────────────────────────────────────

class TestListUserSubscriptions:
    async def test_lista_suscripciones_por_usuario(self, servicer, ctx):
        subs = [_fake_subscription(), _fake_subscription(id=2, plan_id=3)]
        req = MagicMock(user_id="user-1")

        with patch("src.grpc_server.get_subscriptions_by_user", return_value=subs):
            await servicer.ListUserSubscriptions(req, ctx)

        kw = subscription_pb2.ListUserSubscriptionsResponse.call_args.kwargs
        assert kw["success"] is True
        assert len(kw["subscriptions"]) == 2

    async def test_user_id_vacio_retorna_error(self, servicer, ctx):
        req = MagicMock(user_id="")
        await servicer.ListUserSubscriptions(req, ctx)

        kw = subscription_pb2.ListUserSubscriptionsResponse.call_args.kwargs
        assert kw["success"] is False


# ─── CancelSubscription ───────────────────────────────────────────────────────

class TestCancelSubscription:
    async def test_cancela_suscripcion_exitosamente(self, servicer, ctx):
        req = MagicMock(subscription_id=1)

        with patch("src.grpc_server.delete_subscription", return_value=True):
            await servicer.CancelSubscription(req, ctx)

        kw = subscription_pb2.BasicSubscriptionResponse.call_args.kwargs
        assert kw["success"] is True

    async def test_suscripcion_no_encontrada(self, servicer, ctx):
        req = MagicMock(subscription_id=999)

        with patch("src.grpc_server.delete_subscription", return_value=False):
            await servicer.CancelSubscription(req, ctx)

        kw = subscription_pb2.BasicSubscriptionResponse.call_args.kwargs
        assert kw["success"] is False
        assert "not found" in kw["message"]

    async def test_subscription_id_cero_retorna_error(self, servicer, ctx):
        req = MagicMock(subscription_id=0)
        await servicer.CancelSubscription(req, ctx)

        kw = subscription_pb2.BasicSubscriptionResponse.call_args.kwargs
        assert kw["success"] is False
