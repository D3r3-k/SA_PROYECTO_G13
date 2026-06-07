import json
import os
from datetime import datetime, timezone
from typing import Any

from redis.asyncio import Redis

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
NOTIFICATION_QUEUE_NAME = os.getenv("NOTIFICATION_QUEUE_NAME", "notification:queue")

redis_client: Redis | None = None


async def get_redis_client() -> Redis:
    global redis_client

    if redis_client is None:
        redis_client = Redis.from_url(
            REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )

    return redis_client


async def publish_notification_event(payload: dict[str, Any]) -> None:
    client = await get_redis_client()

    event = {
        **payload,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await client.rpush(NOTIFICATION_QUEUE_NAME, json.dumps(event))
