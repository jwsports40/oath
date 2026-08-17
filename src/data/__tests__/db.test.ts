import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { db, kvGet, kvSet } from '../db';
import { seedIfEmpty } from '../seed';
import type { Achievement, Character, NutritionGoal, StreakState, UserSettings } from '../../core/types';

describe('seedIfEmpty', () => {
  it('seeds an empty database and is idempotent', async () => {
    await seedIfEmpty();

    const categories = await db.categories.toArray();
    expect(categories.map((c) => c.name).sort()).toEqual(['BODY', 'CRAFT', 'DUTY', 'MIND', 'RITES']);
    expect(categories.every((c) => c.builtin)).toBe(true);

    const templates = await db.templates.toArray();
    expect(templates).toHaveLength(3);
    const names = templates.map((t) => t.name).sort();
    expect(names).toEqual(['GYM', 'MORNING ROUTINE', 'WATER']);

    const water = templates.find((t) => t.name === 'WATER')!;
    expect(water.kind).toBe('quantity');
    expect(water.difficulty).toBe('medium');
    expect(water.target).toBe(128);
    expect(water.unit).toBe('oz');
    expect(water.recurrence).toEqual({ type: 'everyDay' });
    const rites = categories.find((c) => c.name === 'RITES')!;
    expect(water.categoryId).toBe(rites.id);

    const gym = templates.find((t) => t.name === 'GYM')!;
    expect(gym.difficulty).toBe('hard');
    expect(gym.kind).toBe('workout');
    expect(gym.main).toBe(true);
    expect(gym.recurrence).toEqual({ type: 'daysOfWeek', days: [1, 3, 5] });

    const routine = templates.find((t) => t.name === 'MORNING ROUTINE')!;
    expect(routine.difficulty).toBe('easy');
    expect(routine.kind).toBe('binary');
    expect(routine.recurrence).toEqual({ type: 'everyDay' });

    const exercises = await db.exercises.toArray();
    expect(exercises.map((e) => e.name).sort()).toEqual([
      'Barbell Row', 'Bench Press', 'Deadlift', 'Overhead Press', 'Pull-Up', 'Squat',
    ]);

    const goal = await kvGet<NutritionGoal | null>('nutritionGoal', null);
    expect(goal).toEqual({
      calories: 2500, protein: 220, carbs: 250, fat: 80, waterOz: 128,
      mealPlanRules: { proteinGoal: true, calorieBandPct: 10, minMeals: 2 },
    });

    const character = await kvGet<Character | null>('character', null);
    expect(character).toMatchObject({ level: 1, xpTotal: 0 });

    const settings = await kvGet<UserSettings | null>('settings', null);
    expect(settings).toMatchObject({ units: 'oz', resetHour: 0, quietHours: [22, 8] });

    const streaks = await kvGet<StreakState | null>('streaks', null);
    expect(streaks).toEqual({
      overall: 0, overallBest: 0, perfect: 0, perfectBest: 0,
      sRank: 0, sRankBest: 0, embers: 0, cPlusRun: 0,
    });

    const vigor = await kvGet<number | null>('vigor', null);
    expect(vigor).toBe(50);

    const achievements = await kvGet<Achievement[]>('achievements', []);
    expect(achievements.map((a) => a.id)).toEqual([
      'beginning', 'ironWill', 'hydrated', 'perfectWeek', 'consistency',
      'sRank', 'siegebreaker', 'crest', 'legend',
    ]);
    expect(achievements.map((a) => a.target)).toEqual([1, 10, 30, 7, 100, 1, 1, 3, 1]);
    expect(achievements.every((a) => a.progress === 0 && a.unlockedAt === undefined)).toBe(true);

    // idempotent: run again, counts unchanged
    await seedIfEmpty();
    expect(await db.categories.count()).toBe(5);
    expect(await db.templates.count()).toBe(3);
    expect(await db.exercises.count()).toBe(6);
  });

  it('kv roundtrip and fallback', async () => {
    expect(await kvGet('missingKey', 'fallback')).toBe('fallback');
    await kvSet('someKey', { a: 1, b: [1, 2, 3] });
    expect(await kvGet<{ a: number; b: number[] } | null>('someKey', null)).toEqual({ a: 1, b: [1, 2, 3] });
    await kvSet('someKey', 42);
    expect(await kvGet<number | null>('someKey', null)).toBe(42);
  });
});
