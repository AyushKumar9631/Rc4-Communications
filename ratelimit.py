"""Per-connection token-bucket rate limiter (in memory, thread-safe)."""

import threading
import time


class RateLimiter:
    def __init__(self, burst, per_sec, clock=time.monotonic):
        self.burst = burst
        self.per_sec = per_sec
        self._clock = clock
        self._lock = threading.Lock()
        self._buckets = {}  # key -> (tokens, last_time)

    def allow(self, key):
        now = self._clock()
        with self._lock:
            tokens, last = self._buckets.get(key, (self.burst, now))
            tokens = min(self.burst, tokens + (now - last) * self.per_sec)
            ok = tokens >= 1
            self._buckets[key] = (tokens - 1 if ok else tokens, now)
            return ok

    def forget(self, key):
        with self._lock:
            self._buckets.pop(key, None)
