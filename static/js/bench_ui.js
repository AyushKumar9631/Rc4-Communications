/* Benchmark panel: crypto timing, echo RTT (own throwaway connection), CSV download. */
(function () {
  "use strict";
  var B = window.ChatBench;
  var $ = function (id) { return document.getElementById(id); };
  if (!B || typeof io !== "function" || !(window.crypto && window.crypto.subtle)) {
    $("benchPanel").hidden = true;
    return;
  }
  var rows = null;

  function measureRtt(n) {
    return new Promise(function (resolve, reject) {
      var s = io({ forceNew: true, reconnection: false });
      var timer = setTimeout(function () { s.close(); reject(new Error("timeout")); }, 30000);
      s.on("connect_error", function () { clearTimeout(timer); s.close(); reject(new Error("connection error")); });
      s.on("connect", function () {
        B.benchRtt(s, n).then(resolve, reject).finally(function () { clearTimeout(timer); s.close(); });
      });
    });
  }

  function text(list) {
    return list.map(function (r) {
      return [r.operation.padEnd(20), String(r.size_bytes).padStart(5) + " B",
        r.median_ms.toFixed(4).padStart(10) + " ms (median of " + r.samples + ")"].join(" ");
    }).join("\n");
  }

  $("benchRun").onclick = async function () {
    var out = $("benchOut");
    $("benchRun").disabled = true;
    $("benchCsv").disabled = true;
    out.textContent = "Running (a few seconds)...";
    try {
      rows = await B.benchCrypto();
      out.textContent = text(rows) + "\nMeasuring server round trip...";
      var note = "";
      try { rows.push(await measureRtt(20)); }
      catch (e) { note = "\nRTT skipped: " + e.message; }
      out.textContent = text(rows) + note;
      $("benchCsv").disabled = false;
    } catch (e) {
      out.textContent = "Benchmark failed: " + e.message;
    }
    $("benchRun").disabled = false;
  };

  $("benchCsv").onclick = function () {
    if (!rows) return;
    var url = URL.createObjectURL(new Blob([B.toCsv(rows)], { type: "text/csv" }));
    var a = document.createElement("a");
    a.href = url;
    a.download = "benchmark_" + new Date().toISOString().replace(/[:.]/g, "-") + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  };
})();
