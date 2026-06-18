"""
Mocks de módulos proto generados para engagement-service.
THUMBS_DOWN=1 y THUMBS_UP=2 deben coincidir con el enum del proto.
"""
import sys
from unittest.mock import MagicMock
import pytest


class _BaseServicer:
    pass


_engagement_pb2 = MagicMock(name="engagement_pb2")
_engagement_pb2.THUMBS_DOWN = 1
_engagement_pb2.THUMBS_UP = 2

_engagement_pb2_grpc = MagicMock(name="engagement_pb2_grpc")
_engagement_pb2_grpc.EngagementServiceServicer = _BaseServicer

sys.modules["engagement_pb2"] = _engagement_pb2
sys.modules["engagement_pb2_grpc"] = _engagement_pb2_grpc


@pytest.fixture(autouse=True)
def reset_pb2_mocks():
    import engagement_pb2
    engagement_pb2.reset_mock()
    # Re-asignar constantes que reset_mock() puede haber borrado
    engagement_pb2.THUMBS_DOWN = 1
    engagement_pb2.THUMBS_UP = 2
    yield
