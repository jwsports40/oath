import { ARMOR_AGES, TITLES } from '../core/types';

const LEVEL_CAP = 100;

/** Round half-up per Global Constraints: floor(x + 0.5). */
function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

/** round₁₀(x) = floor(x / 10 + 0.5) * 10 */
function round10(x: number): number {
  return Math.floor(x / 10 + 0.5) * 10;
}

/**
 * XP awarded for completing a quest with a per-quest streak bonus:
 * round( baseXp * min(2, 1 + 0.05 * min(questStreak, 20)) ), round half-up.
 */
export function xpAward(baseXp: number, questStreak: number): number {
  const mult = Math.min(2, 1 + 0.05 * Math.min(questStreak, 20));
  return roundHalfUp(baseXp * mult);
}

/**
 * XP cost to go from `level` to `level + 1`: round₁₀(40 · level^1.5).
 * NOTE: the spec's level table lists "L18: 3,060", but the formula gives
 * round₁₀(40 · 18^1.5) = 3050. The formula is canonical (spec typo).
 */
export function levelCost(level: number): number {
  return round10(40 * Math.pow(level, 1.5));
}

/** Resolve total XP into {level, xp into current level, cost of next level}. Level caps at 100. */
export function levelForXp(xpTotal: number): { level: number; into: number; next: number } {
  let level = 1;
  let remaining = xpTotal;
  while (level < LEVEL_CAP && remaining >= levelCost(level)) {
    remaining -= levelCost(level);
    level++;
  }
  return { level, into: remaining, next: levelCost(level) };
}

/** Highest TITLES threshold ≤ level. */
export function titleForLevel(level: number): string {
  for (const [threshold, title] of TITLES) {
    if (level >= threshold) return title;
  }
  return TITLES[TITLES.length - 1][1];
}

/** Highest ARMOR_AGES band ≤ level. */
export function armorAgeForLevel(level: number): [number, string, string] {
  let best: [number, string, string] = ARMOR_AGES[0];
  for (const age of ARMOR_AGES) {
    if (age[0] <= level) best = age;
  }
  return best;
}
