// Standalone tests for static/js/protocol.js. Run: node tests/test_protocol.js
"use strict";
const assert = require("assert");
const path = require("path");
const L = require(path.join(__dirname, "..", "static", "js", "crypto.js"));
const P = require(path.join(__dirname, "..", "static", "js", "protocol.js"));

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const ITER = 1000; // fast; default is 600000
const room = "r1", alice = "alice";

async function setup(secret) {
  return P.deriveMaster(secret || "correct horse battery", room, ITER);
}
const mutate = (b64, i) => {
  const b = L.base64ToBytes(b64);
  b[i] ^= 1;
  return L.bytesToBase64(b);
};

test("round trip incl. UTF-8", async () => {
  const m = await setup();
  const text = "héllo ✓ \u{1F600} world";
  const { wire } = await P.encryptMessage(m, room, alice, text);
  const r = await P.decryptMessage(m, room, alice, wire);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.plaintext, text);
});

test("wire sizes: nonce 16, mac 32, ct == plaintext length", async () => {
  const m = await setup();
  const { wire } = await P.encryptMessage(m, room, alice, "abcde");
  assert.strictEqual(L.base64ToBytes(wire.nonce).length, 16);
  assert.strictEqual(L.base64ToBytes(wire.mac).length, 32);
  assert.strictEqual(L.base64ToBytes(wire.ciphertext).length, 5);
});

test("fresh nonce and ciphertext for identical plaintext", async () => {
  const m = await setup();
  const a = await P.encryptMessage(m, room, alice, "same");
  const b = await P.encryptMessage(m, room, alice, "same");
  assert.notStrictEqual(a.wire.nonce, b.wire.nonce);
  assert.notStrictEqual(a.wire.ciphertext, b.wire.ciphertext);
});

test("plaintext not visible on the wire", async () => {
  const m = await setup();
  const { wire } = await P.encryptMessage(m, room, alice, "Attack at dawn");
  assert.ok(!JSON.stringify(wire).includes("Attack"));
});

test("keys depend on nonce", async () => {
  const m = await setup();
  const a = await P.deriveMessageKeys(m, new Uint8Array(16));
  const b = await P.deriveMessageKeys(m, new Uint8Array(16).fill(1));
  assert.notStrictEqual(L.bytesToHex(a.encKey), L.bytesToHex(b.encKey));
  assert.notStrictEqual(L.bytesToHex(a.encKey), L.bytesToHex(a.macKey));
});

test("tampering with any field is rejected (bad_mac)", async () => {
  const m = await setup();
  const { wire } = await P.encryptMessage(m, room, alice, "hello there");
  for (const f of ["nonce", "ciphertext", "mac"]) {
    const bad = Object.assign({}, wire, { [f]: mutate(wire[f], 0) });
    const r = await P.decryptMessage(m, room, alice, bad);
    assert.strictEqual(r.ok, false, f);
    assert.strictEqual(r.reason, "bad_mac", f);
    assert.strictEqual(r.plaintext, undefined);
    assert.strictEqual(r.details.plaintext, undefined, "must not decrypt before MAC check");
  }
});

test("last-byte tampering rejected", async () => {
  const m = await setup();
  const { wire } = await P.encryptMessage(m, room, alice, "hello there");
  const n = L.base64ToBytes(wire.ciphertext).length - 1;
  const r = await P.decryptMessage(m, room, alice, Object.assign({}, wire, { ciphertext: mutate(wire.ciphertext, n) }));
  assert.strictEqual(r.reason, "bad_mac");
});

test("wrong room, sender or secret rejected", async () => {
  const m = await setup();
  const { wire } = await P.encryptMessage(m, room, alice, "hello");
  assert.strictEqual((await P.decryptMessage(m, "r2", alice, wire)).reason, "bad_mac");
  assert.strictEqual((await P.decryptMessage(m, room, "bob", wire)).reason, "bad_mac");
  const other = await setup("another passphrase!");
  assert.strictEqual((await P.decryptMessage(other, room, alice, wire)).reason, "bad_mac");
  const otherRoom = await P.deriveMaster("correct horse battery", "r2", ITER);
  assert.strictEqual((await P.decryptMessage(otherRoom, room, alice, wire)).reason, "bad_mac");
});

test("tamper option produces MAC failure at receiver", async () => {
  const m = await setup();
  const { wire } = await P.encryptMessage(m, room, alice, "hello", { tamper: true });
  assert.strictEqual((await P.decryptMessage(m, room, alice, wire)).reason, "bad_mac");
});

test("malformed wire never throws", async () => {
  const m = await setup();
  const { wire } = await P.encryptMessage(m, room, alice, "hello");
  const bads = [
    {}, { nonce: 1, ciphertext: 2, mac: 3 },
    Object.assign({}, wire, { nonce: "!!!!" }),
    Object.assign({}, wire, { nonce: L.bytesToBase64(new Uint8Array(15)) }),
    Object.assign({}, wire, { mac: L.bytesToBase64(new Uint8Array(31)) }),
    Object.assign({}, wire, { ciphertext: "" }),
  ];
  for (const b of bads) {
    const r = await P.decryptMessage(m, room, alice, b);
    assert.deepStrictEqual([r.ok, r.reason], [false, "malformed"]);
  }
});

test("empty message and bad nonce rejected on encrypt", async () => {
  const m = await setup();
  await assert.rejects(P.encryptMessage(m, room, alice, ""));
  await assert.rejects(P.encryptMessage(m, room, alice, "x", { nonce: new Uint8Array(8) }));
  await assert.rejects(P.deriveMaster("", room, ITER));
});

test("max-size message (4096 bytes) round trips", async () => {
  const m = await setup();
  const text = "a".repeat(4096);
  const { wire } = await P.encryptMessage(m, room, alice, text);
  assert.strictEqual((await P.decryptMessage(m, room, alice, wire)).plaintext, text);
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    await fn();
    passed++;
    console.log("ok - " + name);
  }
  console.log(passed + " protocol tests passed");
})().catch((e) => { console.error(e); process.exit(1); });
