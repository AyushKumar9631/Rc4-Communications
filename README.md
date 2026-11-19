# RC4-Based Secure Text Communication System

An **educational** demonstration of the RC4 stream cipher inside a real-time encrypted web chat.
RC4 is cryptographically obsolete. This project is for learning and demonstration only and does
**not** provide modern security guarantees.

> Status: **Phase 1 of 6 complete** (RC4 core only). The chat, backend and deployment are not built yet.
> See [PLAN.md](PLAN.md) for the live progress tracker.

## Planned architecture

- Browser (vanilla JS) encrypts each message with RC4 before sending.
- Flask + Flask-SocketIO relays only ciphertext between users in the same room.
- The receiver decrypts locally. The shared secret key never leaves the browser.
- Hosted on a Render free web service (Phase 5).

## What exists today (Phase 1)

| File | Purpose |
|---|---|
| `crypto/rc4.py` | Python RC4: `ksa`, `prga`, `keystream`, `encrypt`/`decrypt`, UTF-8, hex, Base64 helpers |
| `static/js/crypto.js` | JavaScript RC4 with the same API and helpers (works in browser and Node) |
| `tests/test_rc4.py` | Known vectors, round trips, invalid input, PyCryptodome comparison, Python-vs-JS comparison |
| `tests/test_rc4.js` | Standalone JavaScript tests |
| `tests/js_cross_check.js` | Helper used by the Python tests to run JS RC4 |

## How RC4 works (short version)

1. **KSA** (Key Scheduling Algorithm): start with the array `S = [0..255]` and shuffle it using the key.
2. **PRGA** (Pseudo-Random Generation Algorithm): keep shuffling `S` and output one byte at a time.
   The output sequence is the **keystream**.
3. **Encrypt**: `ciphertext[i] = plaintext[i] XOR keystream[i]`.
4. **Decrypt**: the same XOR with the same keystream gives the plaintext back.

Using the same key for two messages reuses the same keystream, which leaks information.
That is why later phases derive a fresh key per message from a random nonce.

## Setup on Windows (VS Code terminal, PowerShell)

```powershell
cd rc4-secure-chat
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

If PowerShell blocks activation, run this once and try again:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Node.js is needed only for the JavaScript tests and the Python-vs-JS comparison. Check with `node --version`.

## Run the tests

```powershell
node tests/test_rc4.js
python -m pytest tests -v
```

## Limitations (Phase 1)

- No chat, server, HMAC, HKDF, nonce handling or UI yet. Those come in later phases.
- Plain RC4 (as in this phase) provides no integrity protection and must never reuse a key.
