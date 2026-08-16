// game/scoring.ts — deterministic day scoring & rank engine (spec §5).
// Pure functions only; no imports beyond core types.
import { DIFFICULTY } from '../core/types';
import type { Difficulty, InstanceStatus, QuestInstance, QuestKind, Rank } from '../core/types';

export interface Scoreable {
  weight: number;
  credit: number; // 0..1
  optional: boolean;
  difficulty: Difficulty;
  failed: boolean;
}

/** round half-up per Global Constraints: Math.floor(x + 0.5) */
const roundHalfUp = (x: number): number => Math.floor(x + 0.5);

/**
 * Credit earned by an instance.
 * binary/workout/nutrition: done → 1, else 0.
 * quantity: clamp(progress/target, 0, 1) — even if failed (partial water counts).
 */
export function credit(i: {
  kind: QuestKind;
  status: InstanceStatus;
  progress: number;
  target?: number;
}): number {
  if (i.kind === 'quantity' && i.target !== undefined && i.target > 0) {
    return Math.min(1, Math.max(0, i.progress / i.target));
  }
  return i.status === 'done' ? 1 : 0;
}

/**
 * Day score, integer 0..100, round half-up.
 * base = 100·Σ(wᵢcᵢ)/Σ(wᵢ) over required items (base 100 if none);
 * bonus = min(5, Σ over optionals of w·c·0.5); total capped at 100.
 */
export function dayScore(items: Scoreable[]): number {
  const required = items.filter((i) => !i.optional);
  const totalWeight = required.reduce((sum, i) => sum + i.weight, 0);
  const base =
    totalWeight === 0
      ? 100
      : (100 * required.reduce((sum, i) => sum + i.weight * i.credit, 0)) / totalWeight;
  const bonus = Math.min(
    5,
    items.filter((i) => i.optional).reduce((sum, i) => sum + i.weight * i.credit * 0.5, 0),
  );
  return roundHalfUp(Math.min(100, base + bonus));
}

function rankForScore(score: number): Rank {
  if (score >= 100) return 'S+';
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/**
 * Rank for a day, with gates:
 * S needs score ≥ 90 AND every required hard/elite item at credit ≥ 1.
 * S+ needs score === 100 AND zero failed required items.
 * A failed gate demotes to the highest rank the score allows below the gated one
 * (score 100 failing the S+ gate → S if the S gate passes, else A).
 */
export function dayRank(score: number, items: Scoreable[]): Rank {
  const required = items.filter((i) => !i.optional);
  const sGatePasses = required
    .filter((i) => i.difficulty === 'hard' || i.difficulty === 'elite')
    .every((i) => i.credit >= 1);
  const sPlusGatePasses = required.every((i) => !i.failed);
  let rank = rankForScore(score);
  if (rank === 'S+' && !sPlusGatePasses) rank = 'S';
  if (rank === 'S' && !sGatePasses) rank = 'A';
  return rank;
}

export function toScoreable(i: QuestInstance): Scoreable {
  return {
    weight: DIFFICULTY[i.difficulty].weight,
    credit: credit(i),
    optional: i.optional,
    difficulty: i.difficulty,
    failed: i.status === 'failed',
  };
}
