import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { db, kvGet, kvSet } from '../db';
import { seedIfEmpty } from '../seed';
import {
  ensureDay, ensureSiege, completeInstance, uncompleteInstance, setQuantityProgress,
  editPastDay, recomputeDerived, weekAvailableXp,
} from '../lifecycle';
import type { Achievement, Character, QuestInstance, SiegeState, Unlock } from '../../core/types';

/** Wipe the database, re-seed, and pin seedDay/createdAt so tests are machine-date independent. */
async function resetDb(startDay: string): Promise<void> {
  await db.delete();
  await db.open();
  await seedIfEmpty();
  await kvSet('seedDay', startDay);
  const templates = await db.templates.toArray();
  await db.templates.bulkPut(templates.map((t) => ({ ...t, createdAt: '2026-08-01T12:00:00.000Z' })));
}

async function instanceByName(date: string, name: string): Promise<QuestInstance> {
  const instances = await db.instances.where('date').equals(date).toArray();
  const inst = instances.find((i) => i.name === name);
  expect(inst, `${name} instance on ${date}`).toBeDefined();
  return inst!;
}

describe('ensureDay generation + completion + sealing narrative', () => {
  beforeAll(async () => {
    await resetDb('2026-08-17'); // a Monday
  });

  it('materializes Monday instances and is idempotent', async () => {
    await ensureDay('2026-08-17');
    let instances = await db.instances.where('date').equals('2026-08-17').toArray();
    expect(instances.map((i) => i.name).sort()).toEqual(['GYM', 'MORNING ROUTINE', 'WATER']);
    const gym = instances.find((i) => i.name === 'GYM')!;
    expect(gym.main).toBe(true);
    expect(gym.optional).toBe(false);
    const water = instances.find((i) => i.name === 'WATER')!;
    expect(water.target).toBe(128);

    await ensureDay('2026-08-17'); // idempotent
    instances = await db.instances.where('date').equals('2026-08-17').toArray();
    expect(instances).toHaveLength(3);
  });

  it('creates the weekly siege from available XP', async () => {
    // week 2026-08-17..23: required daily 35 (routine 10 + water 25) + gym 50 on Mon/Wed/Fri
    expect(await weekAvailableXp('2026-08-17')).toBe(395);
    const siege = await ensureSiege('2026-08-17');
    expect(siege.weekStart).toBe('2026-08-17');
    // Knight-scaled, easy band (level <= 15): 4 full-clear days of projected
    // damage. Seeded week deals GYM 3x75(crit) + ROUTINE 7x10 + WATER 7x25 =
    // 470 -> round10(4*470/7) = 270.
    expect(siege.maxHp).toBe(270);
    expect(siege.hp).toBe(270);
    // Easy-band strikes: ceil(100/6) + VIT 1 = 18; signature 1.5x = 27.
    expect(siege.strikeDmg).toBe(18);
    expect(siege.sigDmg).toBe(27);
    expect(await ensureSiege('2026-08-17')).toEqual(siege); // idempotent
  });

  it('completing GYM awards XP, deals crit siege damage, updates live score', async () => {
    const gym = await instanceByName('2026-08-17', 'GYM');
    const res = await completeInstance(gym.id, '2026-08-17T10:00:00.000Z');
    expect(res.xp).toBe(50); // streak 0 → base
    expect(res.crit).toBe(true);
    expect(res.siegeDamage).toBe(75); // 50 * 1.5
    expect(res.siegeKilled).toBe(false);
    expect(res.score).toBe(54); // 7/13 → 53.85 → 54
    expect(res.newRank).toBe('D');

    const done = await db.instances.get(gym.id);
    expect(done!.status).toBe('done');

    const siege = (await db.sieges.get('2026-08-17'))!;
    expect(siege.hp).toBe(195);
    expect(siege.log).toHaveLength(1);
    expect(siege.log[0]).toMatchObject({ label: 'GYM', amount: 75, crit: true });

    const live = await db.dailyScores.get('2026-08-17');
    expect(live).toMatchObject({ sealed: false, score: 54, rank: 'D' });

    const char = await kvGet<Character | null>('character', null);
    expect(char!.xpTotal).toBe(50);
  });

  it('partial water counts toward live score; hitting target auto-completes', async () => {
    const water = await instanceByName('2026-08-17', 'WATER');
    const partial = await setQuantityProgress(water.id, 64, '2026-08-17T12:00:00.000Z');
    expect(partial).toBeNull();
    expect((await db.instances.get(water.id))!.status).toBe('todo');
    // (7 + 4*0.5)/13 = 69.23 → 69
    expect((await db.dailyScores.get('2026-08-17'))!.score).toBe(69);

    const full = await setQuantityProgress(water.id, 128, '2026-08-17T18:00:00.000Z');
    expect(full).not.toBeNull();
    expect(full!.xp).toBe(25);
    expect(full!.siegeDamage).toBe(25);
    expect(full!.score).toBe(85); // 11/13 → 84.6 → 85
    expect(full!.newRank).toBe('A');
    expect((await db.instances.get(water.id))!.status).toBe('done');
    expect((await db.sieges.get('2026-08-17'))!.hp).toBe(170);
  });

  it('advancing two days seals intermediate days: required fail, optionals do not', async () => {
    const { sealedDays } = await ensureDay('2026-08-19');
    expect(sealedDays.map((d) => d.date)).toEqual(['2026-08-17', '2026-08-18']);
    expect(sealedDays.map((d) => d.score)).toEqual([85, 0]);
    expect(sealedDays.map((d) => d.rank)).toEqual(['A', 'F']);
    expect(sealedDays.every((d) => d.sealed)).toBe(true);

    const routine17 = await instanceByName('2026-08-17', 'MORNING ROUTINE');
    expect(routine17.status).toBe('failed');

    // Tuesday has no GYM (MWF)
    const tue = await db.instances.where('date').equals('2026-08-18').toArray();
    expect(tue.map((i) => i.name).sort()).toEqual(['MORNING ROUTINE', 'WATER']);
    // Wednesday materialized
    const wed = await db.instances.where('date').equals('2026-08-19').toArray();
    expect(wed.map((i) => i.name).sort()).toEqual(['GYM', 'MORNING ROUTINE', 'WATER']);

    // derived state refolded: A then F with no embers
    const streaks = await kvGet<{ overall: number; overallBest: number } | null>('streaks', null);
    expect(streaks!.overall).toBe(0);
    expect(streaks!.overallBest).toBe(1);
    expect(await kvGet<number | null>('vigor', null)).toBe(44); // 50→59→44
  });

  it('editPastDay flips a failed quest to done and raises the recorded score', async () => {
    const before = (await db.dailyScores.get('2026-08-17'))!;
    const routine17 = await instanceByName('2026-08-17', 'MORNING ROUTINE');
    await editPastDay('2026-08-17', routine17.id, true);

    const after = (await db.dailyScores.get('2026-08-17'))!;
    expect(after.score).toBeGreaterThan(before.score);
    expect(after.score).toBe(100);
    expect(after.rank).toBe('S+');
    expect(after.sealed).toBe(true);

    const char = await kvGet<Character | null>('character', null);
    expect(char!.xpTotal).toBe(85); // 50 gym + 25 water + 10 routine
  });
});

describe('recomputeDerived — levels and unlocks from the event log', () => {
  beforeAll(async () => {
    await resetDb('2026-08-17');
  });

  it('xp events totaling 40 reach level 2', async () => {
    await db.xpEvents.add({
      id: 'xp-1', date: '2026-08-17', at: '2026-08-17T08:00:00.000Z', amount: 40, source: 'bonus',
    });
    await recomputeDerived();
    const char = await kvGet<Character | null>('character', null);
    expect(char!.xpTotal).toBe(40);
    expect(char!.level).toBe(2);
  });

  it('reaching level 10 unlocks the TRAINED KNIGHT age', async () => {
    await db.xpEvents.add({
      id: 'xp-2', date: '2026-08-17', at: '2026-08-17T09:00:00.000Z', amount: 4410, source: 'bonus',
    });
    await recomputeDerived();
    const char = await kvGet<Character | null>('character', null);
    expect(char!.level).toBe(10); // Σ cost(1..9) = 4450
    const unlocks = await kvGet<Unlock[]>('unlocks', []);
    expect(unlocks.some((u) => u.kind === 'armorAge' && u.name === 'TRAINED KNIGHT')).toBe(true);
    expect(unlocks.some((u) => u.kind === 'title' && u.name === 'TRAINED KNIGHT')).toBe(true);
  });
});

describe('siege kill rewards — +150 XP, fragments, crest forging, achievements', () => {
  beforeAll(async () => {
    await resetDb('2026-08-17');
    await ensureDay('2026-08-17');
    // A nearly-dead boss so one GYM completion kills it.
    const siege: SiegeState = {
      weekStart: '2026-08-17', name: 'TEST BOSS', maxHp: 100, hp: 10, generation: 0,
      carryover: 0, overkill: 0, log: [], killed: false, fragmentsAwarded: false,
    };
    await db.sieges.put(siege);
    // Two prior kills already banked as fragments (event log + kv counter agree).
    await db.xpEvents.bulkAdd([
      { id: 'kill-1', date: '2026-08-03', at: '2026-08-03T20:00:00.000Z', amount: 150, source: 'siegeKill' },
      { id: 'kill-2', date: '2026-08-10', at: '2026-08-10T20:00:00.000Z', amount: 150, source: 'siegeKill' },
    ]);
    await kvSet('fragments', 2);
  });

  it('killing the boss awards 150 XP, forges a crest at 3 fragments, updates achievements', async () => {
    const gym = await instanceByName('2026-08-17', 'GYM');
    const res = await completeInstance(gym.id, '2026-08-17T09:00:00.000Z');
    expect(res.siegeDamage).toBe(75);
    expect(res.siegeKilled).toBe(true);

    const siege = (await db.sieges.get('2026-08-17'))!;
    expect(siege.killed).toBe(true);
    expect(siege.hp).toBe(0);
    expect(siege.fragmentsAwarded).toBe(true);
    expect(siege.overkill).toBe(65);

    const killEvents = (await db.xpEvents.toArray()).filter((e) => e.source === 'siegeKill');
    expect(killEvents).toHaveLength(3);
    expect(killEvents.find((e) => e.date === '2026-08-17')).toMatchObject({ amount: 150 });

    // third fragment forged a crest and reset the counter
    expect(await kvGet<number | null>('fragments', null)).toBe(0);
    const unlocks = await kvGet<Unlock[]>('unlocks', []);
    const crest = unlocks.find((u) => u.kind === 'crest');
    expect(crest).toBeDefined();
    expect(crest!.name).toBe('CREST I');
    expect(res.unlocked.some((u) => u.kind === 'crest')).toBe(true);

    const achievements = await kvGet<Achievement[]>('achievements', []);
    const byId = new Map(achievements.map((a) => [a.id, a]));
    expect(byId.get('giantSlayer')).toMatchObject({ progress: 1 });
    expect(byId.get('giantSlayer')!.unlockedAt).toBeDefined();
    expect(byId.get('crest')).toMatchObject({ progress: 3 });
    expect(byId.get('crest')!.unlockedAt).toBeDefined();
    expect(byId.get('ironWill')).toMatchObject({ progress: 0 }); // physical-day streaks count sealed days only
    expect(byId.get('consistency')).toMatchObject({ progress: 1 });

    // XP total: 300 prior kills + 50 gym + 150 kill
    const char = await kvGet<Character | null>('character', null);
    expect(char!.xpTotal).toBe(500);
  });
});

describe('uncompleteInstance — event removal and recompute', () => {
  beforeAll(async () => {
    await resetDb('2026-08-17');
    await ensureDay('2026-08-17');
    await ensureSiege('2026-08-17');
  });

  it('removes completion + xp event, restores siege hp, resets live score', async () => {
    const gym = await instanceByName('2026-08-17', 'GYM');
    await completeInstance(gym.id, '2026-08-17T10:00:00.000Z');
    expect((await db.sieges.get('2026-08-17'))!.hp).toBe(195);

    await uncompleteInstance(gym.id);
    expect((await db.instances.get(gym.id))!.status).toBe('todo');
    expect(await db.completions.count()).toBe(0);
    expect((await db.xpEvents.toArray()).filter((e) => e.source === 'quest')).toHaveLength(0);
    expect((await db.sieges.get('2026-08-17'))!.hp).toBe(270);
    expect((await db.dailyScores.get('2026-08-17'))!.score).toBe(0);
    const char = await kvGet<Character | null>('character', null);
    expect(char!.xpTotal).toBe(0);
  });
});
