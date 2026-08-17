import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { db, kvGet, kvSet } from '../db';
import { seedIfEmpty } from '../seed';
import { completeInstance, ensureDay, ensureSiege, uncompleteInstance } from '../lifecycle';
import { dayKey } from '../../core/dates';
import type { SiegeState, XPEvent } from '../../core/types';

const today = dayKey(new Date());

async function routineInstance() {
  const rows = await db.instances.where('date').equals(today).toArray();
  return rows.find((r) => r.name === 'MORNING ROUTINE')!;
}

describe('siege damage reverts on uncomplete (toggle exploit)', () => {
  beforeAll(async () => {
    await db.delete();
    await db.open();
    await seedIfEmpty();
    await ensureDay(today);
    await ensureSiege(today);
  });

  it('toggling a quest never accumulates damage', async () => {
    const siege0 = (await db.sieges.toArray())[0]!;
    const inst = await routineInstance();
    for (let i = 0; i < 5; i++) {
      await completeInstance(inst.id, new Date().toISOString());
      await uncompleteInstance(inst.id);
    }
    const after = (await db.sieges.get(siege0.weekStart))!;
    expect(after.hp).toBe(siege0.hp);
    expect(after.log).toHaveLength(0);
    expect(after.killed).toBe(false);
  });

  it('a kill achieved by the last completion is reverted when unchecked', async () => {
    const siege = (await db.sieges.toArray())[0]!;
    // Weaken the boss so one routine completion kills it.
    await db.sieges.put({ ...siege, hp: 5 });
    const inst = await routineInstance();
    const res = await completeInstance(inst.id, new Date().toISOString());
    expect(res.siegeKilled).toBe(true);
    expect((await kvGet<number>('fragments', 0))).toBe(1);
    const killEvents = (await db.xpEvents.toArray())
      .filter((e: XPEvent) => e.source === 'siegeKill');
    expect(killEvents).toHaveLength(1);

    await uncompleteInstance(inst.id);
    const after = (await db.sieges.get(siege.weekStart))!;
    expect(after.killed).toBe(false);
    expect(after.hp).toBe(5);
    expect((await db.xpEvents.toArray()).filter((e: XPEvent) => e.source === 'siegeKill')).toHaveLength(0);
    expect((await kvGet<number>('fragments', 0))).toBe(0);
    void kvSet; void ensureSiege;
  });

  it('reversal matches by label even when perk multipliers changed the amount', async () => {
    const weekStart = (await db.sieges.toArray())[0]!.weekStart;
    const fresh = (await db.sieges.get(weekStart))!;
    await db.sieges.put({ ...fresh, hp: fresh.maxHp, killed: false, overkill: 0 });
    const siege = (await db.sieges.get(weekStart))!;
    const inst = await routineInstance();
    await completeInstance(inst.id, new Date().toISOString());
    const struck = (await db.sieges.get(siege.weekStart))!;
    const dealt = struck.log[struck.log.length - 1]!.amount;
    expect(struck.hp).toBe(siege.hp - dealt);
    await uncompleteInstance(inst.id);
    const after = (await db.sieges.get(siege.weekStart))!;
    expect(after.hp).toBe(siege.hp);
  });
});

void (ensureSiege as unknown);
declare const _unused: SiegeState | undefined;
