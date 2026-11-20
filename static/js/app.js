/* Chat UI: join, encrypt-then-MAC send, verify-then-decrypt receive, inspector. */
(function () {
  "use strict";

  var RC4 = window.RC4Lib;
  var Proto = window.ChatProtocol;
  var MAX_PLAINTEXT_BYTES = 4096;
  var MAX_ENTRIES = 200;

  var $ = function (id) { return document.getElementById(id); };
  var state = null; // { room, username, master, members, replay, entries }

  function setStatus(text, on) {
    var el = $("status");
    el.textContent = text;
    el.classList.toggle("on", !!on);
  }

  if (typeof io !== "function" || !RC4 || !Proto) {
    setStatus("failed to load scripts");
    return;
  }
  if (!(window.crypto && window.crypto.subtle)) {
    setStatus("WebCrypto unavailable");
    $("joinError").textContent = "WebCrypto needs HTTPS or localhost. Open http://127.0.0.1:5000.";
    return;
  }

  var socket = io();

  // ---- view helpers -----------------------------------------------------

  function showJoin(message) {
    state = null;
    $("chatView").hidden = true;
    $("joinView").hidden = false;
    $("messages").textContent = "";
    $("members").textContent = "";
    clearInspector();
    $("secret").value = "";
    $("joinError").textContent = message || "";
    $("joinBtn").disabled = !socket.connected;
  }

  function showChat() {
    $("joinView").hidden = true;
    $("chatView").hidden = false;
    $("roomTitle").textContent = "#" + state.room + " as " + state.username;
    renderMembers();
    $("msgInput").focus();
  }

  function renderMembers() {
    $("members").textContent = state.members.join(", ");
  }

  function timeText(ts) {
    return new Date(ts).toLocaleTimeString();
  }

  function addItem(cls, text, meta) {
    var li = document.createElement("li");
    li.className = "msg " + cls;
    if (meta) {
      var m = document.createElement("div");
      m.className = "meta";
      meta(m);
      li.appendChild(m);
    }
    var body = document.createElement("div");
    body.textContent = text;
    li.appendChild(body);
    var list = $("messages");
    list.appendChild(li);
    while (list.children.length > MAX_ENTRIES) {
      var first = list.firstChild;
      if (first.dataset && first.dataset.id) state.entries.delete(first.dataset.id);
      list.removeChild(first);
    }
    list.scrollTop = list.scrollHeight;
    return li;
  }

  function sysMessage(text) { addItem("sys", text); }

  function addMessage(entry) {
    var cls = (entry.own ? "own " : "") + (entry.ok ? "" : "bad");
    var li = addItem(cls, entry.ok ? entry.text : entry.error, function (m) {
      var who = document.createElement("span");
      who.textContent = entry.sender + " · " + timeText(entry.ts) +
        (entry.ok ? " · authenticated" : "");
      m.appendChild(who);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Inspect";
      btn.onclick = function () { inspect(entry.id, li); };
      m.appendChild(btn);
    });
    li.dataset.id = entry.id;
    state.entries.set(entry.id, entry);
  }

  // ---- inspector --------------------------------------------------------

  function clearInspector() {
    $("inspector").hidden = true;
    $("inspector").textContent = "";
    $("inspectorEmpty").hidden = false;
  }

  function field(dl, label, value, cls) {
    var dt = document.createElement("dt");
    dt.textContent = label;
    var dd = document.createElement("dd");
    dd.textContent = value;
    if (cls) dd.className = cls;
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  function inspect(id, li) {
    var e = state && state.entries.get(id);
    if (!e) return;
    var prev = document.querySelector(".msg.selected");
    if (prev) prev.classList.remove("selected");
    li.classList.add("selected");
    var d = e.details, hex = RC4.bytesToHex, dl = $("inspector");
    dl.textContent = "";
    field(dl, "Direction", (e.own ? "sent by you" : "received from " + e.sender) +
      " at " + timeText(e.ts));
    if (d) {
      field(dl, "MAC check (HMAC-SHA256, before decrypting)",
        d.macValid ? "VALID" : "INVALID – message rejected, RC4 never run",
        d.macValid ? "good" : "bad");
      field(dl, "Nonce (random, 16 bytes, public)", hex(d.nonce));
      field(dl, "Per-message RC4 key (HKDF, 32 bytes; shown for teaching only)", hex(d.encKey));
      if (d.plaintext) {
        field(dl, "Plaintext bytes (UTF-8, hex)", hex(d.plaintext));
        field(dl, "Keystream (first " + d.keystream.length + " bytes)", hex(d.keystream));
      }
      field(dl, "Ciphertext (hex, " + d.ciphertext.length + " bytes)", hex(d.ciphertext));
      field(dl, "MAC (hex, 32 bytes)", hex(d.mac));
    }
    field(dl, "What the server relays (it has no key)", JSON.stringify(e.relayed, null, 1));
    $("inspectorEmpty").hidden = true;
    dl.hidden = false;
  }

  // ---- socket events ----------------------------------------------------

  socket.on("connect", function () {
    setStatus("connected", true);
    $("joinBtn").disabled = false;
  });
  socket.on("disconnect", function () {
    setStatus("disconnected");
    $("joinBtn").disabled = true;
    if (state) showJoin("Connection lost. Enter your details to rejoin.");
  });
  socket.on("connect_error", function () { setStatus("connection error"); });

  socket.on("user_joined", function (d) {
    if (!state) return;
    state.members = d.members;
    renderMembers();
    sysMessage(d.username + " joined");
  });
  socket.on("user_left", function (d) {
    if (!state) return;
    state.members = d.members;
    renderMembers();
    sysMessage(d.username + " left");
  });

  socket.on("encrypted_message", async function (msg) {
    var st = state;
    if (!st || !msg || msg.room !== st.room) return;
    var res = await Proto.decryptMessage(st.master, st.room, msg.sender, msg);
    if (state !== st) return; // left or rejoined meanwhile
    var entry = { id: msg.id, own: false, sender: msg.sender, ts: msg.ts, details: res.details,
      relayed: msg, ok: res.ok };
    if (res.ok && !st.replay.accept(msg.nonce)) {
      entry.ok = false;
      entry.error = "Replayed message dropped (nonce already seen).";
    } else if (res.ok) {
      entry.text = res.plaintext;
    } else {
      entry.error = ({
        bad_mac: "Message failed authentication (wrong secret or tampered). Not decrypted.",
        malformed: "Malformed message dropped.",
        bad_utf8: "Message decrypted to invalid text and was dropped."
      })[res.reason] || "Message rejected.";
    }
    addMessage(entry);
  });

  // ---- actions ----------------------------------------------------------

  $("joinForm").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var username = $("username").value.trim();
    var room = $("room").value.trim();
    var secret = $("secret").value;
    var err = $("joinError");
    err.textContent = "";
    if (secret.length < 8) { err.textContent = "Secret must be at least 8 characters."; return; }
    $("joinBtn").disabled = true;
    var master;
    try {
      err.textContent = "Deriving key...";
      master = await Proto.deriveMaster(secret, room);
      err.textContent = "";
    } catch (e) {
      err.textContent = "Key derivation failed: " + e.message;
      $("joinBtn").disabled = !socket.connected;
      return;
    }
    socket.emit("join", { room: room, username: username }, function (res) {
      if (!res || !res.ok) {
        err.textContent = (res && res.message) || "Join failed.";
        $("joinBtn").disabled = !socket.connected;
        return;
      }
      state = { room: res.room, username: res.username, master: master, members: res.members,
        replay: Proto.createReplayGuard(), entries: new Map() };
      $("secret").value = "";
      showChat();
      sysMessage("Joined. Messages are encrypted in your browser.");
    });
  });

  $("leaveBtn").onclick = function () {
    socket.emit("leave", {}, function () { showJoin(); });
  };

  $("sendForm").addEventListener("submit", async function (ev) {
    ev.preventDefault();
    var st = state, input = $("msgInput"), text = input.value;
    if (!st || !text.trim()) return;
    if (RC4.utf8Encode(text).length > MAX_PLAINTEXT_BYTES) {
      sysMessage("Message too long (max " + MAX_PLAINTEXT_BYTES + " bytes).");
      return;
    }
    $("sendBtn").disabled = true;
    try {
      var out = await Proto.encryptMessage(st.master, st.room, st.username, text,
        { tamper: $("tamper").checked });
      var payload = { room: st.room, nonce: out.wire.nonce, ciphertext: out.wire.ciphertext,
        mac: out.wire.mac };
      socket.emit("encrypted_message", payload, function (res) {
        $("sendBtn").disabled = false;
        if (state !== st) return;
        if (!res || !res.ok) { sysMessage("Send failed: " + ((res && res.message) || "no response")); return; }
        input.value = "";
        input.focus();
        addMessage({ id: res.id, own: true, ok: true, sender: st.username, ts: res.ts, text: text,
          details: out.details,
          relayed: { id: res.id, room: st.room, sender: st.username, nonce: payload.nonce,
            ciphertext: payload.ciphertext, mac: payload.mac, ts: res.ts } });
      });
    } catch (e) {
      $("sendBtn").disabled = false;
      sysMessage("Encryption failed: " + e.message);
    }
  });
})();
