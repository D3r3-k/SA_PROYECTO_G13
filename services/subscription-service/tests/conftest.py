"""
Mocks de módulos proto generados para subscription-service.
"""
import sys
from unittest.mock import MagicMock
import pytest


class _BaseServicer:
    pass


_subscription_pb2 = MagicMock(name="subscription_pb2")
_subscription_pb2_grpc = MagicMock(name="subscription_pb2_grpc")
_subscription_pb2_grpc.SubscriptionServiceServicer = _BaseServicer

sys.modules["subscription_pb2"] = _subscription_pb2
sys.modules["subscription_pb2_grpc"] = _subscription_pb2_grpc


@pytest.fixture(autouse=True)
def reset_pb2_mocks():
    import subscription_pb2
    subscription_pb2.reset_mock()
    yield
