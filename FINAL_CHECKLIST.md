# FINAL_CHECKLIST.md

## Confirmed by you on the live site
- [x] Site loads on Render
- [x] Rooms work (join, members)
- [x] Messages are encrypted and received
- [x] Inspector shows nonce, key, keystream, ciphertext, MAC, relayed payload

## Verified in the sandbox
- [x] RC4 vectors, PyCryptodome agreement, JS vs Python (Phase 1)
- [x] Protocol, security and bench JS tests pass (11 + 12 + 9 + bench)
- [x] Rate limiter unit tests

## Still worth doing before submission (not confirmed yet)
- [ ] `python -m pytest tests -v` on your machine: all pass, none skipped
- [ ] `node tests/test_rc4.js`, `test_protocol.js`, `test_security.js`, `test_bench.js` on your machine
- [ ] Third window with a wrong secret shows a red failure on the live site
- [ ] "Corrupt my ciphertext" toggle is rejected by the receiver
- [ ] Run the benchmark panel on the live site; save the CSV into `results/`
- [ ] Rehearse `DEMO_GUIDE.md` once; read `VIVA_QA.md`
- [ ] Final commit pushed; Render shows the latest deploy

## Known limits to state honestly
RC4 is obsolete; shared-secret only; no forward secrecy; replay protection per session; free tier sleeps and loses rooms; UI tested in Chromium only.
