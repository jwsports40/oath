// game/villains.ts — the boss ladder: two villains per 10-level band, the
// ULTIMATE DARK LORD at level 100. Normal strikes scale 3→15 HP; signatures
// fire on a bad day when charged (then 2 daily resets to recharge) and leave
// a 24-hour status on the FOLLOWING day. Balanced around 100 base player HP.

export interface StatusMods {
  xpAll: number;        // fractional reduction to all quest XP (0.10 = −10%)
  xpMain: number;       // reduction to main-quest XP
  xpWorkout: number;    // reduction to workout XP
  xpFirst: number;      // reduction to the first quest of the day
  regenMult: number;    // multiplier on HP regen (1 = unchanged, 0 = disabled)
  regenFlat: number;    // flat HP regen reduction
  maxHpDelta: number;   // temporary max-HP reduction (positive number = lost HP)
  emberSeal: number;    // embers unavailable this day
  bulwarkMult: number;  // multiplier on Bulwark armor (1 = unchanged)
  aegisDisabled: boolean;
  tokenMult: number;    // effectiveness of attached tokens
  enchantMult: number;  // effectiveness of attached enchantments
  playerDmgBonus: number;  // GUARD BREAK: bonus damage on the player's hits
  villainDmgBonus: number; // MARKED FOR DEATH: bonus on the villain's next strike
}

export const NO_MODS: StatusMods = {
  xpAll: 0, xpMain: 0, xpWorkout: 0, xpFirst: 0,
  regenMult: 1, regenFlat: 0, maxHpDelta: 0, emberSeal: 0,
  bulwarkMult: 1, aegisDisabled: false, tokenMult: 1, enchantMult: 1,
  playerDmgBonus: 0, villainDmgBonus: 0,
};

export interface Villain {
  key: string;
  band: number;                 // 0,10,...,90 — min level of its band
  order: 0 | 1;                 // first or second of the pair
  name: string;
  normal: { dmg: number; label: string };
  signature: { dmg: number; label: string; desc: string; mods: Partial<StatusMods> };
}

export const VILLAINS: Villain[] = [
  { key: 'darkDungeonKnight', band: 0, order: 0, name: 'DARK DUNGEON KNIGHT',
    normal: { dmg: 3, label: 'RUSTED SLASH' },
    signature: { dmg: 5, label: 'GUARD BREAK', desc: 'YOUR NEXT HITS DEAL +2 FOR 24H',
      mods: { playerDmgBonus: 2 } } },
  { key: 'goblinWarden', band: 0, order: 1, name: 'GOBLIN WARDEN',
    normal: { dmg: 3, label: 'JAGGED CHOP' },
    signature: { dmg: 5, label: 'DIRTY TRICK', desc: 'FIRST QUEST TOMORROW: −10% XP',
      mods: { xpFirst: 0.10 } } },
  { key: 'chainWarden', band: 10, order: 0, name: 'CHAIN WARDEN',
    normal: { dmg: 4, label: 'IRON FLAIL' },
    signature: { dmg: 6, label: 'SHACKLED', desc: 'MAIN-QUEST XP −10% FOR 24H',
      mods: { xpMain: 0.10 } } },
  { key: 'goreboundOgre', band: 10, order: 1, name: 'GOREBOUND OGRE',
    normal: { dmg: 5, label: 'BUTCHER SWING' },
    signature: { dmg: 7, label: 'CONCUSSION', desc: 'WORKOUT XP −15% FOR 24H',
      mods: { xpWorkout: 0.15 } } },
  { key: 'hornedNecromancer', band: 20, order: 0, name: 'HORNED NECROMANCER',
    normal: { dmg: 5, label: 'GRAVE BOLT' },
    signature: { dmg: 8, label: 'LESSER HEX', desc: 'ALL QUEST XP −10% FOR 24H',
      mods: { xpAll: 0.10 } } },
  { key: 'undeadBoneHound', band: 20, order: 1, name: 'UNDEAD BONE HOUND',
    normal: { dmg: 6, label: 'BONE REND' },
    signature: { dmg: 8, label: 'FESTERING BITE', desc: 'HP REGEN −2 FOR 24H',
      mods: { regenFlat: 2 } } },
  { key: 'emeraldWraithKnight', band: 30, order: 0, name: 'EMERALD WRAITH KNIGHT',
    normal: { dmg: 6, label: 'SOULBLADE' },
    signature: { dmg: 9, label: 'SOUL CHILL', desc: 'ALL HP REGEN −50% FOR 24H',
      mods: { regenMult: 0.5 } } },
  { key: 'undeadLichKing', band: 30, order: 1, name: 'UNDEAD LICH KING',
    normal: { dmg: 7, label: 'DEATH BOLT' },
    signature: { dmg: 10, label: 'SOUL TAX', desc: '1 EMBER SEALED FOR 24H',
      mods: { emberSeal: 1 } } },
  { key: 'toxicSpiderQueen', band: 40, order: 0, name: 'TOXIC SPIDER QUEEN',
    normal: { dmg: 7, label: 'VENOMOUS CLEAVE' },
    signature: { dmg: 11, label: "WIDOW'S VENOM", desc: 'ALL XP −15% · REGEN −25% FOR 24H',
      mods: { xpAll: 0.15, regenMult: 0.75 } } },
  { key: 'hoodedReaper', band: 40, order: 1, name: 'HOODED REAPER',
    normal: { dmg: 8, label: 'REAPING SLASH' },
    signature: { dmg: 12, label: 'MARKED FOR DEATH', desc: 'ITS NEXT STRIKE GAINS +4',
      mods: { villainDmgBonus: 4 } } },
  { key: 'plagueOgre', band: 50, order: 0, name: 'PLAGUE OGRE',
    normal: { dmg: 8, label: 'PESTILENT SMASH' },
    signature: { dmg: 13, label: 'PLAGUE ROT', desc: 'HP REGEN DISABLED FOR 24H',
      mods: { regenMult: 0 } } },
  { key: 'blackCleaverKnight', band: 50, order: 1, name: 'BLACK CLEAVER KNIGHT',
    normal: { dmg: 9, label: "EXECUTIONER'S CLEAVE" },
    signature: { dmg: 13, label: 'ARMOR REND', desc: 'BULWARK −50% FOR 24H',
      mods: { bulwarkMult: 0.5 } } },
  { key: 'neonCryptNecromancer', band: 60, order: 0, name: 'NEON CRYPT NECROMANCER',
    normal: { dmg: 9, label: 'ARCANE SOULBLAST' },
    signature: { dmg: 14, label: 'ARCANE SUPPRESSION', desc: 'YOUR TOKEN AT 50% FOR 24H',
      mods: { tokenMult: 0.5 } } },
  { key: 'moltenWarlord', band: 60, order: 1, name: 'MOLTEN WARLORD',
    normal: { dmg: 10, label: 'INFERNAL GREATSWORD' },
    signature: { dmg: 15, label: 'HELLFIRE BRAND', desc: '−10 MAX HP · REGEN −15% FOR 24H',
      mods: { maxHpDelta: 10, regenMult: 0.85 } } },
  { key: 'ravenReaper', band: 70, order: 0, name: 'RAVEN REAPER',
    normal: { dmg: 10, label: 'RAVEN SCYTHE' },
    signature: { dmg: 16, label: "HARBINGER'S CURSE", desc: 'ALL XP −20% · 1 EMBER SEALED FOR 24H',
      mods: { xpAll: 0.20, emberSeal: 1 } } },
  { key: 'abyssKnight', band: 70, order: 1, name: 'ABYSS KNIGHT',
    normal: { dmg: 11, label: 'ABYSSAL BLADE' },
    signature: { dmg: 17, label: 'VOID FRACTURE', desc: 'BULWARK & RUNED AEGIS DISABLED FOR 24H',
      mods: { bulwarkMult: 0, aegisDisabled: true } } },
  { key: 'crimsonLichKing', band: 80, order: 0, name: 'CRIMSON LICH KING',
    normal: { dmg: 12, label: 'CRIMSON SOULBLADE' },
    signature: { dmg: 18, label: 'BLOOD CURSE', desc: '−15 MAX HP · ALL XP −20% FOR 24H',
      mods: { maxHpDelta: 15, xpAll: 0.20 } } },
  { key: 'gildedReaper', band: 80, order: 1, name: 'GILDED REAPER',
    normal: { dmg: 12, label: 'SOUL HARVEST' },
    signature: { dmg: 19, label: "DEATH'S SHADOW", desc: '−20 MAX HP · REGEN HALVED FOR 24H',
      mods: { maxHpDelta: 20, regenMult: 0.5 } } },
  { key: 'abyssDarkLord', band: 90, order: 0, name: 'ABYSS DARK LORD',
    normal: { dmg: 13, label: 'VOID GREATSWORD' },
    signature: { dmg: 20, label: 'NULLIFICATION', desc: 'TOKENS & ENCHANTS AT 50% FOR 24H',
      mods: { tokenMult: 0.5, enchantMult: 0.5 } } },
  { key: 'ultimateDarkLord', band: 90, order: 1, name: 'ULTIMATE DARK LORD',
    normal: { dmg: 15, label: 'APOCALYPSE CLEAVE' },
    signature: { dmg: 22, label: 'ECLIPSE OF THE SLAYER', desc: '−20 MAX HP · XP −25% · REGEN −50% FOR 24H',
      mods: { maxHpDelta: 20, xpAll: 0.25, regenMult: 0.5 } } },
];

/** Signature cooldown: after firing, this many daily resets until ready again. */
export const SIGNATURE_COOLDOWN_DAYS = 2;

/**
 * The villain a given week belongs to: the player's band supplies the pair,
 * ISO week parity alternates between them. Level 100 is always the final boss.
 */
export function villainFor(level: number, weekStart: string): Villain {
  if (level >= 100) return VILLAINS[VILLAINS.length - 1]!;
  const band = Math.min(90, Math.floor(Math.max(0, level) / 10) * 10);
  const pair = VILLAINS.filter((v) => v.band === band);
  // Deterministic parity from the week-start date string.
  let hash = 0;
  for (const ch of weekStart) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return pair[hash % 2]! ;
}

/** Merge several active statuses into one modifier set (stacking sensibly). */
export function mergeMods(list: Partial<StatusMods>[]): StatusMods {
  const out: StatusMods = { ...NO_MODS };
  for (const m of list) {
    out.xpAll += m.xpAll ?? 0;
    out.xpMain += m.xpMain ?? 0;
    out.xpWorkout += m.xpWorkout ?? 0;
    out.xpFirst += m.xpFirst ?? 0;
    out.regenMult *= m.regenMult ?? 1;
    out.regenFlat += m.regenFlat ?? 0;
    out.maxHpDelta += m.maxHpDelta ?? 0;
    out.emberSeal += m.emberSeal ?? 0;
    out.bulwarkMult *= m.bulwarkMult ?? 1;
    out.aegisDisabled = out.aegisDisabled || (m.aegisDisabled ?? false);
    out.tokenMult *= m.tokenMult ?? 1;
    out.enchantMult *= m.enchantMult ?? 1;
    out.playerDmgBonus += m.playerDmgBonus ?? 0;
    out.villainDmgBonus += m.villainDmgBonus ?? 0;
  }
  return out;
}

export function villainByKey(key: string): Villain | undefined {
  return VILLAINS.find((v) => v.key === key);
}
