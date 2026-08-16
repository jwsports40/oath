import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveBridgeUrl } from '../nutrition';

afterEach(() => vi.unstubAllGlobals());

describe('resolveBridgeUrl', () => {
  it('prefers an explicit settings URL, trimming trailing slash', () => {
    expect(resolveBridgeUrl('https://my-tunnel.trycloudflare.com/')).toBe(
      'https://my-tunnel.trycloudflare.com',
    );
  });
  it('falls back to the same-host default on http pages when unset', () => {
    vi.stubGlobal('window', { location: { protocol: 'http:', hostname: '192.168.68.52' } });
    expect(resolveBridgeUrl(undefined)).toBe('http://192.168.68.52:4174');
    expect(resolveBridgeUrl('')).toBe('http://192.168.68.52:4174');
    expect(resolveBridgeUrl('   ')).toBe('http://192.168.68.52:4174');
  });
  it('is null on https pages with no explicit URL', () => {
    vi.stubGlobal('window', { location: { protocol: 'https:', hostname: 'x.github.io' } });
    expect(resolveBridgeUrl(undefined)).toBeNull();
  });
});
