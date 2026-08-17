import { describe, expect, it } from 'vitest';
import {
  AGE_PERKS, carryFactor, critMult, dmgMult, emberCapacity, healPct, maxHpFor,
  optionalCap, regenAmount, strikeDamage, workoutXpMult,
} from '../body';
import { foldStreaks, type DayOutcome } from '../streaks';

const day = (rank: DayOutcome['rank'], score: number, over: Partial<DayOutcome> = {}): DayOutcome =>
  ({ date: '2026-08-01', rank, score, ...over });

describe('perk helpers', () => {
  it('workout XP multiplier: +1%/STR over 10, +5% from TRAINED KNIGHT, cap +50%', () => {
    expect(workoutXpMult(10, 1)).toBe(1);
    expect(workoutXpMult(20, 1)).toBeCloseTo(1.1);
    expect(workoutXpMult(20, 15)).toBeCloseTo(1.15);
    expect(workoutXpMult(99, 1)).toBeCloseTo(1.5);
  });
  it('crit multiplier grows with WIL, cap 2.0 (2.2 as ABYSS SLAYER+)', () => {
    expect(critMult(10, 1)).toBeCloseTo(1.5);
    expect(critMult(40, 1)).toBeCloseTo(1.8);
    expect(critMult(99, 1)).toBeCloseTo(2.0);
    expect(critMult(99, 70)).toBeCloseTo(2.2);
  });
  it('optional cap from STAM, +1 at ELITE KNIGHT, cap 10', () => {
    expect(optionalCap(10, 1)).toBe(5);
    expect(optionalCap(25, 1)).toBe(8);
    expect(optionalCap(25, 30)).toBe(9);
    expect(optionalCap(99, 30)).toBe(10);
  });
  it('age-gated siege numbers', () => {
    expect(dmgMult(1)).toBe(1);
    expect(dmgMult(20)).toBeCloseTo(1.05);
    expect(dmgMult(55)).toBeCloseTo(1.15);
    expect(healPct(30)).toBe(0.015);
    expect(healPct(40)).toBe(0.0125);
    expect(carryFactor(90)).toBe(0.25);
    expect(carryFactor(100)).toBe(0.5);
    expect(emberCapacity(59)).toBe(2);
    expect(emberCapacity(60)).toBe(3);
    expect(strikeDamage(1)).toBe(10);
    expect(strikeDamage(80)).toBe(8);
    expect(regenAmount(1)).toBe(5);
    expect(regenAmount(90)).toBe(8);
  });
  it('maxHp: 100 base, +1 per protein day, cap 150', () => {
    expect(maxHpFor(0)).toBe(100);
    expect(maxHpFor(10)).toBe(110);
    expect(maxHpFor(200)).toBe(150);
  });
  it('all 11 ages have a name and perk line', () => {
    expect(AGE_PERKS).toHaveLength(11);
    expect(AGE_PERKS[0]![1]).toBe('ROOKIE KNIGHT');
    expect(AGE_PERKS[10]![1]).toBe('ULTIMATE DUNGEON SLAYER');
  });
});

describe('foldStreaks body integration (villain ladder)', () => {
  it('regens on C+ days; a charged villain opens with its SIGNATURE on a bad day', () => {
    const days: DayOutcome[] = [
      day('C', 60, { date: '2026-08-03', proteinOk: true }),
      day('C', 60, { date: '2026-08-04', proteinOk: true }),
      day('F', 10, { date: '2026-08-05' }),   // signature (charged): band-0 sig = 5 dmg
    ];
    const r = foldStreaks(days, { level: 1 });
    expect(r.body.maxHp).toBe(102);
    expect(r.body.hp).toBe(97);              // 102 − 5 signature
    expect(r.body.proteinDays).toBe(2);
    expect(r.sigCooldown).toBe(2);
    // 24h status lands on the FOLLOWING day, so none recorded yet.
    expect(Object.keys(r.statusByDate)).toHaveLength(0);
  });
  it('signature fires every other bad day; status lands on the following day', () => {
    const days: DayOutcome[] = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06']
      .map((d) => day('F', 10, { date: d }));
    const r = foldStreaks(days, { level: 1 });
    // sig day1 -> status day2; day2 normal (cd); day3 sig again -> status day4
    expect(r.statusByDate['2026-08-04']).toBeDefined();
    expect(r.statusByDate['2026-08-05']).toBeUndefined();
    expect(r.statusByDate['2026-08-06']).toBeDefined();
  });
  it('boss strikes first: at 0 HP it steals an ember BEFORE the streak-save', () => {
    // Colossus-in-reverse: shrink the pool so strikes are lethal (mechanism test).
    const long: DayOutcome[] = [
      ...Array.from({ length: 14 }, (_, i) => day('C', 60, { date: `d${i}` })),
      day('F', 10, { date: 'f1' }),  // signature 5: hp 5 -> 0 -> STEAL (2->1), hp=ceil(5/2)=3
    ];
    const r = foldStreaks(long, { level: 1, effects: { maxHpBonus: -95 } });
    expect(r.body.maxHp).toBe(5);
    expect(r.body.emberSteals).toBe(1);
    expect(r.body.hp).toBe(3);
    expect(r.state.embers).toBe(0);          // one stolen by the boss, one burned by the streak-save
    expect(r.state.overall).toBe(15);        // the burn still saved the streak
  });
  it('with no embers banked, hp floors at 0 and wounded shows', () => {
    const long: DayOutcome[] = [
      ...Array.from({ length: 3 }, (_, i) => day('C', 60, { date: `d${i}` })),
      day('F', 10, { date: 'f1' }),  // sig 5
      day('F', 10, { date: 'f2' }),  // normal 3
      day('F', 10, { date: 'f3' }),  // sig 5
    ];
    const r = foldStreaks(long, { level: 1, effects: { maxHpBonus: -95 } });
    expect(r.body.hp).toBe(0);
    expect(r.body.wounded).toBe(true);
    expect(r.body.emberSteals).toBe(0);
  });
  it('ember capacity is 3 at ABYSS KNIGHT (level 60+)', () => {
    const days: DayOutcome[] = Array.from({ length: 21 }, (_, i) => day('C', 60, { date: `d${i}` }));
    expect(foldStreaks(days, { level: 1 }).state.embers).toBe(2);
    expect(foldStreaks(days, { level: 60 }).state.embers).toBe(3);
  });
  it('without body options, behaves exactly as before', () => {
    const days: DayOutcome[] = Array.from({ length: 7 }, (_, i) => day('C', 60, { date: `d${i}` }));
    const { state } = foldStreaks(days);
    expect(state.embers).toBe(1);
    expect(state.overall).toBe(7);
  });
});
