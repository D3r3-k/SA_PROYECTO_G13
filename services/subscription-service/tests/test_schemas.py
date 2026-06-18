"""
Pruebas unitarias para src/schemas.py (modelos Pydantic).
"""
import pytest
from src.schemas import SubscriptionCreate, SubscriptionUpdate, SubscriptionResponse


class TestSubscriptionCreate:
    def test_campos_validos(self):
        sc = SubscriptionCreate(user_id="user-123", plan_id=2)
        assert sc.user_id == "user-123"
        assert sc.plan_id == 2

    def test_user_id_vacio_falla_validacion(self):
        with pytest.raises(Exception):
            SubscriptionCreate(user_id="", plan_id=2)

    def test_plan_id_cero_falla_validacion(self):
        with pytest.raises(Exception):
            SubscriptionCreate(user_id="user-1", plan_id=0)


class TestSubscriptionUpdate:
    def test_campos_validos(self):
        su = SubscriptionUpdate(plan_id=3)
        assert su.plan_id == 3

    def test_plan_id_negativo_falla_validacion(self):
        with pytest.raises(Exception):
            SubscriptionUpdate(plan_id=-1)


class TestSubscriptionResponse:
    def test_campos_validos(self):
        sr = SubscriptionResponse(
            id=1,
            user_id="user-1",
            plan_id=2,
            plan_name="Premium",
            price_usd=9.99,
            status="active",
        )
        assert sr.status == "active"
        assert sr.price_usd == 9.99
