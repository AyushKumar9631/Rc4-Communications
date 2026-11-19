"""Phase 1 tests: RC4 correctness, PyCryptodome agreement, JS/Python agreement.

Run from the project root:  python -m pytest tests -v
"""

import json
import os
import random
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from Crypto.Cipher import ARC4  # PyCryptodome

from crypto import rc4

NODE = shutil.which("node")


class KnownVectorTests(unittest.TestCase):
    """Published RC4 test vectors."""

    def test_key_plaintext(self):
        ct = rc4.encrypt(b"Key", b"Plaintext")
        self.assertEqual(ct.hex(), "bbf316e8d940af0ad3")

    def test_wiki_pedia(self):
        self.assertEqual(rc4.encrypt(b"Wiki", b"pedia").hex(), "1021bf0420")

    def test_secret_attack_at_dawn(self):
        ct = rc4.encrypt(b"Secret", b"Attack at dawn")
        self.assertEqual(ct.hex(), "45a01f645fc35b383552544b9bf5")

    def test_rfc6229_40bit_key(self):
        ks = rc4.keystream(bytes.fromhex("0102030405"), 16)
        self.assertEqual(ks.hex(), "b2396305f03dc027ccc3524a0a1118a8")

    def test_rfc6229_64bit_key(self):
        ks = rc4.keystream(bytes.fromhex("0102030405060708"), 16)
        self.assertEqual(ks.hex(), "97ab8a1bf0afb96132f2f67258da15a8")


class RoundTripTests(unittest.TestCase):
    def test_bytes_round_trip(self):
        key = b"my-secret-key"
        data = bytes(range(256)) * 4
        self.assertEqual(rc4.decrypt(key, rc4.encrypt(key, data)), data)

    def test_text_round_trip_unicode(self):
        key = b"k3y"
        msg = "Hello नमस्ते 🌍 — café"
        self.assertEqual(rc4.decrypt_text(key, rc4.encrypt_text(key, msg)), msg)

    def test_empty_message(self):
        self.assertEqual(rc4.encrypt(b"k", b""), b"")
        self.assertEqual(rc4.decrypt_text(b"k", rc4.encrypt_text(b"k", "")), "")

    def test_wrong_key_does_not_decrypt(self):
        ct = rc4.encrypt(b"right-key", b"attack at dawn")
        self.assertNotEqual(rc4.decrypt(b"wrong-key", ct), b"attack at dawn")

    def test_encoding_helpers(self):
        data = bytes([0, 1, 15, 16, 255])
        self.assertEqual(rc4.to_hex(data), "00010f10ff")
        self.assertEqual(rc4.from_hex("00010f10ff"), data)
        self.assertEqual(rc4.from_base64(rc4.to_base64(data)), data)


class InvalidInputTests(unittest.TestCase):
    def test_empty_key_rejected(self):
        with self.assertRaises(ValueError):
            rc4.ksa(b"")

    def test_oversized_key_rejected(self):
        with self.assertRaises(ValueError):
            rc4.ksa(b"x" * 257)

    def test_max_key_accepted(self):
        rc4.ksa(b"x" * 256)

    def test_non_bytes_key_rejected(self):
        with self.assertRaises(TypeError):
            rc4.ksa("string-key")

    def test_non_bytes_data_rejected(self):
        with self.assertRaises(TypeError):
            rc4.rc4_crypt(b"k", "text")

    def test_invalid_base64_rejected(self):
        with self.assertRaises(Exception):
            rc4.from_base64("not base64!!")


class PyCryptodomeAgreementTests(unittest.TestCase):
    """Our reference implementation must equal PyCryptodome's ARC4."""

    def test_known_inputs(self):
        for key, pt in [(b"Key", b"Plaintext"), (b"Wiki", b"pedia"), (b"Secret", b"Attack at dawn")]:
            self.assertEqual(rc4.encrypt(key, pt), ARC4.new(key).encrypt(pt))

    def test_random_inputs(self):
        rng = random.Random(1234)  # fixed seed: reproducible, test-only randomness
        for _ in range(300):
            key = rng.randbytes(rng.randint(1, 256))
            data = rng.randbytes(rng.randint(0, 600))
            self.assertEqual(rc4.encrypt(key, data), ARC4.new(key).encrypt(data))

    def test_keystream_matches_pycryptodome(self):
        key = b"keystream-check"
        expected = ARC4.new(key).encrypt(bytes(2000))  # XOR with zeros = keystream
        self.assertEqual(rc4.keystream(key, 2000), expected)


@unittest.skipUnless(NODE, "Node.js not found on PATH: cross-language tests cannot run")
class CrossLanguageTests(unittest.TestCase):
    """JavaScript (crypto.js) and Python must produce identical bytes."""

    def test_js_matches_python_and_pycryptodome(self):
        rng = random.Random(98765)
        cases = []
        for _ in range(200):
            cases.append({
                "key_hex": rng.randbytes(rng.randint(1, 256)).hex(),
                "data_hex": rng.randbytes(rng.randint(0, 2000)).hex(),
            })
        # Include non-ASCII-heavy and boundary lengths explicitly
        cases.append({"key_hex": b"Key".hex(), "data_hex": b"Plaintext".hex()})
        cases.append({"key_hex": ("ab" * 256), "data_hex": ""})
        cases.append({"key_hex": "01", "data_hex": "00" * 100000})

        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "cases.json")
            with open(path, "w") as f:
                json.dump(cases, f)
            proc = subprocess.run(
                [NODE, os.path.join(ROOT, "tests", "js_cross_check.js"), path],
                capture_output=True, text=True, timeout=120,
            )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        results = json.loads(proc.stdout)
        self.assertEqual(len(results), len(cases))

        for case, res in zip(cases, results):
            key = bytes.fromhex(case["key_hex"])
            data = bytes.fromhex(case["data_hex"])
            py_ct = rc4.encrypt(key, data)
            self.assertEqual(res["ct_hex"], py_ct.hex())
            self.assertEqual(res["ct_hex"], ARC4.new(key).encrypt(data).hex())
            self.assertEqual(res["ks_hex"], rc4.keystream(key, len(data)).hex())
            self.assertEqual(res["b64"], rc4.to_base64(py_ct))

    def test_standalone_js_suite(self):
        proc = subprocess.run(
            [NODE, os.path.join(ROOT, "tests", "test_rc4.js")],
            capture_output=True, text=True, timeout=60,
        )
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("JS tests passed", proc.stdout)


if __name__ == "__main__":
    unittest.main()
