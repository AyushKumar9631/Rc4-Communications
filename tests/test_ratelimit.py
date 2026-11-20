"""Phase 4 tests: token-bucket limiter and its Socket.IO wiring.

Run from the project root:  python -m pytest tests -v   (or python -m unittest)
"""

import base64
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from ratelimit import RateLimiter

try:
    from app import create_app
except ImportError:  # Flask-SocketIO not installed
    create_app = None


class FakeClock:
    t = 0.0

    def __call__(self):
        return self.t


class LimiterTests(unittest.TestCase):
    def test_burst_then_block_then_refill(self):
        clock = FakeClock()
        rl = RateLimiter(3, 1, clock)
        self.assertEqual([rl.allow("a") for _ in range(4)], [True, True, True, False])
        clock.t += 1.0
        self.assertTrue(rl.allow("a"))
        self.assertFalse(rl.allow("a"))

    def test_keys_independent_and_refill_capped(self):
        clock = FakeClock()
        rl = RateLimiter(2, 1, clock)
        rl.allow("a"); rl.allow("a")
        self.assertFalse(rl.allow("a"))
        self.assertTrue(rl.allow("b"))
        clock.t += 100
        self.assertEqual([rl.allow("a") for _ in range(3)], [True, True, False])

    def test_forget_resets(self):
        rl = RateLimiter(1, 0.001, FakeClock())
        rl.allow("a")
        self.assertFalse(rl.allow("a"))
        rl.forget("a")
        self.assertTrue(rl.allow("a"))


@unittest.skipIf(create_app is None, "Flask-SocketIO not installed")
class SocketRateLimitTests(unittest.TestCase):
    def setUp(self):
        self.app, self.sio = create_app({"RATE_BURST": 5, "RATE_PER_SEC": 0.001})

    def test_echo_flood_limited_per_connection(self):
        a, b = self.sio.test_client(self.app), self.sio.test_client(self.app)
        res = [a.emit("echo", {"data": "x"}, callback=True) for _ in range(7)]
        self.assertEqual([r["ok"] for r in res], [True] * 5 + [False] * 2)
        self.assertEqual(res[-1]["error"], "rate_limited")
        self.assertTrue(b.emit("echo", {"data": "x"}, callback=True)["ok"])

    def test_message_flood_limited_and_not_relayed(self):
        a, b = self.sio.test_client(self.app), self.sio.test_client(self.app)
        a.emit("join", {"room": "r", "username": "a"}, callback=True)
        b.emit("join", {"room": "r", "username": "b"}, callback=True)
        b.get_received()
        enc = lambda n: base64.b64encode(b"x" * n).decode()
        payload = {"room": "r", "nonce": enc(16), "ciphertext": enc(4), "mac": enc(32)}
        res = [a.emit("encrypted_message", payload, callback=True) for _ in range(5)]
        self.assertEqual(res[-1]["error"], "rate_limited")  # join used 1 of 5
        got = [e for e in b.get_received() if e["name"] == "encrypted_message"]
        self.assertEqual(len(got), 3)


if __name__ == "__main__":
    unittest.main()
