import { describe, it, expect } from 'vitest';
import { credit, dayScore, dayRank, toScoreable, type Scoreable } from '../scoring';
import type { QuestInstance } from '../../core/types';

const s = (weight: number, c: number, opts: Partial<Scoreable> = {}): Scoreable => ({
  weight,
  credit: c,
  optional: false,
  difficulty: 'easy',
  failed: false,
  ...opts,
});

// Worked example from spec §5:
// Gym hard w7 c1 · Meal medium w4 c1 · Water medium w4 c0.72 · Routine easy w2 c0 · Walk easy w2 c1
const workedRequired: Scoreable[] = [
  s(7, 1, { difficulty: 'hard' }),
  s(4, 1, { difficulty: 'medium' }),
  s(4, 0.72, { difficulty: 'medium' }),
  s(2, 0, { difficulty: 'easy' }),
  s(2, 1, { difficulty: 'easy' }),
];
const workedOptional = s(2, 1, { difficulty: 'easy', optional: true });

describe('dayScore', () => {
  it('worked example with completed optional → 85', () => {
    expect(dayScore([...workedRequired, workedOptional])).toBe(85);
  });

  it('worked example without optional → 84 (83.578 rounds half-up to 84)', () => {
    expect(dayScore(workedRequired)).toBe(84);
  });

  it('empty required list → base 100 + bonus, capped 100', () => {
    expect(dayScore([])).toBe(100);
    expect(dayScore([s(2, 1, { optional: true })])).toBe(100);
  });

  it('all required complete → 100', () => {
    expect(dayScore([s(7, 1, { difficulty: 'hard' }), s(4, 1, { difficulty: 'medium' })])).toBe(100);
  });

  it('optional bonus caps at 5', () => {
    const required = [s(4, 0.5, { difficulty: 'medium' })]; // base 50
    const optionals = [
      s(10, 1, { difficulty: 'elite', optional: true }), // 5
      s(10, 1, { difficulty: 'elite', optional: true }), // 5 more, but total bonus capped at 5
    ];
    expect(dayScore([...required, ...optionals])).toBe(55);
  });
});

describe('dayRank', () => {
  it('rank of 85 with hard item complete → A', () => {
    expect(dayRank(85, [...workedRequired, workedOptional])).toBe('A');
  });

  it('all required done incl. hard/elite, score 100, no fails → S+', () => {
    const items = [
      s(7, 1, { difficulty: 'hard' }),
      s(10, 1, { difficulty: 'elite' }),
      s(2, 1, { difficulty: 'easy' }),
    ];
    expect(dayScore(items)).toBe(100);
    expect(dayRank(100, items)).toBe('S+');
  });

  it('score 100 with a failed optional → still S+', () => {
    const items = [
      s(7, 1, { difficulty: 'hard' }),
      s(2, 1, { difficulty: 'easy' }),
      s(2, 0, { difficulty: 'easy', optional: true, failed: true }),
    ];
    expect(dayRank(100, items)).toBe('S+');
  });

  it('score 95 with hard done → S', () => {
    const items = [s(7, 1, { difficulty: 'hard' }), s(4, 1, { difficulty: 'medium' })];
    expect(dayRank(95, items)).toBe('S');
  });

  it('score 95 with a required hard NOT complete → A (demoted)', () => {
    const items = [s(7, 0.9, { difficulty: 'hard' }), s(4, 1, { difficulty: 'medium' })];
    expect(dayRank(95, items)).toBe('A');
  });

  it('boundaries', () => {
    const items = [s(4, 1, { difficulty: 'medium' })]; // no hard/elite, no fails — gates pass
    expect(dayRank(39, items)).toBe('F');
    expect(dayRank(40, items)).toBe('D');
    expect(dayRank(55, items)).toBe('C');
    expect(dayRank(70, items)).toBe('B');
    expect(dayRank(80, items)).toBe('A');
    expect(dayRank(90, items)).toBe('S');
    expect(dayRank(100, items)).toBe('S+');
  });
});

describe('credit', () => {
  it('quantity progress 92/128 → 0.71875', () => {
    expect(credit({ kind: 'quantity', status: 'todo', progress: 92, target: 128 })).toBe(0.71875);
  });

  it('quantity partial counts even if failed', () => {
    expect(credit({ kind: 'quantity', status: 'failed', progress: 92, target: 128 })).toBe(0.71875);
  });

  it('binary todo → 0, done → 1', () => {
    expect(credit({ kind: 'binary', status: 'todo', progress: 0 })).toBe(0);
    expect(credit({ kind: 'binary', status: 'done', progress: 1 })).toBe(1);
  });

  it('over-target clamps to 1', () => {
    expect(credit({ kind: 'quantity', status: 'done', progress: 200, target: 128 })).toBe(1);
  });

  it('workout/nutrition behave as binary', () => {
    expect(credit({ kind: 'workout', status: 'done', progress: 0 })).toBe(1);
    expect(credit({ kind: 'nutrition', status: 'todo', progress: 0 })).toBe(0);
  });
});

describe('toScoreable', () => {
  const base: QuestInstance = {
    id: 'i1',
    templateId: 't1',
    date: '2026-08-16',
    name: 'WATER',
    categoryId: 'rites',
    difficulty: 'medium',
    kind: 'quantity',
    main: false,
    optional: false,
    target: 128,
    unit: 'oz',
    status: 'todo',
    progress: 92,
  };

  it('maps a quantity instance', () => {
    expect(toScoreable(base)).toEqual({
      weight: 4,
      credit: 0.71875,
      optional: false,
      difficulty: 'medium',
      failed: false,
    });
  });

  it('maps a failed binary instance', () => {
    const failed: QuestInstance = {
      ...base,
      kind: 'binary',
      difficulty: 'hard',
      target: undefined,
      unit: undefined,
      status: 'failed',
      progress: 0,
    };
    expect(toScoreable(failed)).toEqual({
      weight: 7,
      credit: 0,
      optional: false,
      difficulty: 'hard',
      failed: true,
    });
  });
});
