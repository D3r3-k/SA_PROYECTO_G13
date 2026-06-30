import pytest
from unittest.mock import patch, MagicMock
from src.audit_logger import get_redis_client, push_audit_log
import src.audit_logger as audit_logger_module

def test_get_redis_client_success():
    audit_logger_module.redis_client = None
    with patch("redis.Redis.from_url") as mock_from_url:
        mock_from_url.return_value = MagicMock()
        client = get_redis_client()
        assert client is not None
        mock_from_url.assert_called_once()

def test_get_redis_client_exception():
    audit_logger_module.redis_client = None
    with patch("redis.Redis.from_url", side_effect=Exception("Connection error")):
        with patch("src.audit_logger.logger.error") as mock_logger:
            client = get_redis_client()
            mock_logger.assert_called_once()

def test_push_audit_log_success():
    mock_redis = MagicMock()
    audit_logger_module.redis_client = mock_redis
    push_audit_log("test-service", "test_action", "user123", {"key": "value"})
    mock_redis.rpush.assert_called_once()

def test_push_audit_log_exception():
    mock_redis = MagicMock()
    mock_redis.rpush.side_effect = Exception("Push error")
    audit_logger_module.redis_client = mock_redis
    with patch("src.audit_logger.logger.error") as mock_logger:
        push_audit_log("test-service", "test_action", "user123")
        mock_logger.assert_called_once()
