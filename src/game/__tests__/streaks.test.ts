import { describe, it, expect } from 'vitest';
import type { Rank } from '../../core/types';
import { RANK_ORDER, rankAtLeast, foldStreaks, perQuestStreak, type DayOutcome } from '../streaks';

function day(date: string, rank: Rank, score: number): DayOutcome {
  return { date, rank, score };
}

/** n consecutive days starting at 2026-08-01 with the given rank/score. */
function run(n: number, rank: Rank, score: number, startDay = 1): DayOutcome[] {
  const days: DayOutcome[] = [];
  for (let i = 0; i < n; i++) {
    const d = String(startDay + i).padStart(2, '0');
    days.push(day(`2026-08-${d}`, rank, score));
  }
  return days;
}

describe('rankAtLeast', () => {
  it('orders ranks F..S+', () => {
    expect(RANK_ORDER).toEqual(['F', 'D', 'C', 'B', 'A', 'S', 'S+']);
    expect(rankAtLeast('C', 'C')).toBe(true);
    expect(rankAtLeast('D', 'C')).toBe(false);
    expect(rankAtLeast('S+', 'S')).toBe(true);
    expect(rankAtLeast('A', 'S')).toBe(false);
  });
});

describe('foldStreaks — embers', () => {
  it('banks 1 ember after 7 consecutive C+ days', () => {
    const { state } = foldStreaks(run(7, 'C', 60));
    expect(state.embers).toBe(1);
    expect(state.cPlusRun).toBe(7);
    expect(state.overall).toBe(7);
  });

  it('banks 2 embers after 14 days', () => {
    const { state } = foldStreaks(run(14, 'C', 60));
    expect(state.embers).toBe(2);
  });

  it('caps embers at 2 after 21 days', () => {
    const { state } = foldStreaks(run(21, 'C', 60));
    expect(state.embers).toBe(2);
  });

  it('[C×7, F] burns the ember: overall continues to 8, embers 0, cPlusRun 0', () => {
    const days = [...run(7, 'C', 60), day('2026-08-08', 'F', 20)];
    const { state, emberSpentDates } = foldStreaks(days);
    expect(state.overall).toBe(8);
    expect(state.embers).toBe(0);
    expect(state.cPlusRun).toBe(0);
    expect(emberSpentDates).toEqual(['2026-08-08']);
  });

  it('[C×3, F] with no ember resets overall to 0', () => {
    const days = [...run(3, 'C', 60), day('2026-08-04', 'F', 20)];
    const { state, emberSpentDates } = foldStreaks(days);
    expect(state.overall).toBe(0);
    expect(state.embers).toBe(0);
    expect(emberSpentDates).toEqual([]);
    expect(state.overallBest).toBe(3);
  });
});

describe('foldStreaks — perfect and S-rank streaks', () => {
  it('perfect streak resets on a sub-100 day, best kept', () => {
    const days = [day('2026-08-01', 'S+', 100), day('2026-08-02', 'S+', 100), day('2026-08-03', 'S', 90)];
    const { state } = foldStreaks(days);
    expect(state.perfect).toBe(0);
    expect(state.perfectBest).toBe(2);
  });

  it('sRank streak resets on a sub-S day, best kept', () => {
    const days = [day('2026-08-01', 'S', 95), day('2026-08-02', 'S+', 100), day('2026-08-03', 'A', 85)];
    const { state } = foldStreaks(days);
    expect(state.sRank).toBe(0);
    expect(state.sRankBest).toBe(2);
  });
});

describe('perQuestStreak', () => {
  // MWF template around 2026-08-17 (Monday).
  const mon = '2026-08-17';
  const wed = '2026-08-19';
  const fri = '2026-08-21';

  it('completed Mon & Wed, today=Thu → 2', () => {
    const streak = perQuestStreak('t1', [mon, wed, fri], new Set([mon, wed]), '2026-08-20');
    expect(streak).toBe(2);
  });

  it('completed Mon, missed Wed, today=Fri → 0', () => {
    const streak = perQuestStreak('t1', [mon, wed, fri], new Set([mon]), fri);
    expect(streak).toBe(0);
  });

  it('today counts if completed', () => {
    const streak = perQuestStreak('t1', [mon, wed, fri], new Set([mon, wed, fri]), fri);
    expect(streak).toBe(3);
  });

  it('today scheduled but not yet completed is skipped, not a break', () => {
    const streak = perQuestStreak('t1', [mon, wed, fri], new Set([mon, wed]), fri);
    expect(streak).toBe(2);
  });
});
