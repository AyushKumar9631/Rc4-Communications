# RC4-Based Secure Text Communication System

An **educational** demonstration of the RC4 stream cipher inside a real-time encrypted web chat.
RC4 is cryptographically obsolete. This project is for learning and demonstration only and does
**not** provide modern security guarantees.

> Status: **Phase 2 of 6 complete** (RC4 core + Flask/Socket.IO ciphertext relay). The encrypted chat UI,
> performance/security work and deployment are not built yet.
> See [PLAN.md](PLAN.md) for the live progress tracker.

## Planned architecture

- Browser (vanilla JS) encrypts each message with RC4 before sending.
- Flask + Flask-SocketIO relays only ciphertext between users in the same room.
- The receiver decrypts locally. The shared secret key never leaves the browser.
- Hosted on a Render free web service (Phase 5).

## What exists today (Phases 1-2)

| File | Purpose |
|---|---|
| `app.py` | Flask + Flask-SocketIO backend: room membership, validation, ciphertext relay, echo |
| `templates/index.html` | Basic Phase 2 page to check connectivity (join, echo, raw relay). Replaced by the real UI in Phase 3 |
| `tests/test_socket.py` | Socket.IO integration tests (join/leave, validation, isolation, relay, RC4 end-to-end) |
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

## Run the server (local)

```powershell
python app.py
```

Open http://127.0.0.1:5000 in two browser tabs, join the same room with different usernames,
then use "Send to room" in one tab and watch the log in the other. `GET /health` returns `{"status":"ok"}`.
Optional environment variables: `HOST` (default `127.0.0.1`), `PORT` (default `5000`), `SECRET_KEY`.

## Socket.IO events (Phase 2)

Every client-to-server event returns an acknowledgement: `{"ok": true, ...}` or
`{"ok": false, "error": "<code>", "message": "..."}`.

| Event | Direction | Payload | Notes |
|---|---|---|---|
| `join` | client -> server | `{room, username}` | Room 1-32 and username 1-24 chars of `A-Z a-z 0-9 _ -`. Username unique per room (case-insensitive). One room per connection. Limits: 10 members/room, 100 rooms |
| `leave` | client -> server | `{}` | Leaves the current room |
| `encrypted_message` | client -> server | `{room, ciphertext}` | Sender must be a member of `room`. `ciphertext` is canonical Base64, 1-4096 bytes decoded |
| `encrypted_message` | server -> room (except sender) | `{id, room, sender, ciphertext, ts}` | `id`, `sender`, `ts` are set by the server; client-supplied extras are dropped |
| `echo` | client -> server | `{data}` | Connectivity test; `data` is a string up to 1024 chars; returned in the ack |
| `user_joined` / `user_left` | server -> room | `{username, members}` | Sent on join, leave and disconnect |

Error codes: `bad_payload`, `invalid_room`, `invalid_username`, `already_in_room`, `username_taken`,
`room_full`, `room_limit`, `not_in_room`, `invalid_ciphertext`, `ciphertext_too_large`.

## Limitations (Phase 2)

- The server relays opaque Base64 and never sees keys or plaintext, but nothing encrypts yet: the UI and
  HKDF/nonce/HMAC come in Phase 3. The Phase 2 page sends raw Base64 only to test the relay.
- Room state is in memory (lost on restart) and there is no rate limiting yet.
- `python app.py` uses the Werkzeug dev server (fine locally; it may print harmless "Bad request syntax"
  lines when a WebSocket closes). Production uses Gunicorn in Phase 5.
- Plain RC4 provides no integrity protection and must never reuse a key.
