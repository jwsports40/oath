// data/db.ts — Dexie schema. All persistence flows through this module.
import Dexie, { type Table } from 'dexie';
import type {
  Category, Chest, QuestTemplate, QuestInstance, QuestCompletion, XPEvent, DailyScore,
  LootItem, SiegeState, WorkoutProgram, Exercise, WorkoutSession, PersonalRecord, Meal,
  HydrationEntry,
} from '../core/types';

export class OathDB extends Dexie {
  categories!: Table<Category, string>;
  templates!: Table<QuestTemplate, string>;
  instances!: Table<QuestInstance, string>;         // index: id, date, templateId, [templateId+date]
  completions!: Table<QuestCompletion, string>;     // index: id, date, templateId
  xpEvents!: Table<XPEvent, string>;                // index: id, date
  dailyScores!: Table<DailyScore, string>;          // pk: date
  sieges!: Table<SiegeState, string>;               // pk: weekStart
  programs!: Table<WorkoutProgram, string>;
  exercises!: Table<Exercise, string>;
  sessions!: Table<WorkoutSession, string>;         // index: id, date
  prs!: Table<PersonalRecord, string>;              // index: id, exerciseId
  meals!: Table<Meal, string>;                      // index: id, date
  hydration!: Table<HydrationEntry, string>;        // index: id, date
  kv!: Table<{ key: string; value: unknown }, string>; // character, settings, streaks, vigor, nutritionGoal, achievements, unlocks, foodCache, corrections, aiQueue, body, equipped
  chests!: Table<Chest, string>;
  loot!: Table<LootItem, string>;

  constructor() {
    super('oath');
    this.version(1).stores({
      categories: 'id',
      templates: 'id',
      instances: 'id, date, templateId, [templateId+date]',
      completions: 'id, date, templateId',
      xpEvents: 'id, date',
      dailyScores: 'date',
      sieges: 'weekStart',
      programs: 'id',
      exercises: 'id',
      sessions: 'id, date',
      prs: 'id, exerciseId',
      meals: 'id, date',
      hydration: 'id, date',
      kv: 'key',
    });
    // v2: loot system — chests (deterministic ids from their source) + rolled items.
    this.version(2).stores({
      chests: 'id, kind',
      loot: 'id, chestId, genre',
    });
  }
}

export const db = new OathDB();

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const row = await db.kv.get(key);
  if (row === undefined) return fallback;
  return row.value as T; // Dexie/JSON boundary: kv values are untyped at rest
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  await db.kv.put({ key, value });
}
