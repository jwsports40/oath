// SPOILS — chests earned from bosses and streaks, the loot inventory, and the
// knight's three attachment slots (one token, one enchantment, one totem).
import type { CSSProperties } from 'react';
import { useOath } from '../../app/store';
import { CHEST_NAMES, lootDesc } from '../../game/loot';
import type { Equipped, LootGenre, LootItem } from '../../core/types';
import { Panel, SectionLabel } from '../atoms';
import chestPng from '../loot/chest.png';

const bodyText: CSSProperties = { fontFamily: 'var(--font-body)', fontSize: 18 };
const TIER_COLOR: Record<string, string> = {
  common: 'var(--text-mid)', rare: 'var(--gild)', mythic: 'var(--neon)',
};
const SLOT_OF: Record<LootGenre, keyof Equipped> = {
  token: 'token', enchant: 'enchant', totem: 'totem',
};
const GENRE_LABEL: Record<LootGenre, string> = {
  token: 'TOKENS', enchant: 'ENCHANTMENTS', totem: 'TOTEMS',
};

export default function Spoils() {
  const chests = useOath((s) => s.chests);
  const loot = useOath((s) => s.loot);
  const equipped = useOath((s) => s.equipped);
  const openChest = useOath((s) => s.openChest);
  const equipItem = useOath((s) => s.equipItem);

  const unopened = chests.filter((c) => c.openedAt === undefined);
  const equippedIds = new Set(Object.values(equipped).filter((x): x is string => typeof x === 'string'));

  const renderItem = (item: LootItem) => {
    const slot = SLOT_OF[item.genre];
    const isOn = equippedIds.has(item.id);
    return (
      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--hairline)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...bodyText, color: TIER_COLOR[item.tier] }}>
            {item.name}
            <span style={{ fontFamily: 'var(--font-label)', fontSize: 6, letterSpacing: '0.2em', marginLeft: 8, color: 'var(--text-faint)' }}>
              {item.tier.toUpperCase()}
            </span>
          </div>
          <div style={{ ...bodyText, fontSize: 15, color: 'var(--text-low)' }}>{lootDesc(item)}</div>
        </div>
        <button
          onClick={() => { void equipItem(slot, isOn ? null : item.id); }}
          style={{
            fontFamily: 'var(--font-label)', fontSize: 7, letterSpacing: '0.15em',
            color: isOn ? 'var(--on-neon)' : 'var(--neon)',
            background: isOn ? 'var(--neon)' : 'none',
            border: '1px solid var(--border)', padding: '6px 10px', cursor: 'pointer',
          }}
        >
          {isOn ? 'ATTACHED' : 'ATTACH'}
        </button>
      </div>
    );
  };

  return (
    <section>
      <SectionLabel>SPOILS</SectionLabel>
      {unopened.length > 0 && (
        <Panel amber>
          {unopened.map((c) => (
            <button
              key={c.id}
              onClick={() => { void openChest(c.id); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <img src={chestPng} alt="" style={{ width: 44, height: 44, imageRendering: 'pixelated' }} />
              <span style={{ flex: 1 }}>
                <span style={{ ...bodyText, color: 'var(--gild-bright)', display: 'block' }}>
                  {CHEST_NAMES[c.kind]}
                </span>
                <span style={{ ...bodyText, fontSize: 15, color: 'var(--text-low)' }}>{c.source}</span>
              </span>
              <span style={{ fontFamily: 'var(--font-label)', fontSize: 7, letterSpacing: '0.2em', color: 'var(--gild)' }}>
                OPEN
              </span>
            </button>
          ))}
        </Panel>
      )}
      {loot.length === 0 && unopened.length === 0 && (
        <div style={{ ...bodyText, color: 'var(--text-faint)' }}>
          NO SPOILS YET. SLAY THE BOSS OR HOLD A 7-DAY STREAK TO EARN A CHEST.
        </div>
      )}
      {loot.length > 0 && (
        <Panel>
          {(['token', 'enchant', 'totem'] as LootGenre[]).map((g) => {
            const items = loot.filter((i) => i.genre === g);
            if (items.length === 0) return null;
            return (
              <div key={g} style={{ marginBottom: 6 }}>
                <SectionLabel>{GENRE_LABEL[g]}</SectionLabel>
                {items.map(renderItem)}
              </div>
            );
          })}
        </Panel>
      )}
    </section>
  );
}
