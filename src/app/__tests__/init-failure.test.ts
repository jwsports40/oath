import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Force the first seed to fail so we can observe init error handling.
vi.mock('../../data/seed', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../data/seed')>();
  let calls = 0;
  return {
    ...mod,
    seedIfEmpty: vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('boom: storage unavailable');
      return mod.seedIfEmpty();
    }),
  };
});

describe('init failure resilience', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('surfaces the error instead of hanging on LOADING, and can retry', async () => {
    const { useOath } = await import('../store');

    await useOath.getState().init();
    expect(useOath.getState().ready).toBe(false);
    expect(useOath.getState().initError).toContain('boom');

    // Retry must actually re-run init (promise must not be poisoned-cached).
    await useOath.getState().init();
    expect(useOath.getState().initError).toBeNull();
    expect(useOath.getState().ready).toBe(true);
  });
});
