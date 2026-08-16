// app/store.ts — the zustand composition point. ALL screens compile against this
// contract (Task 10 of the plan); screen tasks must never edit this file.
// Every mutating action calls lifecycle functions then refresh(); refresh()
// recomputes derived caches (stats, achievements) and re-evaluates the
// meal-plan quest before reloading every view from the db.
import { create } from 'zustand';
import { db, kvGet, kvSet } from '../data/db';
import {
  seedIfEmpty, DEFAULT_NUTRITION_GOAL, DEFAULT_SETTINGS, INITIAL_CHARACTER, INITIAL_STREAKS,
} from '../data/seed';
import {
  ensureDay, ensureSiege, completeInstance, uncompleteInstance, setQuantityProgress,
  editPastDay as lifecycleEditPastDay, recomputeDerived, type CompletionResult,
} from '../data/lifecycle';
import { isScheduled, scheduledDatesInRange } from '../data/recurrence';
import { addDays, dayKey, eachDay, weekStartOf } from '../core/dates';
import { newId } from '../core/ids';
import { dayScore, dayRank, toScoreable } from '../game/scoring';
import { armorAgeForLevel, levelForXp, titleForLevel } from '../game/xp';
import { perQuestStreak } from '../game/streaks';
import { INITIAL_VIGOR, vigorBand as bandOf } from '../game/vigor';
import { scheduleNotifications } from './notify';
import { resolveBridgeUrl } from '../ai/nutrition';
import { syncNow } from '../data/sync';
import type { Tab } from './tabs';
import type {
  Achievement, Category, Character, DailyScore, Exercise, ExerciseSet, FoodEntry, Meal,
  NutritionGoal, PersonalRecord, QuestInstance, QuestTemplate, Rank, SiegeState, StreakState,
  Unlock, UserSettings, WorkoutProgram, WorkoutSession,
} from '../core/types';

export type EffectEvent =
  | { kind: 'xp'; amount: number; at: number }
  | { kind: 'levelUp'; from: number; to: number; ageReveal?: string }
  | { kind: 'daySeal'; date: string; score: number; rank: Rank; xp: number; streak: number }
  | { kind: 'pr'; label: string; xp: number }
  | { kind: 'siegeKill'; name: string };

export interface OathStore {
  ready: boolean; initError: string | null; today: string; tab: Tab;
  syncStatus: 'off' | 'syncing' | 'synced' | 'error'; lastSyncAt: string | null;
  syncNow(): Promise<void>;
  instances: QuestInstance[];                 // today's, sorted: main first, required, optional
  templates: QuestTemplate[]; categories: Category[];
  character: Character & { title: string; armorAge: [number, string, string]; into: number; next: number };
  live: { score: number; rank: Rank; pct: number };     // today, live
  streaks: StreakState;
  perQuestStreaks: Record<string, number>;          // templateId → streak
  vigor: number; vigorBand: string;
  siege: SiegeState | null;
  week: { date: string; rank: Rank | null; isToday: boolean }[];   // Mon..Sun of current week
  goals: NutritionGoal; meals: Meal[]; macros: { cal: number; p: number; c: number; f: number };
  hydrationOz: number;
  dailyScores: Record<string, DailyScore>;          // all sealed days (for calendar)
  programs: WorkoutProgram[]; exercises: Exercise[]; sessions: WorkoutSession[]; prs: PersonalRecord[];
  achievements: Achievement[]; unlocks: Unlock[];
  settings: UserSettings;
  effects: EffectEvent[];
  aiQueueSize: number;
  // actions
  init(): Promise<void>;                           // seed, ensureDay, ensureSiege, load everything
  setTab(t: Tab): void;
  complete(id: string): Promise<void>; uncomplete(id: string): Promise<void>;
  addQuantity(id: string, amount: number): Promise<void>;
  addHydration(oz: number): Promise<void>;          // also feeds the WATER quest instance progress
  saveTemplate(t: QuestTemplate): Promise<void>; archiveTemplate(id: string): Promise<void>;
  addCategory(name: string): Promise<void>;
  saveProgram(p: WorkoutProgram): Promise<void>;
  startSession(workoutDayId: string): Promise<string>;       // returns session id
  logSet(sessionId: string, set: ExerciseSet): Promise<void>; // detects PR (e1rm > best) → pr effect +25xp event
  finishSession(sessionId: string, notes?: string): Promise<void>; // completes today's GYM instance
  logMealUtterance(text: string): Promise<void>;    // → ai queue (Task 16)
  correctFoodEntry(mealId: string, idx: number, patch: Partial<FoodEntry>): Promise<void>;
  deleteMeal(mealId: string): Promise<void>;
  editPastDay(date: string, instanceId: string, done: boolean): Promise<void>;
  updateSettings(patch: Partial<UserSettings>): Promise<void>;
  updateGoals(patch: Partial<NutritionGoal>): Promise<void>;
  popEffect(): void;
  refresh(): Promise<void>;                        // reload all derived views from db
}

/** Epley estimated 1-rep max. */
export function e1rm(weight: number, reps: number): number { return Math.round(weight * (1 + reps / 30)); }

const PR_XP = 25;

export interface AiQueueItem { mealId: string; utterance: string; }
export interface FoodCorrection { match: string; cal: number; p: number; c: number; f: number; }

// Task 16's ai/queue.ts registers its drain here so it can wire in without
// editing this file. Until then draining is a no-op.
type AiDrain = () => Promise<void>;
let aiDrain: AiDrain | null = null;
export function registerAiDrain(fn: AiDrain): void { aiDrain = fn; }
async function drainAi(): Promise<void> { if (aiDrain !== null) await aiDrain(); }

/** normalizeFood — lowercase, trim, collapse spaces (canonical copy in ai/nutrition.ts, Task 16). */
function normalizeFood(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** perWeek templates materialize daily as optional regardless of the flag. */
function effectiveOptional(t: QuestTemplate): boolean {
  return t.optional || t.recurrence.type === 'perWeek';
}

function macroTotals(meals: Meal[]): { cal: number; p: number; c: number; f: number } {
  const totals = { cal: 0, p: 0, c: 0, f: 0 };
  for (const m of meals) {
    for (const e of m.entries) {
      totals.cal += e.calories; totals.p += e.protein_g; totals.c += e.carbs_g; totals.f += e.fat_g;
    }
  }
  return totals;
}

let initPromise: Promise<void> | null = null;
let rolloverWired = false;

export const useOath = create<OathStore>()((set, get) => {
  const pushEffects = (queued: EffectEvent[]): void => {
    if (queued.length === 0) return;
    set((s) => ({ effects: [...s.effects, ...queued] }));
  };

  /** Queue the xp / levelUp / siegeKill effects for a CompletionResult. */
  const applyCompletion = (res: CompletionResult): void => {
    const queued: EffectEvent[] = [{ kind: 'xp', amount: res.xp, at: Date.now() }];
    if (res.leveledTo !== undefined) {
      const from = get().character.level;
      const age = res.unlocked.find((u) => u.kind === 'armorAge');
      queued.push(age !== undefined
        ? { kind: 'levelUp', from, to: res.leveledTo, ageReveal: age.name }
        : { kind: 'levelUp', from, to: res.leveledTo });
    }
    if (res.siegeKilled) {
      queued.push({ kind: 'siegeKill', name: get().siege?.name ?? 'THE SIEGE' });
    }
    pushEffects(queued);
  };

  const pushDaySeal = async (d: DailyScore): Promise<void> => {
    const events = await db.xpEvents.where('date').equals(d.date).toArray();
    const xp = events.reduce((sum, e) => sum + e.amount, 0);
    const streaks = await kvGet<StreakState>('streaks', INITIAL_STREAKS);
    pushEffects([{ kind: 'daySeal', date: d.date, score: d.score, rank: d.rank, xp, streak: streaks.overall }]);
  };

  /**
   * Meal-plan quest auto-evaluation: when a nutrition-kind instance exists today,
   * complete it once all configured rules hold (protein ≥ goal, calories within
   * ±band%, ≥ minMeals meals logged). Runs on every refresh — idempotent.
   */
  const evaluateMealPlan = async (): Promise<void> => {
    const today = get().today;
    const nutrition = (await db.instances.where('date').equals(today).toArray())
      .find((i) => i.kind === 'nutrition' && i.status === 'todo');
    if (nutrition === undefined) return;
    const goals = await kvGet<NutritionGoal>('nutritionGoal', DEFAULT_NUTRITION_GOAL);
    const rules = goals.mealPlanRules;
    const meals = (await db.meals.where('date').equals(today).toArray())
      .filter((m) => m.entries.length > 0);
    const macros = macroTotals(meals);
    const proteinOk = !rules.proteinGoal || macros.p >= goals.protein;
    const calOk = Math.abs(macros.cal - goals.calories) <= goals.calories * (rules.calorieBandPct / 100);
    const mealsOk = meals.length >= rules.minMeals;
    if (proteinOk && calOk && mealsOk) {
      applyCompletion(await completeInstance(nutrition.id, new Date().toISOString()));
    }
  };

  /** Advance the ledger to the (possibly new) current date and reload. */
  const rollover = async (): Promise<void> => {
    const today = dayKey(new Date());
    set({ today });
    const { sealedDays } = await ensureDay(today);
    await ensureSiege(today);
    const latest = sealedDays[sealedDays.length - 1];
    if (latest !== undefined) await pushDaySeal(latest);
    await get().refresh();
  };

  /**
   * Cross-device sync through the bridge (see data/sync.ts). Debounced after
   * mutations; pulled on init and when the app returns to the foreground.
   * suppressSync prevents the restore-triggered refresh from re-scheduling.
   */
  let suppressSync = false;
  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  const doSync = async (): Promise<void> => {
    const url = resolveBridgeUrl(get().settings.bridgeUrl);
    if (url === null || typeof fetch === 'undefined') { set({ syncStatus: 'off' }); return; }
    if (suppressSync) return;
    suppressSync = true;
    set({ syncStatus: 'syncing' });
    try {
      const { status } = await syncNow(url);
      if (status === 'synced') {
        set({ syncStatus: 'synced', lastSyncAt: new Date().toISOString() });
        suppressSync = true; // refresh below must not reschedule a push
        await get().refresh();
      } else {
        set({ syncStatus: 'off' });
      }
    } catch {
      set({ syncStatus: 'error' });
    } finally {
      suppressSync = false;
    }
  };
  const scheduleSync = (): void => {
    if (suppressSync || typeof window === 'undefined') return;
    if (syncTimer !== null) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => { syncTimer = null; void doSync(); }, 4000);
  };

  /** Midnight timer + visibility/online listeners (browser only; no-op in tests). */
  const wireRollover = (): void => {
    if (rolloverWired || typeof window === 'undefined' || typeof document === 'undefined') return;
    rolloverWired = true;
    const arm = (): void => {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      window.setTimeout(() => { void rollover().then(arm); }, midnight.getTime() - now.getTime());
    };
    arm();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (dayKey(new Date()) !== get().today) void rollover();
      void doSync();
    });
    window.addEventListener('online', () => {
      void drainAi().then(() => get().refresh());
    });
  };

  return {
    ready: false,
    initError: null,
    syncStatus: 'off' as const,
    lastSyncAt: null,
    async syncNow(): Promise<void> { await doSync(); },
    today: dayKey(new Date()),
    tab: 'today',
    instances: [],
    templates: [],
    categories: [],
    character: {
      ...INITIAL_CHARACTER,
      title: titleForLevel(1), armorAge: armorAgeForLevel(1), into: 0, next: 40,
    },
    live: { score: 0, rank: 'F', pct: 0 },
    streaks: INITIAL_STREAKS,
    perQuestStreaks: {},
    vigor: INITIAL_VIGOR,
    vigorBand: bandOf(INITIAL_VIGOR),
    siege: null,
    week: [],
    goals: DEFAULT_NUTRITION_GOAL,
    meals: [],
    macros: { cal: 0, p: 0, c: 0, f: 0 },
    hydrationOz: 0,
    dailyScores: {},
    programs: [],
    exercises: [],
    sessions: [],
    prs: [],
    achievements: [],
    unlocks: [],
    settings: DEFAULT_SETTINGS,
    effects: [],
    aiQueueSize: 0,

    async init(): Promise<void> {
      if (initPromise !== null) return initPromise;
      set({ initError: null });
      // Ask the browser to mark our storage durable so the OS won't evict the
      // ledger under storage pressure. Best-effort — denial is fine.
      if (typeof navigator !== 'undefined' && navigator.storage !== undefined
        && typeof navigator.storage.persist === 'function') {
        navigator.storage.persist().catch(() => undefined);
      }
      initPromise = (async () => {
        try {
          await seedIfEmpty();
          const today = dayKey(new Date());
          set({ today });
          const { sealedDays } = await ensureDay(today);
          await ensureSiege(today);
          const latest = sealedDays[sealedDays.length - 1];
          if (latest !== undefined) await pushDaySeal(latest);
          await drainAi();
          await get().refresh();
          set({ ready: true });
          wireRollover();
          void doSync(); // pull the shared save once the UI is up
        } catch (err) {
          // Surface the failure and allow a retry instead of an eternal LOADING screen.
          initPromise = null;
          set({ initError: err instanceof Error ? err.message : String(err) });
        }
      })();
      return initPromise;
    },

    setTab(t: Tab): void {
      set({ tab: t });
    },

    async complete(id: string): Promise<void> {
      const res = await completeInstance(id, new Date().toISOString());
      if (res.xp > 0) applyCompletion(res);
      await get().refresh();
    },

    async uncomplete(id: string): Promise<void> {
      await uncompleteInstance(id);
      await get().refresh();
    },

    async addQuantity(id: string, amount: number): Promise<void> {
      const inst = await db.instances.get(id);
      if (inst === undefined) return;
      const res = await setQuantityProgress(id, inst.progress + amount, new Date().toISOString());
      if (res !== null && res.xp > 0) applyCompletion(res);
      await get().refresh();
    },

    async addHydration(oz: number): Promise<void> {
      const today = get().today;
      const at = new Date().toISOString();
      await db.hydration.add({ id: newId(), date: today, at, oz });
      const total = (await db.hydration.where('date').equals(today).toArray())
        .reduce((sum, h) => sum + h.oz, 0);
      // Feed the WATER quest: today's quantity instance measured in oz.
      const water = (await db.instances.where('date').equals(today).toArray())
        .find((i) => i.kind === 'quantity' && i.unit === 'oz');
      if (water !== undefined) {
        const res = await setQuantityProgress(water.id, total, at);
        if (res !== null && res.xp > 0) applyCompletion(res);
      }
      await get().refresh();
    },

    async saveTemplate(t: QuestTemplate): Promise<void> {
      await db.templates.put(t);
      const today = get().today;
      const existing = await db.instances.where('[templateId+date]').equals([t.id, today]).first();
      if (existing !== undefined && existing.status === 'todo') {
        if (!isScheduled(t.recurrence, today) && existing.progress === 0) {
          // Edited off today's schedule before anything happened on it.
          await db.instances.delete(existing.id);
        } else {
          // Sync today's un-actioned instance with the edited template.
          const synced: QuestInstance = {
            ...existing, name: t.name, categoryId: t.categoryId, difficulty: t.difficulty,
            kind: t.kind, main: t.main, optional: effectiveOptional(t),
          };
          delete synced.target;
          delete synced.unit;
          if (t.target !== undefined) synced.target = t.target;
          if (t.unit !== undefined) synced.unit = t.unit;
          await db.instances.put(synced);
        }
      }
      // Materializes today's instance immediately for a new/now-scheduled template.
      await ensureDay(today);
      await get().refresh();
    },

    async archiveTemplate(id: string): Promise<void> {
      const t = await db.templates.get(id);
      if (t === undefined) return;
      await db.templates.put({ ...t, archivedAt: new Date().toISOString() });
      // Drop today's un-actioned instance; history on past days is untouched.
      const inst = await db.instances.where('[templateId+date]').equals([id, get().today]).first();
      if (inst !== undefined && inst.status === 'todo') await db.instances.delete(inst.id);
      await get().refresh();
    },

    async addCategory(name: string): Promise<void> {
      await db.categories.add({ id: newId(), name, builtin: false });
      await get().refresh();
    },

    async saveProgram(p: WorkoutProgram): Promise<void> {
      if (p.active) {
        const others = await db.programs.toArray();
        for (const o of others) {
          if (o.id !== p.id && o.active) await db.programs.put({ ...o, active: false });
        }
      }
      await db.programs.put(p);
      await get().refresh();
    },

    async startSession(workoutDayId: string): Promise<string> {
      const id = newId();
      await db.sessions.add({
        id, date: get().today, workoutDayId, startedAt: new Date().toISOString(), sets: [],
      });
      await get().refresh();
      return id;
    },

    async logSet(sessionId: string, exerciseSet: ExerciseSet): Promise<void> {
      const session = await db.sessions.get(sessionId);
      if (session === undefined) return;
      await db.sessions.put({ ...session, sets: [...session.sets, exerciseSet] });
      // PR detection: e1rm above the previous best for the exercise (0 if none).
      const score = e1rm(exerciseSet.weight, exerciseSet.reps);
      const best = (await db.prs.where('exerciseId').equals(exerciseSet.exerciseId).toArray())
        .reduce((max, p) => Math.max(max, p.e1rm), 0);
      if (score > best) {
        const pr: PersonalRecord = {
          id: newId(), exerciseId: exerciseSet.exerciseId, date: session.date,
          weight: exerciseSet.weight, reps: exerciseSet.reps, e1rm: score,
        };
        await db.prs.add(pr);
        await db.xpEvents.add({
          id: newId(), date: session.date, at: new Date().toISOString(),
          amount: PR_XP, source: 'pr', refId: pr.id,
        });
        pushEffects([{ kind: 'pr', label: `${exerciseSet.weight}×${exerciseSet.reps}`, xp: PR_XP }]);
      }
      await get().refresh();
    },

    async finishSession(sessionId: string, notes?: string): Promise<void> {
      const session = await db.sessions.get(sessionId);
      if (session === undefined) return;
      const finished: WorkoutSession = { ...session, finishedAt: new Date().toISOString() };
      if (notes !== undefined) finished.notes = notes;
      await db.sessions.put(finished);
      // Complete today's workout-kind instance (the main quest first if several).
      const workout = (await db.instances.where('date').equals(get().today).toArray())
        .filter((i) => i.kind === 'workout' && i.status === 'todo')
        .sort((a, b) => Number(b.main) - Number(a.main))[0];
      if (workout !== undefined) {
        const res = await completeInstance(workout.id, new Date().toISOString());
        if (res.xp > 0) applyCompletion(res);
      }
      await get().refresh();
    },

    async logMealUtterance(text: string): Promise<void> {
      const hasKey = get().settings.anthropicKey !== undefined && get().settings.anthropicKey !== '';
      const meal: Meal = {
        id: newId(), date: get().today, at: new Date().toISOString(),
        entries: [], utterance: text,
        status: hasKey ? 'estimating' : 'needs_review',
      };
      await db.meals.add(meal);
      const queue = await kvGet<AiQueueItem[]>('aiQueue', []);
      queue.push({ mealId: meal.id, utterance: text });
      await kvSet('aiQueue', queue);
      await drainAi();
      await get().refresh();
    },

    async correctFoodEntry(mealId: string, idx: number, patch: Partial<FoodEntry>): Promise<void> {
      const meal = await db.meals.get(mealId);
      if (meal === undefined || meal.entries[idx] === undefined) return;
      const entry: FoodEntry = { ...meal.entries[idx], ...patch, corrected: true };
      const entries = meal.entries.slice();
      entries[idx] = entry;
      await db.meals.put({ ...meal, entries });
      const corrections = await kvGet<FoodCorrection[]>('corrections', []);
      corrections.push({
        match: normalizeFood(`${entry.food} ${entry.quantity} ${entry.unit}`),
        cal: entry.calories, p: entry.protein_g, c: entry.carbs_g, f: entry.fat_g,
      });
      await kvSet('corrections', corrections.slice(-20));
      await get().refresh();
    },

    async deleteMeal(mealId: string): Promise<void> {
      const meal = await db.meals.get(mealId);
      if (meal === undefined) return;
      await db.meals.delete(mealId);
      // Drop any still-queued SCRIBE item for this meal.
      const queue = await kvGet<AiQueueItem[]>('aiQueue', []);
      await kvSet('aiQueue', queue.filter((i) => i.mealId !== mealId));
      // The meal-plan quest is auto-evaluated; if its rules no longer hold after
      // the deletion, revert the auto-completion symmetrically.
      const nutrition = (await db.instances.where('date').equals(get().today).toArray())
        .find((i) => i.kind === 'nutrition' && i.status === 'done');
      if (nutrition !== undefined) {
        const goals = await kvGet<NutritionGoal>('nutritionGoal', DEFAULT_NUTRITION_GOAL);
        const rules = goals.mealPlanRules;
        const meals = (await db.meals.where('date').equals(get().today).toArray())
          .filter((m) => m.entries.length > 0);
        const macros = macroTotals(meals);
        const proteinOk = !rules.proteinGoal || macros.p >= goals.protein;
        const calOk = Math.abs(macros.cal - goals.calories) <= goals.calories * (rules.calorieBandPct / 100);
        if (!(proteinOk && calOk && meals.length >= rules.minMeals)) {
          await uncompleteInstance(nutrition.id);
        }
      }
      await get().refresh();
    },

    async editPastDay(date: string, instanceId: string, done: boolean): Promise<void> {
      await lifecycleEditPastDay(date, instanceId, done);
      await get().refresh();
    },

    async updateSettings(patch: Partial<UserSettings>): Promise<void> {
      const current = await kvGet<UserSettings>('settings', DEFAULT_SETTINGS);
      await kvSet('settings', { ...current, ...patch });
      await get().refresh();
    },

    async updateGoals(patch: Partial<NutritionGoal>): Promise<void> {
      const current = await kvGet<NutritionGoal>('nutritionGoal', DEFAULT_NUTRITION_GOAL);
      await kvSet('nutritionGoal', { ...current, ...patch });
      await get().refresh();
    },

    popEffect(): void {
      set((s) => ({ effects: s.effects.slice(1) }));
    },

    async refresh(): Promise<void> {
      const today = get().today;
      // Derived caches (character stats, streaks, vigor, achievements) refresh
      // on EVERY refresh so views never show stale progress.
      await recomputeDerived();
      // Meal-plan quest auto-evaluation reacts to any macros change.
      await evaluateMealPlan();

      const templatesAll = await db.templates.toArray();
      const templates = templatesAll.filter((t) => t.archivedAt === undefined);
      const categories = await db.categories.toArray();

      const todaysRaw = await db.instances.where('date').equals(today).toArray();
      const orderOf = (i: QuestInstance): number => (i.main ? 0 : i.optional ? 2 : 1);
      const instances = todaysRaw.slice()
        .sort((a, b) => orderOf(a) - orderOf(b) || a.name.localeCompare(b.name));

      const scoreables = todaysRaw.map(toScoreable);
      const score = dayScore(scoreables);
      const rank = dayRank(score, scoreables);

      const charRaw = await kvGet<Character>('character', INITIAL_CHARACTER);
      const { into, next } = levelForXp(charRaw.xpTotal);
      const character = {
        ...charRaw,
        title: titleForLevel(charRaw.level),
        armorAge: armorAgeForLevel(charRaw.level),
        into, next,
      };

      const streaks = await kvGet<StreakState>('streaks', INITIAL_STREAKS);
      const vigor = await kvGet<number>('vigor', INITIAL_VIGOR);

      const completions = await db.completions.toArray();
      const doneByTemplate = new Map<string, Set<string>>();
      for (const c of completions) {
        const dates = doneByTemplate.get(c.templateId) ?? new Set<string>();
        dates.add(c.date);
        doneByTemplate.set(c.templateId, dates);
      }
      const perQuestStreaks: Record<string, number> = {};
      for (const t of templates) {
        const from = dayKey(new Date(t.createdAt));
        const scheduled = from <= today ? scheduledDatesInRange(t.recurrence, from, today) : [];
        perQuestStreaks[t.id] = perQuestStreak(
          t.id, scheduled, doneByTemplate.get(t.id) ?? new Set<string>(), today,
        );
      }

      const dailyScores: Record<string, DailyScore> = {};
      for (const d of await db.dailyScores.toArray()) {
        if (d.sealed) dailyScores[d.date] = d;
      }

      const ws = weekStartOf(today);
      const week = eachDay(ws, addDays(ws, 6)).map((d) => ({
        date: d, rank: dailyScores[d]?.rank ?? null, isToday: d === today,
      }));

      const siege = (await db.sieges.get(ws)) ?? null;

      const goals = await kvGet<NutritionGoal>('nutritionGoal', DEFAULT_NUTRITION_GOAL);
      const meals = (await db.meals.where('date').equals(today).toArray())
        .sort((a, b) => (a.at < b.at ? -1 : 1));
      const macros = macroTotals(meals);
      const hydrationOz = (await db.hydration.where('date').equals(today).toArray())
        .reduce((sum, h) => sum + h.oz, 0);

      const programs = await db.programs.toArray();
      const exercises = await db.exercises.toArray();
      const sessions = await db.sessions.toArray();
      const prs = await db.prs.toArray();
      const achievements = await kvGet<Achievement[]>('achievements', []);
      const unlocks = await kvGet<Unlock[]>('unlocks', []);
      const settings = await kvGet<UserSettings>('settings', DEFAULT_SETTINGS);
      const aiQueueSize = (await kvGet<AiQueueItem[]>('aiQueue', [])).length;

      set({
        instances, templates, categories, character,
        live: { score, rank, pct: score },
        streaks, perQuestStreaks, vigor, vigorBand: bandOf(vigor), siege, week,
        goals, meals, macros, hydrationOz, dailyScores,
        programs, exercises, sessions, prs, achievements, unlocks, settings, aiQueueSize,
      });

      // Re-arm today's best-effort notification timers (Task 20). refresh() runs
      // after init, midnight rollover, and every mutation, so plans always track
      // current quest/streak state. No-op outside the browser.
      scheduleNotifications(get());
      // Push local changes to the shared save shortly after things settle.
      scheduleSync();
    },
  };
});
