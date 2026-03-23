"""
Prometheon Cache Layer — Redis-backed caching for RCA results.

Provides idempotent analysis: same (service, time_window) combo
within a short TTL returns cached result instead of re-querying Jaeger.
"""

import os
import json
import hashlib
from typing import Optional

import redis.asyncio as redis

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
CACHE_TTL_SECONDS = 120  # 2 minutes — traces evolve, don't cache too long

_pool: Optional[redis.Redis] = None


async def get_redis() -> redis.Redis:
    """Get or create the Redis connection pool."""
    global _pool
    if _pool is None:
        _pool = redis.from_url(REDIS_URL, decode_responses=True)
    return _pool


async def close_redis():
    """Close the Redis pool on shutdown."""
    global _pool
    if _pool:
        await _pool.aclose()
        _pool = None


def _cache_key(tenant_id: str, service: str, time_window: int) -> str:
    """Build a deterministic cache key for an RCA query."""
    raw = f"rca:{tenant_id}:{service}:{time_window}"
    return raw


async def get_cached_analysis(
    tenant_id: str, service: str, time_window: int
) -> Optional[dict]:
    """Return cached RCA result if it exists and hasn't expired."""
    r = await get_redis()
    key = _cache_key(tenant_id, service, time_window)
    data = await r.get(key)
    if data:
        return json.loads(data)
    return None


async def set_cached_analysis(
    tenant_id: str, service: str, time_window: int, result: dict
) -> None:
    """Cache an RCA result with TTL."""
    r = await get_redis()
    key = _cache_key(tenant_id, service, time_window)
    await r.setex(key, CACHE_TTL_SECONDS, json.dumps(result, default=str))


async def invalidate_tenant_cache(tenant_id: str) -> None:
    """Clear all cached RCA results for a tenant (e.g. after new injection)."""
    r = await get_redis()
    pattern = f"rca:{tenant_id}:*"
    keys = []
    async for key in r.scan_iter(match=pattern):
        keys.append(key)
    if keys:
        await r.delete(*keys)
