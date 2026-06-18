"""
Mocks de módulos proto generados para notification-service.
"""
import sys
from unittest.mock import MagicMock, AsyncMock
import pytest


class _BaseServicer:
    pass


_notification_pb2 = MagicMock(name="notification_pb2")
_notification_pb2_grpc = MagicMock(name="notification_pb2_grpc")
_notification_pb2_grpc.NotificationServiceServicer = _BaseServicer

sys.modules["notification_pb2"] = _notification_pb2
sys.modules["notification_pb2_grpc"] = _notification_pb2_grpc


@pytest.fixture(autouse=True)
def reset_pb2_mocks():
    import notification_pb2
    notification_pb2.reset_mock()
    yield
