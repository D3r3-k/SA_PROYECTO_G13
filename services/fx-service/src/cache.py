import json

import redis.asyncio as redis


class RedisCache:
    def __init__(self, redis_url: str):
        self._client = redis.from_url(redis_url, decode_responses=True)

    async def get_json(self, key: str) -> dict | None:
        value = await self._client.get(key)
        if not value:
            return None
        return json.loads(value)

    async def set_json(self, key: str, value: dict, ttl_seconds: int) -> None:
        await self._client.set(key, json.dumps(value), ex=ttl_seconds)

    async def ping(self) -> bool:
        try:
            return bool(await self._client.ping())
        except Exception:
            return False

    async def close(self) -> None:
        await self._client.aclose()
