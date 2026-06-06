import logging

from fastapi import FastAPI, HTTPException

from src.cache import RedisCache
from src.config import get_settings
from src.provider import FxProviderError, fetch_rate

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("fx-service")

settings = get_settings()
cache = RedisCache(settings["redis_url"])
app = FastAPI(title="fx-service")


def _normalize_currency(code: str) -> str:
    normalized = code.strip().upper()
    if len(normalized) != 3 or not normalized.isalpha():
        raise HTTPException(status_code=400, detail="currency codes must be 3 letters")
    return normalized


@app.on_event("shutdown")
async def shutdown_event() -> None:
    await cache.close()


@app.get("/health")
async def health():
    return {"status": "ok", "redis": await cache.ping()}


@app.get("/rates/{base}/{target}")
async def get_rate(base: str, target: str):
    base_code = _normalize_currency(base)
    target_code = _normalize_currency(target)
    cache_key = f"fx:rate:{base_code}:{target_code}"

    cached_payload = await cache.get_json(cache_key)
    if cached_payload is not None:
        logger.info("cache hit key=%s", cache_key)
        return {**cached_payload, "cached": True}

    logger.info("cache miss key=%s", cache_key)

    try:
        payload = await fetch_rate(settings["fx_api_base_url"], base_code, target_code)
    except FxProviderError as exc:
        logger.exception("fx provider error for %s -> %s: %s", base_code, target_code, exc)
        raise HTTPException(status_code=502, detail="could not fetch fx rate") from exc

    try:
        await cache.set_json(cache_key, payload, settings["cache_ttl"])
    except Exception:
        logger.warning("could not persist cache key=%s", cache_key, exc_info=True)

    return {**payload, "cached": False}
