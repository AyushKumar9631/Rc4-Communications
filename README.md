# RC4-Based Secure Text Communication System

An **educational** demonstration of the RC4 stream cipher inside a real-time encrypted web chat.
RC4 is cryptographically obsolete. This project is for learning and demonstration only and does
**not** provide modern security guarantees.

> Status: **Phase 5 of 6 complete** (RC4 core, ciphertext relay, encrypted chat UI, benchmarks, security tests, rate limiting).
> Render deployment files are ready; see [DEPLOYMENT.md](DEPLOYMENT.md).
> See [PLAN.md](PLAN.md) for the live progress tracker.

## Planned architecture

- Browser (vanilla JS) encrypts each message with RC4 before sending.
- Flask + Flask-SocketIO relays only ciphertext between users in the same room.
- The receiver decrypts locally. The shared secret key never leaves the browser.
- Hosted on a Render free web service (Phase 5).

## What exists today (Phases 1-3)

| File | Purpose |
|---|---|
| `app.py` | Flask + Flask-SocketIO backend: room membership, validation, ciphertext relay, echo |
| `templates/index.html`, `static/css/style.css`, `static/js/app.js` | Chat UI: join, send, receive, ciphertext inspector |
| `static/js/protocol.js` | PBKDF2 master key, per-message HKDF key, RC4 encrypt-then-HMAC, verify-then-decrypt |
| `static/js/vendor/socket.io.min.js` | Socket.IO client 4.7.5 (MIT), served locally (no CDN) |
| `tests/test_protocol.js`, `tests/test_protocol.py` | Protocol tests; JS vs independent Python/PyCryptodome reference |
| `tests/test_socket.py` | Socket.IO integration tests (join/leave, validation, isolation, relay, RC4 end-to-end) |
| `ratelimit.py` | Token-bucket rate limiter used by `app.py` |
| `static/js/bench.js`, `static/js/bench_ui.js`, `benchmarks/run_bench.js` | Benchmarks, CSV export, UI panel |
| `tests/test_security.js`, `tests/test_bench.js`, `tests/test_ratelimit.py` | Phase 4 tests |
| `gunicorn.conf.py`, `render.yaml`, `DEPLOYMENT.md` | Render deployment (Phase 5) |
| `SECURITY.md` | Threat model, attacks demonstrated, limits |
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
node tests/test_protocol.js
python -m pytest tests -v
```

## Phase 4: benchmarks and security

```powershell
node benchmarks/run_bench.js     # writes results/crypto_benchmark.csv
node tests/test_security.js      # keystream reuse, bit flip, replay, wrong key
node tests/test_bench.js
```

In the browser, open "Performance benchmark" at the bottom of the page, press Run, then Download CSV
(includes echo round-trip time to the server). Rate limit: 30-message burst, 10/s per connection.
See [SECURITY.md](SECURITY.md).

## Run the server (local)

```powershell
python app.py
```

Open http://127.0.0.1:5000 in two browser tabs (use `localhost`/`127.0.0.1`: WebCrypto needs a secure context),
join the same room with different usernames and the **same shared secret**, then chat. Press "Inspect" on a
message to see nonce, keys, keystream, ciphertext, MAC. Join a third tab with a different secret to see
authentication failures. `GET /health` returns `{"status":"ok"}`.
Optional environment variables: `HOST` (default `127.0.0.1`), `PORT` (default `5000`), `SECRET_KEY`.

## Message protocol (Phase 3)

```
master = PBKDF2-HMAC-SHA256(secret, salt="rc4-chat-v1|"+room, 600000 iters)   once per join
keys   = HKDF-SHA256(ikm=master, salt=nonce(16 random bytes), info="rc4-chat-v1", 64 bytes)
         encKey = keys[0:32], macKey = keys[32:64]
ct     = RC4(encKey, utf8(plaintext))
mac    = HMAC-SHA256(macKey, "rc4-chat-v1\0" room "\0" sender "\0" nonce ct)
wire   = {room, nonce, ciphertext, mac}  (Base64)
```

Receiver verifies the MAC (constant time) before running RC4, drops messages whose nonce was already seen
in the session, and never decrypts failures. The secret and keys never leave the browser.

## Socket.IO events

Every client-to-server event returns an acknowledgement: `{"ok": true, ...}` or
`{"ok": false, "error": "<code>", "message": "..."}`.

| Event | Direction | Payload | Notes |
|---|---|---|---|
| `join` | client -> server | `{room, username}` | Room 1-32 and username 1-24 chars of `A-Z a-z 0-9 _ -`. Username unique per room (case-insensitive). One room per connection. Limits: 10 members/room, 100 rooms |
| `leave` | client -> server | `{}` | Leaves the current room |
| `encrypted_message` | client -> server | `{room, nonce, ciphertext, mac}` | Sender must be a member of `room`. Canonical Base64; `nonce` exactly 16 bytes, `ciphertext` 1-4096 bytes, `mac` exactly 32 bytes |
| `encrypted_message` | server -> room (except sender) | `{id, room, sender, nonce, ciphertext, mac, ts}` | `id`, `sender`, `ts` are set by the server; client-supplied extras are dropped |
| `echo` | client -> server | `{data}` | Connectivity test; `data` is a string up to 1024 chars; returned in the ack |
| `user_joined` / `user_left` | server -> room | `{username, members}` | Sent on join, leave and disconnect |

Error codes: `bad_payload`, `invalid_room`, `invalid_username`, `already_in_room`, `username_taken`,
`room_full`, `room_limit`, `not_in_room`, `invalid_nonce`, `invalid_ciphertext`, `invalid_mac`, `ciphertext_too_large`.

## Limitations (Phase 3)

- RC4 is obsolete; the HMAC and per-message keys fix integrity and keystream reuse, not RC4's own biases.
- A weak shared secret can be brute-forced offline from captured traffic (PBKDF2 only slows it down).
- No key exchange: users share the secret out of band. No forward secrecy. Replay protection is per
  browser session only (a rejoin resets the seen-nonce set). The server can drop or reorder messages.
- Usernames are not authenticated beyond being bound into the MAC; anyone with the secret can join as any free name.
- Room state is in memory (lost on restart); rate limiting is per connection, not per IP.
- `python app.py` uses the Werkzeug dev server; production uses Gunicorn (see DEPLOYMENT.md).
