import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { seedIfEmpty } from '../seed';
import { ensureDay, ensureSiege, rerollCurrentBoss } from '../lifecycle';
import { dayKey, weekStartOf } from '../../core/dates';
import { villainByKey } from '../../game/villains';

const today = dayKey(new Date());
const weekStart = weekStartOf(today);

describe('rerollCurrentBoss (migration m3)', () => {
  beforeAll(async () => {
    await db.delete();
    await db.open();
    await seedIfEmpty();
    await ensureDay(today);
    await ensureSiege(today);
  });

  it('swaps to the band partner, fresh at full knight-scaled HP', async () => {
    const before = (await db.sieges.get(weekStart))!;
    await rerollCurrentBoss(today);
    const after = (await db.sieges.get(weekStart))!;

    expect(after.villainKey).not.toBe(before.villainKey);
    const v = villainByKey(after.villainKey!)!;
    expect(v.band).toBe(villainByKey(before.villainKey!)!.band);
    expect(after.name).toBe(v.name);
    expect(after.generation).toBe(0);
    expect(after.hp).toBe(after.maxHp);
    expect(after.log).toHaveLength(0);
    expect(after.killed).toBe(false);
    // Knight-scaled strikes survive the reroll (fresh 100-HP knight: 20 / 30).
    expect(after.strikeDmg).toBe(20);
    expect(after.sigDmg).toBe(30);
  });

  it('is idempotent in effect: rerolling again flips back within the same pair', async () => {
    const a = (await db.sieges.get(weekStart))!.villainKey;
    await rerollCurrentBoss(today);
    const b = (await db.sieges.get(weekStart))!.villainKey;
    expect(b).not.toBe(a);
    expect(villainByKey(b!)!.band).toBe(villainByKey(a!)!.band);
  });
});
