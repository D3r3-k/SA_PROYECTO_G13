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

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            payload = await _fetch_from_frankfurter_v2(client, fx_api_base_url, base, target)
    except httpx.HTTPStatusError as exc:
        raise FxProviderError(
            f"provider returned {exc.response.status_code} for {exc.request.url}"
        ) from exc
    except httpx.HTTPError as exc:
        raise FxProviderError(f"provider request failed: {exc}") from exc

    rate = payload.get("rate")
    quote = payload.get("quote") or target
    if rate is None:
        raise FxProviderError(f"rate not found in provider response for {base}->{target}")

    return {
        "base": base,
        "target": target,
        "rate": rate,
        "provider": "frankfurter-v2",
        "timestamp": int(time.time()),
    }


async def _fetch_from_frankfurter_v2(
    client: httpx.AsyncClient,
    fx_api_base_url: str,
    base: str,
    target: str,
) -> dict:
    base_url = fx_api_base_url.rstrip("/")

    # Primary path: single-pair endpoint.
    rate_url = f"{base_url}/rate/{base}/{target}"
    try:
        response = await client.get(rate_url, follow_redirects=True)
        response.raise_for_status()
        payload = response.json()
        if payload.get("rate") is not None:
            return payload
    except httpx.HTTPStatusError:
        # Fall back to the quotes endpoint below.
        pass

    # Fallback path: query the rates endpoint for a single quote.
    rates_url = f"{base_url}/rates"
    response = await client.get(rates_url, params={"base": base, "quotes": target}, follow_redirects=True)
    response.raise_for_status()
    payload = response.json()

    if isinstance(payload, list):
        for item in payload:
            if item.get("quote") == target and item.get("rate") is not None:
                return item
    elif isinstance(payload, dict):
        rate = payload.get("rate")
        if rate is not None:
            return payload

    raise FxProviderError(f"rate not found in provider response for {base}->{target}")
