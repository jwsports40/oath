import { describe, it, expect } from 'vitest';
import type { SiegeState } from '../../core/types';
import { BOSS_NAMES, KILL_XP, newSiege, dealDamage, bossHeal } from '../siege';

const WEEK = '2026-08-17'; // a Monday
const NEXT_WEEK = '2026-08-24';

describe('BOSS_NAMES', () => {
  it('has at least 12 names', () => {
    expect(BOSS_NAMES.length).toBeGreaterThanOrEqual(12);
  });
});

describe('newSiege', () => {
  it('weekAvailableXp 1140 -> maxHp 9100 (8*1140=9120 -> round50 -> 9100)', () => {
    const s = newSiege(WEEK, 1140);
    expect(s.maxHp).toBe(9100);
    expect(s.hp).toBe(9100);
    expect(s.generation).toBe(0);
    expect(s.killed).toBe(false);
    expect(s.fragmentsAwarded).toBe(false);
    expect(s.carryover).toBe(0);
    expect(s.overkill).toBe(0);
    expect(s.log).toEqual([]);
    expect(BOSS_NAMES).toContain(s.name);
    expect(s.weekStart).toBe(WEEK);
  });

  it('picks the name deterministically by hash of weekStart', () => {
    const a = newSiege(WEEK, 1140);
    const b = newSiege(WEEK, 1140);
    expect(a.name).toBe(b.name);
  });

  it('survived boss returns RISEN at +5% maxHp with generation+1', () => {
    const prev = newSiege(WEEK, 1140); // not killed
    const s = newSiege(NEXT_WEEK, 1140, prev);
    expect(s.name.endsWith('RISEN')).toBe(true);
    expect(s.name).toBe(prev.name + ' RISEN');
    expect(s.generation).toBe(1);
    // maxHp = round50(8 * xp * 1.05)
    expect(s.maxHp).toBe(Math.floor((8 * 1140 * 1.05) / 50 + 0.5) * 50);
    expect(s.hp).toBe(s.maxHp);
    expect(s.carryover).toBe(0);
  });

  it('killed boss -> fresh boss with 25% overkill carried as initial damage', () => {
    let prev = newSiege(WEEK, 1140);
    prev = { ...prev, hp: 100 };
    prev = dealDamage(prev, 300, true, 'FINAL BLOW', '2026-08-22T18:00:00');
    expect(prev.killed).toBe(true);
    expect(prev.overkill).toBe(350); // damage 450 - 100 hp

    const s = newSiege(NEXT_WEEK, 1140, prev);
    expect(s.generation).toBe(0);
    expect(s.name.endsWith('RISEN')).toBe(false);
    expect(BOSS_NAMES).toContain(s.name);
    expect(s.carryover).toBe(88); // round(0.25 * 350) = 87.5 -> 88
    expect(s.maxHp).toBe(9100);
    expect(s.hp).toBe(9100 - 88);
  });

  it('carryover can never reduce hp below 1', () => {
    let prev = newSiege(WEEK, 1140);
    prev = { ...prev, hp: 1 };
    prev = dealDamage(prev, 999999, true, 'OBLITERATION', '2026-08-22T18:00:00');
    const s = newSiege(NEXT_WEEK, 1, prev); // tiny boss, huge carryover
    expect(s.hp).toBeGreaterThanOrEqual(1);
  });
});

describe('dealDamage', () => {
  it('non-main 40 xp -> 40 damage, logged without crit', () => {
    const s0 = newSiege(WEEK, 1140);
    const s = dealDamage(s0, 40, false, 'MEAL PLAN', '2026-08-17T09:00:00');
    expect(s.hp).toBe(9060);
    expect(s.log).toHaveLength(1);
    expect(s.log[0]).toEqual({
      at: '2026-08-17T09:00:00',
      label: 'MEAL PLAN',
      amount: 40,
      crit: false,
    });
  });

  it('main 75 xp crits x1.5 -> 113 damage (75*1.5=112.5, round half-up)', () => {
    // Spec's sample log shows -112 for this crit; per the plan the spec figure is
    // illustrative — our round-half-up rule gives 113.
    const s0 = newSiege(WEEK, 1140);
    const s = dealDamage(s0, 75, true, 'GYM READY', '2026-08-17T10:00:00');
    expect(s.hp).toBe(9100 - 113);
    expect(s.log[0].amount).toBe(113);
    expect(s.log[0].crit).toBe(true);
  });

  it('kill: 300 main xp on 100 hp boss -> killed, overkill 350', () => {
    let s = newSiege(WEEK, 1140);
    s = { ...s, hp: 100 };
    s = dealDamage(s, 300, true, 'FINAL BLOW', '2026-08-22T18:00:00');
    expect(s.hp).toBe(0);
    expect(s.killed).toBe(true);
    expect(s.overkill).toBe(350); // 450 damage - 100 hp
    expect(s.log[0].amount).toBe(450);
  });

  it('damage after the kill keeps accumulating overkill', () => {
    let s = newSiege(WEEK, 1140);
    s = { ...s, hp: 100 };
    s = dealDamage(s, 300, true, 'FINAL BLOW', '2026-08-22T18:00:00');
    s = dealDamage(s, 40, false, 'MEAL PLAN', '2026-08-22T19:00:00');
    expect(s.killed).toBe(true);
    expect(s.hp).toBe(0);
    expect(s.overkill).toBe(390); // 350 + 40
  });
});

describe('bossHeal', () => {
  it('heals round(0.015*maxHp): maxHp 9100 -> +137 (136.5 -> 137)', () => {
    let s = newSiege(WEEK, 1140);
    s = dealDamage(s, 400, false, 'X', '2026-08-17T09:00:00'); // hp 8700
    const healed = bossHeal(s);
    expect(healed.hp).toBe(8700 + 137);
  });

  it('caps at maxHp', () => {
    let s = newSiege(WEEK, 1140);
    s = dealDamage(s, 40, false, 'X', '2026-08-17T09:00:00'); // hp 9060
    const healed = bossHeal(s);
    expect(healed.hp).toBe(9100);
  });

  it('does not resurrect a killed boss', () => {
    let s = newSiege(WEEK, 1140);
    s = { ...s, hp: 100 };
    s = dealDamage(s, 300, true, 'FINAL BLOW', '2026-08-22T18:00:00');
    expect(bossHeal(s).hp).toBe(0);
  });
});

describe('KILL_XP', () => {
  it('is 150', () => {
    expect(KILL_XP).toBe(150);
  });
});

// keep the type import "used" under noUnusedLocals via an annotation
const _typecheck: SiegeState | undefined = undefined;
void _typecheck;
