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
import { foldStreaks, perQuestStreak, type DayOutcome } from '../game/streaks';
import { nextVigor, INITIAL_VIGOR } from '../game/vigor';
import { newSiege, dealDamage, KILL_XP } from '../game/siege';
import {
  carryFactor, critMult, dmgMult, maxHpFor, optionalCap, workoutXpMult,
} from '../game/body';
import { chestEntitlements, equippedIds, lootEffects, type LootEffects } from '../game/loot';
import { NO_MODS, VILLAINS, mergeMods, villainByKey, villainFor, type StatusMods } from '../game/villains';
import { isAdminHash } from '../core/pin';
import type { DayStatus } from '../game/streaks';
import { ARMOR_AGES, DIFFICULTY, TITLES } from '../core/types';
import { DEFAULT_NUTRITION_GOAL } from './seed';
import type {
  Achievement, Character, Chest, DailyScore, Difficulty, Equipped, LootItem,
  NutritionGoal, QuestInstance, QuestKind, QuestTemplate, Rank, SiegeState, Unlock,
} from '../core/types';

/**
 * Current perk context: cached stats, the EFFECTIVE age level (admin override
 * wins), and the aggregated effects of the attached loot.
 */
async function perkContext(date?: string): Promise<{
  level: number; ageLevel: number; str: number; wil: number; stam: number;
  fx: LootEffects; mods: StatusMods;
}> {
  const ch = await kvGet<Character>('character', { level: 1, xpTotal: 0, str: 10, vit: 1, wil: 10, stam: 10 });
  const settings = await kvGet<{ adminKnightLevel?: number }>('settings', {});
  const admin = isAdminHash(await kvGet<string | null>('pinHash', null));
  const equipped = await kvGet<Equipped>('equipped', {});
  const items = (await Promise.all(equippedIds(equipped).map((i) => db.loot.get(i))))
    .filter((x): x is LootItem => x !== undefined);
  // Villain status for the given day (a signature fired the previous evening).
  let mods: StatusMods = NO_MODS;
  if (date !== undefined) {
    const statuses = await kvGet<Record<string, DayStatus>>('villainStatus', {});
    const st = statuses[date];
    if (st !== undefined) mods = mergeMods([st.mods]);
  }
  // ARCANE SUPPRESSION / NULLIFICATION: scale token and enchantment power.
  const scale = (fx: LootEffects, m: number): LootEffects => ({
    ...fx,
    xpAll: fx.xpAll * m, xpWorkout: fx.xpWorkout * m, xpMain: fx.xpMain * m, xpFirst: fx.xpFirst * m,
    strikeArmor: fx.strikeArmor * m, siegeDmg: fx.siegeDmg * m,
    strikeShave: fx.strikeShave * m, regenBonus: fx.regenBonus * m,
  });
  const tokens = scale(lootEffects(items.filter((i) => i.genre === 'token')), mods.tokenMult);
  const enchants = scale(lootEffects(items.filter((i) => i.genre === 'enchant')), mods.enchantMult);
  const totems = lootEffects(items.filter((i) => i.genre === 'totem'));
  const fx: LootEffects = {
    xpAll: tokens.xpAll, xpWorkout: tokens.xpWorkout, xpMain: tokens.xpMain, xpFirst: tokens.xpFirst,
    strikeArmor: enchants.strikeArmor, siegeDmg: enchants.siegeDmg,
    strikeShave: enchants.strikeShave, regenBonus: enchants.regenBonus,
    maxHpBonus: totems.maxHpBonus, maxHpMult: totems.maxHpMult, carryBonus: totems.carryBonus,
    wardEmber: totems.wardEmber, unbroken: totems.unbroken,
  };
  return {
    level: ch.level,
    ageLevel: admin ? settings.adminKnightLevel ?? ch.level : ch.level,
    str: ch.str, wil: ch.wil, stam: ch.stam ?? 10,
    fx, mods,
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

const DEFAULT_CHARACTER: Character = { level: 1, xpTotal: 0, str: 10, vit: 1, wil: 10 };

/** Round half-up per Global Constraints. */
const round = (x: number): number => Math.floor(x + 0.5);

/** perWeek templates materialize daily as optional regardless of the flag. */
function effectiveOptional(t: QuestTemplate): boolean {
  return t.optional || t.recurrence.type === 'perWeek';
}

/** Create today's instances for every scheduled, non-archived template (idempotent). */
async function materializeDay(d: string): Promise<void> {
  const templates = await db.templates.toArray();
  // Prune: an untouched instance whose template no longer schedules this day
  // (or was archived) vanishes — it neither shows nor tallies in grading.
  // Anything acted on (progress/done) or already sealed stays as history.
  const sealed = (await db.dailyScores.get(d))?.sealed === true;
  if (!sealed) {
    for (const inst of await db.instances.where('date').equals(d).toArray()) {
      if (inst.status !== 'todo' || inst.progress !== 0) continue;
      const t = templates.find((x) => x.id === inst.templateId);
      if (t === undefined || t.archivedAt !== undefined || !isScheduled(t.recurrence, d)) {
        await db.instances.delete(inst.id);
      }
    }
  }
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
    if (t.rune !== undefined) instance.rune = t.rune;
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
  // The boss NEVER heals — its Sunday pool is all it gets.
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
  const perk = await perkContext(inst.date);
  // XP multipliers: STR + TRAINED KNIGHT perk (workouts) plus attached tokens,
  // minus any active villain curse (signature status from yesterday).
  const firstOfDay = (await db.completions.where('date').equals(inst.date).count()) === 0;
  let bonus = perk.fx.xpAll
    + (inst.main ? perk.fx.xpMain : 0)
    + (firstOfDay ? perk.fx.xpFirst : 0);
  if (inst.kind === 'workout') {
    bonus += (workoutXpMult(perk.str, perk.ageLevel) - 1) + perk.fx.xpWorkout;
  }
  bonus -= perk.mods.xpAll
    + (inst.main ? perk.mods.xpMain : 0)
    + (inst.kind === 'workout' ? perk.mods.xpWorkout : 0)
    + (firstOfDay ? perk.mods.xpFirst : 0);
  bonus = Math.max(-0.9, bonus);
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
      flat: perk.mods.playerDmgBonus,
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

  // Reverse this quest's siege damage — unchecking must take back exactly what
  // completing dealt, including un-killing the boss (no toggle-farming kills).
  const siege = await db.sieges.get(weekStartOf(inst.date));
  if (siege !== undefined && completions.length > 0) {
    let hp = siege.hp;
    let overkill = siege.overkill;
    const log = [...siege.log];
    for (const _c of completions) {
      // Match by label alone: the logged amount is authoritative (perk
      // multipliers may differ between deal time and now).
      for (let i = log.length - 1; i >= 0; i--) {
        if (log[i].label === inst.name) {
          const amount = log[i].amount;
          log.splice(i, 1);
          // Part of this hit may have been overkill — only the portion that
          // actually reduced hp comes back.
          const overkillShare = Math.min(overkill, amount);
          overkill -= overkillShare;
          hp = Math.min(siege.maxHp, hp + (amount - overkillShare));
          break;
        }
      }
    }
    const next: SiegeState = { ...siege, hp, overkill, log };
    if (siege.killed && hp > 0) {
      // The kill is undone: revert its rewards too.
      next.killed = false;
      next.fragmentsAwarded = false;
      const killEvents = (await db.xpEvents.toArray())
        .filter((e) => e.source === 'siegeKill' && e.refId === siege.weekStart);
      await db.xpEvents.bulkDelete(killEvents.map((e) => e.id));
      const fragments = await kvGet<number>('fragments', 0);
      await kvSet('fragments', Math.max(0, fragments - 1));
    }
    await db.sieges.put(next);
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

  // Rune-day flags: a surviving completion of a runed quest marks its day
  // (unchecking deletes the completion, so this is cheat-proof; a day can
  // never grant more than one point per stat, however many quests complete).
  const templatesById = new Map((await db.templates.toArray()).map((t) => [t.id, t]));
  const runesByDate = new Map<string, Set<string>>();
  for (const c of await db.completions.toArray()) {
    const rune = templatesById.get(c.templateId)?.rune;
    if (rune === undefined) continue;
    const set = runesByDate.get(c.date) ?? new Set<string>();
    set.add(rune);
    runesByDate.set(c.date, set);
  }

  // Streaks, embers, and the knight's body — one fold, one source of truth.
  const outcomes: DayOutcome[] = sealed.map((d) => ({
    date: d.date, rank: d.rank, score: d.score,
    proteinOk: (proteinByDate.get(d.date) ?? 0) >= goals.protein,
    waterOk: (waterByDate.get(d.date) ?? 0) >= goals.waterOz,
    physicalOk: runesByDate.get(d.date)?.has('physical') === true,
    mentalOk: runesByDate.get(d.date)?.has('mental') === true,
    workOk: runesByDate.get(d.date)?.has('work') === true,
  }));
  const settings = await kvGet<{ adminKnightLevel?: number }>('settings', {});
  const admin = isAdminHash(await kvGet<string | null>('pinHash', null));
  const equippedSlots = await kvGet<Equipped>('equipped', {});
  const equippedItems = (await Promise.all(equippedIds(equippedSlots).map((i) => db.loot.get(i))))
    .filter((x): x is LootItem => x !== undefined);
  const ageLevel = admin ? settings.adminKnightLevel ?? level : level;
  const villainByWeek: Record<string, string> = {};
  const strikesByWeek: Record<string, { normal: number; sig: number }> = {};
  const killDateByWeek: Record<string, string> = {};
  for (const sg of await db.sieges.toArray()) {
    if (sg.villainKey !== undefined) villainByWeek[sg.weekStart] = sg.villainKey;
    if (sg.strikeDmg !== undefined) {
      strikesByWeek[sg.weekStart] = { normal: sg.strikeDmg, sig: sg.sigDmg ?? Math.round(sg.strikeDmg * 1.5) };
    }
    // Damage stops once the boss falls — the killing blow is the last log entry.
    if (sg.killed && sg.log.length > 0) {
      killDateByWeek[sg.weekStart] = dayKey(new Date(sg.log[sg.log.length - 1]!.at));
    }
  }
  const { state: streaks, emberSpentDates, body, statusByDate, sigCooldown, villainStrikes } = foldStreaks(outcomes, {
    level: ageLevel, effects: lootEffects(equippedItems), villainByWeek, strikesByWeek, killDateByWeek,
  });
  await kvSet('streaks', streaks);
  await kvSet('body', body);
  await kvSet('villainStatus', statusByDate);
  await kvSet('sigCooldown', sigCooldown);
  await kvSet('villainStrikes', villainStrikes);

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

  // Character: stats fed by rune days (max +1 per stat per day; a stat gain
  // lands the NEXT dawn because only sealed days are counted).
  const physicalDays = outcomes.filter((o) => o.physicalOk === true).length;
  const mentalDays = outcomes.filter((o) => o.mentalOk === true).length;
  await kvSet<Character>('character', {
    level, xpTotal,
    str: 10 + physicalDays,
    vit: 1 + body.workDays,
    wil: 10 + mentalDays,
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
  void instanceById; void templateById;
  // Longest consecutive-day run of a sealed-day flag.
  const bestRun = (flag: (o: DayOutcome) => boolean): number => {
    let best = 0;
    let run = 0;
    for (const o of outcomes) {
      run = flag(o) ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  };
  const progressById: Record<string, number> = {
    beginning: Math.min(1, sealed.length),
    ironWill: bestRun((o) => o.physicalOk === true),
    hydrated: bestRun((o) => o.waterOk === true),
    perfectWeek: streaks.perfectBest,
    consistency: completions.length,
    crest: killCount,
  };
  const todayKey = dayKey(new Date());
  const currentSiege = await db.sieges.get(weekStartOf(todayKey));
  const LEVEL_TIERS: [number, string][] = [
    [25, 'GETTING ON TRACK'], [50, 'ALMOST A THREAT'],
    [75, 'ACTUALLY A THREAT'], [100, 'LEGEND'],
  ];
  const achievements = await kvGet<Achievement[]>('achievements', []);
  const refreshed = achievements.map((a) => {
    if (a.id === 'giantSlayer') {
      // Completed by killing THIS week's boss; a new boss resets it.
      const killed = currentSiege?.killed === true;
      const next: Achievement = { ...a, progress: killed ? 1 : 0 };
      if (killed) {
        if (next.unlockedAt === undefined) next.unlockedAt = now;
      } else {
        delete next.unlockedAt;
      }
      return next;
    }
    if (a.id === 'levelPath') {
      // Staged path: the completed stage holds until the NEXT day, then the
      // deed resets under its next name (25 -> 50 -> 75 -> 100).
      let next: Achievement = { ...a };
      if (next.unlockedAt !== undefined && dayKey(new Date(next.unlockedAt)) < todayKey) {
        const idx = LEVEL_TIERS.findIndex(([t]) => t === next.target);
        const later = idx >= 0 ? LEVEL_TIERS[idx + 1] : undefined;
        if (later !== undefined) {
          next = { id: a.id, name: later[1], desc: `Reach level ${later[0]}`, target: later[0], progress: 0 };
        }
      }
      next.progress = Math.min(next.target, level);
      if (next.unlockedAt === undefined && level >= next.target) next.unlockedAt = now;
      return next;
    }
    const progress = Math.min(a.target, progressById[a.id] ?? a.progress);
    const next: Achievement = { ...a, progress };
    if (next.unlockedAt === undefined && progress >= a.target) next.unlockedAt = now;
    return next;
  });
  await kvSet('achievements', refreshed);
}

/**
 * Rebuild every siege's hp/log/killed state from the completions that actually
 * exist (migration m2: undo toggle-farmed damage). Heals from sub-C sealed
 * days are re-applied; kill rewards are reconciled (events + fragments).
 */
export async function rebuildSieges(): Promise<void> {
  const perk = await perkContext();
  const sieges = await db.sieges.toArray();
  const completions = await db.completions.toArray();
  let killedCount = 0;
  for (const siege of sieges) {
    const weekEnd = addDays(siege.weekStart, 6);
    const week = completions
      .filter((c) => c.date >= siege.weekStart && c.date <= weekEnd)
      .sort((a, b) => (a.at < b.at ? -1 : 1));
    const log: SiegeState['log'] = [];
    let hp = Math.max(1, siege.maxHp - siege.carryover);
    let overkill = 0;
    for (const c of week) {
      const inst = await db.instances.get(c.instanceId);
      const dmg = round(c.xp * dmgMult(perk.ageLevel) * (c.crit ? critMult(perk.wil, perk.ageLevel) : 1));
      log.push({ at: c.at, label: inst?.name ?? 'QUEST', amount: dmg, crit: c.crit });
      overkill += Math.max(0, dmg - hp);
      hp = Math.max(0, hp - dmg);
    }
    const killed = hp === 0;
    if (killed) killedCount += 1;
    const killEvents = (await db.xpEvents.toArray())
      .filter((e) => e.source === 'siegeKill' && e.refId === siege.weekStart);
    if (killed && killEvents.length === 0 && week.length > 0) {
      await db.xpEvents.add({
        id: newId(), date: week[week.length - 1].date, at: week[week.length - 1].at,
        amount: KILL_XP, source: 'siegeKill', refId: siege.weekStart,
      });
    }
    if (!killed && killEvents.length > 0) {
      await db.xpEvents.bulkDelete(killEvents.map((e) => e.id));
    }
    await db.sieges.put({ ...siege, hp, overkill, log, killed, fragmentsAwarded: killed });
  }
  const crests = (await kvGet<Unlock[]>('unlocks', [])).filter((u) => u.kind === 'crest').length;
  await kvSet('fragments', Math.max(0, killedCount - crests * 3));
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
/**
 * Pre-spoils projection of the damage a full-clear week deals: every required
 * quest's XP (STR + age perks, NO loot) through the siege multipliers.
 */
export async function weekProjectedDamage(
  weekStart: string,
  ctx: { str: number; wil: number; ageLevel: number },
): Promise<number> {
  const templates = await db.templates.toArray();
  const dmgOf = (difficulty: Difficulty, kind: QuestKind, main: boolean): number => {
    let base = DIFFICULTY[difficulty].xp;
    if (kind === 'workout') base = round(base * workoutXpMult(ctx.str, ctx.ageLevel));
    return round(base * dmgMult(ctx.ageLevel) * (main ? critMult(ctx.wil, ctx.ageLevel) : 1));
  };
  let total = 0;
  for (const d of eachDay(weekStart, addDays(weekStart, 6))) {
    const instances = await db.instances.where('date').equals(d).toArray();
    if (instances.length > 0) {
      total += instances
        .filter((i) => !i.optional)
        .reduce((sum, i) => sum + dmgOf(i.difficulty, i.kind, i.main), 0);
    } else {
      total += templates
        .filter((t) =>
          t.archivedAt === undefined
          && !effectiveOptional(t)
          && dayKey(new Date(t.createdAt)) <= d
          && isScheduled(t.recurrence, d))
        .reduce((sum, t) => sum + dmgOf(t.difficulty, t.kind, t.main), 0);
    }
  }
  return total;
}

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
/** Round to the nearest 10, half-up (boss HP granularity). */
const round10 = (x: number): number => Math.floor(x / 10 + 0.5) * 10;

/**
 * Scale a freshly risen boss to the knight AT ARRIVAL, spoils excluded:
 * - maxHp = 5 full-clear days of the knight's projected damage (final boss: 7),
 *   so a killer week needs 5 S-days with 2 to spare.
 * - strikeDmg = knight's pre-spoils max HP / 5 (final boss: / 4) PLUS the
 *   knight's vitality (the daily heal), so healing never outruns the clock:
 *   a good day nets exactly the /5 pace, a bad day (no heal) bites deeper.
 */
async function scaleSiegeToKnight(siege: SiegeState, villainKey: string): Promise<void> {
  const perk = await perkContext();
  const finalBoss = villainKey === 'ultimateDarkLord';
  // Early bands (level 1-15) are gentler: a day quicker to kill, a day
  // slower to kill you.
  const easy = !finalBoss && perk.level <= 15;
  const weekDmg = await weekProjectedDamage(siege.weekStart, perk);
  const killDays = finalBoss ? 7 : easy ? 4 : 5;
  const gen = Math.pow(1.05, siege.generation);
  const dealt = Math.max(0, siege.maxHp - siege.hp);
  siege.maxHp = Math.max(50, round10((killDays * weekDmg / 7) * gen));
  siege.hp = Math.max(siege.killed ? 0 : 1, siege.maxHp - Math.max(dealt, siege.carryover));
  const body = await kvGet<{ proteinDays: number; workDays?: number }>('body', { proteinDays: 0, workDays: 0 });
  const playerMax = maxHpFor(body.proteinDays);
  const vit = 1 + (body.workDays ?? 0);
  const divisor = finalBoss ? 4 : easy ? 6 : 5;
  siege.strikeDmg = Math.max(1, Math.ceil(playerMax / divisor) + vit);
  siege.sigDmg = Math.round(siege.strikeDmg * 1.5);
}

/**
 * Swap this week's boss for the OTHER villain of its band — a brand-new fight
 * at full knight-scaled HP (generation 0, empty log). Used by migration m3.
 */
export async function rerollCurrentBoss(today: string): Promise<void> {
  const weekStart = weekStartOf(today);
  const existing = await db.sieges.get(weekStart);
  const perk = await perkContext();
  const current = (existing?.villainKey !== undefined ? villainByKey(existing.villainKey) : undefined)
    ?? villainFor(perk.ageLevel, weekStart);
  const pair = VILLAINS.filter((v) => v.band === current.band);
  const villain = pair.find((v) => v.key !== current.key) ?? current;
  const siege = newSiege(
    weekStart, await weekAvailableXp(weekStart), undefined,
    carryFactor(perk.ageLevel) + perk.fx.carryBonus,
  );
  siege.villainKey = villain.key;
  siege.name = villain.name;
  await scaleSiegeToKnight(siege, villain.key);
  await db.sieges.put(siege);
  await recomputeDerived();
}

/** Re-pin this week's boss to the current scaling rules, keeping the villain
 * and the damage already dealt. Used by migration m4. */
export async function rescaleCurrentSiege(today: string): Promise<void> {
  const siege = await db.sieges.get(weekStartOf(today));
  if (siege === undefined || siege.villainKey === undefined) return;
  await scaleSiegeToKnight(siege, siege.villainKey);
  await db.sieges.put(siege);
  await recomputeDerived();
}

export async function ensureSiege(today: string): Promise<SiegeState> {
  const weekStart = weekStartOf(today);
  const existing = await db.sieges.get(weekStart);
  if (existing !== undefined) {
    if (existing.strikeDmg === undefined && existing.villainKey !== undefined) {
      // Boss from before knight-scaling shipped — rescale in place, keeping
      // the damage already dealt this week.
      await scaleSiegeToKnight(existing, existing.villainKey);
      await db.sieges.put(existing);
      await recomputeDerived();
    }
    return existing;
  }
  const prior = (await db.sieges.toArray())
    .filter((s) => s.weekStart < weekStart)
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1))
    .pop();
  const perk = await perkContext();
  const siege = newSiege(
    weekStart, await weekAvailableXp(weekStart), prior,
    carryFactor(perk.ageLevel) + perk.fx.carryBonus,
  );
  // Pin this week's villain at creation — leveling mid-week never switches it,
  // and a RISEN boss is the same monster returning from last week.
  const returning = prior !== undefined && !prior.killed && prior.villainKey !== undefined
    ? villainByKey(prior.villainKey)
    : undefined;
  const villain = returning ?? villainFor(perk.ageLevel, weekStart);
  siege.villainKey = villain.key;
  siege.name = siege.generation > 0 ? `${villain.name} RISEN` : villain.name;
  await scaleSiegeToKnight(siege, villain.key);
  await db.sieges.add(siege);
  return siege;
}
