"""
rate_limiter.py — lightweight in-memory per-user rate limiter.
No external dependency (no Redis, no slowapi) — fits free-tier/single-instance deployment.

Tracks request timestamps per (user_id, endpoint_key) in memory.
Each call to check_rate_limit() prunes old timestamps and raises HTTPException(429)
if either the per-minute or per-day limit is exceeded.

NOTE: This is process-local. On Render free tier (single instance, no horizontal
scaling), this is sufficient. If the API ever moves to multiple instances, this
would need to move to Redis or another shared store.
"""

import time
from collections import defaultdict
from fastapi import HTTPException  # type: ignore

# user_id -> endpoint_key -> list of unix timestamps (seconds)
_request_log: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))

MINUTE = 60
DAY = 86400

# Per-endpoint limits: (max_per_minute, max_per_day)
RATE_LIMITS: dict[str, tuple[int, int]] = {
    "ingest": (2, 5),
    "explain": (10, 200),
    "chat": (10, 150),
}


def _prune(timestamps: list[float], now: float) -> list[float]:
    """Keep only timestamps within the last 24 hours."""
    cutoff = now - DAY
    return [t for t in timestamps if t > cutoff]


def check_rate_limit(user_id: str, endpoint_key: str) -> None:
    """
    Raises HTTPException(429) if user_id has exceeded the RPM or RPD limit
    for the given endpoint_key. Otherwise records this request and returns None.
    """
    if endpoint_key not in RATE_LIMITS:
        return  # no limit configured, allow

    max_per_minute, max_per_day = RATE_LIMITS[endpoint_key]
    now = time.time()

    timestamps = _prune(_request_log[user_id][endpoint_key], now)

    minute_count = sum(1 for t in timestamps if t > now - MINUTE)
    day_count = len(timestamps)

    if minute_count >= max_per_minute:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded: max {max_per_minute} requests per minute for this action. Please wait a moment and try again.",
        )

    if day_count >= max_per_day:
        raise HTTPException(
            status_code=429,
            detail=f"Daily limit reached: max {max_per_day} requests per day for this action. Please try again tomorrow.",
        )

    timestamps.append(now)
    _request_log[user_id][endpoint_key] = timestamps