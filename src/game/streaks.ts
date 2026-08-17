// game/streaks.ts — pure day-fold over ordered sealed days.
// Rules (spec §5 Streaks & Embers):
// - Overall streak continues while rank ≥ C. A sub-C day auto-burns 1 ember (if any)
//   to preserve overall (day recorded as emberSpent, overall continues); otherwise
//   overall resets to 0.
// - Perfect streak: score === 100 consecutive. sRank streak: rank ≥ S consecutive.
// - cPlusRun: consecutive rank ≥ C days; every time it hits a multiple of 7, bank
//   1 ember (max held 2). An ember-burned day resets cPlusRun (the day itself was
//   sub-C) but not overall.
import type { Rank, StreakState } from '../core/types';
import {
  emberCapacity, maxHpFor, regenAmount, strikeArmorFromAge, type BodyState,
} from './body';
import type { LootEffects } from './loot';
import {
  NO_MODS, SIGNATURE_COOLDOWN_DAYS, mergeMods, signatureCoin, villainByKey, villainFor,
  type StatusMods,
} from './villains';
import { weekStartOf } from '../core/dates';

export interface DayStatus {
  villain: string;   // villain key
  label: string;     // signature name
  desc: string;
  mods: Partial<StatusMods>;
}

export interface VillainStrike {
  date: string; label: string; amount: number; sig: boolean;
}

export interface DayOutcome {
  date: string; rank: Rank; score: number;
  proteinOk?: boolean; waterOk?: boolean;
}

export const RANK_ORDER: Rank[] = ['F', 'D', 'C', 'B', 'A', 'S', 'S+'];

export function rankAtLeast(r: Rank, min: Rank): boolean {
  return RANK_ORDER.indexOf(r) >= RANK_ORDER.indexOf(min);
}

export function foldStreaks(
  days: DayOutcome[],
  opts: {
    level: number; effects?: Partial<LootEffects>;
    villainByWeek?: Record<string, string>;   // weekStart -> pinned villain key
    strikesByWeek?: Record<string, { normal: number; sig: number }>;  // pinned pre-spoils damage
    killDateByWeek?: Record<string, string>;  // weekStart -> day the boss fell (no strikes after)
  } = { level: 1 },
): {
  state: StreakState; emberSpentDates: string[]; body: BodyState;
  statusByDate: Record<string, DayStatus>; sigCooldown: number;
  villainStrikes: VillainStrike[];
} {
  const fx = opts.effects ?? {};
  const armor = fx.strikeArmor ?? 0;
  const hpBonus = fx.maxHpBonus ?? 0;
  const regenBonus = fx.regenBonus ?? 0;
  let lastUnbrokenIdx: number | null = null;
  // Villain ladder state
  let sigCd = 0;                                     // daily resets until signature ready
  let pendingStatus: DayStatus | null = null;        // applied to the NEXT day
  let villainBonusNext = 0;                          // MARKED FOR DEATH carry
  const statusByDate: Record<string, DayStatus> = {};
  const villainStrikes: VillainStrike[] = [];
  const state: StreakState = {
    overall: 0, overallBest: 0,
    perfect: 0, perfectBest: 0,
    sRank: 0, sRankBest: 0,
    embers: 0, cPlusRun: 0,
  };
  const emberSpentDates: string[] = [];
  const capacity = emberCapacity(opts.level);
  const body: BodyState = {
    hp: maxHpFor(0) + hpBonus, maxHp: maxHpFor(0) + hpBonus, wounded: false,
    proteinDays: 0, waterDays: 0, sRankDays: 0, emberSteals: 0,
  };

  for (let i = 0; i < days.length; i++) {
    const day = days[i]!;
    // Signature cooldown ticks down at each daily reset.
    if (sigCd > 0) sigCd -= 1;
    // Yesterday's signature status applies to THIS day.
    let mods: StatusMods = NO_MODS;
    if (pendingStatus !== null) {
      statusByDate[day.date] = pendingStatus;
      mods = mergeMods([pendingStatus.mods]);
      villainBonusNext += mods.villainDmgBonus;
      pendingStatus = null;
    }
    // Body accounting first: nutrition grows the pool, then the day resolves.
    if (day.proteinOk === true) {
      body.proteinDays += 1;
    }
    body.maxHp = Math.max(1, maxHpFor(body.proteinDays) + hpBonus - mods.maxHpDelta);
    body.hp = Math.min(body.hp, body.maxHp);
    if (day.waterOk === true) body.waterDays += 1;
    if (rankAtLeast(day.rank, 'S')) body.sRankDays += 1;

    // The villain strikes FIRST, EVERY day it still stands this week. On a
    // sub-C day a charged signature may fire (50/50 coin, deterministic per
    // date+villain; a miss keeps it charged) — good days only take the
    // normal blow.
    const week = weekStartOf(day.date);
    const killedAt = opts.killDateByWeek?.[week];
    const bossAlive = killedAt === undefined || day.date < killedAt;
    if (bossAlive) {
      const pinned = opts.villainByWeek?.[week];
      const villain = (pinned !== undefined ? villainByKey(pinned) : undefined)
        ?? villainFor(opts.level, week);
      const badDay = !rankAtLeast(day.rank, 'C');
      let dmg: number;
      const pinnedDmg = opts.strikesByWeek?.[week];
      const sigFired = badDay && sigCd === 0 && signatureCoin(day.date, villain.key);
      if (sigFired) {
        dmg = pinnedDmg?.sig ?? villain.signature.dmg;
        sigCd = SIGNATURE_COOLDOWN_DAYS;
        pendingStatus = {
          villain: villain.key, label: villain.signature.label,
          desc: villain.signature.desc, mods: villain.signature.mods,
        };
      } else {
        dmg = (pinnedDmg?.normal ?? villain.normal.dmg) + villainBonusNext;
        villainBonusNext = 0;
      }
      const bulwark = Math.round(armor * mods.bulwarkMult * mods.enchantMult);
      const dealt = Math.max(1, dmg - bulwark - strikeArmorFromAge(opts.level));
      body.hp -= dealt;
      villainStrikes.push({
        date: day.date, label: sigFired ? villain.signature.label : villain.normal.label,
        amount: dealt, sig: sigFired,
      });
      const usableEmbers = Math.max(0, state.embers - mods.emberSeal);
      if (body.hp <= 0) {
        if (fx.unbroken === true && (lastUnbrokenIdx === null || i - lastUnbrokenIdx >= 14)) {
          // Totem of the Unbroken: survive at 1 HP, the boss gets nothing.
          lastUnbrokenIdx = i;
          body.hp = 1;
        } else if (fx.wardEmber === true) {
          // Totem of the Undying Flame: the boss can never steal an ember.
          body.hp = 0;
        } else if (usableEmbers > 0) {
          state.embers -= 1;
          body.emberSteals += 1;
          body.hp = Math.ceil(body.maxHp / 2);
        } else {
          body.hp = 0;
        }
      }
    }
    if (rankAtLeast(day.rank, 'C')) {
      const aegis = mods.aegisDisabled ? 0 : regenBonus * mods.enchantMult;
      // VITALITY IS THE DAILY HEAL: VIT starts at 1 and grows +1 per S-day;
      // high ages add their regen perk on top (regenAmount extra over base 5).
      const vitHeal = 1 + body.sRankDays + (regenAmount(opts.level) - 5);
      const regen = Math.max(0, Math.round((vitHeal + aegis - mods.regenFlat) * mods.regenMult));
      body.hp = Math.min(body.maxHp, body.hp + regen);
      state.overall += 1;
      state.cPlusRun += 1;
      if (state.cPlusRun % 7 === 0 && state.embers < capacity) state.embers += 1;
    } else {
      if (Math.max(0, state.embers - mods.emberSeal) > 0) {
        // Auto-burn an ember to preserve the overall streak.
        state.embers -= 1;
        emberSpentDates.push(day.date);
        state.overall += 1;
      } else {
        state.overall = 0;
      }
      state.cPlusRun = 0; // the day itself was sub-C
    }
    state.overallBest = Math.max(state.overallBest, state.overall);

    state.perfect = day.score === 100 ? state.perfect + 1 : 0;
    state.perfectBest = Math.max(state.perfectBest, state.perfect);

    state.sRank = rankAtLeast(day.rank, 'S') ? state.sRank + 1 : 0;
    state.sRankBest = Math.max(state.sRankBest, state.sRank);
  }

  body.wounded = body.hp < body.maxHp / 2;
  return { state, emberSpentDates, body, statusByDate, sigCooldown: sigCd, villainStrikes };
}

/**
 * Consecutive completed scheduled dates ending at the most recent scheduled
 * date ≤ today. Non-scheduled days are skipped (MWF gym isn't broken by
 * Tuesday). Today counts if completed; if today is scheduled but not yet
 * completed it is skipped (not a break).
 */
export function perQuestStreak(
  _templateId: string,
  scheduledDates: string[],
  completedDates: Set<string>,
  today: string,
): number {
  const past = scheduledDates.filter((d) => d <= today).sort();
  let i = past.length - 1;
  if (i >= 0 && past[i] === today && !completedDates.has(today)) i -= 1;
  let streak = 0;
  while (i >= 0 && completedDates.has(past[i])) {
    streak += 1;
    i -= 1;
  }
  return streak;
}
