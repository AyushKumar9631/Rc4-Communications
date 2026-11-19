"""Phase 2/3 tests: HTTP routes, Socket.IO events, validation, room isolation.

Run from the project root:  python -m pytest tests -v
"""

import base64
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from app import create_app
from crypto import rc4

SMALL = {"MAX_ROOM_MEMBERS": 3, "MAX_ROOMS": 3, "MAX_CIPHERTEXT_BYTES": 64, "MAX_ECHO_CHARS": 16}


def b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


NONCE = b64(b"n" * 16)
MAC = b64(b"m" * 32)


class Base(unittest.TestCase):
    def setUp(self):
        self.app, self.sio = create_app(SMALL)
        self.state = self.app.extensions["chat_state"]
        self._clients = []

    def tearDown(self):
        for c in self._clients:
            if c.is_connected():
                c.disconnect()

    def client(self):
        c = self.sio.test_client(self.app)
        self._clients.append(c)
        return c

    def join(self, c, room="r1", name="alice"):
        res = c.emit("join", {"room": room, "username": name}, callback=True)
        c.get_received()
        return res

    @staticmethod
    def events(c, name=None):
        got = c.get_received()
        return [e for e in got if name is None or e["name"] == name]


class HttpTests(Base):
    def test_index_served(self):
        r = self.app.test_client().get("/")
        self.assertEqual(r.status_code, 200)
        self.assertIn(b"RC4", r.data)

    def test_health(self):
        r = self.app.test_client().get("/health")
        self.assertEqual(r.get_json(), {"status": "ok"})

    def test_static_crypto_js_served(self):
        r = self.app.test_client().get("/static/js/crypto.js")
        self.assertEqual(r.status_code, 200)
        r.close()


class JoinLeaveTests(Base):
    def test_join_ok(self):
        res = self.join(self.client())
        self.assertEqual(res, {"ok": True, "room": "r1", "username": "alice", "members": ["alice"]})

    def test_join_notifies_others_not_self(self):
        a, b = self.client(), self.client()
        self.join(a, name="alice")
        self.join(b, name="bob")
        ev = self.events(a, "user_joined")
        self.assertEqual(len(ev), 1)
        self.assertEqual(ev[0]["args"][0], {"username": "bob", "members": ["alice", "bob"]})
        self.assertEqual(self.events(b, "user_joined"), [])

    def test_invalid_join_payloads(self):
        cases = [
            (None, "bad_payload"),
            ("room", "bad_payload"),
            ([], "bad_payload"),
            ({}, "invalid_room"),
            ({"room": 5, "username": "a"}, "invalid_room"),
            ({"room": "", "username": "a"}, "invalid_room"),
            ({"room": "x" * 33, "username": "a"}, "invalid_room"),
            ({"room": "bad room", "username": "a"}, "invalid_room"),
            ({"room": "ok\n", "username": "a"}, "invalid_room"),
            ({"room": "<b>", "username": "a"}, "invalid_room"),
            ({"room": "ok"}, "invalid_username"),
            ({"room": "ok", "username": ""}, "invalid_username"),
            ({"room": "ok", "username": "y" * 25}, "invalid_username"),
            ({"room": "ok", "username": "a b"}, "invalid_username"),
            ({"room": "ok", "username": "<script>"}, "invalid_username"),
            ({"room": "ok", "username": ["a"]}, "invalid_username"),
        ]
        for payload, code in cases:
            with self.subTest(payload=payload):
                c = self.client()
                res = c.emit("join", payload, callback=True)
                self.assertFalse(res["ok"])
                self.assertEqual(res["error"], code)
        self.assertEqual(self.state.rooms, {})

    def test_boundary_lengths_accepted(self):
        res = self.join(self.client(), room="r" * 32, name="u" * 24)
        self.assertTrue(res["ok"])

    def test_username_taken_case_insensitive(self):
        self.join(self.client(), name="Alice")
        res = self.join(self.client(), name="aLiCe")
        self.assertEqual(res["error"], "username_taken")

    def test_same_username_other_room_ok(self):
        self.join(self.client(), room="r1", name="alice")
        self.assertTrue(self.join(self.client(), room="r2", name="alice")["ok"])

    def test_already_in_room(self):
        c = self.client()
        self.join(c, room="r1")
        self.assertEqual(self.join(c, room="r2", name="alice")["error"], "already_in_room")
        self.assertEqual(self.join(c, room="r1")["error"], "already_in_room")

    def test_room_full(self):
        for n in ("a", "b", "c"):
            self.assertTrue(self.join(self.client(), name=n)["ok"])
        self.assertEqual(self.join(self.client(), name="d")["error"], "room_full")

    def test_room_limit(self):
        for r in ("r1", "r2", "r3"):
            self.assertTrue(self.join(self.client(), room=r)["ok"])
        res = self.join(self.client(), room="r4")
        self.assertEqual(res["error"], "room_limit")
        self.assertNotIn("r4", self.state.rooms)

    def test_leave(self):
        a, b = self.client(), self.client()
        self.join(a, name="alice")
        self.join(b, name="bob")
        self.events(a)
        res = b.emit("leave", {}, callback=True)
        self.assertEqual(res, {"ok": True, "room": "r1"})
        ev = self.events(a, "user_left")
        self.assertEqual(ev[0]["args"][0], {"username": "bob", "members": ["alice"]})
        self.assertTrue(self.join(b, name="bob")["ok"])  # can rejoin

    def test_leave_without_join(self):
        res = self.client().emit("leave", {}, callback=True)
        self.assertEqual(res["error"], "not_in_room")

    def test_leave_stops_delivery_and_sending(self):
        a, b = self.client(), self.client()
        self.join(a, name="alice")
        self.join(b, name="bob")
        b.emit("leave", {}, callback=True)
        b.get_received()
        a.emit("encrypted_message", {"room": "r1", "ciphertext": b64(b"x")}, callback=True)
        self.assertEqual(self.events(b, "encrypted_message"), [])
        res = b.emit("encrypted_message", {"room": "r1", "ciphertext": b64(b"x")}, callback=True)
        self.assertEqual(res["error"], "not_in_room")

    def test_disconnect_notifies_and_cleans_up(self):
        a, b = self.client(), self.client()
        self.join(a, name="alice")
        self.join(b, name="bob")
        self.events(a)
        b.disconnect()
        ev = self.events(a, "user_left")
        self.assertEqual(ev[0]["args"][0], {"username": "bob", "members": ["alice"]})
        a.disconnect()
        self.assertEqual(self.state.rooms, {})
        self.assertEqual(self.state.sid_room, {})

    def test_disconnect_without_join_is_safe(self):
        c = self.client()
        c.disconnect()
        self.assertEqual(self.state.rooms, {})


class MessageTests(Base):
    def setUp(self):
        super().setUp()
        self.a, self.b, self.c = self.client(), self.client(), self.client()
        self.join(self.a, name="alice")
        self.join(self.b, name="bob")
        self.join(self.c, room="other", name="carol")
        for cl in (self.a, self.b, self.c):
            cl.get_received()

    def send(self, client, **kw):
        payload = {"room": "r1", "nonce": NONCE, "mac": MAC}
        payload.update(kw)
        return client.emit("encrypted_message", payload, callback=True)

    def test_relay_to_room_only_and_not_sender(self):
        ct = b64(b"\x01\x02\x03")
        res = self.send(self.a, ciphertext=ct)
        self.assertTrue(res["ok"])
        got = self.events(self.b, "encrypted_message")
        self.assertEqual(len(got), 1)
        msg = got[0]["args"][0]
        self.assertEqual(set(msg), {"id", "room", "sender", "nonce", "ciphertext", "mac", "ts"})
        self.assertEqual((msg["nonce"], msg["ciphertext"], msg["mac"]), (NONCE, ct, MAC))
        self.assertEqual(msg["sender"], "alice")
        self.assertEqual(msg["room"], "r1")
        self.assertEqual(msg["id"], res["id"])
        self.assertIsInstance(msg["ts"], int)
        self.assertEqual(self.events(self.a, "encrypted_message"), [])
        self.assertEqual(self.events(self.c, "encrypted_message"), [])

    def test_client_cannot_spoof_sender_or_inject_fields(self):
        self.send(self.a, ciphertext=b64(b"x"), sender="bob", id="forged", ts=1, extra="x")
        msg = self.events(self.b, "encrypted_message")[0]["args"][0]
        self.assertEqual(msg["sender"], "alice")
        self.assertNotEqual(msg["id"], "forged")
        self.assertNotEqual(msg["ts"], 1)
        self.assertNotIn("extra", msg)

    def test_unique_ids(self):
        ids = {self.send(self.a, ciphertext=b64(b"x"))["id"] for _ in range(20)}
        self.assertEqual(len(ids), 20)

    def test_not_member(self):
        outsider = self.client()
        res = self.send(outsider, ciphertext=b64(b"x"))
        self.assertEqual(res["error"], "not_in_room")
        self.assertEqual(self.events(self.a, "encrypted_message"), [])

    def test_wrong_or_missing_room(self):
        for room in ("other", "nope", None, 5):
            with self.subTest(room=room):
                res = self.a.emit("encrypted_message",
                                  {"room": room, "nonce": NONCE, "ciphertext": b64(b"x"), "mac": MAC},
                                  callback=True)
                self.assertEqual(res["error"], "not_in_room")
        res = self.a.emit("encrypted_message",
                          {"nonce": NONCE, "ciphertext": b64(b"x"), "mac": MAC}, callback=True)
        self.assertEqual(res["error"], "not_in_room")
        self.assertEqual(self.events(self.c, "encrypted_message"), [])

    def test_bad_payload_type(self):
        for payload in (None, "text", 5, [1]):
            with self.subTest(payload=payload):
                res = self.a.emit("encrypted_message", payload, callback=True)
                self.assertEqual(res["error"], "bad_payload")

    def test_invalid_ciphertext(self):
        cases = [
            None, 5, ["a"], {"a": 1}, "", "!!!!", "aGVsbG8", "aGVs bG8=", "aGVsbG8=\n",
            "QR==",  # non-canonical padding bits
            "é" * 4,
        ]
        for ct in cases:
            with self.subTest(ct=ct):
                res = self.send(self.a, ciphertext=ct)
                self.assertFalse(res["ok"])
                self.assertEqual(res["error"], "invalid_ciphertext")
        res = self.a.emit("encrypted_message", {"room": "r1", "nonce": NONCE, "mac": MAC},
                          callback=True)
        self.assertEqual(res["error"], "invalid_ciphertext")
        self.assertEqual(self.events(self.b, "encrypted_message"), [])

    def test_invalid_nonce_and_mac(self):
        bad = [None, 5, "", "!!!!", b64(b"n" * 15), b64(b"n" * 17), b64(b"m" * 31),
               b64(b"m" * 33), "A" * 100000, "QR=="]
        for field in ("nonce", "mac"):
            for value in bad:
                with self.subTest(field=field, value=str(value)[:12]):
                    res = self.send(self.a, ciphertext=b64(b"x"), **{field: value})
                    self.assertEqual(res["error"], "invalid_" + field)
            payload = {"room": "r1", "nonce": NONCE, "mac": MAC, "ciphertext": b64(b"x")}
            del payload[field]
            res = self.a.emit("encrypted_message", payload, callback=True)
            self.assertEqual(res["error"], "invalid_" + field)
        self.assertEqual(self.events(self.b, "encrypted_message"), [])

    def test_size_limits(self):
        self.assertTrue(self.send(self.a, ciphertext=b64(b"x" * 64))["ok"])
        res = self.send(self.a, ciphertext=b64(b"x" * 65))
        self.assertEqual(res["error"], "ciphertext_too_large")
        res = self.send(self.a, ciphertext="A" * 100000)
        self.assertEqual(res["error"], "ciphertext_too_large")
        self.assertEqual(len(self.events(self.b, "encrypted_message")), 1)

    def test_echo(self):
        outsider = self.client()  # echo works without joining
        res = outsider.emit("echo", {"data": "hi"}, callback=True)
        self.assertTrue(res["ok"])
        self.assertEqual(res["data"], "hi")
        self.assertEqual(self.events(self.a), [])

    def test_echo_invalid(self):
        for payload in (None, "hi", {}, {"data": 5}, {"data": "x" * 17}):
            with self.subTest(payload=payload):
                res = self.a.emit("echo", payload, callback=True)
                self.assertEqual(res["error"], "bad_payload")
        self.assertTrue(self.a.emit("echo", {"data": "x" * 16}, callback=True)["ok"])

    def test_end_to_end_with_phase1_rc4(self):
        key = b"shared-secret"
        plaintext = "Attack at dawn \u2713"
        ct = rc4.encrypt_text(key, plaintext)
        self.assertTrue(self.send(self.a, ciphertext=ct)["ok"])
        msg = self.events(self.b, "encrypted_message")[0]["args"][0]
        self.assertNotIn("Attack", repr(msg))
        self.assertEqual(rc4.decrypt_text(key, msg["ciphertext"]), plaintext)

    def test_index_references_local_assets_only(self):
        html = self.app.test_client().get("/").get_data(as_text=True)
        self.assertNotIn("cdnjs", html)
        for path in ("/static/js/vendor/socket.io.min.js", "/static/js/crypto.js",
                     "/static/js/protocol.js", "/static/js/app.js", "/static/css/style.css"):
            r = self.app.test_client().get(path)
            self.assertEqual(r.status_code, 200, path)
            r.close()
            self.assertIn(path, html)


if __name__ == "__main__":
    unittest.main()
