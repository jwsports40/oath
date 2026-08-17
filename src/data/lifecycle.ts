// data/lifecycle.ts — day generation, sealing, and event-log recompute.
// QuestCompletion + XPEvent records are the source of truth; DailyScore,
// streaks, vigor, character and achievements are recomputed caches.
// Failure rules: missed quests get FAILED status, never removed. NEVER XP loss,
// level loss, or deleted history.
import { db, kvGet, kvSet } from './db';
import { newId } from '../core/ids';
import { addDays, dayKey, eachDay, romanNumeral, weekStartOf } from '../core/dates';
import { isScheduled, scheduledDatesInRange } from './recurrence';
import { dayScore, dayRank, toScoreable } from '../game/scoring';
import { xpAward, levelForXp } from '../game/xp';
import { foldStreaks, perQuestStreak, rankAtLeast, type DayOutcome } from '../game/streaks';
import { nextVigor, INITIAL_VIGOR } from '../game/vigor';
import { newSiege, bossHeal, dealDamage, KILL_XP } from '../game/siege';
import {
  carryFactor, critMult, dmgMult, healPct, optionalCap, workoutXpMult,
} from '../game/body';
import { chestEntitlements, lootEffects, type LootEffects } from '../game/loot';
import { ARMOR_AGES, DIFFICULTY, TITLES } from '../core/types';
import { DEFAULT_NUTRITION_GOAL } from './seed';
import type {
  Achievement, Character, Chest, DailyScore, Equipped, LootItem, NutritionGoal,
  QuestInstance, QuestTemplate, Rank, SiegeState, Unlock,
} from '../core/types';

/**
 * Current perk context: cached stats, the EFFECTIVE age level (admin override
 * wins), and the aggregated effects of the attached loot.
 */
async function perkContext(): Promise<{
  level: number; ageLevel: number; str: number; wil: number; stam: number; fx: LootEffects;
}> {
  const ch = await kvGet<Character>('character', { level: 1, xpTotal: 0, str: 10, vit: 10, wil: 10, stam: 10 });
  const settings = await kvGet<{ adminKnightLevel?: number }>('settings', {});
  const equipped = await kvGet<Equipped>('equipped', {});
  const ids = [equipped.token, equipped.enchant, equipped.totem]
    .filter((x): x is string => typeof x === 'string');
  const items = (await Promise.all(ids.map((i) => db.loot.get(i))))
    .filter((x): x is LootItem => x !== undefined);
  return {
    level: ch.level,
    ageLevel: settings.adminKnightLevel ?? ch.level,
    str: ch.str, wil: ch.wil, stam: ch.stam ?? 10,
    fx: lootEffects(items),
  };
}

export interface CompletionResult {
  xp: number;
  crit: boolean;
  leveledTo?: number;
  newRank: Rank;
  score: number;
  siegeDamage: number;
  siegeKilled: boolean;
  unlocked: Unlock[];
}

const DEFAULT_CHARACTER: Character = { level: 1, xpTotal: 0, str: 10, vit: 10, wil: 10 };

/** Round half-up per Global Constraints. */
const round = (x: number): number => Math.floor(x + 0.5);

/** perWeek templates materialize daily as optional regardless of the flag. */
function effectiveOptional(t: QuestTemplate): boolean {
  return t.optional || t.recurrence.type === 'perWeek';
}

/** Create today's instances for every scheduled, non-archived template (idempotent). */
async function materializeDay(d: string): Promise<void> {
  const templates = await db.templates.toArray();
  for (const t of templates) {
    if (t.archivedAt !== undefined) continue;
    if (dayKey(new Date(t.createdAt)) > d) continue; // never backfill before the template existed
    if (!isScheduled(t.recurrence, d)) continue;
    const existing = await db.instances.where('[templateId+date]').equals([t.id, d]).first();
    if (existing !== undefined) continue;
    const instance: QuestInstance = {
      id: newId(), templateId: t.id, date: d,
      name: t.name, categoryId: t.categoryId, difficulty: t.difficulty, kind: t.kind,
      main: t.main, optional: effectiveOptional(t),
      status: 'todo', progress: 0,
    };
    if (t.target !== undefined) instance.target = t.target;
    if (t.unit !== undefined) instance.unit = t.unit;
    await db.instances.add(instance);
  }
}

/**
 * Seal a past day: mark unfinished required instances 'failed' (optionals never
 * fail), compute score/rank, write DailyScore{sealed:true}, heal the boss if
 * the day ends below C. Returns null when the day has no instances.
 */
async function sealDay(d: string): Promise<DailyScore | null> {
  const instances = await db.instances.where('date').equals(d).toArray();
  if (instances.length === 0) return null;
  for (const inst of instances) {
    if (!inst.optional && inst.status === 'todo') {
      inst.status = 'failed';
      await db.instances.put(inst);
    }
  }
  const perk = await perkContext();
  const scoreables = instances.map(toScoreable);
  const score = dayScore(scoreables, optionalCap(perk.stam, perk.ageLevel));
  const rank = dayRank(score, scoreables);
  const required = instances.filter((i) => !i.optional);
  const prev = await db.dailyScores.get(d);
  const sealed: DailyScore = {
    date: d, score, rank,
    requiredDone: required.filter((i) => i.status === 'done').length,
    requiredTotal: required.length,
    emberSpent: prev?.emberSpent ?? false, // refolded by recomputeDerived
    sealed: true,
  };
  await db.dailyScores.put(sealed);
  if (!rankAtLeast(rank, 'C')) {
    const siege = await db.sieges.get(weekStartOf(d));
    if (siege !== undefined && !siege.killed) await db.sieges.put(bossHeal(siege, Math.max(0.005, healPct(perk.ageLevel) - perk.fx.healPtDown)));
  }
  return sealed;
}

/** Recompute the live (unsealed) DailyScore for a day. No-op on sealed days. */
async function updateLiveScore(d: string): Promise<{ score: number; rank: Rank }> {
  const existing = await db.dailyScores.get(d);
  if (existing?.sealed) return { score: existing.score, rank: existing.rank };
  const instances = await db.instances.where('date').equals(d).toArray();
  const perk = await perkContext();
  const scoreables = instances.map(toScoreable);
  const score = dayScore(scoreables, optionalCap(perk.stam, perk.ageLevel));
  const rank = dayRank(score, scoreables);
  const required = instances.filter((i) => !i.optional);
  await db.dailyScores.put({
    date: d, score, rank,
    requiredDone: required.filter((i) => i.status === 'done').length,
    requiredTotal: required.length,
    emberSpent: false, sealed: false,
  });
  return { score, rank };
}

/**
 * Bring the ledger up to `today`: materialize every missing day since the last
 * generated one (or the seed day), sealing each passed day along the way, then
 * refresh today's live score and refold all derived state.
 */
export async function ensureDay(today: string): Promise<{
  sealedDays: DailyScore[]; leveledFrom?: number; leveledTo?: number;
}> {
  const before = await kvGet<Character>('character', DEFAULT_CHARACTER);
  const last = await db.instances.orderBy('date').last();
  const seedDay = await kvGet<string>('seedDay', today);
  const start = last !== undefined ? addDays(last.date, 1) : (seedDay < today ? seedDay : today);
  for (const d of eachDay(start, today)) await materializeDay(d);
  // Re-materialize today regardless: picks up templates created after generation.
  if (start > today) await materializeDay(today);

  const sealedDays: DailyScore[] = [];
  const first = await db.instances.orderBy('date').first();
  if (first !== undefined) {
    for (const d of eachDay(first.date, addDays(today, -1))) {
      const existing = await db.dailyScores.get(d);
      if (existing?.sealed) continue;
      const sealed = await sealDay(d);
      if (sealed !== null) sealedDays.push(sealed);
    }
  }
  await updateLiveScore(today);
  await recomputeDerived();
  const after = await kvGet<Character>('character', before);
  return after.level > before.level
    ? { sealedDays, leveledFrom: before.level, leveledTo: after.level }
    : { sealedDays };
}

/** Per-quest streak for an instance's template as of the instance's date. */
async function questStreakFor(inst: QuestInstance): Promise<number> {
  const t = await db.templates.get(inst.templateId);
  if (t === undefined) return 0;
  const from = dayKey(new Date(t.createdAt));
  const scheduled = from <= inst.date ? scheduledDatesInRange(t.recurrence, from, inst.date) : [];
  const completions = await db.completions.where('templateId').equals(t.id).toArray();
  return perQuestStreak(t.id, scheduled, new Set(completions.map((c) => c.date)), inst.date);
}

/** Award a Crest Fragment for a boss kill; 3 fragments forge a crest Unlock. */
async function awardFragment(at: string): Promise<void> {
  let fragments = (await kvGet<number>('fragments', 0)) + 1;
  if (fragments >= 3) {
    fragments = 0;
    const unlocks = await kvGet<Unlock[]>('unlocks', []);
    const crestNumber = unlocks.filter((u) => u.kind === 'crest').length + 1;
    unlocks.push({
      id: `crest-${crestNumber}`, kind: 'crest',
      name: `CREST ${romanNumeral(crestNumber)}`, unlockedAt: at,
    });
    await kvSet('unlocks', unlocks);
  }
  await kvSet('fragments', fragments);
}

/**
 * Complete an instance: write completion + XPEvent (xpAward with the per-quest
 * streak), deal siege damage (crit if main), refresh the live score, recompute
 * character/achievements, and report level-ups + new unlocks.
 */
export async function completeInstance(id: string, at: string): Promise<CompletionResult> {
  const inst = await db.instances.get(id);
  if (inst === undefined) throw new Error(`no instance ${id}`);
  if (inst.status === 'done') {
    const live = await updateLiveScore(inst.date);
    return {
      xp: 0, crit: false, newRank: live.rank, score: live.score,
      siegeDamage: 0, siegeKilled: false, unlocked: [],
    };
  }

  const before = await kvGet<Character>('character', DEFAULT_CHARACTER);
  const unlockIdsBefore = new Set((await kvGet<Unlock[]>('unlocks', [])).map((u) => u.id));

  const streak = await questStreakFor(inst);
  const perk = await perkContext();
  // XP multipliers: STR + TRAINED KNIGHT perk (workouts) plus attached tokens.
  const firstOfDay = (await db.completions.where('date').equals(inst.date).count()) === 0;
  let bonus = perk.fx.xpAll
    + (inst.main ? perk.fx.xpMain : 0)
    + (firstOfDay ? perk.fx.xpFirst : 0);
  if (inst.kind === 'workout') {
    bonus += (workoutXpMult(perk.str, perk.ageLevel) - 1) + perk.fx.xpWorkout;
  }
  const baseXp = round(DIFFICULTY[inst.difficulty].xp * (1 + bonus));
  const xp = xpAward(baseXp, streak);
  await db.completions.add({
    id: newId(), instanceId: id, templateId: inst.templateId,
    date: inst.date, at, xp, crit: inst.main,
  });
  await db.xpEvents.add({ id: newId(), date: inst.date, at, amount: xp, source: 'quest', refId: id });
  const updated: QuestInstance = {
    ...inst, status: 'done', completedAt: at,
    progress: inst.kind === 'quantity' ? Math.max(inst.progress, inst.target ?? inst.progress) : 1,
  };
  await db.instances.put(updated);

  // Siege damage — only completing real quests deals damage.
  let siegeDamage = 0;
  let siegeKilled = false;
  const siege = await db.sieges.get(weekStartOf(inst.date));
  if (siege !== undefined && !siege.killed) {
    const struck = dealDamage(siege, xp, inst.main, inst.name, at, {
      crit: critMult(perk.wil, perk.ageLevel),
      dmg: dmgMult(perk.ageLevel) + perk.fx.siegeDmg,
    });
    siegeDamage = struck.log[struck.log.length - 1].amount;
    siegeKilled = struck.killed;
    if (siegeKilled) {
      struck.fragmentsAwarded = true;
      await db.xpEvents.add({
        id: newId(), date: inst.date, at, amount: KILL_XP, source: 'siegeKill', refId: siege.weekStart,
      });
      await awardFragment(at);
    }
    await db.sieges.put(struck);
  }

  const live = await updateLiveScore(inst.date);
  await recomputeDerived();
  const after = await kvGet<Character>('character', before);
  const unlocked = (await kvGet<Unlock[]>('unlocks', [])).filter((u) => !unlockIdsBefore.has(u.id));

  const result: CompletionResult = {
    xp, crit: inst.main, newRank: live.rank, score: live.score,
    siegeDamage, siegeKilled, unlocked,
  };
  if (after.level > before.level) result.leveledTo = after.level;
  return result;
}

/** Remove an instance's completion + XP event and recompute (history-safe undo). */
export async function uncompleteInstance(id: string): Promise<void> {
  const inst = await db.instances.get(id);
  if (inst === undefined || inst.status !== 'done') return;
  const completions = (await db.completions.where('date').equals(inst.date).toArray())
    .filter((c) => c.instanceId === id);

  // Restore siege hp for a still-living boss (a kill stands).
  const siege = await db.sieges.get(weekStartOf(inst.date));
  if (siege !== undefined && !siege.killed && completions.length > 0) {
    let hp = siege.hp;
    const log = [...siege.log];
    for (const c of completions) {
      const damage = round(c.xp * (c.crit ? 1.5 : 1));
      for (let i = log.length - 1; i >= 0; i--) {
        if (log[i].label === inst.name && log[i].amount === damage) {
          log.splice(i, 1);
          hp = Math.min(siege.maxHp, hp + damage);
          break;
        }
      }
    }
    await db.sieges.put({ ...siege, hp, log });
  }

  await db.completions.bulkDelete(completions.map((c) => c.id));
  const events = (await db.xpEvents.where('date').equals(inst.date).toArray())
    .filter((e) => e.source === 'quest' && e.refId === id);
  await db.xpEvents.bulkDelete(events.map((e) => e.id));

  const reverted: QuestInstance = {
    ...inst, status: 'todo',
    progress: inst.kind === 'quantity' ? inst.progress : 0,
  };
  delete reverted.completedAt;
  await db.instances.put(reverted);
  await updateLiveScore(inst.date);
  await recomputeDerived();
}

/**
 * Update a quantity quest's progress; auto-completes (via completeInstance)
 * when progress reaches the target while the instance is still todo.
 */
export async function setQuantityProgress(
  id: string, progress: number, at: string,
): Promise<CompletionResult | null> {
  const inst = await db.instances.get(id);
  if (inst === undefined || inst.kind !== 'quantity') return null;
  const clamped = Math.max(0, progress);
  await db.instances.put({ ...inst, progress: clamped });
  if (inst.status === 'todo' && inst.target !== undefined && clamped >= inst.target) {
    return completeInstance(id, at);
  }
  await updateLiveScore(inst.date);
  return null;
}

/**
 * Recompute every derived cache from the event log: refold sealed days into
 * streaks/embers, fold vigor from INITIAL_VIGOR, character from Σ xpEvents,
 * level unlocks, and achievements. Never deletes completions or xp events.
 */
export async function recomputeDerived(): Promise<void> {
  const sealed = (await db.dailyScores.toArray())
    .filter((d) => d.sealed)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  // Level first — armor-age perks feed the fold below.
  const events = await db.xpEvents.toArray();
  const xpTotal = events.reduce((sum, e) => sum + e.amount, 0);
  const { level } = levelForXp(xpTotal);

  // Per-day nutrition flags (protein grows HP, water grows STAM).
  const goals = await kvGet<NutritionGoal>('nutritionGoal', DEFAULT_NUTRITION_GOAL);
  const proteinByDate = new Map<string, number>();
  for (const m of await db.meals.toArray()) {
    const p = m.entries.reduce((sum, e) => sum + e.protein_g, 0);
    proteinByDate.set(m.date, (proteinByDate.get(m.date) ?? 0) + p);
  }
  const waterByDate = new Map<string, number>();
  for (const h of await db.hydration.toArray()) {
    waterByDate.set(h.date, (waterByDate.get(h.date) ?? 0) + h.oz);
  }

  // Streaks, embers, and the knight's body — one fold, one source of truth.
  const outcomes: DayOutcome[] = sealed.map((d) => ({
    date: d.date, rank: d.rank, score: d.score,
    proteinOk: (proteinByDate.get(d.date) ?? 0) >= goals.protein,
    waterOk: (waterByDate.get(d.date) ?? 0) >= goals.waterOz,
  }));
  const settings = await kvGet<{ adminKnightLevel?: number }>('settings', {});
  const equippedSlots = await kvGet<Equipped>('equipped', {});
  const equippedIds = [equippedSlots.token, equippedSlots.enchant, equippedSlots.totem]
    .filter((x): x is string => typeof x === 'string');
  const equippedItems = (await Promise.all(equippedIds.map((i) => db.loot.get(i))))
    .filter((x): x is LootItem => x !== undefined);
  const ageLevel = settings.adminKnightLevel ?? level;
  const { state: streaks, emberSpentDates, body } = foldStreaks(outcomes, {
    level: ageLevel, effects: lootEffects(equippedItems),
  });
  await kvSet('streaks', streaks);
  await kvSet('body', body);

  // Chest entitlements — deterministic ids derived from history; never re-rolled.
  const kills = (await db.sieges.toArray())
    .filter((sg) => sg.killed)
    .map((sg) => ({ weekStart: sg.weekStart, generation: sg.generation }));
  const earned = chestEntitlements({
    overallBest: streaks.overallBest, sRankBest: streaks.sRankBest, kills,
  });
  const nowIso = new Date().toISOString();
  for (const e of earned) {
    if ((await db.chests.get(e.id)) === undefined) {
      const chest: Chest = { id: e.id, kind: e.kind, source: e.source, earnedAt: nowIso };
      await db.chests.add(chest);
    }
  }
  const emberSet = new Set(emberSpentDates);
  for (const d of sealed) {
    const spent = emberSet.has(d.date);
    if (d.emberSpent !== spent) await db.dailyScores.put({ ...d, emberSpent: spent });
  }

  // World vigor
  let vigor = INITIAL_VIGOR;
  for (const d of sealed) vigor = nextVigor(vigor, d.score);
  await kvSet('vigor', vigor);

  // Character: stats fed by real habits (statboard design doc).
  const finishedSessions = (await db.sessions.toArray()).filter((s) => s.finishedAt !== undefined).length;
  await kvSet<Character>('character', {
    level, xpTotal,
    str: 10 + finishedSessions,
    vit: 10 + streaks.overallBest,
    wil: 10 + body.sRankDays,
    stam: 10 + body.waterDays,
  });

  // Armor-age / title unlocks for the current level (append-only, never revoked).
  const unlocks = await kvGet<Unlock[]>('unlocks', []);
  const have = new Set(unlocks.map((u) => u.id));
  const now = new Date().toISOString();
  let added = false;
  for (const [lv, name] of ARMOR_AGES) {
    if (lv <= level && !have.has(`armorAge-${lv}`)) {
      unlocks.push({ id: `armorAge-${lv}`, kind: 'armorAge', name, unlockedAt: now });
      added = true;
    }
  }
  for (const [lv, name] of TITLES) {
    if (lv <= level && !have.has(`title-${lv}`)) {
      unlocks.push({ id: `title-${lv}`, kind: 'title', name, unlockedAt: now });
      added = true;
    }
  }
  if (added) await kvSet('unlocks', unlocks);

  // Achievements (spec §9) — progress derived from the event log; unlockedAt sticky.
  const completions = await db.completions.toArray();
  const instances = await db.instances.toArray();
  const templates = await db.templates.toArray();
  const instanceById = new Map(instances.map((i) => [i.id, i]));
  const templateById = new Map(templates.map((t) => [t.id, t]));
  const killCount = events.filter((e) => e.source === 'siegeKill').length;
  const workoutCompletions = completions
    .filter((c) => templateById.get(c.templateId)?.kind === 'workout').length;
  const hydratedDays = new Set(
    completions
      .filter((c) => {
        const i = instanceById.get(c.instanceId);
        return i !== undefined && i.kind === 'quantity' && i.unit === 'oz';
      })
      .map((c) => c.date),
  ).size;
  const progressById: Record<string, number> = {
    beginning: Math.min(1, sealed.length),
    ironWill: workoutCompletions,
    hydrated: hydratedDays,
    perfectWeek: streaks.perfectBest,
    consistency: completions.length,
    sRank: sealed.some((d) => rankAtLeast(d.rank, 'S')) ? 1 : 0,
    siegebreaker: Math.min(1, killCount),
    crest: killCount,
    legend: level >= 100 ? 1 : 0,
  };
  const achievements = await kvGet<Achievement[]>('achievements', []);
  const refreshed = achievements.map((a) => {
    const progress = Math.min(a.target, progressById[a.id] ?? a.progress);
    const next: Achievement = { ...a, progress };
    if (next.unlockedAt === undefined && progress >= a.target) next.unlockedAt = now;
    return next;
  });
  await kvSet('achievements', refreshed);
}

/**
 * Toggle a past instance, re-seal that day (recompute its score/rank), then
 * recompute everything downstream. History is edited by adding/removing events,
 * never by rewriting scores directly.
 */
export async function editPastDay(date: string, instanceId: string, done: boolean): Promise<void> {
  const inst = await db.instances.get(instanceId);
  if (inst === undefined || inst.date !== date) return;
  if (done && inst.status !== 'done') {
    const streak = await questStreakFor(inst);
    const xp = xpAward(DIFFICULTY[inst.difficulty].xp, streak);
    const at = new Date().toISOString();
    await db.completions.add({
      id: newId(), instanceId, templateId: inst.templateId, date, at, xp, crit: inst.main,
    });
    await db.xpEvents.add({ id: newId(), date, at, amount: xp, source: 'quest', refId: instanceId });
    await db.instances.put({
      ...inst, status: 'done', completedAt: at,
      progress: inst.kind === 'quantity' ? Math.max(inst.progress, inst.target ?? inst.progress) : 1,
    });
  } else if (!done && inst.status === 'done') {
    const completions = (await db.completions.where('date').equals(date).toArray())
      .filter((c) => c.instanceId === instanceId);
    await db.completions.bulkDelete(completions.map((c) => c.id));
    const events = (await db.xpEvents.where('date').equals(date).toArray())
      .filter((e) => e.source === 'quest' && e.refId === instanceId);
    await db.xpEvents.bulkDelete(events.map((e) => e.id));
    const reverted: QuestInstance = {
      ...inst,
      status: inst.optional ? 'todo' : 'failed',
      progress: inst.kind === 'quantity' ? inst.progress : 0,
    };
    delete reverted.completedAt;
    await db.instances.put(reverted);
  }
  await sealDay(date);
  await recomputeDerived();
}

/**
 * Σ base XP of required instances scheduled Mon..Sun of the week — materialized
 * days use their instances, future days are projected from templates.
 */
export async function weekAvailableXp(weekStart: string): Promise<number> {
  const templates = await db.templates.toArray();
  let total = 0;
  for (const d of eachDay(weekStart, addDays(weekStart, 6))) {
    const instances = await db.instances.where('date').equals(d).toArray();
    if (instances.length > 0) {
      total += instances
        .filter((i) => !i.optional)
        .reduce((sum, i) => sum + DIFFICULTY[i.difficulty].xp, 0);
    } else {
      total += templates
        .filter((t) =>
          t.archivedAt === undefined
          && !effectiveOptional(t)
          && dayKey(new Date(t.createdAt)) <= d
          && isScheduled(t.recurrence, d))
        .reduce((sum, t) => sum + DIFFICULTY[t.difficulty].xp, 0);
    }
  }
  return total;
}

/** Get (or create, on a new week) this week's siege, seeded from the prior boss. */
export async function ensureSiege(today: string): Promise<SiegeState> {
  const weekStart = weekStartOf(today);
  const existing = await db.sieges.get(weekStart);
  if (existing !== undefined) return existing;
  const prior = (await db.sieges.toArray())
    .filter((s) => s.weekStart < weekStart)
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1))
    .pop();
  const perk = await perkContext();
  const siege = newSiege(
    weekStart, await weekAvailableXp(weekStart), prior,
    carryFactor(perk.ageLevel) + perk.fx.carryBonus,
  );
  await db.sieges.add(siege);
  return siege;
}
