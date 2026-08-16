import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { db, kvGet } from '../../data/db';
import { dayKey } from '../../core/dates';
import { newId } from '../../core/ids';
import { useOath, e1rm } from '../store';
import { TABS } from '../tabs';
import type { Meal, QuestInstance, QuestTemplate } from '../../core/types';

const today = dayKey(new Date());

async function inst(name: string): Promise<QuestInstance | undefined> {
  const rows = await db.instances.where('date').equals(today).toArray();
  return rows.find((r) => r.name === name);
}

function drainEffects(): void {
  while (useOath.getState().effects.length > 0) useOath.getState().popEffect();
}

function template(partial: Partial<QuestTemplate> & { name: string }): QuestTemplate {
  return {
    id: newId(), categoryId: useOath.getState().categories[0].id,
    difficulty: 'easy', kind: 'binary', main: false, optional: false,
    recurrence: { type: 'everyDay' }, reminders: [], createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe('OathStore', () => {
  beforeAll(async () => {
    await db.delete();
    await db.open();
    await useOath.getState().init();
  });

  it('init: seeds, generates today, loads all views, ready', () => {
    const s = useOath.getState();
    expect(s.ready).toBe(true);
    expect(s.today).toBe(today);
    const names = s.instances.map((i) => i.name);
    expect(names).toContain('MORNING ROUTINE');
    expect(names).toContain('WATER');
    expect(names).toContain('WALK');
    expect(s.siege).not.toBeNull();
    expect(s.character.level).toBe(1);
    expect(s.character.title).toBe('Wanderer');
    expect(s.character.armorAge[1]).toBe('WANDERER');
    expect(s.character.next).toBe(40);
    expect(s.achievements).toHaveLength(9);
    expect(s.week).toHaveLength(7);
    expect(s.week.filter((d) => d.isToday)).toHaveLength(1);
    expect(s.vigor).toBe(50);
    expect(s.vigorBand).toBe('EMBER CAMP');
    expect(s.effects).toHaveLength(0);
    // sorted: required before optional
    const walkIdx = names.indexOf('WALK');
    expect(walkIdx).toBe(names.length - 1);
  });

  it('all 5 tabs switch through the store', () => {
    expect(TABS).toHaveLength(5);
    for (const t of TABS) {
      useOath.getState().setTab(t.id);
      expect(useOath.getState().tab).toBe(t.id);
    }
  });

  it('complete → live score changes and one xp effect queued; uncomplete reverts', async () => {
    const before = useOath.getState().live.score;
    const routine = (await inst('MORNING ROUTINE'))!;
    await useOath.getState().complete(routine.id);
    let s = useOath.getState();
    expect(s.live.score).toBeGreaterThan(before);
    expect(s.live.pct).toBe(s.live.score);
    const xpEffects = s.effects.filter((e) => e.kind === 'xp');
    expect(xpEffects).toHaveLength(1);
    expect(xpEffects[0]).toMatchObject({ kind: 'xp', amount: 10 });
    drainEffects();

    await useOath.getState().uncomplete(routine.id);
    expect((await inst('MORNING ROUTINE'))!.status).toBe('todo');
    s = useOath.getState();
    expect(s.live.score).toBe(before);
    await useOath.getState().complete(routine.id);
    drainEffects();
  });

  it('addHydration feeds the WATER instance and auto-completes at target', async () => {
    await useOath.getState().addHydration(64);
    expect(useOath.getState().hydrationOz).toBe(64);
    expect((await inst('WATER'))!.status).toBe('todo');
    expect((await inst('WATER'))!.progress).toBe(64);

    await useOath.getState().addHydration(64);
    const s = useOath.getState();
    expect(s.hydrationOz).toBe(128);
    const water = (await inst('WATER'))!;
    expect(water.status).toBe('done');
    expect(water.progress).toBe(128);
    expect(s.effects.some((e) => e.kind === 'xp' && e.amount === 25)).toBe(true);
    drainEffects();
  });

  it('saveTemplate materializes today instance immediately when scheduled today', async () => {
    const t = template({ name: 'READ' });
    await useOath.getState().saveTemplate(t);
    const created = await inst('READ');
    expect(created).toBeDefined();
    expect(created!.status).toBe('todo');
    expect(useOath.getState().templates.some((x) => x.id === t.id)).toBe(true);
    expect(useOath.getState().perQuestStreaks[t.id]).toBe(0);

    // editing syncs today's un-actioned instance
    await useOath.getState().saveTemplate({ ...t, name: 'READ BOOKS' });
    expect(await inst('READ')).toBeUndefined();
    expect(await inst('READ BOOKS')).toBeDefined();
  });

  it('logSet detects PRs: PersonalRecord row + pr XPEvent(+25) + pr effect', async () => {
    const bench = (await db.exercises.toArray()).find((e) => e.name === 'Bench Press')!;
    const sid = await useOath.getState().startSession('day-adhoc');
    await useOath.getState().logSet(sid, { exerciseId: bench.id, setIndex: 0, weight: 100, reps: 5 });
    expect(e1rm(100, 5)).toBe(117);
    let prs = await db.prs.where('exerciseId').equals(bench.id).toArray();
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({ weight: 100, reps: 5, e1rm: 117 });
    const prEvents = (await db.xpEvents.toArray()).filter((e) => e.source === 'pr');
    expect(prEvents).toHaveLength(1);
    expect(prEvents[0].amount).toBe(25);
    expect(useOath.getState().effects.some((e) => e.kind === 'pr' && e.xp === 25)).toBe(true);
    expect(useOath.getState().prs).toHaveLength(1);
    drainEffects();

    // lower e1rm → no new PR
    await useOath.getState().logSet(sid, { exerciseId: bench.id, setIndex: 1, weight: 90, reps: 5 });
    expect(await db.prs.where('exerciseId').equals(bench.id).count()).toBe(1);
    // higher e1rm → new PR
    await useOath.getState().logSet(sid, { exerciseId: bench.id, setIndex: 2, weight: 110, reps: 5 });
    prs = await db.prs.where('exerciseId').equals(bench.id).toArray();
    expect(prs).toHaveLength(2);
    const session = (await db.sessions.get(sid))!;
    expect(session.sets).toHaveLength(3);
    drainEffects();
  });

  it('finishSession completes today workout instance; STR = 10 + finished sessions', async () => {
    await useOath.getState().saveTemplate(template({ name: 'LIFT', kind: 'workout', difficulty: 'hard' }));
    expect((await inst('LIFT'))!.status).toBe('todo');

    const sid = await useOath.getState().startSession('day-1');
    await useOath.getState().finishSession(sid, 'good');
    const session = (await db.sessions.get(sid))!;
    expect(session.finishedAt).toBeDefined();
    expect(session.notes).toBe('good');

    const workouts = (await db.instances.where('date').equals(today).toArray())
      .filter((i) => i.kind === 'workout');
    expect(workouts.some((i) => i.status === 'done')).toBe(true);
    // the PR session above was never finished — only one finished session
    expect(useOath.getState().character.str).toBe(11);
    drainEffects();
  });

  it('stat derivations + achievements update on every refresh', async () => {
    let s = useOath.getState();
    expect(s.character.vit).toBe(10 + s.streaks.overallBest);
    expect(s.character.wil).toBe(10);

    // A sealed S day appears in the ledger → refresh alone refolds everything.
    await db.dailyScores.put({
      date: '2000-01-05', score: 95, rank: 'S',
      requiredDone: 1, requiredTotal: 1, emberSpent: false, sealed: true,
    });
    await useOath.getState().refresh();
    s = useOath.getState();
    expect(s.character.wil).toBe(13); // 10 + 3 (S day)
    expect(s.character.vit).toBe(11); // 10 + overallBest 1
    expect(s.streaks.overallBest).toBe(1);
    expect(s.dailyScores['2000-01-05']).toBeDefined();
    expect(s.achievements.find((a) => a.id === 'beginning')!.progress).toBe(1);
    expect(s.achievements.find((a) => a.id === 'sRank')!.progress).toBe(1);
  });

  it('meal-plan quest auto-completes when all rules are met', async () => {
    await useOath.getState().saveTemplate(template({ name: 'MEAL PLAN', kind: 'nutrition', difficulty: 'medium' }));
    expect((await inst('MEAL PLAN'))!.status).toBe('todo');

    await useOath.getState().updateGoals({
      calories: 1000, protein: 50,
      mealPlanRules: { proteinGoal: true, calorieBandPct: 10, minMeals: 1 },
    });
    expect(useOath.getState().goals.calories).toBe(1000);
    expect((await inst('MEAL PLAN'))!.status).toBe('todo'); // no meals logged yet

    const meal: Meal = {
      id: newId(), date: today, at: new Date().toISOString(), status: 'done',
      entries: [{
        food: 'chicken bowl', quantity: 1, unit: 'serving',
        calories: 1000, protein_g: 60, carbs_g: 80, fat_g: 25,
        confidence: 0.9, corrected: false,
      }],
    };
    await db.meals.add(meal);
    await useOath.getState().refresh();
    expect((await inst('MEAL PLAN'))!.status).toBe('done');
    expect(useOath.getState().macros).toEqual({ cal: 1000, p: 60, c: 80, f: 25 });
    drainEffects();
  });

  it('logMealUtterance queues for SCRIBE; needs_review without an API key', async () => {
    await useOath.getState().logMealUtterance('2 eggs');
    const s = useOath.getState();
    expect(s.aiQueueSize).toBe(1);
    const meal = s.meals.find((m) => m.utterance === '2 eggs');
    expect(meal).toBeDefined();
    expect(meal!.status).toBe('needs_review'); // no anthropicKey set
  });

  it('correctFoodEntry marks corrected and records a normalized correction', async () => {
    const meal = useOath.getState().meals.find((m) => m.entries.length > 0)!;
    await useOath.getState().correctFoodEntry(meal.id, 0, { calories: 900 });
    const updated = (await db.meals.get(meal.id))!;
    expect(updated.entries[0].calories).toBe(900);
    expect(updated.entries[0].corrected).toBe(true);
    const corrections = await kvGet<{ match: string; cal: number }[]>('corrections', []);
    expect(corrections).toHaveLength(1);
    expect(corrections[0].cal).toBe(900);
    expect(corrections[0].match).toBe('chicken bowl 1 serving');
  });

  it('updateSettings persists through refresh', async () => {
    await useOath.getState().updateSettings({ crt: false });
    expect(useOath.getState().settings.crt).toBe(false);
    await useOath.getState().refresh();
    expect(useOath.getState().settings.crt).toBe(false);
  });
});
