/*
 * RC4 (educational) + encoding helpers.
 *
 * Works in the browser (exposes window.RC4Lib) and in Node (module.exports).
 * RC4 is cryptographically obsolete; this is a teaching implementation.
 *
 * KSA : shuffle a 256-byte state array using the key.
 * PRGA: keep shuffling and emit keystream bytes.
 * Encrypt/decrypt: XOR data with the keystream (same operation both ways).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.RC4Lib = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MIN_KEY_BYTES = 1;
  var MAX_KEY_BYTES = 256;

  function checkKey(key) {
    if (!(key instanceof Uint8Array)) {
      throw new TypeError("RC4 key must be a Uint8Array");
    }
    if (key.length < MIN_KEY_BYTES || key.length > MAX_KEY_BYTES) {
      throw new RangeError(
        "RC4 key must be " + MIN_KEY_BYTES + "-" + MAX_KEY_BYTES +
        " bytes, got " + key.length
      );
    }
  }

  /** Key Scheduling Algorithm. Returns the permuted state S (Uint8Array(256)). */
  function ksa(key) {
    checkKey(key);
    var s = new Uint8Array(256);
    var i, j = 0, t;
    for (i = 0; i < 256; i++) s[i] = i;
    for (i = 0; i < 256; i++) {
      j = (j + s[i] + key[i % key.length]) & 255;
      t = s[i]; s[i] = s[j]; s[j] = t;
    }
    return s;
  }

  /** PRGA: returns a function that yields the next keystream byte on each call. */
  function prga(s) {
    var i = 0, j = 0;
    return function nextByte() {
      i = (i + 1) & 255;
      j = (j + s[i]) & 255;
      var t = s[i]; s[i] = s[j]; s[j] = t;
      return s[(s[i] + s[j]) & 255];
    };
  }

  /** First `length` keystream bytes for `key`. */
  function keystream(key, length) {
    var next = prga(ksa(key));
    var out = new Uint8Array(length);
    for (var n = 0; n < length; n++) out[n] = next();
    return out;
  }

  /** XOR data with the RC4 keystream (encrypts and decrypts alike). */
  function rc4Crypt(key, data) {
    if (!(data instanceof Uint8Array)) {
      throw new TypeError("data must be a Uint8Array");
    }
    var next = prga(ksa(key));
    var out = new Uint8Array(data.length);
    for (var n = 0; n < data.length; n++) out[n] = data[n] ^ next();
    return out;
  }

  var encrypt = rc4Crypt;
  var decrypt = rc4Crypt;

  // ---- Encoding helpers -------------------------------------------------

  function utf8Encode(text) {
    return new TextEncoder().encode(text);
  }

  function utf8Decode(bytes) {
    // fatal:true makes invalid UTF-8 throw instead of silently inserting U+FFFD
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }

  function bytesToHex(bytes) {
    var hex = "";
    for (var n = 0; n < bytes.length; n++) {
      hex += (bytes[n] < 16 ? "0" : "") + bytes[n].toString(16);
    }
    return hex;
  }

  function hexToBytes(hex) {
    if (typeof hex !== "string" || hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
      throw new Error("Invalid hex string");
    }
    var out = new Uint8Array(hex.length / 2);
    for (var n = 0; n < out.length; n++) {
      out[n] = parseInt(hex.substr(n * 2, 2), 16);
    }
    return out;
  }

  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  /** Standard Base64 with '=' padding (pure JS, no btoa/Buffer dependency). */
  function bytesToBase64(bytes) {
    var out = "", n, b0, b1, b2;
    for (n = 0; n + 2 < bytes.length; n += 3) {
      b0 = bytes[n]; b1 = bytes[n + 1]; b2 = bytes[n + 2];
      out += B64[b0 >> 2] + B64[((b0 & 3) << 4) | (b1 >> 4)] +
             B64[((b1 & 15) << 2) | (b2 >> 6)] + B64[b2 & 63];
    }
    var rem = bytes.length - n;
    if (rem === 1) {
      b0 = bytes[n];
      out += B64[b0 >> 2] + B64[(b0 & 3) << 4] + "==";
    } else if (rem === 2) {
      b0 = bytes[n]; b1 = bytes[n + 1];
      out += B64[b0 >> 2] + B64[((b0 & 3) << 4) | (b1 >> 4)] + B64[(b1 & 15) << 2] + "=";
    }
    return out;
  }

  /** Strict Base64 decode; throws on invalid characters or padding. */
  function base64ToBytes(text) {
    if (typeof text !== "string" || text.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
      throw new Error("Invalid Base64 string");
    }
    var pad = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
    var out = new Uint8Array((text.length / 4) * 3 - pad);
    var o = 0, n, c0, c1, c2, c3;
    for (n = 0; n < text.length; n += 4) {
      c0 = B64.indexOf(text[n]);
      c1 = B64.indexOf(text[n + 1]);
      c2 = text[n + 2] === "=" ? 0 : B64.indexOf(text[n + 2]);
      c3 = text[n + 3] === "=" ? 0 : B64.indexOf(text[n + 3]);
      if (o < out.length) out[o++] = (c0 << 2) | (c1 >> 4);
      if (o < out.length) out[o++] = ((c1 & 15) << 4) | (c2 >> 2);
      if (o < out.length) out[o++] = ((c2 & 3) << 6) | c3;
    }
    return out;
  }

  /** UTF-8 encode, RC4 encrypt, Base64 encode (network-ready form). */
  function encryptText(key, text) {
    return bytesToBase64(encrypt(key, utf8Encode(text)));
  }

  /** Base64 decode, RC4 decrypt, UTF-8 decode. */
  function decryptText(key, b64) {
    return utf8Decode(decrypt(key, base64ToBytes(b64)));
  }

  return {
    ksa: ksa,
    prga: prga,
    keystream: keystream,
    rc4Crypt: rc4Crypt,
    encrypt: encrypt,
    decrypt: decrypt,
    utf8Encode: utf8Encode,
    utf8Decode: utf8Decode,
    bytesToHex: bytesToHex,
    hexToBytes: hexToBytes,
    bytesToBase64: bytesToBase64,
    base64ToBytes: base64ToBytes,
    encryptText: encryptText,
    decryptText: decryptText
  };
});
