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
  it('maxHp from protein days, cap 100', () => {
    expect(maxHpFor(0)).toBe(20);
    expect(maxHpFor(10)).toBe(30);
    expect(maxHpFor(200)).toBe(100);
  });
  it('all 11 ages have a name and perk line', () => {
    expect(AGE_PERKS).toHaveLength(11);
    expect(AGE_PERKS[0]![1]).toBe('ROOKIE KNIGHT');
    expect(AGE_PERKS[10]![1]).toBe('ULTIMATE DUNGEON SLAYER');
  });
});

describe('foldStreaks body integration', () => {
  it('regens on C+ days and takes strikes on sub-C days', () => {
    const days: DayOutcome[] = [
      day('C', 60, { proteinOk: true }),   // protein day: max 22, regen -> full
      day('C', 60, { proteinOk: true }),   // max 24
      day('F', 10, {}),                    // strike -10
    ];
    const { body } = foldStreaks(days, { level: 1 });
    expect(body.maxHp).toBe(22);
    expect(body.hp).toBe(12);
    expect(body.proteinDays).toBe(2);
    expect(body.wounded).toBe(false);
  });
  it('boss strikes first: at 0 HP it steals an ember BEFORE the streak-save', () => {
    // 14 C+ days: 2 embers banked, maxHp 20 (no protein), hp full.
    const long: DayOutcome[] = [
      ...Array.from({ length: 14 }, (_, i) => day('C', 60, { date: `d${i}` })),
      day('F', 10, { date: 'f1' }), // strike: hp 20->10 (no steal); streak-save burns ember (2->1)
      day('F', 10, { date: 'f2' }), // strike: hp 10->0 -> boss STEALS the last ember, hp=half(20)=10;
                                    // streak-save then finds none -> overall streak breaks
    ];
    const r = foldStreaks(long, { level: 1 });
    expect(r.state.embers).toBe(0);
    expect(r.body.hp).toBe(10);
    expect(r.state.overall).toBe(0);       // the sting: insurance stolen, streak lost
    expect(r.body.emberSteals).toBe(1);
  });
  it('with no embers banked, hp floors at 0 and wounded shows', () => {
    const long: DayOutcome[] = [
      ...Array.from({ length: 3 }, (_, i) => day('C', 60, { date: `d${i}` })), // no ember yet
      day('F', 10, { date: 'f1' }),
      day('F', 10, { date: 'f2' }),
      day('F', 10, { date: 'f3' }),
    ];
    const r = foldStreaks(long, { level: 1 });
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
