from fastapi import FastAPI
import os
import time
import json
import redis.asyncio as aioredis

app = FastAPI(title="fx-service")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CACHE_TTL = int(os.getenv("FX_CACHE_TTL", "3600"))

redis = aioredis.from_url(REDIS_URL)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/fx/rate/{from_currency}/{to_currency}")
async def get_rate(from_currency: str, to_currency: str):
    key = f"fx:{from_currency.upper()}:{to_currency.upper()}"
    cached = await redis.get(key)
    if cached:
        data = json.loads(cached)
        data["cached"] = True
        return data

    # Mock external call - replace with real provider integration
    rate = 1.23
    payload = {"rate": rate, "timestamp": int(time.time())}
    await redis.set(key, json.dumps(payload), ex=CACHE_TTL)
    payload["cached"] = False
    return payload
