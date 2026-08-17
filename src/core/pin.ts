// core/pin.ts — 4-digit PIN login. The hash doubles as the sync profile id:
// the same PIN on any device keys the same save on the bridge. This is a
// privacy latch for a personal app, not bank-grade security — hashing is a
// deliberately simple pure-JS FNV construction so it works on http LAN
// origins where crypto.subtle is unavailable.

export function validPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function hashPin(pin: string): string {
  const seed = `oath-pin:${pin}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let round = 0; round < 5000; round++) {
    for (let i = 0; i < seed.length; i++) {
      h1 ^= seed.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193) >>> 0;
    }
    h1 = (h1 ^ round) >>> 0;
    h2 = Math.imul(h2 ^ h1, 0x85ebca6b) >>> 0;
    h2 = ((h2 << 13) | (h2 >>> 19)) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
