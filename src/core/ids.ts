// core/ids.ts
// crypto.randomUUID only exists in secure contexts (https / localhost). The app is
// also served over plain http on the LAN (e.g. http://192.168.x.x:4173), so fall
// back to building a v4 UUID from getRandomValues, which works everywhere.
export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c !== undefined && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c !== undefined && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10xx
  const h = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
