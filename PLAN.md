# PLAN.md — Single Source of Truth

## Project Overview
- **Project title:** RC4-Based Secure Text Communication System
- **Objective:** Minimal real-time encrypted web chat that demonstrates RC4 (client-side encryption, ciphertext-only relay), with performance measurement and security demonstrations. Educational only; RC4 is obsolete.
- **Technology stack:** HTML5/CSS3/vanilla JS; Python 3, Flask, Flask-SocketIO, Gunicorn; manual RC4 (JS + Python), PyCryptodome for verification, HKDF-SHA256 + HMAC-SHA256 (later phases)
- **Target hosting platform:** Render free web service (via GitHub)

## Current Status
- **Current phase:** Phase 1 complete, awaiting approval for Phase 2
- **Last completed phase:** 1
- **Overall progress:** 1 / 6 phases
- **Last updated:** 2026-11-19 16:41 UTC (22:11 IST)
- **Current blockers:** None

## Phase Tracker

| Phase | Description | Status | Tests | Notes |
|---|---|---|---|---|
| 1 | RC4 implementation | Completed | 21 pytest + 11 JS passed | Run in Linux sandbox, not yet on your Windows machine |
| 2 | Backend | Pending | Not run | |
| 3 | Encrypted chat UI | Pending | Not run | |
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

## Pending Tasks
- [ ] Phase 2: Flask + Flask-SocketIO backend, room membership checks, validation, echo/ack event, socket tests
- [ ] Phase 3: Chat UI, nonce, HKDF, HMAC encrypt-then-MAC, inspector
- [ ] Phase 4: Benchmarks, RTT, CSV export, security tests, SECURITY.md
- [ ] Phase 5: Render deployment files and DEPLOYMENT.md
- [ ] Phase 6: Final testing, DEMO_GUIDE.md, VIVA_QA.md, FINAL_CHECKLIST.md

## File Inventory

| File | Purpose |
|---|---|
| `crypto/__init__.py` | Package marker |
| `crypto/rc4.py` | Python RC4 reference implementation and helpers |
| `static/js/crypto.js` | JavaScript RC4 and helpers (browser + Node) |
| `tests/test_rc4.py` | Python tests: vectors, round trips, invalid inputs, PyCryptodome, cross-language |
| `tests/test_rc4.js` | Standalone JS tests |
| `tests/js_cross_check.js` | Node helper used by the cross-language Python test |
| `requirements.txt` | Pinned Python dependencies |
| `.gitignore` | Git ignore rules |
| `results/.gitkeep` | Keeps benchmark output folder in git |
| `README.md` | Overview, setup, test commands |
| `PLAN.md` | This file |

## Test Results

| Test | Command | Actual result | Status | Notes |
|---|---|---|---|---|
| JS suite | `node tests/test_rc4.js` | 11 JS tests passed | Pass | Node v22.23.5 |
| Python suite | `python3 -m pytest tests -v` | 21 passed in 0.46s | Pass | Python 3.13.18, pytest 9.1.1, pycryptodome 4.5.0 |
| Known vectors | included above | 3 classic + 2 RFC 6229 keystream, both languages | Pass | |
| PyCryptodome agreement | included above | 300 random + known inputs match | Pass | |
| JS vs Python | included above | 203 cases match (ciphertext, keystream, Base64) | Pass | Includes 100,000-byte input and 256-byte key |
| On user's Windows machine | not run | | Unverified | See Manual Actions |

## Manual Actions Required

| # | Action | Why | Commands | Verify | Done |
|---|---|---|---|---|---|
| 1 | Set up venv and run tests locally | Confirm everything works on your machine | See README "Setup on Windows" and "Run the tests" | `node tests/test_rc4.js` prints "11 JS tests passed"; `python -m pytest tests -v` shows 21 passed | No |
| 2 | Install Node.js if `node --version` fails | Needed for JS tests and cross-language test | https://nodejs.org (LTS) | `node --version` | No |

## Deployment Status
- **Local:** Not tested on user's machine (tested in sandbox only)
- **Render:** Not configured
- **Public URL:** None
- **Outstanding deployment issues:** None yet (Phase 5)

## Known Issues and Limitations
- Phase 1 is RC4 only: no integrity protection, nonce, HKDF, or HMAC yet (Phase 3).
- `requirements.txt` pins versions installed in the sandbox (pycryptodome 4.5.0, pytest 9.1.1); if `pip install` cannot find them on your machine, tell me and I will adjust.
- If Node.js is missing, the two cross-language tests are skipped by pytest (reported as skipped, not passed).
- Package is named `crypto/` per the spec; PyCryptodome's package is `Crypto/` (capital C). Python import is case-sensitive, so they do not clash.

## Change Log

### Phase 1
- **Created:** `crypto/__init__.py`, `crypto/rc4.py`, `static/js/crypto.js`, `tests/test_rc4.py`, `tests/test_rc4.js`, `tests/js_cross_check.js`, `requirements.txt`, `.gitignore`, `results/.gitkeep`, `README.md`, `PLAN.md`
- **Modified:** none
- **Deleted:** none
- **Features:** RC4 KSA/PRGA/XOR in Python and JS; UTF-8, hex, Base64 helpers; key length validation (1–256 bytes)
- **Tests performed:** see Test Results

## Next Phase
- **Phase 2:** Flask backend and WebSocket communication
- **Objectives:** Flask app serving a basic page; Flask-SocketIO with join/leave/encrypted_message/echo events; room membership checks; payload validation and size limits; socket integration tests
- **Dependencies:** Phase 1 approved; adds Flask and Flask-SocketIO to `requirements.txt`
- **Expected deliverables:** `app.py`, `templates/index.html`, `tests/test_socket.py`, updated `requirements.txt` and `PLAN.md`
