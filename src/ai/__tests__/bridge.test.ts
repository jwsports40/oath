import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EstimateFailedError, bridgeAvailable, defaultBridgeUrl, estimateViaBridge,
  type NutritionRequest,
} from '../nutrition';

const REQ: NutritionRequest = {
  utterance: '10 oz chicken', units: 'imperial', localDate: '2026-08-16', knownCorrections: [],
};
const GOOD = {
  entries: [{ food: 'Chicken breast', quantity: 10, unit: 'oz', calories: 468, protein_g: 88,
    carbs_g: 0, fat_g: 10, confidence: 0.9, assumptions: [] }],
  needs_clarification: [],
};

afterEach(() => vi.unstubAllGlobals());

describe('defaultBridgeUrl', () => {
  it('is null outside a browser', () => {
    expect(defaultBridgeUrl()).toBeNull();
  });
  it('targets port 4174 on the serving host for http pages', () => {
    vi.stubGlobal('window', { location: { protocol: 'http:', hostname: '192.168.68.52' } });
    expect(defaultBridgeUrl()).toBe('http://192.168.68.52:4174');
  });
  it('is null on https pages (mixed content would be blocked)', () => {
    vi.stubGlobal('window', { location: { protocol: 'https:', hostname: 'example.github.io' } });
    expect(defaultBridgeUrl()).toBeNull();
  });
});

describe('estimateViaBridge', () => {
  it('POSTs the request and returns the parsed response', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(GOOD), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await estimateViaBridge(REQ, 'http://localhost:4174');
    expect(res.entries[0]?.protein_g).toBe(88);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('http://localhost:4174/scribe');
    expect(JSON.parse(call[1].body as string)).toEqual(REQ);
  });
  it('treats HTTP 422 as terminal (EstimateFailedError)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad output', { status: 422 })));
    await expect(estimateViaBridge(REQ, 'http://x')).rejects.toBeInstanceOf(EstimateFailedError);
  });
  it('treats other failures as transient (plain Error)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    const err = await estimateViaBridge(REQ, 'http://x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(EstimateFailedError);
  });
});

describe('bridgeAvailable', () => {
  it('true when /health responds ok, false on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', { status: 200 })));
    expect(await bridgeAvailable('http://x')).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('refused'); }));
    expect(await bridgeAvailable('http://x')).toBe(false);
  });
});
