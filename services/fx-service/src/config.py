import os


def get_settings() -> dict[str, str | int]:
    return {
        "redis_url": os.getenv("REDIS_URL", "redis://localhost:6379/0"),
        "cache_ttl": int(os.getenv("FX_CACHE_TTL", "3600")),
        "fx_api_base_url": os.getenv("FX_API_BASE_URL", "https://api.frankfurter.dev/v2"),
    }
