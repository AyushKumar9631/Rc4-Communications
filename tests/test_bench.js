// Tests for static/js/bench.js. Run: node tests/test_bench.js
"use strict";
const assert = require("assert");
const path = require("path");
const B = require(path.join(__dirname, "..", "static", "js", "bench.js"));

(async () => {
  const rows = await B.benchCrypto({ sizes: [16, 64], samples: 3, iterations: 1000 });
  assert.strictEqual(rows.length, 1 + 2 * 4);
  rows.forEach((r) => assert.ok(r.median_ms >= 0 && r.min_ms <= r.max_ms));
  const lines = B.toCsv(rows).trim().split("\n");
  assert.strictEqual(lines[0], B.COLUMNS.join(","));
  assert.strictEqual(lines.length, rows.length + 1);
  lines.forEach((l) => assert.strictEqual(l.split(",").length, B.COLUMNS.length));

  let calls = 0;
  const fake = { emit(ev, data, cb) { calls++; cb(calls === 2 ? { ok: false, error: "rate_limited" } : { ok: true }); } };
  const rtt = await B.benchRtt(fake, 3);
  assert.strictEqual(rtt.operation, "rtt_echo");
  assert.strictEqual(rtt.samples, 3);
  assert.strictEqual(calls, 4); // one rate-limited attempt retried

  await assert.rejects(B.benchRtt({ emit(e, d, cb) { cb({ ok: false, error: "bad_payload" }); } }, 2));
  console.log("bench tests passed");
})().catch((e) => { console.log("FAIL - " + e.message); process.exit(1); });
