import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId } from '../ids';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('produces v4-shaped unique ids with native randomUUID', () => {
    const a = newId();
    expect(a).toMatch(UUID_RE);
    expect(newId()).not.toBe(a);
  });

  it('works in insecure contexts where crypto.randomUUID is missing', () => {
    // http:// over LAN strips randomUUID but keeps getRandomValues.
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array<ArrayBuffer>) => real.getRandomValues(arr),
    });
    const a = newId();
    expect(a).toMatch(UUID_RE);
    expect(newId()).not.toBe(a);
  });
});
