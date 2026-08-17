import { useOath } from '../../app/store';
import { SectionLabel } from '../atoms';
import { ARMOR_AGES } from '../../core/types';
import { AGE_PERKS } from '../../game/body';

interface Tile {
  key: string;
  name: string;
  condition: string;
  unlocked: boolean;
  perk?: string;
  ageLevel?: number;   // set on armor-age tiles — tap to wear that knight
}

/**
 * ARMORY grid — 11 armor ages plus crest/cosmetic unlocks as tiles.
 * Unlocked tiles are lit neon; locked tiles sit dim with their unlock condition
 * (`LV 19`, `S×7` = 7 S-days, `PR ✓`).
 */
export default function Armory() {
  const level = useOath((s) => s.ageLevel); // admin override wins
  const settings = useOath((s) => s.settings);
  const isAdmin = useOath((s) => s.isAdmin);
  const updateSettings = useOath((s) => s.updateSettings);
  const unlocks = useOath((s) => s.unlocks);
  const streaks = useOath((s) => s.streaks);
  const prs = useOath((s) => s.prs);

  const hasUnlock = (kind: string, name?: string): boolean =>
    unlocks.some((u) => u.kind === kind && (name === undefined || u.name === name));

  const perkByLevel = new Map(AGE_PERKS.map(([lv, , perk]) => [lv, perk]));
  const tiles: Tile[] = ARMOR_AGES.map(([lv, name]) => ({
    key: `age-${lv}`,
    name,
    condition: `LV ${lv}`,
    unlocked: level >= lv,
    perk: perkByLevel.get(lv),
    ageLevel: lv,
  }));

  /** Tap a knight to wear it — the owner's admin login only. */
  const wear = (lv: number): void => {
    if (!isAdmin) return;
    const worn = settings.adminKnightLevel;
    void updateSettings(worn === lv ? { adminKnightLevel: undefined } : { adminKnightLevel: lv });
  };
  const wornLevel = AGE_PERKS.filter(([lv]) => lv <= level).map(([lv]) => lv).pop() ?? 1;

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
            onClick={t.ageLevel !== undefined ? () => wear(t.ageLevel as number) : undefined}
            style={{
              border: `1px solid ${t.ageLevel === wornLevel ? 'var(--gild)' : t.unlocked ? 'var(--border)' : 'var(--hairline)'}`,
              background: 'var(--panel)',
              padding: '8px 6px',
              textAlign: 'center',
              opacity: t.unlocked ? 1 : 0.55,
              cursor: t.ageLevel !== undefined ? 'pointer' : 'default',
              boxShadow: t.ageLevel === wornLevel ? '0 0 8px rgba(201,162,60,0.35)' : 'none',
            }}
          >
            {t.ageLevel === wornLevel && (
              <div style={{ fontFamily: 'var(--font-label)', fontSize: 6, letterSpacing: '0.2em', color: 'var(--gild)', marginBottom: 3 }}>
                ◆ WORN ◆
              </div>
            )}
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
            {t.perk !== undefined && t.perk !== '—' && (
              <div
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, marginTop: 3,
                  color: t.unlocked ? 'var(--gild)' : 'var(--text-faint)',
                }}
              >
                {t.perk}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
