// game/siege.ts — weekly boss engine. Pure and deterministic: only completing
// real quests deals damage; main quests crit x1.5; sub-C days heal the boss.
// Kill -> Crest Fragment + KILL_XP; overkill carries 25% into next week.
// Survival -> the boss returns renamed 'X RISEN' at +5% maxHp per generation.

import type { SiegeState } from '../core/types';

export const BOSS_NAMES: string[] = [
  'THE HOLLOW KING',
  'MOURNGRAVE',
  'THE PALE WARDEN',
  'ASHFANG',
  'THE SILENT TITHE',
  'VOWBREAKER',
  'THE CARRION EARL',
  'DREADMERE',
  'THE UNLIT',
  'GRIEFHOLD',
  'THE FAMINE KNIGHT',
  'OATHRUST',
];

export const KILL_XP = 150;

/** Round half-up (plan Global Constraints). */
const round = (x: number): number => Math.floor(x + 0.5);

/** Round to the nearest 50, half-up. */
const round50 = (x: number): number => Math.floor(x / 50 + 0.5) * 50;

/** Deterministic FNV-1a string hash (unsigned 32-bit). */
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Start the week's siege.
 * - Fresh boss (no prev, or prev was killed): name picked by hash of weekStart,
 *   generation 0. If prev was killed, 25% of its overkill carries over as
 *   initial damage: hp = max(1, maxHp - carryover).
 * - Survived boss: returns as '<name> RISEN' at generation+1 with
 *   maxHp = round50(8 * weekAvailableXp * 1.05^generation). No carryover.
 */
export function newSiege(
  weekStart: string,
  weekAvailableXp: number,
  prev?: SiegeState,
  carryFactorPct = 0.25,
): SiegeState {
  const returning = prev !== undefined && !prev.killed;
  const generation = returning ? prev.generation + 1 : 0;
  const maxHp = round50(8 * weekAvailableXp * Math.pow(1.05, generation));
  const name = returning
    ? prev.name + ' RISEN'
    : BOSS_NAMES[hashStr(weekStart) % BOSS_NAMES.length];
  const carryover = prev !== undefined && prev.killed ? round(carryFactorPct * Math.max(0, prev.overkill)) : 0;
  const hp = Math.max(1, maxHp - carryover);
  return {
    weekStart,
    name,
    maxHp,
    hp,
    generation,
    carryover,
    overkill: 0,
    log: [],
    killed: false,
    fragmentsAwarded: false,
  };
}

/**
 * Deal quest damage: damage = round(xp * (isMain ? 1.5 : 1)). Appends a log
 * entry, sets killed when hp hits 0, and tracks overkill (damage beyond
 * remaining hp) so 25% carries into next week's boss.
 */
export function dealDamage(
  s: SiegeState,
  xp: number,
  isMain: boolean,
  label: string,
  at: string,
  mults: { crit?: number; dmg?: number; flat?: number } = {},
): SiegeState {
  const damage = round(xp * (mults.dmg ?? 1) * (isMain ? (mults.crit ?? 1.5) : 1)) + (mults.flat ?? 0);
  const excess = Math.max(0, damage - s.hp);
  const hp = Math.max(0, s.hp - damage);
  return {
    ...s,
    hp,
    killed: s.killed || hp === 0,
    overkill: s.overkill + excess,
    log: [...s.log, { at, label, amount: damage, crit: isMain }],
  };
}

/** Boss heals round(1.5% of maxHp), capped at maxHp; no effect once killed. */
export function bossHeal(s: SiegeState, pct = 0.015): SiegeState {
  if (s.killed) return s;
  return { ...s, hp: Math.min(s.maxHp, s.hp + round(pct * s.maxHp)) };
}
