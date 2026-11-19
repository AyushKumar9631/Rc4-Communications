"""Phase 3: JS protocol (static/js/protocol.js) vs independent Python reference.

The reference uses hashlib PBKDF2, PyCryptodome HKDF + ARC4 and stdlib hmac.
Run from the project root:  python -m pytest tests -v
"""

import base64
import hashlib
import hmac
import json
import os
import shutil
import subprocess
import unittest

from Crypto.Cipher import ARC4
from Crypto.Hash import SHA256
from Crypto.Protocol.KDF import HKDF

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HELPER = os.path.join(ROOT, "tests", "protocol_cross_check.js")
NODE = shutil.which("node")
VERSION = "rc4-chat-v1"
ITER = 1000


def ref_master(secret, room, iterations=ITER):
    return hashlib.pbkdf2_hmac("sha256", secret.encode(), f"{VERSION}|{room}".encode(), iterations, 32)


def ref_keys(master, nonce):
    okm = HKDF(master, 64, nonce, SHA256, context=VERSION.encode())
    return okm[:32], okm[32:]


def ref_encrypt(secret, room, sender, plaintext, nonce):
    enc_key, mac_key = ref_keys(ref_master(secret, room), nonce)
    ct = ARC4.new(enc_key).encrypt(plaintext.encode())
    data = f"{VERSION}\0{room}\0{sender}\0".encode() + nonce + ct
    mac = hmac.new(mac_key, data, hashlib.sha256).digest()
    b64 = lambda b: base64.b64encode(b).decode()
    return {"nonce": b64(nonce), "ciphertext": b64(ct), "mac": b64(mac)}, enc_key, mac_key


def node(req):
    out = subprocess.run([NODE, HELPER], input=json.dumps(req), capture_output=True,
                         text=True, check=True, timeout=60)
    return json.loads(out.stdout)


@unittest.skipUnless(NODE, "node not installed")
class CrossLanguageProtocol(unittest.TestCase):
    CASES = [
        ("correct horse battery", "r1", "alice", "hello", bytes(16)),
        ("pässwörd ✓ long enough", "room_2", "bob-1", "héllo ✓ \U0001F600", bytes(range(16))),
        ("x", "a", "b", "A" * 4096, os.urandom(16)),
        ("secret!!", "R", "U_u", "line1\nline2\ttab", os.urandom(16)),
    ]

    def test_js_encrypt_matches_python_reference(self):
        for secret, room, sender, text, nonce in self.CASES:
            with self.subTest(room=room, n=len(text)):
                wire, enc_key, mac_key = ref_encrypt(secret, room, sender, text, nonce)
                got = node({"op": "encrypt", "secret": secret, "room": room, "sender": sender,
                            "plaintext": text, "nonce": nonce.hex(), "iterations": ITER})
                self.assertEqual(got["master"], ref_master(secret, room).hex())
                self.assertEqual(got["encKey"], enc_key.hex())
                self.assertEqual(got["macKey"], mac_key.hex())
                self.assertEqual(got["wire"], wire)

    def test_js_decrypts_python_message(self):
        for secret, room, sender, text, nonce in self.CASES:
            with self.subTest(room=room, n=len(text)):
                wire, _, _ = ref_encrypt(secret, room, sender, text, nonce)
                got = node({"op": "decrypt", "secret": secret, "room": room, "sender": sender,
                            "wire": wire, "iterations": ITER})
                self.assertEqual(got, {"ok": True, "plaintext": text})

    def test_js_rejects_python_message_with_wrong_context(self):
        secret, room, sender, text, nonce = self.CASES[0]
        wire, _, _ = ref_encrypt(secret, room, sender, text, nonce)
        for kw in ({"sender": "mallory"}, {"room": "r2"}, {"secret": "wrong secret"}):
            with self.subTest(kw=kw):
                req = {"op": "decrypt", "secret": secret, "room": room, "sender": sender,
                       "wire": wire, "iterations": ITER}
                req.update(kw)
                self.assertEqual(node(req)["reason"], "bad_mac")


if __name__ == "__main__":
    unittest.main()
