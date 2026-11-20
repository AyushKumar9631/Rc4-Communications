# SECURITY.md

Educational project. RC4 is obsolete (RFC 7465 prohibits it in TLS). Do not protect real data with it.

## Threat model

| Attacker | Can | Cannot |
|---|---|---|
| Passive network/server observer | See room, sender, size, timing, nonce, ciphertext, MAC | Read plaintext without the shared secret |
| Active relay (malicious server) | Drop, delay, reorder, duplicate messages | Forge or alter messages without the secret |
| Outsider without secret | Join a room, send junk | Produce a message that passes the MAC |

## Demonstrated weaknesses and mitigations (`node tests/test_security.js`)

| Attack | Raw RC4 | This protocol |
|---|---|---|
| Keystream reuse (same key twice leaks `p1 XOR p2`) | Vulnerable | Fresh 16-byte random nonce -> HKDF per-message key. A reused nonce reintroduces the leak (tested), so nonces must stay random |
| Bit flipping (flip ciphertext bit -> same plaintext bit flips) | Vulnerable | HMAC-SHA256 encrypt-then-MAC; MAC verified (constant time) before RC4 runs; failures never decrypted |
| Replay | n/a | Receiver drops a nonce already seen this session. Resets on rejoin; the server can replay across sessions |
| Re-labelling sender/room | n/a | Sender, room and nonce are bound into the MAC |
| Wrong key | Silent garbage | MAC fails -> rejected, no plaintext |

## Server hardening

- Per-connection token bucket (`ratelimit.py`) on `join`, `encrypted_message`, `echo`: burst 30, refill 10/s (`RATE_BURST`, `RATE_PER_SEC`). Excess gets `rate_limited` and is not relayed.
- Size limits (4096-byte ciphertext, 1024-char echo), canonical Base64, room/member caps, server-side membership checks, sender set by server.
- Client renders all text with `textContent`; Socket.IO client is served locally (no CDN).

## Not covered

- RC4's own statistical biases (early keystream bytes); the HMAC fixes integrity, not this.
- Weak secrets: offline brute force from captured traffic (PBKDF2 600k iterations only slows it).
- No key exchange, no forward secrecy; anyone with the secret can join under any free username.
- Traffic analysis (length, timing, membership) and message loss/reordering by the server.
- Rate limiting is per connection, not per IP; room state is in memory. Inspector shows per-message keys (teaching only).
- Benchmark timings are indicative only (JIT, timer resolution, other load).
