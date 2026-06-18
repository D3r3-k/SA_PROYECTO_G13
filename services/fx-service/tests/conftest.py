"""
Mocks de módulos proto generados para fx-service.
"""
import sys
from unittest.mock import MagicMock
import pytest


class _BaseServicer:
    pass


_fx_pb2 = MagicMock(name="fx_pb2")
_fx_pb2_grpc = MagicMock(name="fx_pb2_grpc")
_fx_pb2_grpc.FxServiceServicer = _BaseServicer

sys.modules["fx_pb2"] = _fx_pb2
sys.modules["fx_pb2_grpc"] = _fx_pb2_grpc


@pytest.fixture(autouse=True)
def reset_pb2_mocks():
    import fx_pb2
    fx_pb2.reset_mock()
    yield
