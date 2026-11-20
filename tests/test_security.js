// Security demonstrations as tests. Run: node tests/test_security.js
"use strict";
const assert = require("assert");
const path = require("path");
const L = require(path.join(__dirname, "..", "static", "js", "crypto.js"));
const P = require(path.join(__dirname, "..", "static", "js", "protocol.js"));

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const ITER = 1000;
const room = "r1", alice = "alice";
const xor = (a, b) => a.map((v, i) => v ^ b[i]);
const master = (secret) => P.deriveMaster(secret || "correct horse battery", room, ITER);
const wireBytes = (w, f) => L.base64ToBytes(w[f]);
const flip = (w, f, i) => {
  const b = wireBytes(w, f);
  b[i] ^= 1;
  return Object.assign({}, w, { [f]: L.bytesToBase64(b) });
};

test("keystream reuse: raw RC4 with one key leaks p1 XOR p2", () => {
  const key = L.utf8Encode("static-key");
  const p1 = L.utf8Encode("attack at dawn!!"), p2 = L.utf8Encode("retreat at dusk!");
  const c1 = L.encrypt(key, p1), c2 = L.encrypt(key, p2);
  assert.deepStrictEqual(xor(c1, c2), xor(p1, p2));
  assert.deepStrictEqual(xor(xor(c1, c2), p1), xor(p2, new Uint8Array(p2.length))); // known plaintext recovers p2
});

test("keystream reuse: random per-message nonce gives different keys, no leak", async () => {
  const m = await master();
  const t1 = "attack at dawn!!", t2 = "retreat at dusk!";
  const a = await P.encryptMessage(m, room, alice, t1);
  const b = await P.encryptMessage(m, room, alice, t2);
  assert.notDeepStrictEqual(a.details.encKey, b.details.encKey);
  assert.notDeepStrictEqual(xor(a.details.ciphertext, b.details.ciphertext),
    xor(L.utf8Encode(t1), L.utf8Encode(t2)));
});

test("keystream reuse: a REUSED nonce brings the leak back (why nonces are random)", async () => {
  const m = await master();
  const nonce = new Uint8Array(16).fill(9);
  const a = await P.encryptMessage(m, room, alice, "attack at dawn!!", { nonce });
  const b = await P.encryptMessage(m, room, alice, "retreat at dusk!", { nonce });
  assert.deepStrictEqual(xor(a.details.ciphertext, b.details.ciphertext),
    xor(L.utf8Encode("attack at dawn!!"), L.utf8Encode("retreat at dusk!")));
});

test("bit-flip without MAC: raw RC4 is malleable", () => {
  const key = L.utf8Encode("static-key");
  const ct = L.encrypt(key, L.utf8Encode("PAY $100 TO BOB"));
  ct[5] ^= "1".charCodeAt(0) ^ "9".charCodeAt(0); // attacker needs no key
  assert.strictEqual(L.utf8Decode(L.decrypt(key, ct)), "PAY $900 TO BOB");
});

test("bit-flip with protocol: any flipped nonce/ciphertext/MAC bit -> bad_mac, no plaintext", async () => {
  const m = await master();
  const { wire } = await P.encryptMessage(m, room, alice, "PAY $100 TO BOB");
  for (const f of ["nonce", "ciphertext", "mac"]) {
    const r = await P.decryptMessage(m, room, alice, flip(wire, f, 0));
    assert.strictEqual(r.ok, false, f);
    assert.strictEqual(r.reason, "bad_mac", f);
    assert.strictEqual(r.details.plaintext, undefined, f);
  }
});

test("replay: protocol alone re-accepts a message; the replay guard drops the second copy", async () => {
  const m = await master();
  const { wire } = await P.encryptMessage(m, room, alice, "hello");
  assert.strictEqual((await P.decryptMessage(m, room, alice, wire)).ok, true);
  assert.strictEqual((await P.decryptMessage(m, room, alice, wire)).ok, true);
  const guard = P.createReplayGuard();
  assert.strictEqual(guard.accept(wire.nonce), true);
  assert.strictEqual(guard.accept(wire.nonce), false);
  assert.strictEqual(P.createReplayGuard().accept(wire.nonce), true); // new session resets
});

test("replay: re-labelling sender or room breaks the MAC", async () => {
  const m = await master();
  const { wire } = await P.encryptMessage(m, room, alice, "hello");
  assert.strictEqual((await P.decryptMessage(m, room, "mallory", wire)).reason, "bad_mac");
  assert.strictEqual((await P.decryptMessage(m, "other", alice, wire)).reason, "bad_mac");
});

test("wrong key: different secret -> bad_mac; keys differ; plaintext never produced", async () => {
  const m = await master(), wrong = await master("wrong horse battery");
  const { wire } = await P.encryptMessage(m, room, alice, "secret text");
  const r = await P.decryptMessage(wrong, room, alice, wire);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "bad_mac");
  assert.strictEqual(r.details.plaintext, undefined);
});

test("wrong key: raw RC4 decrypts to garbage silently (no authentication)", () => {
  const ct = L.encrypt(L.utf8Encode("right-key"), L.utf8Encode("secret text"));
  const out = L.decrypt(L.utf8Encode("wrong-key"), ct);
  assert.notStrictEqual(Buffer.from(out).toString("latin1"), "secret text");
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log("ok   - " + name); }
    catch (e) { failed++; console.log("FAIL - " + name + "\n  " + e.message); }
  }
  console.log(failed ? failed + " FAILED" : tests.length + " security tests passed");
  process.exit(failed ? 1 : 0);
})();
