# VIVA_QA.md

**1. How does RC4 work?** KSA shuffles `S[0..255]` using the key. PRGA keeps swapping and outputs one keystream byte at a time. Ciphertext = plaintext XOR keystream; decryption is the same XOR.

**2. Why is RC4 considered broken?** Biased keystream (especially early bytes), exploited in WEP and TLS attacks; RFC 7465 prohibits it in TLS. It also gives no integrity and breaks badly if a keystream is reused.

**3. Why use it then?** Teaching: a simple stream cipher whose weaknesses are easy to demonstrate. Not for real data.

**4. What is keystream reuse?** Same key twice gives `c1 XOR c2 = p1 XOR p2`, so known text reveals the other message. Tested in `test_security.js`.

**5. How do you avoid it?** Each message has a random 16-byte nonce; HKDF-SHA256(master, salt = nonce) gives a fresh 64-byte output: 32-byte RC4 key and 32-byte MAC key.

**6. How is the master key made?** PBKDF2-HMAC-SHA256, 600,000 iterations, salt `rc4-chat-v1|<room>`, once per join, in the browser.

**7. Why add a MAC?** RC4 is malleable: flipping a ciphertext bit flips the same plaintext bit. HMAC-SHA256 encrypt-then-MAC, bound to room, sender and nonce, is verified in constant time before decrypting.

**8. What does the server see?** Room, username, sizes, timing, nonce, ciphertext, MAC. Never the secret, keys or plaintext. It validates and relays only.

**9. How is replay handled?** The receiver drops a nonce it has already seen this session. A rejoin resets it, and a malicious server could replay across sessions; this is a stated limitation.

**10. What if the secret is wrong?** MAC check fails; the message is shown as failed and never decrypted.

**11. What attacks does it not stop?** Brute force of weak secrets (PBKDF2 only slows it), RC4 statistical biases, traffic analysis, message dropping/reordering by the server, no forward secrecy, no key exchange.

**12. What did you measure?** RC4 and full-protocol time for 16 B to 4 KB, one PBKDF2 derivation, and echo round-trip time. In the sandbox a 4 KB message took about 0.017 ms with raw RC4 and about 0.17 ms with the full protocol; use your own CSV from the live site. The protocol cost is mostly HKDF and HMAC, not RC4.

**13. Why one Gunicorn worker?** Room membership is in process memory; two workers would split rooms. 100 threads serve the connections.

**14. What other protections exist?** Per-connection rate limit (burst 30, 10/s), size limits, canonical Base64 checks, server-side membership checks, `textContent` rendering, no CDN.

**15. What would you use in production?** AES-256-GCM or ChaCha20-Poly1305 (AEAD) with a proper key exchange (e.g. X25519), over TLS.
