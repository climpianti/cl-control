"""Installer sessions and PIN rate limiting."""

from __future__ import annotations

from collections import defaultdict, deque
import time
from typing import Callable

DEFAULT_CONFIG = {
    "schema_version": 1,
    "pin": "",
    "session_minutes": 30,
    "rate_limit": {
        "max_attempts": 5,
        "window_seconds": 300,
        "lockout_seconds": 900,
    },
}


class PinRateLimiter:
    """In-memory limiter that never stores the attempted PIN."""

    def __init__(
        self,
        max_attempts: int = 5,
        window_seconds: int = 300,
        lockout_seconds: int = 900,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.max_attempts = max(1, int(max_attempts))
        self.window_seconds = max(1, int(window_seconds))
        self.lockout_seconds = max(1, int(lockout_seconds))
        self._clock = clock
        self._attempts: dict[str, deque[float]] = defaultdict(deque)
        self._locked_until: dict[str, float] = {}

    def retry_after(self, key: str) -> int:
        now = self._clock()
        expiry = self._locked_until.get(key, 0)
        if expiry <= now:
            self._locked_until.pop(key, None)
            return 0
        return max(1, int(expiry - now + 0.999))

    def record_failure(self, key: str) -> int:
        now = self._clock()
        attempts = self._attempts[key]
        while attempts and attempts[0] <= now - self.window_seconds:
            attempts.popleft()
        attempts.append(now)
        if len(attempts) >= self.max_attempts:
            self._locked_until[key] = now + self.lockout_seconds
            attempts.clear()
        return self.retry_after(key)

    def record_success(self, key: str) -> None:
        self._attempts.pop(key, None)
        self._locked_until.pop(key, None)


class InstallerSessions:
    """Ephemeral admin sessions; no secret is persisted."""

    def __init__(
        self, session_minutes: int, clock: Callable[[], float] = time.time
    ) -> None:
        self._ttl = max(1, int(session_minutes)) * 60
        self._clock = clock
        self._sessions: dict[str, float] = {}

    def unlock(self, user_id: str) -> None:
        self._sessions[user_id] = self._clock() + self._ttl

    def lock(self, user_id: str) -> None:
        self._sessions.pop(user_id, None)

    def active(self, user_id: str) -> bool:
        expiry = self._sessions.get(user_id, 0)
        if expiry <= self._clock():
            self._sessions.pop(user_id, None)
            return False
        return True
