import time

import httpx


class FxProviderError(RuntimeError):
    pass


async def fetch_rate(fx_api_base_url: str, base: str, target: str) -> dict:
    if base == target:
        return {
            "base": base,
            "target": target,
            "rate": 1.0,
            "provider": "self",
            "timestamp": int(time.time()),
        }

    url = f"{fx_api_base_url.rstrip('/')}/latest"
    params = {"from": base, "to": target}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, params=params, follow_redirects=True)
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        raise FxProviderError(
            f"provider returned {exc.response.status_code} for {exc.request.url}"
        ) from exc
    except httpx.HTTPError as exc:
        raise FxProviderError(f"provider request failed: {exc}") from exc

    rates = payload.get("rates", {})
    rate = rates.get(target)
    if rate is None:
        raise FxProviderError(f"rate not found in provider response for {base}->{target}")

    return {
        "base": base,
        "target": target,
        "rate": rate,
        "provider": "frankfurter",
        "timestamp": int(time.time()),
    }
