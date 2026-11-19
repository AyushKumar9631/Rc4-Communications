# PLAN.md — Single Source of Truth

## Project Overview
- **Project title:** RC4-Based Secure Text Communication System
- **Objective:** Minimal real-time encrypted web chat that demonstrates RC4 (client-side encryption, ciphertext-only relay), with performance measurement and security demonstrations. Educational only; RC4 is obsolete.
- **Technology stack:** HTML5/CSS3/vanilla JS; Python 3, Flask, Flask-SocketIO, Gunicorn; manual RC4 (JS + Python), PyCryptodome for verification, HKDF-SHA256 + HMAC-SHA256 (later phases)
- **Target hosting platform:** Render free web service (via GitHub)

## Current Status
- **Current phase:** Phase 3 complete, awaiting approval for Phase 4
- **Last completed phase:** 3
- **Overall progress:** 3 / 6 phases
- **Last updated:** 2026-11-19 17:15 UTC (22:45 IST)
- **Current blockers:** None

## Phase Tracker

| Phase | Description | Status | Tests | Notes |
|---|---|---|---|---|
| 1 | RC4 implementation | Completed | 21 pytest + 11 JS passed | Run in Linux sandbox, not yet on your Windows machine |
| 2 | Backend | Completed | 28 pytest (socket + HTTP) passed; live WebSocket smoke test passed | Run in Linux sandbox, not yet on your Windows machine |
| 3 | Encrypted chat UI | Completed | 54 pytest + 11 + 12 JS passed; real-browser (Chromium) 3-tab check passed | Run in Linux sandbox, not yet on your Windows machine |
| 4 | Performance/security | Pending | Not run | |
| 5 | Render deployment | Pending | Not run | |
| 6 | Final testing | Pending | Not run | |

## Completed Tasks
- [x] Project directory structure created
- [x] `requirements.txt` created (pycryptodome, pytest)
- [x] Python RC4 (KSA, PRGA, encrypt/decrypt, UTF-8, hex, Base64) in `crypto/rc4.py`
- [x] JavaScript RC4 with same features in `static/js/crypto.js`
- [x] Known test vectors (3 classic + 2 RFC 6229) pass in both languages
- [x] Python verified against PyCryptodome ARC4 (300 random cases + keystream)
- [x] JS vs Python vs PyCryptodome verified identical (203 cases incl. 100 KB input)
- [x] README.md and PLAN.md created
- [x] Phase 1 re-verified before starting Phase 2 (11 JS + 21 pytest passed)
- [x] `app.py`: Flask app factory + Flask-SocketIO (threading mode), `/` and `/health` routes
- [x] Events: `join`, `leave`, `disconnect`, `encrypted_message`, `echo`, `user_joined`, `user_left`, all with ack responses
- [x] Server-side room membership checks (server state, not client claims); sender/id/ts set by server, extra fields dropped
- [x] Validation: room/username regex, unique username per room (case-insensitive), one room per connection, room/member limits, canonical Base64 ciphertext, size limits (4096 bytes, echo 1024 chars), engine buffer limit
- [x] Socket.IO rooms namespaced (`room:<name>`) so clients cannot join other clients' private sid rooms
- [x] `templates/index.html`: basic connectivity page (join, leave, echo, raw relay, event log via `textContent`)
- [x] `tests/test_socket.py`: 28 tests incl. isolation, spoofing, disconnect cleanup, end-to-end with Phase 1 RC4
- [x] `requirements.txt` updated (Flask, Flask-SocketIO, simple-websocket); clean install verified in a fresh venv

- [x] `static/js/protocol.js`: PBKDF2 master key, per-message random 16-byte nonce, HKDF-SHA256 (64 bytes -> RC4 key + MAC key), RC4, HMAC-SHA256 encrypt-then-MAC bound to room + sender + nonce; MAC verified before decrypt
- [x] Chat UI (`templates/index.html`, `static/css/style.css`, `static/js/app.js`): join with shared secret, send/receive, members, system notices, replay drop, failure display, ciphertext inspector, "corrupt my ciphertext" demo toggle, light/dark theme; all DOM output via `textContent`
- [x] Socket.IO client vendored locally (`static/js/vendor/`, v4.7.5, MIT); no CDN
- [x] `app.py`: `encrypted_message` now requires/validates `nonce` (16 B) and `mac` (32 B) and relays them
- [x] Tests: `tests/test_protocol.js` (12), `tests/test_protocol.py` (JS vs Python/PyCryptodome HKDF/ARC4/HMAC reference), `tests/test_socket.py` updated (+nonce/mac validation, local-assets check)

## Pending Tasks
- [ ] Phase 4: Benchmarks, RTT, CSV export, security tests, SECURITY.md
- [ ] Phase 5: Render deployment files and DEPLOYMENT.md
- [ ] Phase 6: Final testing, DEMO_GUIDE.md, VIVA_QA.md, FINAL_CHECKLIST.md

## File Inventory

| File | Purpose |
|---|---|
| `app.py` | Flask + Flask-SocketIO backend (`create_app()`, module-level `app`/`socketio` for Gunicorn later) |
| `templates/index.html` | Chat UI page (Phase 3) |
| `static/css/style.css` | UI styles |
| `static/js/app.js` | UI logic: socket events, send/receive, inspector |
| `static/js/protocol.js` | HKDF/HMAC/RC4 message protocol (browser + Node) |
| `static/js/vendor/socket.io.min.js`, `socket.io-client.LICENSE` | Vendored Socket.IO client 4.7.5 (MIT) |
| `tests/test_protocol.js` | Standalone JS protocol tests |
| `tests/test_protocol.py` | Python reference cross-check of the protocol |
| `tests/protocol_cross_check.js` | Node helper for `test_protocol.py` |
| `tests/test_socket.py` | Phase 2 tests: HTTP, join/leave, validation, isolation, relay, echo, RC4 end-to-end |
| `crypto/__init__.py` | Package marker |
| `crypto/rc4.py` | Python RC4 reference implementation and helpers |
| `static/js/crypto.js` | JavaScript RC4 and helpers (browser + Node) |
| `tests/test_rc4.py` | Python tests: vectors, round trips, invalid inputs, PyCryptodome, cross-language |
| `tests/test_rc4.js` | Standalone JS tests |
| `tests/js_cross_check.js` | Node helper used by the cross-language Python test |
| `requirements.txt` | Pinned Python dependencies (RC4 tests + Flask stack) |
| `.gitignore` | Git ignore rules |
| `results/.gitkeep` | Keeps benchmark output folder in git |
| `README.md` | Overview, setup, test commands |
| `PLAN.md` | This file |

## Test Results

| Test | Command | Actual result | Status | Notes |
|---|---|---|---|---|
| JS suite | `node tests/test_rc4.js` | 11 JS tests passed | Pass | Node v22.23.5 |
| Python suite (Phase 1-3) | `python -m pytest tests -v` | 54 passed (71 subtests) in 1.28s | Pass | Python 3.12.3, pytest 9.2.0 (also fresh venv from `requirements.txt`), Flask 3.1.3, Flask-SocketIO 5.7.2 |
| JS protocol suite | `node tests/test_protocol.js` | 12 protocol tests passed | Pass | Node v22.23.5 |
| Protocol cross-language | included in pytest (`tests/test_protocol.py`) | JS matches Python reference: master, enc/mac keys, wire; JS decrypts Python messages; wrong room/sender/secret rejected | Pass | |
| Real browser (Playwright Chromium) | ad-hoc script, not shipped | alice/bob (same secret) exchange message; eve (wrong secret) gets auth failure; corrupt toggle rejected by receiver; `<img onerror>` text rendered inert; inspector populated; leave updates members; 0 console errors | Pass | Sandbox only; replay drop not exercised in browser |
| Socket tests | included above (`tests/test_socket.py`) | 30 passed | Pass | Uses Flask-SocketIO test client (no real network) |
| Live WebSocket smoke | ad-hoc script, not shipped | 2 clients over real `websocket` transport: join, relay, RC4 decrypt on receiver, echo, 4096-byte max accepted, 4097 rejected, 200 KB frame dropped without ack, server stayed up | Pass | Sandbox only |
| HTML page | `node --check` on inline script | Syntax OK | Pass | Not opened in a real browser here |
| Known vectors | included above | 3 classic + 2 RFC 6229 keystream, both languages | Pass | |
| PyCryptodome agreement | included above | 300 random + known inputs match | Pass | |
| JS vs Python | included above | 203 cases match (ciphertext, keystream, Base64) | Pass | Includes 100,000-byte input and 256-byte key |
| On user's Windows machine | not run | | Unverified | See Manual Actions |
| UI on your browsers | not run | | Unverified | See Manual Actions |

## Manual Actions Required

| # | Action | Why | Commands | Verify | Done |
|---|---|---|---|---|---|
| 1 | Set up venv, reinstall requirements and run tests locally | Confirm everything works on your machine | README "Setup on Windows" and "Run the tests" | `node tests/test_rc4.js` -> 11 passed; `node tests/test_protocol.js` -> 12 passed; `python -m pytest tests -v` -> 54 passed | No |
| 2 | Install Node.js if `node --version` fails | Needed for JS tests and cross-language tests | https://nodejs.org (LTS) | `node --version` | No |
| 3 | Run the server, open two tabs (same secret) and a third (different secret) | Confirm real browser behavior | `python app.py`, open http://127.0.0.1:5000 | Same-secret tab shows message "authenticated"; other-secret tab shows red failure; Inspect panel fills | No |

## Deployment Status
- **Local:** Server runs in sandbox (`python app.py`); not tested on user's machine
- **Render:** Not configured
- **Public URL:** None
- **Outstanding deployment issues:** None yet (Phase 5)

## Known Issues and Limitations
- Shared secret is user-chosen (min 8 chars); weak secrets are brute-forceable offline. No key exchange, no forward secrecy. Replay protection is per-session only. WebCrypto requires HTTPS or localhost (Render is HTTPS).
- Inspector shows the per-message RC4 key for teaching; remove if reused beyond the demo.
- UI tested in Chromium only (sandbox), not Firefox/Safari.
- Room state is in memory (lost on restart); no rate limiting yet (consider in Phase 4).
- `python app.py` uses the Werkzeug dev server with `allow_unsafe_werkzeug=True`; it can print harmless "Bad request syntax" lines when a WebSocket closes. Gunicorn replaces it in Phase 5.
- Frames larger than the engine buffer (about 7.5 KB with default limits) are dropped by Socket.IO before our handler runs, so the sender gets no ack.
- Tests use the Flask-SocketIO test client; real transport was only smoke-tested ad hoc in the sandbox.
- `requirements.txt` pins versions installed in the sandbox (pycryptodome 4.5.0, pytest 9.1.1); if `pip install` cannot find them on your machine, tell me and I will adjust.
- If Node.js is missing, the two cross-language tests are skipped by pytest (reported as skipped, not passed).
- Package is named `crypto/` per the spec; PyCryptodome's package is `Crypto/` (capital C). Python import is case-sensitive, so they do not clash.

## Change Log

### Phase 3
- **Created:** `static/js/protocol.js`, `static/js/app.js`, `static/css/style.css`, `static/js/vendor/socket.io.min.js`, `static/js/vendor/socket.io-client.LICENSE`, `tests/test_protocol.js`, `tests/test_protocol.py`, `tests/protocol_cross_check.js`
- **Modified:** `app.py` (nonce/mac validation + relay, generic Base64 field check), `templates/index.html` (replaced by chat UI), `tests/test_socket.py`, `README.md`, `PLAN.md`
- **Deleted:** none (Phase 2 test page replaced in place)
- **Features:** see Completed Tasks
- **Tests performed:** see Test Results

### Phase 2
- **Created:** `app.py`, `templates/index.html`, `tests/test_socket.py`
- **Modified:** `requirements.txt` (added Flask, Flask-SocketIO, simple-websocket), `README.md` (status, run instructions, event table, limitations), `PLAN.md`
- **Deleted:** none
- **Features:** see Completed Tasks; Phase 1 files untouched
- **Tests performed:** see Test Results

### Phase 1
- **Created:** `crypto/__init__.py`, `crypto/rc4.py`, `static/js/crypto.js`, `tests/test_rc4.py`, `tests/test_rc4.js`, `tests/js_cross_check.js`, `requirements.txt`, `.gitignore`, `results/.gitkeep`, `README.md`, `PLAN.md`
- **Modified:** none
- **Deleted:** none
- **Features:** RC4 KSA/PRGA/XOR in Python and JS; UTF-8, hex, Base64 helpers; key length validation (1–256 bytes)
- **Tests performed:** see Test Results

## Next Phase
- **Phase 4:** Performance and security
- **Objectives:** Benchmarks (encrypt/decrypt time vs size, RTT), CSV export to `results/`, security demonstrations/tests (keystream reuse, bit-flip without MAC, replay, wrong key), rate limiting, `SECURITY.md`
- **Dependencies:** Phase 3 approved
- **Expected deliverables:** benchmark scripts/UI, `results/*.csv`, security tests, `SECURITY.md`, updated `PLAN.md`
