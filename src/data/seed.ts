// data/seed.ts — first-run seed: built-in categories, defaults, starter quests.
import { db, kvGet, kvSet } from './db';
import { newId } from '../core/ids';
import { dayKey } from '../core/dates';
import { INITIAL_VIGOR } from '../game/vigor';
import type {
  Achievement, Category, Character, Exercise, NutritionGoal, QuestTemplate, StreakState, UserSettings,
} from '../core/types';

const BUILTIN_CATEGORIES = ['BODY', 'MIND', 'DUTY', 'CRAFT', 'RITES'] as const;

export const DEFAULT_NUTRITION_GOAL: NutritionGoal = {
  calories: 2500, protein: 220, carbs: 250, fat: 80, waterOz: 128,
  mealPlanRules: { proteinGoal: true, calorieBandPct: 10, minMeals: 2 },
};

export const DEFAULT_SETTINGS: UserSettings = {
  units: 'oz', sound: true, haptics: true, crt: true, fxIntensity: 'full',
  resetHour: 0,
  quietHours: [22, 8],
  notifications: {
    questReminders: true, eveningSweep: true, threshold: true,
    streakGuard: true, workout: true, sweepTime: '20:00',
  },
};

export const INITIAL_CHARACTER: Character = { level: 1, xpTotal: 0, str: 10, vit: 10, wil: 10 };

export const INITIAL_STREAKS: StreakState = {
  overall: 0, overallBest: 0, perfect: 0, perfectBest: 0,
  sRank: 0, sRankBest: 0, embers: 0, cPlusRun: 0,
};

// spec §9 — the nine Deeds
const ACHIEVEMENTS: Achievement[] = [
  { id: 'beginning', name: 'THE BEGINNING', desc: 'Complete your first day', target: 1, progress: 0 },
  { id: 'ironWill', name: 'IRON WILL', desc: 'Gym ×10', target: 10, progress: 0 },
  { id: 'hydrated', name: 'HYDRATED', desc: 'Hit the water target 30 days', target: 30, progress: 0 },
  { id: 'perfectWeek', name: 'PERFECT WEEK', desc: '7 perfect days', target: 7, progress: 0 },
  { id: 'consistency', name: 'CONSISTENCY', desc: '100 quests completed', target: 100, progress: 0 },
  { id: 'sRank', name: 'S-RANK', desc: 'First S day', target: 1, progress: 0 },
  { id: 'siegebreaker', name: 'SIEGEBREAKER', desc: 'First boss kill', target: 1, progress: 0 },
  { id: 'crest', name: 'CREST', desc: 'Forge 3 fragments', target: 3, progress: 0 },
  { id: 'legend', name: 'LEGEND', desc: 'Reach level 100', target: 1, progress: 0 },
];

const STARTER_EXERCISES = ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press', 'Barbell Row', 'Pull-Up'];

/** One-time data migrations for existing saves (idempotent, kv-flagged). */
async function runMigrations(): Promise<void> {
  // m1: optional quests removed from the default experience — retire the
  // seeded WALK quest and its unactioned instances (history stays intact).
  if (!(await kvGet('migr-no-optional', false))) {
    const walk = (await db.templates.toArray())
      .find((t) => t.name === 'WALK' && t.optional && t.archivedAt === undefined);
    if (walk !== undefined) {
      await db.templates.put({ ...walk, archivedAt: new Date().toISOString() });
      const open = (await db.instances.where('templateId').equals(walk.id).toArray())
        .filter((i) => i.status === 'todo');
      for (const i of open) await db.instances.delete(i.id);
    }
    await kvSet('migr-no-optional', true);
  }
}

export async function seedIfEmpty(): Promise<void> {
  if ((await db.categories.count()) > 0) { await runMigrations(); return; }

  const categories: Category[] = BUILTIN_CATEGORIES.map((name) => ({ id: newId(), name, builtin: true }));
  const catId = (name: string): string => categories.find((c) => c.name === name)!.id;

  const createdAt = new Date().toISOString();
  const templates: QuestTemplate[] = [
    {
      id: newId(), name: 'MORNING ROUTINE', categoryId: catId('RITES'), difficulty: 'easy',
      kind: 'binary', main: false, optional: false, recurrence: { type: 'everyDay' },
      reminders: [], createdAt,
    },
    {
      id: newId(), name: 'WATER', categoryId: catId('RITES'), difficulty: 'medium',
      kind: 'quantity', main: false, optional: false, recurrence: { type: 'everyDay' },
      target: 128, unit: 'oz', reminders: [], createdAt,
    },
    {
      id: newId(), name: 'GYM', categoryId: catId('BODY'), difficulty: 'hard',
      kind: 'workout', main: true, optional: false,
      recurrence: { type: 'daysOfWeek', days: [1, 3, 5] }, reminders: [], createdAt,
    },
  ];

  const exercises: Exercise[] = STARTER_EXERCISES.map((name) => ({ id: newId(), name }));

  await db.transaction('rw', [db.categories, db.templates, db.exercises, db.kv], async () => {
    await db.categories.bulkAdd(categories);
    await db.templates.bulkAdd(templates);
    await db.exercises.bulkAdd(exercises);
    await kvSet('nutritionGoal', DEFAULT_NUTRITION_GOAL);
    await kvSet('settings', DEFAULT_SETTINGS);
    await kvSet('character', INITIAL_CHARACTER);
    await kvSet('streaks', INITIAL_STREAKS);
    await kvSet('vigor', INITIAL_VIGOR);
    await kvSet('achievements', ACHIEVEMENTS);
    await kvSet('unlocks', []);
    await kvSet('seedDay', dayKey(new Date()));
  });
}
