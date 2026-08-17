// game/body.ts — the knight statboard and armor-age passive perks
// (docs/superpowers/specs/2026-08-16-knight-statboard-design.md).
// Pure helpers only; nothing here ever subtracts XP or levels.

/** [minLevel, name, perk line for the Armory card] */
export const AGE_PERKS: [number, string, string][] = [
  [1, 'ROOKIE KNIGHT', '—'],
  [10, 'TRAINED KNIGHT', '+5% WORKOUT XP'],
  [20, 'VETERAN KNIGHT', '+5% SIEGE DAMAGE'],
  [30, 'ELITE KNIGHT', 'OPTIONAL XP CAP +1'],
  [40, 'DUNGEON KNIGHT', 'BOSS HEALS 1.25% (WAS 1.5%)'],
  [50, 'DUNGEON SLAYER', '+10% SIEGE DAMAGE'],
  [60, 'ABYSS KNIGHT', 'CAN BANK A 3RD EMBER'],
  [70, 'ABYSS SLAYER', 'CRIT CAP ×2.2 (WAS ×2.0)'],
  [80, 'LEGENDARY DUNGEON SLAYER', 'BOSS STRIKES −8 HP (WAS −10)'],
  [90, 'MYTHIC DUNGEON SLAYER', 'REGEN +8 HP/DAY (WAS +5)'],
  [100, 'ULTIMATE DUNGEON SLAYER', 'OVERKILL CARRIES 50% (WAS 25%)'],
];

export function ageNameForLevel(level: number): string {
  let name = AGE_PERKS[0]![1];
  for (const [min, n] of AGE_PERKS) if (level >= min) name = n;
  return name;
}

const has = (level: number, min: number): boolean => level >= min;

/** Workout-kind quest XP multiplier: +1%/STR over 10 (cap +50%), +5% at TRAINED. */
export function workoutXpMult(str: number, level: number): number {
  return 1 + Math.min(0.5, 0.01 * Math.max(0, str - 10)) + (has(level, 10) ? 0.05 : 0);
}

/** Main-quest siege crit: 1.5 + 0.01/WIL over 10, cap 2.0 (2.2 at ABYSS SLAYER). */
export function critMult(wil: number, level: number): number {
  const cap = has(level, 70) ? 2.2 : 2.0;
  return Math.min(cap, 1.5 + 0.01 * Math.max(0, wil - 10));
}

/** Optional-XP bonus cap: 5 + 1 per 5 STAM over 10, +1 at ELITE, cap 10. */
export function optionalCap(stam: number, level: number): number {
  return Math.min(10, 5 + Math.floor(Math.max(0, stam - 10) / 5) + (has(level, 30) ? 1 : 0));
}

export function dmgMult(level: number): number {
  return 1 + (has(level, 20) ? 0.05 : 0) + (has(level, 50) ? 0.1 : 0);
}

export function healPct(level: number): number { return has(level, 40) ? 0.0125 : 0.015; }
export function carryFactor(level: number): number { return has(level, 100) ? 0.5 : 0.25; }
export function emberCapacity(level: number): number { return has(level, 60) ? 3 : 2; }
export function strikeDamage(level: number): number { return has(level, 80) ? 8 : 10; }
export function regenAmount(level: number): number { return has(level, 90) ? 8 : 5; }

export function maxHpFor(proteinDays: number): number {
  return Math.min(100, 20 + 2 * proteinDays);
}

export interface BodyState {
  hp: number;
  maxHp: number;
  wounded: boolean;
  proteinDays: number;
  waterDays: number;
  sRankDays: number;
  emberSteals: number;
}
