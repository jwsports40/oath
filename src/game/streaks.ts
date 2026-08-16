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

export interface DayOutcome { date: string; rank: Rank; score: number; }

export const RANK_ORDER: Rank[] = ['F', 'D', 'C', 'B', 'A', 'S', 'S+'];

export function rankAtLeast(r: Rank, min: Rank): boolean {
  return RANK_ORDER.indexOf(r) >= RANK_ORDER.indexOf(min);
}

export function foldStreaks(days: DayOutcome[]): { state: StreakState; emberSpentDates: string[] } {
  const state: StreakState = {
    overall: 0, overallBest: 0,
    perfect: 0, perfectBest: 0,
    sRank: 0, sRankBest: 0,
    embers: 0, cPlusRun: 0,
  };
  const emberSpentDates: string[] = [];

  for (const day of days) {
    if (rankAtLeast(day.rank, 'C')) {
      state.overall += 1;
      state.cPlusRun += 1;
      if (state.cPlusRun % 7 === 0 && state.embers < 2) state.embers += 1;
    } else if (state.embers > 0) {
      // Auto-burn an ember to preserve the overall streak.
      state.embers -= 1;
      emberSpentDates.push(day.date);
      state.overall += 1;
      state.cPlusRun = 0; // the day itself was sub-C
    } else {
      state.overall = 0;
      state.cPlusRun = 0;
    }
    state.overallBest = Math.max(state.overallBest, state.overall);

    state.perfect = day.score === 100 ? state.perfect + 1 : 0;
    state.perfectBest = Math.max(state.perfectBest, state.perfect);

    state.sRank = rankAtLeast(day.rank, 'S') ? state.sRank + 1 : 0;
    state.sRankBest = Math.max(state.sRankBest, state.sRank);
  }

  return { state, emberSpentDates };
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
