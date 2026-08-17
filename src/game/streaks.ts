// game/streaks.ts — pure day-fold over ordered sealed days.
// Rules (spec §5 Streaks & Embers):
// - Overall streak continues while rank ≥ C. A sub-C day auto-burns 1 ember (if any)
//   to preserve overall (day recorded as emberSpent, overall continues); otherwise
//   overall resets to 0.
// - Perfect streak: score === 100 consecutive. sRank streak: rank ≥ S consecutive.
// - cPlusRun: consecutive rank ≥ C days; every time it hits a multiple of 7, bank
//   1 ember (max held 2). An ember-burned day resets cPlusRun (the day itself was
//   sub-C) but not overall.
import type { Rank, StreakState } from '../core/types';
import {
  emberCapacity, maxHpFor, regenAmount, strikeDamage, type BodyState,
} from './body';
import type { LootEffects } from './loot';

export interface DayOutcome {
  date: string; rank: Rank; score: number;
  proteinOk?: boolean; waterOk?: boolean;
}

export const RANK_ORDER: Rank[] = ['F', 'D', 'C', 'B', 'A', 'S', 'S+'];

export function rankAtLeast(r: Rank, min: Rank): boolean {
  return RANK_ORDER.indexOf(r) >= RANK_ORDER.indexOf(min);
}

export function foldStreaks(
  days: DayOutcome[],
  opts: { level: number; effects?: Partial<LootEffects> } = { level: 1 },
): { state: StreakState; emberSpentDates: string[]; body: BodyState } {
  const fx = opts.effects ?? {};
  const armor = fx.strikeArmor ?? 0;
  const hpBonus = fx.maxHpBonus ?? 0;
  const regenBonus = fx.regenBonus ?? 0;
  let lastUnbrokenIdx: number | null = null;
  const state: StreakState = {
    overall: 0, overallBest: 0,
    perfect: 0, perfectBest: 0,
    sRank: 0, sRankBest: 0,
    embers: 0, cPlusRun: 0,
  };
  const emberSpentDates: string[] = [];
  const capacity = emberCapacity(opts.level);
  const body: BodyState = {
    hp: maxHpFor(0) + hpBonus, maxHp: maxHpFor(0) + hpBonus, wounded: false,
    proteinDays: 0, waterDays: 0, sRankDays: 0, emberSteals: 0,
  };

  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    // Body accounting first: nutrition grows the pool, then the day resolves.
    if (day.proteinOk === true) {
      body.proteinDays += 1;
      body.maxHp = maxHpFor(body.proteinDays) + hpBonus;
    }
    if (day.waterOk === true) body.waterDays += 1;
    if (rankAtLeast(day.rank, 'S')) body.sRankDays += 1;

    if (rankAtLeast(day.rank, 'C')) {
      body.hp = Math.min(body.maxHp, body.hp + regenAmount(opts.level) + regenBonus);
      state.overall += 1;
      state.cPlusRun += 1;
      if (state.cPlusRun % 7 === 0 && state.embers < capacity) state.embers += 1;
    } else {
      // The boss strikes FIRST. If it drops you to 0 and an ember is banked,
      // it steals that ember before the streak-save can use it.
      body.hp -= Math.max(1, strikeDamage(opts.level) - armor);
      if (body.hp <= 0) {
        if (fx.unbroken === true && (lastUnbrokenIdx === null || i - lastUnbrokenIdx >= 14)) {
          // Totem of the Unbroken: survive at 1 HP, the boss gets nothing.
          lastUnbrokenIdx = i;
          body.hp = 1;
        } else if (fx.wardEmber === true) {
          // Totem of the Undying Flame: the boss can never steal an ember.
          body.hp = 0;
        } else if (state.embers > 0) {
          state.embers -= 1;
          body.emberSteals += 1;
          body.hp = Math.ceil(body.maxHp / 2);
        } else {
          body.hp = 0;
        }
      }
      if (state.embers > 0) {
        // Auto-burn an ember to preserve the overall streak.
        state.embers -= 1;
        emberSpentDates.push(day.date);
        state.overall += 1;
      } else {
        state.overall = 0;
      }
      state.cPlusRun = 0; // the day itself was sub-C
    }
    state.overallBest = Math.max(state.overallBest, state.overall);

    state.perfect = day.score === 100 ? state.perfect + 1 : 0;
    state.perfectBest = Math.max(state.perfectBest, state.perfect);

    state.sRank = rankAtLeast(day.rank, 'S') ? state.sRank + 1 : 0;
    state.sRankBest = Math.max(state.sRankBest, state.sRank);
  }

  body.wounded = body.hp < body.maxHp / 2;
  return { state, emberSpentDates, body };
}

/**
 * Consecutive completed scheduled dates ending at the most recent scheduled
 * date ≤ today. Non-scheduled days are skipped (MWF gym isn't broken by
 * Tuesday). Today counts if completed; if today is scheduled but not yet
 * completed it is skipped (not a break).
 */
export function perQuestStreak(
  _templateId: string,
  scheduledDates: string[],
  completedDates: Set<string>,
  today: string,
): number {
  const past = scheduledDates.filter((d) => d <= today).sort();
  let i = past.length - 1;
  if (i >= 0 && past[i] === today && !completedDates.has(today)) i -= 1;
  let streak = 0;
  while (i >= 0 && completedDates.has(past[i])) {
    streak += 1;
    i -= 1;
  }
  return streak;
}
