"""
Configura mocks de los módulos proto generados ANTES de que se importen los módulos
del servicio. Los archivos payment_pb2.py y payment_pb2_grpc.py son generados por
protoc en el Dockerfile y no existen en el entorno de pruebas.
"""
import sys
from unittest.mock import MagicMock
import pytest


class _BaseServicer:
    """Clase base real para que PaymentGatewayServiceServicer herede de algo concreto."""
    pass


_pb2 = MagicMock(name="payment_pb2")
_pb2_grpc = MagicMock(name="payment_pb2_grpc")
_pb2_grpc.PaymentGatewayServiceServicer = _BaseServicer

sys.modules["payment_pb2"] = _pb2
sys.modules["payment_pb2_grpc"] = _pb2_grpc


@pytest.fixture(autouse=True)
def reset_pb2_mocks():
    """Limpia el historial de llamadas de los mocks proto antes de cada test."""
    import payment_pb2
    payment_pb2.reset_mock()
    yield
