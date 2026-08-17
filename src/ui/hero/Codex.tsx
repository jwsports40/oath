// CODEX — the tap-to-open compendium of every chest, token, enchantment, and
// totem, with the hand-made emblem art and real in-game numbers.
import type { CSSProperties } from 'react';
import { CATALOG, CHEST_NAMES, type LootDef } from '../../game/loot';
import type { ChestKind, LootTier } from '../../core/types';
import { SectionLabel } from '../atoms';
import { VILLAINS } from '../../game/villains';
import { sceneFor } from '../siege/scenes';
import { emblemUrl } from '../loot/emblems';
import chestPng from '../loot/chest.png';

const bodyText: CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 18 };
const TIERS: LootTier[] = ['common', 'rare', 'mythic'];
const TIER_COLOR: Record<LootTier, string> = {
  common: 'var(--text-mid)', rare: 'var(--gild)', mythic: 'var(--neon)',
};

const CHEST_ROWS: { kind: ChestKind; earned: string; odds: string }[] = [
  { kind: 'war', earned: 'DEFEAT THE WEEKLY BOSS · SLAY A RISEN BOSS · EVERY 7 DAYS OF STREAK · STREAK 30/60/100 · S-STREAK 7', odds: '45% TOKEN · 45% ENCHANT · 10% TOTEM' },
];

function tierValue(def: LootDef, tier: LootTier): string {
  const v = def.values !== undefined ? def.values[tier] : def.value ?? 0;
  return v < 1 ? `${Math.round(v * 10000) / 100}%` : String(v);
}

function TieredItem({ def }: { def: LootDef }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ ...bodyText, color: 'var(--text-hi)' }}>{def.name}</div>
      <div style={{ ...bodyText, fontSize: 15, color: 'var(--text-low)', marginBottom: 4 }}>
        {def.desc.replace('{v}', '…')}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {TIERS.map((t) => (
          <div key={t} style={{ flex: 1, textAlign: 'center' }}>
            <img
              src={emblemUrl(def.key, t)}
              alt={`${def.name} ${t}`}
              style={{ width: '100%', maxWidth: 96, imageRendering: 'pixelated', display: 'block', margin: '0 auto' }}
            />
            <div style={{ fontFamily: 'var(--font-label)', fontSize: 6, letterSpacing: '0.2em', color: TIER_COLOR[t], marginTop: 3 }}>
              {t.toUpperCase()}
            </div>
            <div style={{ ...bodyText, fontSize: 15, color: 'var(--text-mid)' }}>{tierValue(def, t)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Codex({ onClose }: { onClose: () => void }) {
  const tokens = CATALOG.filter((d) => d.genre === 'token');
  const enchants = CATALOG.filter((d) => d.genre === 'enchant');
  const totems = CATALOG.filter((d) => d.genre === 'totem');
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: '#000',
        overflowY: 'auto', padding: '16px 16px 96px', display: 'flex', justifyContent: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: 398, background: '#000' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-title)', fontSize: 30, color: 'var(--gild-bright)' }}>
              Codex
            </span>
            <button
              onClick={onClose}
              style={{
                fontFamily: 'var(--font-label)', fontSize: 7, letterSpacing: '0.15em',
                color: 'var(--text-mid)', background: 'none', border: '1px solid var(--border)',
                padding: '6px 10px', cursor: 'pointer',
              }}
            >
              CLOSE
            </button>
          </div>


          <SectionLabel>THE KNIGHT — STATBOARD</SectionLabel>
          <div style={{ ...bodyText, fontSize: 14, color: 'var(--text-low)', marginBottom: 10, lineHeight: 1.5 }}>
            EVERY STAT IS EARNED FROM REAL DAYS — GAINS LAND AT THE NEXT DAWN, ONE PER STAT PER DAY,
            AND UNCHECKING A QUEST REVOKES ITS GAIN.
            STR +1 PER DAY WITH A COMPLETED PHYSICAL-RUNE QUEST (STRONGER WORKOUT XP).
            WIL +1 PER MENTAL-RUNE DAY (SHARPER MAIN-QUEST CRITS).
            VIT +1 PER WORK-RUNE DAY — VIT IS YOUR HEAL, RESTORED ONLY ON S-TIER DAYS.
            MAX HP +2 PER DAY YOU END AT OR OVER YOUR PROTEIN GOAL (OVERSHOOTING NEVER HURTS).
            STAM +1 PER DAY YOU HIT OR BEAT YOUR WATER GOAL.
          </div>

          <SectionLabel>DAYS, RANKS &amp; EMBERS</SectionLabel>
          <div style={{ ...bodyText, fontSize: 14, color: 'var(--text-low)', marginBottom: 10, lineHeight: 1.5 }}>
            EACH DAY SEALS AT MIDNIGHT AND EARNS A RANK, F THROUGH S+.
            C OR BETTER KEEPS YOUR STREAK ALIVE; EVERY 7 STRAIGHT C+ DAYS BANKS AN EMBER.
            ON A BAD DAY AN EMBER AUTO-BURNS TO SAVE THE STREAK — BUT THE BOSS STRIKES FIRST,
            AND IF IT DROPS YOU TO 0 HP IT STEALS AN EMBER BEFORE THE SAVE, RALLYING YOU AT HALF HP.
            QUESTS ONLY APPEAR — AND ONLY COUNT — ON THE DAYS THEY ARE SCHEDULED.
          </div>

          <SectionLabel>THE SIEGE</SectionLabel>
          <div style={{ ...bodyText, fontSize: 14, color: 'var(--text-low)', marginBottom: 10, lineHeight: 1.5 }}>
            A NEW BOSS RISES EACH SUNDAY, SCALED TO YOUR KNIGHT AT ITS ARRIVAL (SPOILS DON'T COUNT).
            ITS HP EQUALS 5 PERFECT DAYS OF YOUR DAMAGE — THE FINAL BOSS TAKES 7.
            IT STRIKES EVERY DAY IT STANDS, FOR YOUR MAX HP ÷ 5 PLUS YOUR VITALITY — THE FINAL BOSS HITS FOR ÷ 4 PLUS VIT.
            ON A BAD DAY (BELOW C) A CHARGED SIGNATURE HAS 50/50 ODDS TO FIRE INSTEAD;
            A MISS KEEPS IT CHARGED, A HIT CURSES YOUR NEXT DAY FOR 24H AND RECHARGES FOR 2 DAYS.
            KILL THE BOSS AND THE STRIKES STOP FOR THE WEEK.
            VITALITY IS YOUR DAILY HEAL — ONLY AN S-TIER DAY RESTORES YOUR VIT IN HP.
            VIT STARTS AT 1 AND GROWS +1 PER WORK-RUNE DAY; THE BOSS'S BLOWS ARE SIZED TO OUTPACE IT.
            THE BOSS NEVER HEALS AND ITS SUNDAY STRENGTH IS PINNED ALL WEEK.
            RUNES: PHYSICAL +1 STR · MENTAL +1 WIL · WORK +1 VIT — ONE PER DAY, AT NEXT DAWN.
            PROTEIN DAYS ADD +2 MAX HP; WATER DAYS ADD +1 STAM.
            THROUGH LEVEL 15 BOSSES ARE GENTLER — 4 DAYS OF DAMAGE FELLS THEM, 6 TO FELL YOU.
            AT 0 HP IT STEALS AN EMBER AND YOU RALLY AT HALF HP.
            SURVIVE THE WEEK AND IT RETURNS RISEN AT +5% HP.
          </div>

          <SectionLabel>VILLAINS OF THE LADDER</SectionLabel>
          {VILLAINS.map((v) => (
            <div key={v.key} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--hairline)' }}>
              {sceneFor(v.key) !== undefined && (
                <img
                  src={sceneFor(v.key)}
                  alt={v.name}
                  style={{ width: 92, height: 61, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ ...bodyText, fontSize: 16, color: 'var(--text-hi)' }}>
                  {v.name}
                  <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>
                    {'  '}{v.key === 'ultimateDarkLord' ? 'LV 100 · FINAL BOSS' : `LV ${Math.max(1, v.band)}–${v.band + 9}`}
                  </span>
                </div>
                <div style={{ ...bodyText, fontSize: 13, color: 'var(--text-mid)' }}>{v.normal.label}</div>
                <div style={{ ...bodyText, fontSize: 13, color: 'var(--ember)' }}>
                  ULT: {v.signature.label} — {v.signature.desc}
                </div>
              </div>
            </div>
          ))}
          <div style={{ ...bodyText, fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 12px' }}>
            ATTACK DAMAGE SCALES TO YOUR KNIGHT WHEN THE BOSS RISES. ULTS DEAL 1.5× A NORMAL BLOW.
          </div>

          <SectionLabel>THE CHEST</SectionLabel>
          {CHEST_ROWS.map((c) => (
            <div key={c.kind} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--hairline)' }}>
              <img src={chestPng} alt="" style={{ width: 40, height: 40, imageRendering: 'pixelated' }} />
              <div>
                <div style={{ ...bodyText, color: 'var(--gild-bright)' }}>{CHEST_NAMES[c.kind]}</div>
                <div style={{ ...bodyText, fontSize: 14, color: 'var(--text-low)' }}>{c.earned}</div>
                <div style={{ ...bodyText, fontSize: 14, color: 'var(--text-faint)' }}>{c.odds}</div>
              </div>
            </div>
          ))}
          <div style={{ ...bodyText, fontSize: 14, color: 'var(--text-faint)', margin: '4px 0 10px' }}>
            TIER ROLL: 60% COMMON · 30% RARE · 10% MYTHIC. TOTEMS ARE ALWAYS MYTHIC.
            ROLL A SPOIL YOU ALREADY OWN AND IT UPGRADES ONE TIER INSTEAD — ALREADY MYTHIC? THE CHEST RESHUFFLES.
          </div>

          <SectionLabel>TOKENS — XP</SectionLabel>
          {tokens.map((d) => <TieredItem key={d.key} def={d} />)}

          <SectionLabel>ENCHANTMENTS — ARMOR &amp; ATTACK</SectionLabel>
          {enchants.map((d) => <TieredItem key={d.key} def={d} />)}

          <SectionLabel>TOTEMS — MYTHIC</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {totems.map((d) => (
              <div key={d.key} style={{ textAlign: 'center' }}>
                <img
                  src={emblemUrl(d.key)}
                  alt={d.name}
                  style={{ width: '100%', imageRendering: 'pixelated', display: 'block' }}
                />
                <div style={{ ...bodyText, fontSize: 14, color: 'var(--text-mid)', marginTop: 4 }}>
                  {d.desc}
                </div>
              </div>
            ))}
          </div>

          <SectionLabel>DEEDS</SectionLabel>
          <div style={{ ...bodyText, fontSize: 14, color: 'var(--text-low)', margin: '4px 0 10px', lineHeight: 1.5 }}>
            GIANT SLAYER COMPLETES WHEN THIS WEEK'S BOSS FALLS AND RESETS WHEN THE NEXT ONE RISES.
            IRON WILL ASKS FOR A PHYSICAL QUEST 10 DAYS STRAIGHT; HYDRATED, YOUR WATER GOAL 7 DAYS STRAIGHT.
            THE LEVEL PATH EVOLVES THE DAY AFTER EACH STAGE: GETTING ON TRACK (25) → ALMOST A THREAT (50)
            → ACTUALLY A THREAT (75) → LEGEND (100).
          </div>
        </div>
      </div>
    </div>
  );
}
