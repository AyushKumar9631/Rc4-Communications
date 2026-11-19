// Helper for tests/test_rc4.py: reads a JSON file of {key_hex, data_hex} cases,
// encrypts each with the JS RC4 implementation, prints a JSON array of
// {ct_hex, ks_hex, b64} results. Usage: node tests/js_cross_check.js cases.json
"use strict";
const fs = require("fs");
const path = require("path");
const L = require(path.join(__dirname, "..", "static", "js", "crypto.js"));

const cases = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const out = cases.map((c) => {
  const key = L.hexToBytes(c.key_hex);
  const data = L.hexToBytes(c.data_hex);
  const ct = L.encrypt(key, data);
  return {
    ct_hex: L.bytesToHex(ct),
    ks_hex: L.bytesToHex(L.keystream(key, data.length)),
    b64: L.bytesToBase64(ct),
  };
});
process.stdout.write(JSON.stringify(out));
