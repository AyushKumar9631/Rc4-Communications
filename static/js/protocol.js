/*
 * Message protocol (educational): per-message HKDF key + RC4 + HMAC (encrypt-then-MAC).
 *
 * master  = PBKDF2-HMAC-SHA256(secret, salt = "rc4-chat-v1|" + room)        (once per join)
 * keys    = HKDF-SHA256(ikm = master, salt = nonce, info = "rc4-chat-v1", 64 bytes)
 *           encKey = keys[0..32), macKey = keys[32..64)
 * ct      = RC4(encKey, utf8(plaintext))
 * mac     = HMAC-SHA256(macKey, "rc4-chat-v1\0" room "\0" sender "\0" nonce ct)
 * wire    = { nonce, ciphertext, mac }  (Base64)
 *
 * Receiver verifies the MAC (constant time) BEFORE running RC4. Needs WebCrypto
 * (HTTPS or localhost in browsers; built in on Node 20+).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./crypto.js"));
  } else {
    root.ChatProtocol = factory(root.RC4Lib);
  }
})(typeof self !== "undefined" ? self : this, function (RC4) {
  "use strict";

  var VERSION = "rc4-chat-v1";
  var NONCE_BYTES = 16;
  var MAC_BYTES = 32;
  var MASTER_BYTES = 32;
  var ENC_KEY_BYTES = 32;
  var MAC_KEY_BYTES = 32;
  var PBKDF2_ITERATIONS = 600000;
  var KEYSTREAM_PREVIEW = 16;

  function subtle() {
    var c = globalThis.crypto;
    if (!c || !c.subtle) {
      throw new Error("WebCrypto unavailable (use HTTPS or localhost)");
    }
    return c.subtle;
  }

  function randomBytes(n) {
    var out = new Uint8Array(n);
    globalThis.crypto.getRandomValues(out);
    return out;
  }

  function concat(parts) {
    var total = 0, i, off = 0;
    for (i = 0; i < parts.length; i++) total += parts[i].length;
    var out = new Uint8Array(total);
    for (i = 0; i < parts.length; i++) { out.set(parts[i], off); off += parts[i].length; }
    return out;
  }

  async function deriveMaster(secret, room, iterations) {
    if (typeof secret !== "string" || secret.length === 0) throw new Error("Secret required");
    var key = await subtle().importKey("raw", RC4.utf8Encode(secret), "PBKDF2", false, ["deriveBits"]);
    var bits = await subtle().deriveBits({
      name: "PBKDF2", hash: "SHA-256",
      salt: RC4.utf8Encode(VERSION + "|" + room),
      iterations: iterations || PBKDF2_ITERATIONS
    }, key, MASTER_BYTES * 8);
    return new Uint8Array(bits);
  }

  async function deriveMessageKeys(master, nonce) {
    var ikm = await subtle().importKey("raw", master, "HKDF", false, ["deriveBits"]);
    var bits = new Uint8Array(await subtle().deriveBits({
      name: "HKDF", hash: "SHA-256", salt: nonce, info: RC4.utf8Encode(VERSION)
    }, ikm, (ENC_KEY_BYTES + MAC_KEY_BYTES) * 8));
    return { encKey: bits.slice(0, ENC_KEY_BYTES), macKey: bits.slice(ENC_KEY_BYTES) };
  }

  function macInput(room, sender, nonce, ct) {
    return concat([RC4.utf8Encode(VERSION + "\0" + room + "\0" + sender + "\0"), nonce, ct]);
  }

  function hmacKey(macKey) {
    return subtle().importKey("raw", macKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  }

  /**
   * Encrypt `plaintext` for (room, sender).
   * opts.nonce  : fixed nonce (tests only)
   * opts.tamper : flip one ciphertext bit AFTER the MAC is computed (demo of MAC failure)
   * Returns { wire: {nonce, ciphertext, mac}, details }.
   */
  async function encryptMessage(master, room, sender, plaintext, opts) {
    opts = opts || {};
    var pt = RC4.utf8Encode(plaintext);
    if (pt.length === 0) throw new Error("Empty message");
    var nonce = opts.nonce || randomBytes(NONCE_BYTES);
    if (nonce.length !== NONCE_BYTES) throw new Error("Nonce must be " + NONCE_BYTES + " bytes");
    var keys = await deriveMessageKeys(master, nonce);
    var ct = RC4.encrypt(keys.encKey, pt);
    var mac = new Uint8Array(await subtle().sign("HMAC", await hmacKey(keys.macKey),
      macInput(room, sender, nonce, ct)));
    var sentCt = ct;
    if (opts.tamper) { sentCt = ct.slice(); sentCt[0] ^= 1; }
    return {
      wire: {
        nonce: RC4.bytesToBase64(nonce),
        ciphertext: RC4.bytesToBase64(sentCt),
        mac: RC4.bytesToBase64(mac)
      },
      details: {
        nonce: nonce, encKey: keys.encKey, macKey: keys.macKey, plaintext: pt,
        keystream: RC4.keystream(keys.encKey, Math.min(pt.length, KEYSTREAM_PREVIEW)),
        ciphertext: sentCt, mac: mac, macValid: !opts.tamper
      }
    };
  }

  /**
   * Verify then decrypt a wire message. Never throws on bad input.
   * Returns { ok: true, plaintext, details } or { ok: false, reason, details? }
   * reason: "malformed" | "bad_mac" | "bad_utf8"
   */
  async function decryptMessage(master, room, sender, wire) {
    var nonce, ct, mac;
    try {
      nonce = RC4.base64ToBytes(wire.nonce);
      ct = RC4.base64ToBytes(wire.ciphertext);
      mac = RC4.base64ToBytes(wire.mac);
    } catch (e) {
      return { ok: false, reason: "malformed" };
    }
    if (nonce.length !== NONCE_BYTES || mac.length !== MAC_BYTES || ct.length === 0) {
      return { ok: false, reason: "malformed" };
    }
    var keys = await deriveMessageKeys(master, nonce);
    var valid = await subtle().verify("HMAC", await hmacKey(keys.macKey), mac,
      macInput(room, sender, nonce, ct));
    var details = {
      nonce: nonce, encKey: keys.encKey, macKey: keys.macKey, ciphertext: ct, mac: mac,
      macValid: valid
    };
    if (!valid) return { ok: false, reason: "bad_mac", details: details };
    var pt = RC4.decrypt(keys.encKey, ct);
    details.plaintext = pt;
    details.keystream = RC4.keystream(keys.encKey, Math.min(ct.length, KEYSTREAM_PREVIEW));
    try {
      return { ok: true, plaintext: RC4.utf8Decode(pt), details: details };
    } catch (e) {
      return { ok: false, reason: "bad_utf8", details: details };
    }
  }

  /** Session-scoped replay guard: accept(nonceB64) is true only the first time a nonce is seen. */
  function createReplayGuard() {
    var seen = new Set();
    return {
      accept: function (nonceB64) {
        if (seen.has(nonceB64)) return false;
        seen.add(nonceB64);
        return true;
      }
    };
  }

  return {
    VERSION: VERSION,
    NONCE_BYTES: NONCE_BYTES,
    MAC_BYTES: MAC_BYTES,
    PBKDF2_ITERATIONS: PBKDF2_ITERATIONS,
    deriveMaster: deriveMaster,
    deriveMessageKeys: deriveMessageKeys,
    encryptMessage: encryptMessage,
    decryptMessage: decryptMessage,
    createReplayGuard: createReplayGuard
  };
});
