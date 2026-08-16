import { describe, expect, it } from 'vitest';
import { mergeDumps, type Dump } from '../sync';

const at = (h: number): string => `2026-08-16T${String(h).padStart(2, '0')}:00:00.000Z`;

function base(): Dump {
  return {
    categories: [], templates: [], instances: [], completions: [], xpEvents: [],
    dailyScores: [], sieges: [], programs: [], exercises: [], sessions: [], prs: [],
    meals: [], hydration: [], kv: [],
  };
}

describe('mergeDumps', () => {
  it('unions append-only event tables by id — nothing is ever lost', () => {
    const local = base(); const remote = base();
    local.completions = [{ id: 'c1', instanceId: 'i1', templateId: 't', date: 'd', at: at(1), xp: 10, crit: false }];
    remote.completions = [{ id: 'c2', instanceId: 'i2', templateId: 't', date: 'd', at: at(2), xp: 10, crit: false }];
    local.xpEvents = [{ id: 'x1', date: 'd', at: at(1), amount: 10, source: 'quest' }];
    remote.xpEvents = [{ id: 'x1', date: 'd', at: at(1), amount: 10, source: 'quest' },
      { id: 'x2', date: 'd', at: at(2), amount: 25, source: 'quest' }];
    const m = mergeDumps(local, remote);
    expect(m.completions).toHaveLength(2);
    expect(m.xpEvents).toHaveLength(2);
  });

  it('dedupes instances by templateId+date, keeps the more-progressed row, remaps completions', () => {
    const local = base(); const remote = base();
    local.instances = [{ id: 'LI', templateId: 'tpl', date: '2026-08-16', name: 'GYM', status: 'todo', progress: 0 }];
    remote.instances = [{ id: 'RI', templateId: 'tpl', date: '2026-08-16', name: 'GYM', status: 'done', progress: 1 }];
    remote.completions = [{ id: 'rc', instanceId: 'RI', templateId: 'tpl', date: '2026-08-16', at: at(3), xp: 50, crit: false }];
    const m = mergeDumps(local, remote);
    expect(m.instances).toHaveLength(1);
    expect((m.instances[0] as { id: string }).id).toBe('RI');
    expect((m.completions[0] as { instanceId: string }).instanceId).toBe('RI');
  });

  it('remaps the losing side completion onto the winning instance id', () => {
    const local = base(); const remote = base();
    local.instances = [{ id: 'LI', templateId: 'tpl', date: 'd', name: 'X', status: 'done', progress: 1 }];
    local.completions = [{ id: 'lc', instanceId: 'LI', templateId: 'tpl', date: 'd', at: at(1), xp: 10, crit: false }];
    remote.instances = [{ id: 'RI', templateId: 'tpl', date: 'd', name: 'X', status: 'todo', progress: 0 }];
    const m = mergeDumps(local, remote);
    expect((m.instances[0] as { id: string }).id).toBe('LI');
    expect((m.completions[0] as { instanceId: string }).instanceId).toBe('LI');
  });

  it('keeps device-specific kv keys local (settings, aiQueue)', () => {
    const local = base(); const remote = base();
    local.kv = [{ key: 'settings', value: { sound: true, bridgeUrl: 'local' } }];
    remote.kv = [{ key: 'settings', value: { sound: false, bridgeUrl: 'remote' } },
      { key: 'aiQueue', value: [{ mealId: 'm', utterance: 'u' }] }];
    const m = mergeDumps(local, remote);
    const kv = Object.fromEntries((m.kv as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
    expect((kv.settings as { bridgeUrl: string }).bridgeUrl).toBe('local');
    expect(kv.aiQueue).toBeUndefined();
  });

  it('merges achievements by max progress, fragments by max, seedDay by earliest', () => {
    const local = base(); const remote = base();
    local.kv = [
      { key: 'achievements', value: [{ id: 'a', progress: 3 }] },
      { key: 'fragments', value: 1 }, { key: 'seedDay', value: '2026-08-16' },
    ];
    remote.kv = [
      { key: 'achievements', value: [{ id: 'a', progress: 5, unlockedAt: at(1) }, { id: 'b', progress: 1 }] },
      { key: 'fragments', value: 2 }, { key: 'seedDay', value: '2026-08-10' },
    ];
    const m = mergeDumps(local, remote);
    const kv = Object.fromEntries((m.kv as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
    const ach = kv.achievements as { id: string; progress: number; unlockedAt?: string }[];
    expect(ach.find((a) => a.id === 'a')?.progress).toBe(5);
    expect(ach.find((a) => a.id === 'a')?.unlockedAt).toBe(at(1));
    expect(ach).toHaveLength(2);
    expect(kv.fragments).toBe(2);
    expect(kv.seedDay).toBe('2026-08-10');
  });

  it('on template id collision prefers the side with more recent activity', () => {
    const local = base(); const remote = base();
    local.templates = [{ id: 't', name: 'OLD NAME' }];
    local.completions = [{ id: 'lc', instanceId: 'a', templateId: 't', date: 'd', at: at(1), xp: 1, crit: false }];
    remote.templates = [{ id: 't', name: 'NEW NAME' }];
    remote.completions = [{ id: 'rc', instanceId: 'b', templateId: 't', date: 'd', at: at(9), xp: 1, crit: false }];
    const m = mergeDumps(local, remote);
    expect((m.templates[0] as { name: string }).name).toBe('NEW NAME');
  });
});
