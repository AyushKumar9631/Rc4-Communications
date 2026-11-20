# DEMO_GUIDE.md (about 5 minutes)

Setup: open `https://<your-app>.onrender.com/health` first to wake the free service. Use two browser windows side by side (A and B) plus a third for the failure case. Room `demo`, secret `correct horse battery`.

| Step | Do | Say |
|---|---|---|
| 1 | Show the header badge: connected. | Educational demo; RC4 is obsolete. |
| 2 | A joins as `alice`, B as `bob`, same room and secret. | Secret never leaves the browser; PBKDF2 derives a master key locally. |
| 3 | A sends "hello". B shows it as authenticated. | Encrypted in the browser, decrypted in the browser. |
| 4 | Click **Inspect** on the message. | Point out nonce, per-message RC4 key, keystream, ciphertext, MAC, and "what the server relays". The server never has a key. |
| 5 | Send the same text twice; Inspect both. | Different nonce gives different key and ciphertext (no keystream reuse). |
| 6 | A ticks "corrupt my outgoing ciphertext" and sends. B shows a red failure. | One flipped bit fails the HMAC; RC4 is never run. |
| 7 | Third window joins with a different secret and receives a message. | Wrong key fails authentication; no plaintext. |
| 8 | Open **Performance benchmark**, Run, Download CSV. | RC4 alone vs full protocol time by size, plus real round-trip time. |
| 9 | Show `SECURITY.md` table. | Attacks shown: keystream reuse, bit flip, replay, wrong key. |

Fallback if the site is slow: run locally with `python app.py` and `node tests/test_security.js`.
