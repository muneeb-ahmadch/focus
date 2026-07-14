import os
import time

from fastapi import HTTPException, Request

WINDOW_SECONDS = 60
# Above this many tracked keys, sweep the quiet ones so per-IP churn (or a
# spoofed key space) can't grow the dict for the process lifetime.
SWEEP_THRESHOLD = 4096


class SlidingWindowRateLimiter:
    def __init__(self, per_minute: int):
        self.per_minute = per_minute
        self._hits: dict[str, list[float]] = {}

    def reset(self) -> None:
        self._hits.clear()

    def _sweep(self, now: float | None = None) -> None:
        now = time.monotonic() if now is None else now
        window_start = now - WINDOW_SECONDS
        stale = [key for key, hits in self._hits.items() if not hits or hits[-1] < window_start]
        for key in stale:
            del self._hits[key]

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        window_start = now - WINDOW_SECONDS
        if len(self._hits) > SWEEP_THRESHOLD:
            self._sweep(now)
        hits = self._hits.get(key)
        if hits is None:
            hits = []
            self._hits[key] = hits
        while hits and hits[0] < window_start:
            hits.pop(0)
        if len(hits) >= self.per_minute:
            return False
        hits.append(now)
        return True


limiter = SlidingWindowRateLimiter(per_minute=int(os.environ.get("RATE_LIMIT_PER_MIN", "60")))


def rate_limit(request: Request) -> None:
    # request.client.host is the transport peer. The app never reads
    # X-Forwarded-For, and the server runs with --no-proxy-headers, so a
    # client-supplied header cannot mint fresh buckets.
    key = request.client.host if request.client else "unknown"
    if not limiter.allow(key):
        raise HTTPException(status_code=429, detail="rate limit exceeded")
