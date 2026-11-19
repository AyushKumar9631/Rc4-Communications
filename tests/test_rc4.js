// Standalone JS tests for static/js/crypto.js. Run: node tests/test_rc4.js
"use strict";
const assert = require("assert");
const path = require("path");
const L = require(path.join(__dirname, "..", "static", "js", "crypto.js"));

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("ok - " + name);
}
const enc = (s) => new TextEncoder().encode(s);

// Classic published vectors
test("vector Key/Plaintext", () => {
  const ct = L.encrypt(enc("Key"), enc("Plaintext"));
  assert.strictEqual(L.bytesToHex(ct), "bbf316e8d940af0ad3");
});
test("vector Wiki/pedia", () => {
  assert.strictEqual(L.bytesToHex(L.encrypt(enc("Wiki"), enc("pedia"))), "1021bf0420");
});
test("vector Secret/Attack at dawn", () => {
  assert.strictEqual(
    L.bytesToHex(L.encrypt(enc("Secret"), enc("Attack at dawn"))),
    "45a01f645fc35b383552544b9bf5"
  );
});
// RFC 6229 keystream offset 0 (first 16 bytes)
test("RFC6229 40-bit key keystream", () => {
  const key = L.hexToBytes("0102030405");
  assert.strictEqual(L.bytesToHex(L.keystream(key, 16)), "b2396305f03dc027ccc3524a0a1118a8");
});
test("RFC6229 64-bit key keystream", () => {
  const key = L.hexToBytes("0102030405060708");
  assert.strictEqual(L.bytesToHex(L.keystream(key, 16)), "97ab8a1bf0afb96132f2f67258da15a8");
});

test("round trip bytes", () => {
  const key = enc("some-key");
  const pt = new Uint8Array(1000).map((_, i) => (i * 7) & 255);
  assert.deepStrictEqual(L.decrypt(key, L.encrypt(key, pt)), pt);
});
test("round trip UTF-8 text via Base64", () => {
  const key = enc("k3y");
  const msg = "Hello नमस्ते 🌍 — café";
  assert.strictEqual(L.decryptText(key, L.encryptText(key, msg)), msg);
});
test("empty message", () => {
  const key = enc("k");
  assert.strictEqual(L.decryptText(key, L.encryptText(key, "")), "");
});
test("hex round trip", () => {
  const b = Uint8Array.from([0, 1, 15, 16, 255]);
  assert.strictEqual(L.bytesToHex(b), "00010f10ff");
  assert.deepStrictEqual(L.hexToBytes("00010f10ff"), b);
});
test("base64 matches Node Buffer for all lengths 0..64", () => {
  for (let n = 0; n <= 64; n++) {
    const b = new Uint8Array(n).map((_, i) => (i * 31 + n) & 255);
    const expected = Buffer.from(b).toString("base64");
    assert.strictEqual(L.bytesToBase64(b), expected);
    assert.deepStrictEqual(L.base64ToBytes(expected), b);
  }
});
test("invalid inputs rejected", () => {
  assert.throws(() => L.ksa(new Uint8Array(0)), RangeError);
  assert.throws(() => L.ksa(new Uint8Array(257)), RangeError);
  assert.throws(() => L.ksa("string"), TypeError);
  assert.throws(() => L.base64ToBytes("abc"), /Invalid Base64/);
  assert.throws(() => L.base64ToBytes("ab!d"), /Invalid Base64/);
  assert.throws(() => L.hexToBytes("zz"), /Invalid hex/);
  assert.throws(() => L.hexToBytes("abc"), /Invalid hex/);
  assert.throws(() => L.utf8Decode(Uint8Array.from([0xff, 0xfe])));
});

console.log("\n" + passed + " JS tests passed");
