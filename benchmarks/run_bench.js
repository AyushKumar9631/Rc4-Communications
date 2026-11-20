// Crypto benchmark -> results/crypto_benchmark.csv. Run: node benchmarks/run_bench.js
"use strict";
const fs = require("fs");
const path = require("path");
const B = require("../static/js/bench.js");

(async () => {
  const rows = await B.benchCrypto();
  const out = path.join(__dirname, "..", "results", "crypto_benchmark.csv");
  fs.writeFileSync(out, B.toCsv(rows));
  console.log(B.toCsv(rows));
  console.log("written:", out);
})();
