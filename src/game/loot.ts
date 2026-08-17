// game/loot.ts — chests, the item catalog, and equipped-effect aggregation.
// Rolls are random ONCE at open time and persisted as LootItem rows; everything
// else here is pure and deterministic (entitlements derive from history, so
// recompute and cross-device sync can never re-roll or duplicate a chest).
import type { ChestKind, LootGenre, LootItem, LootTier } from '../core/types';

export interface LootDef {
  key: string;
  genre: LootGenre;
  name: string;
  desc: string;                       // uses {v} for the tier value
  values?: Record<Exclude<LootTier, never>, number>; // tokens/enchants; totems have a single fixed value
  value?: number;                     // totems
}

export const CATALOG: LootDef[] = [
  // Tokens — XP buffs (fractions)
  { key: 'tokenVigor', genre: 'token', name: 'TOKEN OF VIGOR', desc: '+{v}% ALL QUEST XP',
    values: { common: 0.05, rare: 0.10, mythic: 0.15 } },
  { key: 'tokenIron', genre: 'token', name: 'TOKEN OF IRON', desc: '+{v}% WORKOUT XP',
    values: { common: 0.10, rare: 0.20, mythic: 0.30 } },
  { key: 'tokenClarity', genre: 'token', name: 'TOKEN OF CLARITY', desc: '+{v}% MAIN-QUEST XP',
    values: { common: 0.10, rare: 0.15, mythic: 0.25 } },
  { key: 'tokenDawn', genre: 'token', name: 'TOKEN OF DAWN', desc: '+{v}% XP ON THE FIRST QUEST OF THE DAY',
    values: { common: 0.15, rare: 0.25, mythic: 0.40 } },
  // Enchantments — armor & attack
  { key: 'enchBulwark', genre: 'enchant', name: 'BULWARK', desc: 'BOSS STRIKES −{v} HP',
    values: { common: 2, rare: 3, mythic: 5 } },
  { key: 'enchKeenEdge', genre: 'enchant', name: 'KEEN EDGE', desc: '+{v}% SIEGE DAMAGE',
    values: { common: 0.05, rare: 0.10, mythic: 0.15 } },
  { key: 'enchEmberWard', genre: 'enchant', name: 'EMBER WARD', desc: 'BOSS NIGHTLY HEAL −{v}PT',
    values: { common: 0.0025, rare: 0.005, mythic: 0.0075 } },
  { key: 'enchRunedAegis', genre: 'enchant', name: 'RUNED AEGIS', desc: '+{v} HP REGEN ON GOOD DAYS',
    values: { common: 1, rare: 2, mythic: 3 } },
  // Totems — always mythic, one fixed power each
  { key: 'totemUnbroken', genre: 'totem', name: 'TOTEM OF THE UNBROKEN',
    desc: 'A LETHAL STRIKE LEAVES YOU AT 1 HP (ONCE PER 14 DAYS)', value: 1 },
  { key: 'totemUndyingFlame', genre: 'totem', name: 'TOTEM OF THE UNDYING FLAME',
    desc: 'THE BOSS CAN NEVER STEAL YOUR EMBERS', value: 1 },
  { key: 'totemColossus', genre: 'totem', name: 'TOTEM OF THE COLOSSUS',
    desc: '+20 MAX HP', value: 20 },
  { key: 'totemWarpath', genre: 'totem', name: 'TOTEM OF THE WARPATH',
    desc: 'OVERKILL CARRIES +25% MORE INTO NEXT WEEK', value: 0.25 },
];

// One chest to rule them all: every source drops the same "CHEST" with
// uniform odds (the old kind field remains in storage for stable ids).
export const CHEST_NAMES: Record<ChestKind, string> = {
  wooden: 'CHEST', war: 'CHEST', gilded: 'CHEST',
};

/** Genre odds — identical for every chest: [token, enchant, totem]. */
const GENRE_ODDS: Record<ChestKind, [number, number, number]> = {
  wooden: [0.45, 0.45, 0.10],
  war: [0.45, 0.45, 0.10],
  gilded: [0.45, 0.45, 0.10],
};

/** Tier odds — identical for every chest: [common, rare, mythic]. */
const TIER_ODDS: Record<ChestKind, [number, number, number]> = {
  wooden: [0.60, 0.30, 0.10],
  war: [0.60, 0.30, 0.10],
  gilded: [0.60, 0.30, 0.10],
};

function pickWeighted<T>(entries: [T, number][], roll: number): T {
  let acc = 0;
  for (const [value, weight] of entries) {
    acc += weight;
    if (roll < acc) return value;
  }
  return entries[entries.length - 1]![0];
}

/** Roll a chest. `rand` is injected so tests are deterministic; app passes Math.random. */
export function rollChest(
  kind: ChestKind,
  rand: () => number,
): { itemKey: string; genre: LootGenre; tier: LootTier } {
  const [t, e, o] = GENRE_ODDS[kind];
  const genre = pickWeighted<LootGenre>([['token', t], ['enchant', e], ['totem', o]], rand());
  const pool = CATALOG.filter((d) => d.genre === genre);
  const item = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]!;
  const [c, r, m] = TIER_ODDS[kind];
  const tier: LootTier = genre === 'totem'
    ? 'mythic'
    : pickWeighted<LootTier>([['common', c], ['rare', r], ['mythic', m]], rand());
  return { itemKey: item.key, genre, tier };
}

export function lootDesc(item: LootItem): string {
  const def = CATALOG.find((d) => d.key === item.itemKey);
  if (def === undefined) return '';
  const v = def.values !== undefined ? def.values[item.tier] : def.value ?? 0;
  const shown = v < 1 ? Math.round(v * 10000) / 100 : v; // fractions render as percents
  return def.desc.replace('{v}', String(shown));
}

/** Everything that has ever earned a chest, with DETERMINISTIC ids (sync-safe). */
export function chestEntitlements(history: {
  overallBest: number;
  sRankBest: number;
  kills: { weekStart: string; generation: number }[];
}): { id: string; kind: ChestKind; source: string }[] {
  const out: { id: string; kind: ChestKind; source: string }[] = [];
  for (let n = 7; n <= history.overallBest; n += 7) {
    out.push({ id: `chest-wooden-streak-${n}`, kind: 'wooden', source: `STREAK ${n}` });
  }
  for (const n of [30, 60, 100]) {
    if (history.overallBest >= n) {
      out.push({ id: `chest-gilded-streak-${n}`, kind: 'gilded', source: `STREAK ${n}` });
    }
  }
  if (history.sRankBest >= 7) {
    out.push({ id: 'chest-gilded-srank-7', kind: 'gilded', source: 'S-STREAK 7' });
  }
  for (const k of history.kills) {
    if (k.generation > 0) {
      out.push({ id: `chest-gilded-risen-${k.weekStart}`, kind: 'gilded', source: 'RISEN BOSS SLAIN' });
    } else {
      out.push({ id: `chest-war-${k.weekStart}`, kind: 'war', source: 'BOSS SLAIN' });
    }
  }
  return out;
}

export const MAX_ATTACHED = 3;

/** Equipped item ids — reads the slots list, falling back to legacy per-genre fields. */
export function equippedIds(e: { slots?: string[]; token?: string; enchant?: string; totem?: string }): string[] {
  if (Array.isArray(e.slots)) return e.slots.slice(0, MAX_ATTACHED);
  return [e.token, e.enchant, e.totem]
    .filter((x): x is string => typeof x === 'string')
    .slice(0, MAX_ATTACHED);
}

/** Aggregate live effects of the attached items (up to MAX_ATTACHED, any mix). */
export interface LootEffects {
  xpAll: number; xpWorkout: number; xpMain: number; xpFirst: number;
  strikeArmor: number; siegeDmg: number; healPtDown: number; regenBonus: number;
  maxHpBonus: number; carryBonus: number;
  wardEmber: boolean; unbroken: boolean;
}

export function lootEffects(equipped: LootItem[]): LootEffects {
  const fx: LootEffects = {
    xpAll: 0, xpWorkout: 0, xpMain: 0, xpFirst: 0,
    strikeArmor: 0, siegeDmg: 0, healPtDown: 0, regenBonus: 0,
    maxHpBonus: 0, carryBonus: 0, wardEmber: false, unbroken: false,
  };
  for (const it of equipped) {
    const def = CATALOG.find((d) => d.key === it.itemKey);
    if (def === undefined) continue;
    const v = def.values !== undefined ? def.values[it.tier] : def.value ?? 0;
    switch (it.itemKey) {
      case 'tokenVigor': fx.xpAll += v; break;
      case 'tokenIron': fx.xpWorkout += v; break;
      case 'tokenClarity': fx.xpMain += v; break;
      case 'tokenDawn': fx.xpFirst += v; break;
      case 'enchBulwark': fx.strikeArmor += v; break;
      case 'enchKeenEdge': fx.siegeDmg += v; break;
      case 'enchEmberWard': fx.healPtDown += v; break;
      case 'enchRunedAegis': fx.regenBonus += v; break;
      case 'totemUnbroken': fx.unbroken = true; break;
      case 'totemUndyingFlame': fx.wardEmber = true; break;
      case 'totemColossus': fx.maxHpBonus += v; break;
      case 'totemWarpath': fx.carryBonus += v; break;
    }
  }
  return fx;
}
