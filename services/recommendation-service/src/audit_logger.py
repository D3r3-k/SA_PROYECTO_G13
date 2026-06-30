import os
import json
import logging
from datetime import datetime, timezone
import redis

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
AUDIT_QUEUE_NAME = "log_audit_queue"

redis_client = None
logger = logging.getLogger("audit_logger")

def get_redis_client():
    global redis_client
    if redis_client is None:
        try:
            redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        except Exception as e:
            logger.error(f"Failed to connect to Redis for audit logging: {e}")
    return redis_client

def push_audit_log(service_name: str, action: str, user_id: str, details: dict = None):
    if details is None:
        details = {}
        
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": service_name,
        "action": action,
        "user_id": user_id,
        "details": details
    }
    
    try:
        client = get_redis_client()
        if client:
            client.rpush(AUDIT_QUEUE_NAME, json.dumps(payload))
    except Exception as e:
        logger.error(f"Failed to push audit log to Redis: {e}")
