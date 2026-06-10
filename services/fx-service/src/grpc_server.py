import asyncio
import logging

import grpc

import fx_pb2
import fx_pb2_grpc

from src.cache import RedisCache
from src.config import get_settings
from src.provider import FxProviderError, fetch_rate

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("fx-service-grpc")

settings = get_settings()
cache = RedisCache(settings["redis_url"])


def _normalize_currency(code: str) -> str:
    normalized = code.strip().upper()

    if len(normalized) != 3 or not normalized.isalpha():
        raise ValueError("currency codes must be 3 letters")

    return normalized


class FxServiceServicer(fx_pb2_grpc.FxServiceServicer):
    async def Health(self, request, context):
        redis_ok = await cache.ping()

        return fx_pb2.FxHealthResponse(
            success=True,
            status="ok" if redis_ok else "degraded",
            redis=redis_ok
        )

    async def GetRate(self, request, context):
        try:
            base_code = _normalize_currency(request.base)
            target_code = _normalize_currency(request.target)
        except ValueError as exc:
            return fx_pb2.RateResponse(
                success=False,
                message=str(exc)
            )

        cache_key = f"fx:rate:{base_code}:{target_code}"

        cached_payload = await cache.get_json(cache_key)

        if cached_payload is not None:
            logger.info("cache hit key=%s", cache_key)

            return fx_pb2.RateResponse(
                success=True,
                message="rate resolved from cache",
                base=cached_payload.get("base", base_code),
                target=cached_payload.get("target", target_code),
                rate=float(cached_payload.get("rate", 0)),
                timestamp=int(cached_payload.get("timestamp", 0)),
                cached=True
            )

        logger.info("cache miss key=%s", cache_key)

        try:
            payload = await fetch_rate(
                settings["fx_api_base_url"],
                base_code,
                target_code
            )
        except FxProviderError as exc:
            logger.exception("fx provider error")
            return fx_pb2.RateResponse(
                success=False,
                message=f"could not fetch fx rate: {exc}"
            )

        try:
            await cache.set_json(cache_key, payload, settings["cache_ttl"])
        except Exception:
            logger.warning("could not persist cache key=%s", cache_key, exc_info=True)

        return fx_pb2.RateResponse(
            success=True,
            message="rate resolved from provider",
            base=payload["base"],
            target=payload["target"],
            rate=float(payload["rate"]),
            timestamp=int(payload["timestamp"]),
            cached=False
        )


async def serve() -> None:
    server = grpc.aio.server()
    fx_pb2_grpc.add_FxServiceServicer_to_server(FxServiceServicer(), server)

    listen_addr = "[::]:50052"
    server.add_insecure_port(listen_addr)

    logger.info("FX Service gRPC running on %s", listen_addr)

    await server.start()

    try:
        await server.wait_for_termination()
    finally:
        await cache.close()


if __name__ == "__main__":
    asyncio.run(serve())