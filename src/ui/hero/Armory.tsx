import { useOath } from '../../app/store';
import { SectionLabel } from '../atoms';
import { ARMOR_AGES } from '../../core/types';

interface Tile {
  key: string;
  name: string;
  condition: string;
  unlocked: boolean;
}

/**
 * ARMORY grid — 11 armor ages plus crest/cosmetic unlocks as tiles.
 * Unlocked tiles are lit neon; locked tiles sit dim with their unlock condition
 * (`LV 19`, `S×7` = 7 S-days, `PR ✓`).
 */
export default function Armory() {
  const level = useOath((s) => s.character.level);
  const unlocks = useOath((s) => s.unlocks);
  const streaks = useOath((s) => s.streaks);
  const prs = useOath((s) => s.prs);

  const hasUnlock = (kind: string, name?: string): boolean =>
    unlocks.some((u) => u.kind === kind && (name === undefined || u.name === name));

  const tiles: Tile[] = ARMOR_AGES.map(([lv, name]) => ({
    key: `age-${lv}`,
    name,
    condition: `LV ${lv}`,
    unlocked: level >= lv,
  }));

  // Cosmetic unlocks beyond the ages (spec §3): helms, capes, crests.
  tiles.push(
    {
      key: 'ember-helm',
      name: 'EMBER HELM',
      condition: 'S×7',
      unlocked: streaks.sRankBest >= 7 || hasUnlock('helm', 'EMBER HELM'),
    },
    {
      key: 'champion-cape',
      name: 'CHAMPION CAPE',
      condition: 'PR ✓',
      unlocked: prs.length > 0 || hasUnlock('cape', 'CHAMPION CAPE'),
    },
    {
      key: 'war-crest',
      name: 'WAR CREST',
      condition: 'CREST ×3',
      unlocked: hasUnlock('crest'),
    },
  );

  // Any other earned cosmetics (environments, extra crests…) show as lit tiles.
  for (const u of unlocks) {
    if (u.kind === 'armorAge' || u.kind === 'title') continue;
    if (tiles.some((t) => t.name === u.name)) continue;
    tiles.push({ key: `unlock-${u.id}`, name: u.name, condition: '✓', unlocked: true });
  }

  return (
    <section>
      <SectionLabel>ARMORY</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {tiles.map((t) => (
          <div
            key={t.key}
            style={{
              border: `1px solid ${t.unlocked ? 'var(--border)' : 'var(--hairline)'}`,
              background: 'var(--panel)',
              padding: '8px 6px',
              textAlign: 'center',
              opacity: t.unlocked ? 1 : 0.55,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 18,
                lineHeight: 1.05,
                color: t.unlocked ? 'var(--neon)' : 'var(--text-low)',
                textShadow: t.unlocked ? '0 0 6px rgba(70,255,125,0.45)' : 'none',
              }}
            >
              {t.name}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-label)',
                fontSize: 6,
                letterSpacing: '0.15em',
                marginTop: 5,
                color: t.unlocked ? 'var(--text-mid)' : 'var(--text-faint)',
              }}
            >
              {t.unlocked ? 'UNLOCKED' : t.condition}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
