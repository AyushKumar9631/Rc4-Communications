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

## Live checks on the deployed site (all reported passed by you)
- [x] Wrong-secret window shows red authentication failure
- [x] "Corrupt my ciphertext" toggle rejected by receiver
- [x] Inspector on failed message shows MAC INVALID, no plaintext
- [x] Same text sent twice gives different nonce, key, ciphertext
- [x] HTML in a message rendered as plain text
- [x] Duplicate username refused; rooms isolated; leave and rejoin updates members
- [x] Rate limit: 60 rapid echoes gave 31 ok (burst 30 + 1 refill), rest `rate_limited`
- [x] Benchmark panel, CSV download, other browsers and sleep recovery (reported under "all tests passed")

## Not run anywhere
- [ ] Python suite (`python -m pytest tests -v`) and `test_ratelimit.py` socket tests: never executed (not in sandbox, not locally by choice). Live checks above cover the same behavior.

## Before submission
- [ ] Benchmark CSV from the live site saved in `results/` and committed; `VIVA_QA.md` numbers match it
- [ ] Rehearse `DEMO_GUIDE.md` once
- [ ] Latest commit pushed; Render shows that deploy

## Known limits to state honestly
RC4 is obsolete; shared-secret only; no forward secrecy; replay protection per session; free tier sleeps and loses rooms; UI tested in Chromium only.
