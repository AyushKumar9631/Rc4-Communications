# PLAN.md — Single Source of Truth

## Project Overview
- **Project title:** RC4-Based Secure Text Communication System
- **Objective:** Minimal real-time encrypted web chat that demonstrates RC4 (client-side encryption, ciphertext-only relay), with performance measurement and security demonstrations. Educational only; RC4 is obsolete.
- **Technology stack:** HTML5/CSS3/vanilla JS; Python 3, Flask, Flask-SocketIO, Gunicorn; manual RC4 (JS + Python), PyCryptodome for verification, HKDF-SHA256 + HMAC-SHA256 (later phases)
- **Target hosting platform:** Render free web service (via GitHub)

## Current Status
- **Current phase:** All 6 phases complete
- **Last completed phase:** 6
- **Overall progress:** 6 / 6 phases
- **Last updated:** 2026-11-20
- **Current blockers:** None

## Phase Tracker

| Phase | Description | Status | Tests | Notes |
|---|---|---|---|---|
| 1 | RC4 implementation | Completed | 21 pytest + 11 JS passed | Run in Linux sandbox, not yet on your Windows machine |
| 2 | Backend | Completed | 28 pytest (socket + HTTP) passed; live WebSocket smoke test passed | Run in Linux sandbox, not yet on your Windows machine |
| 3 | Encrypted chat UI | Completed | 54 pytest + 11 + 12 JS passed; real-browser (Chromium) 3-tab check passed | Run in Linux sandbox, not yet on your Windows machine |
| 4 | Performance/security | Completed | 9 security + 1 bench JS + 3 limiter pytest-style passed; socket rate-limit tests NOT run | Flask-SocketIO/pytest not installable in sandbox (no network); see Test Results |
| 5 | Render deployment | Completed | Deployed by user; site works | Files written in sandbox; deployment and live check done by user |
| 6 | Final testing | Completed | Live checks passed incl. rate limit 31/60 | DEMO_GUIDE, VIVA_QA, FINAL_CHECKLIST added; Python suite never run |

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

- [x] Phase 4: `ratelimit.py` token bucket wired into `join`/`encrypted_message`/`echo` (`rate_limited` error; `RATE_BURST` 30, `RATE_PER_SEC` 10)
- [x] `static/js/bench.js` (RC4 + protocol timing, PBKDF2 once, echo RTT, CSV), `benchmarks/run_bench.js` -> `results/crypto_benchmark.csv`, browser panel `static/js/bench_ui.js` with CSV download
- [x] `protocol.js` `createReplayGuard()` (app.js now uses it; behavior unchanged)
- [x] `tests/test_security.js` (keystream reuse, bit flip, replay, wrong key), `tests/test_bench.js`, `tests/test_ratelimit.py`
- [x] `SECURITY.md`

- [x] Phase 5: `gunicorn.conf.py` (1 worker, 100 threads, `$PORT`, trusts proxy), `render.yaml` (free plan, `/health`, generated `SECRET_KEY`), `gunicorn==23.0.0` in requirements, optional `ALLOWED_ORIGINS` env in `app.py`, `DEPLOYMENT.md`

- [x] Phase 6: `DEMO_GUIDE.md`, `VIVA_QA.md`, `FINAL_CHECKLIST.md`; user confirmed live site, rooms, encryption and inspector

## Pending Tasks

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
| `ratelimit.py` | Per-connection token bucket |
| `static/js/bench.js`, `static/js/bench_ui.js` | Benchmark library and UI panel |
| `benchmarks/run_bench.js` | Node crypto benchmark -> `results/crypto_benchmark.csv` |
| `tests/test_security.js`, `tests/test_bench.js`, `tests/test_ratelimit.py` | Phase 4 tests |
| `SECURITY.md` | Threat model and limits |
| `gunicorn.conf.py` | Gunicorn settings for Render |
| `render.yaml` | Render Blueprint |
| `DEPLOYMENT.md` | Deploy, verify, troubleshoot |
| `DEMO_GUIDE.md`, `VIVA_QA.md`, `FINAL_CHECKLIST.md` | Phase 6 deliverables |
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
| Security suite | `node tests/test_security.js` | 9 passed | Pass | Node v22.23.5 |
| Bench tests | `node tests/test_bench.js` | passed (fake socket for RTT, CSV shape) | Pass | |
| Benchmark run | `node benchmarks/run_bench.js` | CSV written; e.g. protocol 4096 B ~0.17 ms enc, RC4 4096 B ~0.018 ms; PBKDF2 ~105 ms | Pass | Sandbox numbers, indicative only |
| Limiter unit tests | `python -m unittest tests.test_ratelimit` | 3 passed, 2 socket tests skipped | Partial | Flask-SocketIO missing in sandbox |
| Bench UI | Playwright Chromium, stub `io` | Panel ran, RTT row + CSV download OK, 0 page errors | Partial | Real server RTT not exercised |
| Phase 1-3 suites | node tests/test_rc4.js, test_protocol.js | 11 + 12 passed | Pass | Python suite and real-server socket tests NOT rerun after `app.py` change |
| Deploy files | `ast.parse` on `app.py`, `gunicorn.conf.py`; YAML parse of `render.yaml` | OK | Partial | Gunicorn, Flask-SocketIO and Render not available in sandbox |
| Live Render site | manual by user | site loads, rooms work, encryption works, inspector populated | Pass | Reported by user; wrong-secret and corrupt toggle not reported |
| Live checks (wrong secret, corrupt toggle, inspector failure, nonce uniqueness, XSS text, join rules, leave/rejoin) | manual by user on Render | all reported passed | Pass | Reported by user |
| Live rate limit | browser console: 60 rapid `echo` | 31 ok of 60 (burst 30 + 1 refill) | Pass | Confirms limiter on real Gunicorn server |
| Python suite | not run | | Unverified | User chose not to run locally; not runnable in sandbox |
| On user's Windows machine | not run | | Unverified | See Manual Actions |
| UI on your browsers | not run | | Unverified | See Manual Actions |

## Manual Actions Required

| # | Action | Why | Commands | Verify | Done |
|---|---|---|---|---|---|
| 1 | Set up venv, reinstall requirements and run tests locally | Confirm everything works on your machine | README "Setup on Windows" and "Run the tests" | `node tests/test_rc4.js` -> 11 passed; `node tests/test_protocol.js` -> 12 passed; `python -m pytest tests -v` -> 54 passed | No |
| 2 | Install Node.js if `node --version` fails | Needed for JS tests and cross-language tests | https://nodejs.org (LTS) | `node --version` | No |
| 4 | Run full suite after Phase 4 | Socket rate-limit tests and Phase 2-3 socket tests could not run in sandbox | `pip install -r requirements.txt` then `python -m pytest tests -v` | All pass, none skipped |
| 5 | Run server, open page, run benchmark panel, download CSV into `results/` | Real RTT numbers | `python app.py` | CSV has `rtt_echo` row |
| 6 | Push to GitHub, deploy via Render Blueprint, follow DEPLOYMENT.md "Verify" | Real deployment untested | See `DEPLOYMENT.md` | `/health` ok; 2 browsers chat; third with wrong secret fails | Yes (user confirmed) |
| 3 | Run the server, open two tabs (same secret) and a third (different secret) | Confirm real browser behavior | `python app.py`, open http://127.0.0.1:5000 | Same-secret tab shows message "authenticated"; other-secret tab shows red failure; Inspect panel fills | Yes (user confirmed, incl. wrong-secret tab) |

## Deployment Status
- **Local:** Server ran in sandbox in Phases 2-3 (`python app.py`); not tested on user's machine
- **Render:** Deployed and working (user confirmed)
- **Public URL:** Held by user (not recorded here)
- **Outstanding deployment issues:** None reported

## Known Issues and Limitations
- Shared secret is user-chosen (min 8 chars); weak secrets are brute-forceable offline. No key exchange, no forward secrecy. Replay protection is per-session only. WebCrypto requires HTTPS or localhost (Render is HTTPS).
- Inspector shows the per-message RC4 key for teaching; remove if reused beyond the demo.
- UI tested in Chromium only (sandbox), not Firefox/Safari.
- Room state is in memory (lost on restart); rate limiting is per connection only. Phase 4 `app.py` change (limiter) is untested against a real server in the sandbox.
- `python app.py` uses the Werkzeug dev server with `allow_unsafe_werkzeug=True`; it can print harmless "Bad request syntax" lines when a WebSocket closes. Gunicorn replaces it in Phase 5.
- Frames larger than the engine buffer (about 7.5 KB with default limits) are dropped by Socket.IO before our handler runs, so the sender gets no ack.
- Tests use the Flask-SocketIO test client; real transport was only smoke-tested ad hoc in the sandbox.
- `requirements.txt` pins versions installed in the sandbox (pycryptodome 4.5.0, pytest 9.1.1); if `pip install` cannot find them on your machine, tell me and I will adjust.
- If Node.js is missing, the two cross-language tests are skipped by pytest (reported as skipped, not passed).
- Package is named `crypto/` per the spec; PyCryptodome's package is `Crypto/` (capital C). Python import is case-sensitive, so they do not clash.

## Change Log

### Phase 6
- **Created:** `DEMO_GUIDE.md`, `VIVA_QA.md`, `FINAL_CHECKLIST.md`
- **Modified:** `README.md`, `PLAN.md`
- **Deleted:** none

### Phase 5
- **Created:** `gunicorn.conf.py`, `render.yaml`, `DEPLOYMENT.md`
- **Modified:** `requirements.txt` (gunicorn), `app.py` (`ALLOWED_ORIGINS`), `README.md`, `PLAN.md`
- **Deleted:** none

### Phase 4
- **Created:** `ratelimit.py`, `static/js/bench.js`, `static/js/bench_ui.js`, `benchmarks/run_bench.js`, `results/crypto_benchmark.csv`, `tests/test_security.js`, `tests/test_bench.js`, `tests/test_ratelimit.py`, `SECURITY.md`
- **Modified:** `app.py` (limiter), `static/js/protocol.js` (`createReplayGuard`), `static/js/app.js` (uses guard), `templates/index.html` + `static/css/style.css` (bench panel), `README.md`, `PLAN.md`
- **Deleted:** none

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
- None. All phases complete. Remaining optional items are in `FINAL_CHECKLIST.md`.
