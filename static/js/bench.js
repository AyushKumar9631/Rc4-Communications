/* Benchmarks (browser + Node): RC4 and full-protocol timing, echo round-trip time, CSV. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./crypto.js"), require("./protocol.js"));
  } else {
    root.ChatBench = factory(root.RC4Lib, root.ChatProtocol);
  }
})(typeof self !== "undefined" ? self : this, function (RC4, Proto) {
  "use strict";

  var SIZES = [16, 64, 256, 1024, 4096];
  var COLUMNS = ["operation", "size_bytes", "samples", "median_ms", "min_ms", "max_ms", "kb_per_s"];

  function now() { return globalThis.performance.now(); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function row(operation, size, perOpMs) {
    var s = perOpMs.slice().sort(function (a, b) { return a - b; });
    var m = s.length >> 1;
    var med = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    return {
      operation: operation, size_bytes: size, samples: s.length,
      median_ms: med, min_ms: s[0], max_ms: s[s.length - 1],
      kb_per_s: size && med > 0 ? size / 1024 / (med / 1000) : ""
    };
  }

  async function sample(samples, inner, fn) {
    var out = [];
    for (var w = 0; w < inner; w++) await fn(); // warm-up, not recorded
    for (var i = 0; i < samples; i++) {
      var t0 = now();
      for (var j = 0; j < inner; j++) await fn();
      out.push((now() - t0) / inner);
    }
    return out;
  }

  async function benchCrypto(opts) {
    opts = opts || {};
    var sizes = opts.sizes || SIZES, samples = opts.samples || 15;
    var rows = [];
    var t0 = now();
    var master = await Proto.deriveMaster("benchmark-secret", "bench", opts.iterations);
    rows.push(row("pbkdf2_derive_once", 0, [now() - t0]));
    var key = new Uint8Array(32).fill(7);
    for (var i = 0; i < sizes.length; i++) {
      var n = sizes[i], text = "a".repeat(n), pt = RC4.utf8Encode(text);
      var ct = RC4.encrypt(key, pt);
      var wire = (await Proto.encryptMessage(master, "bench", "bench", text)).wire;
      rows.push(row("rc4_encrypt", n, await sample(samples, 100, function () { RC4.encrypt(key, pt); })));
      rows.push(row("rc4_decrypt", n, await sample(samples, 100, function () { RC4.decrypt(key, ct); })));
      rows.push(row("protocol_encrypt", n, await sample(samples, 10, function () {
        return Proto.encryptMessage(master, "bench", "bench", text);
      })));
      rows.push(row("protocol_decrypt", n, await sample(samples, 10, function () {
        return Proto.decryptMessage(master, "bench", "bench", wire);
      })));
    }
    return rows;
  }

  /** Sequential echo round trips over an open Socket.IO socket. */
  async function benchRtt(socket, n) {
    var times = [], attempts = 0;
    while (times.length < n && attempts++ < n * 5) {
      var t0 = now();
      var res = await new Promise(function (resolve) { socket.emit("echo", { data: "x".repeat(16) }, resolve); });
      var dt = now() - t0;
      if (res && res.ok) times.push(dt);
      else if (res && res.error === "rate_limited") await sleep(150);
      else throw new Error("echo failed");
    }
    if (times.length < n) throw new Error("rate limited");
    return row("rtt_echo", 16, times);
  }

  function toCsv(rows) {
    var lines = [COLUMNS.join(",")];
    rows.forEach(function (r) {
      lines.push(COLUMNS.map(function (c) {
        var v = r[c];
        return typeof v === "number" && c !== "size_bytes" && c !== "samples" ? v.toFixed(4) : String(v);
      }).join(","));
    });
    return lines.join("\n") + "\n";
  }

  return { SIZES: SIZES, COLUMNS: COLUMNS, benchCrypto: benchCrypto, benchRtt: benchRtt, toCsv: toCsv };
});
