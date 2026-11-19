"""Reference RC4 implementation (educational use only).

RC4 is a stream cipher designed by Ron Rivest (1987). It is cryptographically
obsolete (see SECURITY.md in a later phase). This module exists to teach how the
algorithm works and to act as a reference that the JavaScript implementation in
``static/js/crypto.js`` is checked against.

How RC4 works
-------------
1. KSA (Key Scheduling Algorithm): shuffle a 256-byte array S using the key.
2. PRGA (Pseudo-Random Generation Algorithm): keep shuffling S and emit one
   pseudo-random byte at a time. This byte sequence is called the KEYSTREAM.
3. Encryption:  ciphertext[i] = plaintext[i] XOR keystream[i]
4. Decryption:  plaintext[i]  = ciphertext[i] XOR keystream[i]
   (XOR is its own inverse, so encryption and decryption are the same function.)
"""

import base64
import binascii

MIN_KEY_BYTES = 1
MAX_KEY_BYTES = 256  # RC4 key length limit (key is cycled over 256 state bytes)


def _check_key(key: bytes) -> None:
    if not isinstance(key, (bytes, bytearray)):
        raise TypeError("RC4 key must be bytes")
    if not (MIN_KEY_BYTES <= len(key) <= MAX_KEY_BYTES):
        raise ValueError(
            f"RC4 key must be {MIN_KEY_BYTES}-{MAX_KEY_BYTES} bytes, got {len(key)}"
        )


def ksa(key: bytes) -> list:
    """Key Scheduling Algorithm: return the initial permutation S of 0..255."""
    _check_key(key)
    s = list(range(256))
    j = 0
    for i in range(256):
        j = (j + s[i] + key[i % len(key)]) % 256
        s[i], s[j] = s[j], s[i]
    return s


def prga(s: list):
    """Pseudo-Random Generation Algorithm: yield keystream bytes forever.

    Mutates ``s`` (the state produced by :func:`ksa`).
    """
    i = 0
    j = 0
    while True:
        i = (i + 1) % 256
        j = (j + s[i]) % 256
        s[i], s[j] = s[j], s[i]
        yield s[(s[i] + s[j]) % 256]


def keystream(key: bytes, length: int) -> bytes:
    """Return the first ``length`` keystream bytes for ``key``."""
    if length < 0:
        raise ValueError("length must be non-negative")
    gen = prga(ksa(key))
    return bytes(next(gen) for _ in range(length))


def rc4_crypt(key: bytes, data: bytes) -> bytes:
    """XOR ``data`` with the RC4 keystream. Encrypts and decrypts alike."""
    if not isinstance(data, (bytes, bytearray)):
        raise TypeError("data must be bytes")
    gen = prga(ksa(key))
    return bytes(b ^ next(gen) for b in data)


def encrypt(key: bytes, plaintext: bytes) -> bytes:
    """RC4 encrypt bytes."""
    return rc4_crypt(key, plaintext)


def decrypt(key: bytes, ciphertext: bytes) -> bytes:
    """RC4 decrypt bytes (identical operation to encrypt)."""
    return rc4_crypt(key, ciphertext)


# ---------------------------------------------------------------------------
# Encoding helpers (mirror the helpers in static/js/crypto.js)
# ---------------------------------------------------------------------------

def utf8_encode(text: str) -> bytes:
    return text.encode("utf-8")


def utf8_decode(data: bytes) -> str:
    return data.decode("utf-8")


def to_hex(data: bytes) -> str:
    return binascii.hexlify(data).decode("ascii")


def from_hex(text: str) -> bytes:
    return binascii.unhexlify(text)


def to_base64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def from_base64(text: str) -> bytes:
    return base64.b64decode(text, validate=True)


def encrypt_text(key: bytes, text: str) -> str:
    """UTF-8 encode, RC4 encrypt, Base64 encode (the network-ready form)."""
    return to_base64(encrypt(key, utf8_encode(text)))


def decrypt_text(key: bytes, b64_ciphertext: str) -> str:
    """Base64 decode, RC4 decrypt, UTF-8 decode."""
    return utf8_decode(decrypt(key, from_base64(b64_ciphertext)))
