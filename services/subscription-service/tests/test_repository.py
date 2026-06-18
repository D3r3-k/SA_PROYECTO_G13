"""
Pruebas unitarias para src/repository.py.
Mockea get_cursor para no requerir PostgreSQL real.
"""
from contextlib import contextmanager
from unittest.mock import MagicMock, patch
import pytest

from src.repository import (
    update_plan,
    list_plans,
    create_subscription,
    update_subscription_plan,
    get_subscriptions_by_user,
    delete_subscription,
    list_audit_logs,
)


def _cursor_ctx(mock_cursor):
    @contextmanager
    def _ctx():
        yield mock_cursor
    return _ctx


def _fake_plan_row():
    return {"id": 2, "name": "Premium", "price_usd": 9.99, "is_active": True}


def _fake_sub_row():
    return {
        "id": 1, "user_id": "user-1", "plan_id": 2,
        "status": "active", "started_at": "2024-01-01", "updated_at": "2024-01-01"
    }


# ─── update_plan ──────────────────────────────────────────────────────────────

class TestUpdatePlan:
    def test_actualiza_plan_exitosamente(self):
        plan_row = {"id": 2, "name": "Premium Plus", "price_usd": 14.99, "is_active": True}
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = plan_row

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = update_plan(2, "Premium Plus", 14.99)

        assert result["name"] == "Premium Plus"
        assert mock_cursor.execute.call_count == 3  # set_config x2 + UPDATE

    def test_plan_no_encontrado_lanza_valueerror(self):
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            with pytest.raises(ValueError, match="plan not found"):
                update_plan(999, "X", 5.0)

    def test_pasa_actor_ids(self):
        plan_row = {"id": 1, "name": "Basic", "price_usd": 4.99, "is_active": True}
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = plan_row

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            update_plan(1, "Basic", 4.99, actor_user_id="admin-1", actor_email="a@b.com")

        first_call_params = mock_cursor.execute.call_args_list[0][0][1]
        assert first_call_params == ("admin-1",)


# ─── list_plans ───────────────────────────────────────────────────────────────

class TestListPlans:
    def test_retorna_lista_de_planes(self):
        rows = [_fake_plan_row(), {"id": 3, "name": "Basic", "price_usd": 4.99, "is_active": True}]
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = rows

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = list_plans()

        assert len(result) == 2

    def test_retorna_lista_vacia(self):
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = list_plans()

        assert result == []


# ─── create_subscription ──────────────────────────────────────────────────────

class TestCreateSubscription:
    def test_crea_suscripcion_exitosamente(self):
        plan_row = {"id": 2, "name": "Premium", "price_usd": 9.99}
        sub_row = _fake_sub_row()
        mock_cursor = MagicMock()
        # fetchone: plan, no active sub, new sub
        mock_cursor.fetchone.side_effect = [plan_row, None, sub_row]

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = create_subscription("user-1", 2)

        assert result["user_id"] == "user-1"
        assert result["plan_name"] == "Premium"
        assert result["price_usd"] == 9.99

    def test_plan_no_encontrado_lanza_valueerror(self):
        mock_cursor = MagicMock()
        mock_cursor.fetchone.side_effect = [None]

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            with pytest.raises(ValueError, match="plan not found"):
                create_subscription("user-1", 999)

    def test_usuario_ya_suscrito_lanza_valueerror(self):
        plan_row = {"id": 2, "name": "Premium", "price_usd": 9.99}
        active_sub = _fake_sub_row()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.side_effect = [plan_row, active_sub]

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            with pytest.raises(ValueError, match="active subscription"):
                create_subscription("user-1", 2)


# ─── update_subscription_plan ─────────────────────────────────────────────────

class TestUpdateSubscriptionPlan:
    def test_actualiza_suscripcion_exitosamente(self):
        plan_row = {"id": 3, "name": "Ultra", "price_usd": 19.99}
        sub_row = {"id": 1, "user_id": "user-1", "plan_id": 3,
                   "status": "active", "started_at": "2024-01-01", "updated_at": "2024-01-01"}
        mock_cursor = MagicMock()
        mock_cursor.fetchone.side_effect = [plan_row, sub_row]

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = update_subscription_plan(1, 3, "user-1")

        assert result["plan_name"] == "Ultra"
        assert result["price_usd"] == 19.99

    def test_plan_no_encontrado_lanza_valueerror(self):
        mock_cursor = MagicMock()
        mock_cursor.fetchone.side_effect = [None]

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            with pytest.raises(ValueError, match="plan not found"):
                update_subscription_plan(1, 999, "user-1")

    def test_suscripcion_no_encontrada_lanza_valueerror(self):
        plan_row = {"id": 3, "name": "Ultra", "price_usd": 19.99}
        mock_cursor = MagicMock()
        mock_cursor.fetchone.side_effect = [plan_row, None]

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            with pytest.raises(ValueError, match="active subscription not found"):
                update_subscription_plan(1, 3, "user-1")


# ─── get_subscriptions_by_user ────────────────────────────────────────────────

class TestGetSubscriptionsByUser:
    def test_retorna_suscripciones_con_price_usd_como_float(self):
        rows = [
            {"id": 1, "user_id": "user-1", "plan_id": 2, "plan_name": "Premium",
             "price_usd": "9.99", "status": "active", "started_at": "2024-01", "updated_at": "2024-01"},
        ]
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = rows

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = get_subscriptions_by_user("user-1")

        assert len(result) == 1
        assert isinstance(result[0]["price_usd"], float)

    def test_retorna_lista_vacia_sin_suscripciones(self):
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = get_subscriptions_by_user("user-x")

        assert result == []


# ─── delete_subscription ──────────────────────────────────────────────────────

class TestDeleteSubscription:
    def test_retorna_true_si_se_cancela(self):
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = {"id": 1}

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = delete_subscription(1)

        assert result is True

    def test_retorna_false_si_no_se_cancela(self):
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = delete_subscription(999)

        assert result is False


# ─── list_audit_logs ──────────────────────────────────────────────────────────

class TestListAuditLogs:
    def test_agrega_campo_service_a_cada_fila(self):
        rows = [{"id": "1", "actor_user_id": "u1", "action": "INSERT"}]
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = rows

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = list_audit_logs()

        assert len(result) == 1
        assert result[0]["service"] == "subscription"

    def test_retorna_lista_vacia(self):
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            result = list_audit_logs()

        assert result == []

    def test_pasa_todos_los_parametros_al_cursor(self):
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []

        with patch("src.repository.get_cursor", _cursor_ctx(mock_cursor)):
            list_audit_logs(
                table_name="subscriptions",
                actor_user_id="admin-1",
                action="UPDATE",
                from_ts="2024-01-01",
                to_ts="2024-12-31",
                limit=50,
                offset=5,
            )

        params = mock_cursor.execute.call_args[0][1]
        assert params[0] == "subscriptions"
        assert params[1] == "admin-1"
        assert params[5] == 50
        assert params[6] == 5
