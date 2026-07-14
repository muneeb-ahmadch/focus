"""SEC-6: the sliding-window limiter must bound its memory — quiet keys are
swept, they don't accumulate for the process lifetime."""

import time

from app.ratelimit import WINDOW_SECONDS, SlidingWindowRateLimiter


def test_allows_up_to_limit_then_blocks():
    rl = SlidingWindowRateLimiter(per_minute=3)
    assert [rl.allow("a") for _ in range(4)] == [True, True, True, False]


def test_separate_keys_have_separate_budgets():
    rl = SlidingWindowRateLimiter(per_minute=1)
    assert rl.allow("a") is True
    assert rl.allow("b") is True
    assert rl.allow("a") is False


def test_reset_clears_all():
    rl = SlidingWindowRateLimiter(per_minute=1)
    rl.allow("a")
    rl.reset()
    assert rl.allow("a") is True


def test_reading_an_unknown_key_does_not_create_an_entry():
    rl = SlidingWindowRateLimiter(per_minute=1)
    rl.allow("real")
    assert set(rl._hits) == {"real"}


def test_sweep_removes_quiet_keys():
    rl = SlidingWindowRateLimiter(per_minute=5)
    rl.allow("quiet")
    assert "quiet" in rl._hits
    rl._sweep(now=time.monotonic() + WINDOW_SECONDS + 1)
    assert "quiet" not in rl._hits


def test_window_expiry_lets_requests_through_again():
    rl = SlidingWindowRateLimiter(per_minute=1)
    rl._hits["a"] = [time.monotonic() - WINDOW_SECONDS - 1]
    assert rl.allow("a") is True
