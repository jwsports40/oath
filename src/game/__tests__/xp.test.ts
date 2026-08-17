import { describe, it, expect } from 'vitest';
import { xpAward, levelCost, levelForXp, titleForLevel, armorAgeForLevel } from '../xp';

describe('levelCost', () => {
  it('matches the canonical curve round₁₀(40·level^1.5)', () => {
    expect(levelCost(1)).toBe(40);
    expect(levelCost(5)).toBe(450);
    expect(levelCost(10)).toBe(1260);
    expect(levelCost(18)).toBe(3050); // spec table says 3,060 — formula is canonical
    expect(levelCost(20)).toBe(3580);
    expect(levelCost(50)).toBe(14140);
    expect(levelCost(100)).toBe(40000);
  });
});

describe('xpAward', () => {
  it('applies streak multiplier with round half-up', () => {
    expect(xpAward(75, 5)).toBe(94);
  });
  it('no streak → base xp', () => {
    expect(xpAward(75, 0)).toBe(75);
  });
  it('caps multiplier at 2× (streak capped at 20)', () => {
    expect(xpAward(100, 25)).toBe(200);
  });
});

describe('levelForXp', () => {
  it('starts at level 1', () => {
    expect(levelForXp(0)).toEqual({ level: 1, into: 0, next: 40 });
  });
  it('reaches level 2 at 40 xp', () => {
    expect(levelForXp(40).level).toBe(2);
  });
  it('caps at level 100', () => {
    expect(levelForXp(10_000_000).level).toBe(100);
  });
});

describe('titleForLevel', () => {
  it('returns highest title threshold ≤ level', () => {
    expect(titleForLevel(30)).toBe('ELITE KNIGHT');
  });
});

describe('armorAgeForLevel', () => {
  it('returns highest armor age band ≤ level', () => {
    expect(armorAgeForLevel(47)[1]).toBe('DUNGEON KNIGHT');
  });
});
