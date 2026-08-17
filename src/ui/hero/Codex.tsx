// CODEX — the tap-to-open compendium of every chest, token, enchantment, and
// totem, with the hand-made emblem art and real in-game numbers.
import type { CSSProperties } from 'react';
import { CATALOG, CHEST_NAMES, type LootDef } from '../../game/loot';
import type { ChestKind, LootTier } from '../../core/types';
import { SectionLabel } from '../atoms';
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
        position: 'fixed', inset: 0, zIndex: 80, background: '#000',
        overflowY: 'auto', padding: 16, display: 'flex', justifyContent: 'center',
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
        </div>
      </div>
    </div>
  );
}
