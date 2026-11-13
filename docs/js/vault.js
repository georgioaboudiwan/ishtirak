window.Vault = (() => {
  'use strict';

  const te = new TextEncoder();
  const td = new TextDecoder();
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const cache = new Map();

  function b64(buf) {
    const u = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function unb64(str) {
    let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  function rand(n) { return crypto.getRandomValues(new Uint8Array(n)); }

  async function aes(keyB64) {
    if (!cache.has(keyB64)) {
      cache.set(keyB64, await crypto.subtle.importKey('raw', unb64(keyB64), 'AES-GCM', false, ['encrypt', 'decrypt']));
    }
    return cache.get(keyB64);
  }

  async function encWith(key, obj) {
    const iv = rand(12);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
    return `v1.${b64(iv)}.${b64(ct)}`;
  }

  async function decWith(key, str) {
    try {
      const parts = String(str).split('.');
      if (parts.length !== 3 || parts[0] !== 'v1') return null;
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(parts[1]) }, key, unb64(parts[2]));
      return JSON.parse(td.decode(pt));
    } catch { return null; }
  }

  async function derive(secret, saltB64) {
    const base = await crypto.subtle.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: unb64(saltB64), iterations: 310000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  const curve = { name: 'ECDH', namedCurve: 'P-256' };

  function slimPub(jwk) { return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }; }

  async function sharedKey(privKey, pubJwk) {
    const pub = await crypto.subtle.importKey('jwk', pubJwk, curve, false, []);
    return crypto.subtle.deriveKey({ name: 'ECDH', public: pub }, privKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  return {
    genKey() { return b64(rand(32)); },
    genSalt() { return b64(rand(16)); },
    code(n) {
      const bytes = rand(n);
      let s = '';
      for (let i = 0; i < n; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
      return s;
    },
    async enc(keyB64, obj) { return encWith(await aes(keyB64), obj); },
    async dec(keyB64, str) { return keyB64 && str ? decWith(await aes(keyB64), str) : null; },
    // Binary files (meter photos): 1 version byte + 12-byte IV + AES-GCM ciphertext.
    async encBytes(keyB64, bytes) {
      const iv = rand(12);
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(keyB64), bytes));
      const out = new Uint8Array(13 + ct.length);
      out[0] = 1; out.set(iv, 1); out.set(ct, 13);
      return out;
    },
    async decBytes(keyB64, buf) {
      try {
        const u = new Uint8Array(buf);
        if (u[0] !== 1 || u.length < 30) return null;
        return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(1, 13) }, await aes(keyB64), u.slice(13)));
      } catch { return null; }
    },
    async wrap(secret, salt, keyB64) { return encWith(await derive(secret, salt), { k: keyB64 }); },
    async unwrap(secret, salt, str) {
      const o = await decWith(await derive(secret, salt), str);
      return o && o.k ? o.k : null;
    },
    async genPair() {
      const pair = await crypto.subtle.generateKey(curve, true, ['deriveKey']);
      const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
      const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
      return { pub: JSON.stringify(slimPub(pub)), priv: JSON.stringify(priv) };
    },
    async seal(pubStr, obj) {
      const eph = await crypto.subtle.generateKey(curve, true, ['deriveKey']);
      const key = await sharedKey(eph.privateKey, JSON.parse(pubStr));
      const e = slimPub(await crypto.subtle.exportKey('jwk', eph.publicKey));
      return JSON.stringify({ e, c: await encWith(key, obj) });
    },
    async open(privStr, sealedStr) {
      try {
        const sealed = JSON.parse(sealedStr);
        const priv = await crypto.subtle.importKey('jwk', JSON.parse(privStr), curve, false, ['deriveKey']);
        return decWith(await sharedKey(priv, sealed.e), sealed.c);
      } catch { return null; }
    }
  };
})();
