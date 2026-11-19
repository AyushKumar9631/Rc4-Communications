// Helper for tests/test_protocol.py. Reads one JSON request on stdin, prints JSON.
"use strict";
const path = require("path");
const L = require(path.join(__dirname, "..", "static", "js", "crypto.js"));
const P = require(path.join(__dirname, "..", "static", "js", "protocol.js"));
const hex = L.bytesToHex;

let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", async () => {
  const q = JSON.parse(input);
  const master = await P.deriveMaster(q.secret, q.room, q.iterations);
  if (q.op === "encrypt") {
    const r = await P.encryptMessage(master, q.room, q.sender, q.plaintext,
      { nonce: L.hexToBytes(q.nonce) });
    console.log(JSON.stringify({
      wire: r.wire, master: hex(master),
      encKey: hex(r.details.encKey), macKey: hex(r.details.macKey)
    }));
  } else {
    const r = await P.decryptMessage(master, q.room, q.sender, q.wire);
    console.log(JSON.stringify({ ok: r.ok, plaintext: r.plaintext, reason: r.reason }));
  }
});
