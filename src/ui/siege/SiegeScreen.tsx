// ui/siege/SiegeScreen.tsx — full-screen weekly boss overlay (plan Task 18, spec §5).
// Opened from the Today screen's siege banner. All siege state comes from the
// store; the crest-fragment counter lives in kv 'fragments' (lifecycle awards
// fragments + 150 XP on kill and forges a crest Unlock at 3).
import { useEffect, useState } from 'react';
import { useOath } from '../../app/store';
import { kvGet } from '../../data/db';
import { KILL_XP } from '../../game/siege';
import type { SiegeState } from '../../core/types';
import { Icon, SectionLabel } from '../atoms';
import Knight from '../knight/Knight';

// --- Boss sprite -------------------------------------------------------------
// Hulking horned silhouette in the same chunky pixel style as the Knight:
// big rectangles on a logical grid, crisp edges, ember eyes. Enemy-only red.

type Px = [number, number, number, number];

const BOSS_GRID_W = 24;
const BOSS_GRID_H = 30;
const BOSS_BODY = '#1a0f0d';

const BOSS_PIXELS: Px[] = [
  // horns
  [3, 0, 2, 3], [19, 0, 2, 3],
  [4, 2, 2, 2], [18, 2, 2, 2],
  [5, 3, 2, 2], [17, 3, 2, 2],
  // head
  [7, 4, 10, 6],
  // shoulders
  [3, 10, 18, 4],
  // arms
  [2, 12, 3, 9], [19, 12, 3, 9],
  // fists
  [1, 20, 4, 4], [19, 20, 4, 4],
  // torso
  [6, 14, 12, 9],
  // legs
  [7, 23, 4, 6], [13, 23, 4, 6],
];

const BOSS_EYES: Px[] = [
  [9, 6, 2, 2], [13, 6, 2, 2],
];

function BossSprite({ size = 132, dimmed = false }: { size?: number; dimmed?: boolean }) {
  return (
    <svg
      viewBox={`0 0 ${BOSS_GRID_W} ${BOSS_GRID_H}`}
      width={size}
      height={Math.round((size * BOSS_GRID_H) / BOSS_GRID_W)}
      style={{ shapeRendering: 'crispEdges', display: 'block', opacity: dimmed ? 0.35 : 1 }}
      role="img"
      aria-label="siege boss"
    >
      <rect x={0} y={29} width={BOSS_GRID_W} height={1} fill="var(--hairline)" />
      {BOSS_PIXELS.map(([x, y, w, h], i) => (
        <rect key={`b-${i}`} x={x} y={y} width={w} height={h} fill={BOSS_BODY} />
      ))}
      {BOSS_EYES.map(([x, y, w, h], i) => (
        <rect key={`e-${i}`} x={x} y={y} width={w} height={h} fill="var(--ember)" />
      ))}
    </svg>
  );
}

// --- The screen --------------------------------------------------------------

/** Store-wired overlay: reads siege + knight level from useOath, fragments from kv. */
export default function SiegeScreen({ onClose }: { onClose: () => void }) {
  const siege = useOath((s) => s.siege);
  const level = useOath((s) => s.character.level);
  const [fragments, setFragments] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void kvGet<number>('fragments', 0).then((n) => {
      if (!cancelled) setFragments(n);
    });
    return () => { cancelled = true; };
  }, [siege?.killed]);

  return <SiegeView siege={siege} level={level} fragments={fragments} onClose={onClose} />;
}

/** Pure presentational siege page — exported for tests. */
export function SiegeView({
  siege, level, fragments, onClose,
}: {
  siege: SiegeState | null;
  level: number;
  fragments: number;
  onClose: () => void;
}) {
  const closeBtn = (
    <button
      type="button"
      onClick={onClose}
      style={{
        fontFamily: 'var(--font-label)', fontSize: 7, letterSpacing: '0.2em',
        color: 'var(--text-mid)', background: 'var(--panel)',
        border: '1px solid var(--border)', padding: '8px 14px',
      }}
    >
      CLOSE
    </button>
  );

  const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 200, overflowY: 'auto',
    background: 'var(--bg-deep)',
  } as const;

  const columnStyle = {
    maxWidth: 430, margin: '0 auto', minHeight: '100%', padding: '18px 16px 24px',
    display: 'flex', flexDirection: 'column', gap: 12,
  } as const;

  if (siege === null) {
    return (
      <div style={overlayStyle}>
        <div style={{ ...columnStyle, alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'var(--font-title)', fontSize: 32, color: 'var(--ember)' }}>
            THE SIEGE
          </span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-low)' }}>
            NO BOSS STIRS THIS WEEK.
          </span>
          {closeBtn}
        </div>
      </div>
    );
  }

  // The engine renames a survived boss '<NAME> RISEN'; only prefix when it hasn't.
  const risen = siege.generation > 0;
  const displayName = risen && !siege.name.includes('RISEN') ? `RISEN · ${siege.name}` : siege.name;
  const hpPct = siege.maxHp > 0 ? Math.max(0, Math.min(100, (siege.hp / siege.maxHp) * 100)) : 0;
  const villain = useOath((st) => st.villain);
  const sigCooldown = useOath((st) => st.sigCooldown);
  const todayStatus = useOath((st) => st.todayStatus);
  // Latest 8 strikes, newest first.
  const log = siege.log.slice(-8).reverse();
  // kv 'fragments' wraps to 0 when the 3rd fragment forges a crest — show the
  // full triad on the week the forge happened.
  const shownFragments = siege.killed && fragments === 0 ? 3 : fragments;

  return (
    <div style={overlayStyle}>
      <div style={columnStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ember)' }}>
          <Icon name="skull" size={18} />
          <SectionLabel>THE SIEGE</SectionLabel>
        </div>

        {/* Boss name */}
        <div style={{ fontFamily: 'var(--font-title)', fontSize: 36, lineHeight: 1, color: 'var(--ember)' }}>
          {displayName}
        </div>
        {risen && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-mid)' }}>
            IT REMEMBERS.
          </div>
        )}

        {/* HP bar */}
        <div>
          <div
            style={{
              height: 14, background: 'var(--panel)', border: '1px solid var(--border)',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute', top: 0, left: 0, bottom: 0, width: `${hpPct}%`,
                background: 'var(--ember)',
              }}
            />
          </div>
          <div
            style={{
              marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              fontFamily: 'var(--font-body)', fontSize: 20, color: 'var(--text-hi)',
            }}
          >
            <span>{siege.hp.toLocaleString()} / {siege.maxHp.toLocaleString()} HP</span>
            {/* Signature charge: two diamonds; one clears each daily reset. */}
            <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-label)', fontSize: 6, letterSpacing: '0.15em', color: sigCooldown === 0 ? 'var(--ember)' : 'var(--text-faint)' }}>
                {sigCooldown === 0 ? 'SIGNATURE READY' : 'CHARGING'}
              </span>
              {[0, 1].map((k) => (
                <span
                  key={k}
                  style={{
                    width: 7, height: 7, transform: 'rotate(45deg)',
                    border: '1px solid var(--ember)',
                    background: k < sigCooldown ? 'var(--bg-deep)' : 'var(--ember)',
                    boxShadow: sigCooldown === 0 ? '0 0 5px rgba(226,91,74,0.6)' : 'none',
                  }}
                />
              ))}
            </span>
          </div>
        </div>

        {/* This villain's attacks */}
        {villain !== null && (
          <div style={{ border: '1px solid var(--hairline)', padding: '6px 10px', fontFamily: 'var(--font-body)', fontSize: 16 }}>
            <div style={{ color: 'var(--text-mid)' }}>
              {villain.normal.label} — {siege.strikeDmg ?? villain.normal.dmg} HP
            </div>
            <div style={{ color: 'var(--ember)' }}>
              {villain.signature.label} — {siege.sigDmg ?? villain.signature.dmg} HP · {villain.signature.desc}
            </div>
          </div>
        )}

        {/* Active curse from yesterday's signature */}
        {todayStatus !== null && (
          <div
            style={{
              border: '1px solid var(--ember)', padding: '6px 10px', textAlign: 'center',
              fontFamily: 'var(--font-body)', fontSize: 17, color: 'var(--ember)',
              textShadow: '0 0 6px rgba(226,91,74,0.4)',
            }}
          >
            {todayStatus.label} — {todayStatus.desc}
          </div>
        )}

        {/* Arena: knight vs boss */}
        <div
          style={{
            display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            padding: '10px 6px', background: 'var(--panel)', border: '1px solid var(--border)',
          }}
        >
          <Knight level={level} pose="full" size={108} />
          <BossSprite size={132} dimmed={siege.killed} />
        </div>

        {/* Kill reward band */}
        {siege.killed && (
          <div
            style={{
              border: '1px solid var(--neon)', padding: '8px 10px', textAlign: 'center',
              fontFamily: 'var(--font-body)', fontSize: 20, color: 'var(--neon)',
            }}
          >
            CREST FRAGMENT {shownFragments}/3 · +{KILL_XP} XP
          </div>
        )}

        {/* Attack log */}
        <div>
          <SectionLabel>SIEGE LOG</SectionLabel>
          {log.length === 0 && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-faint)' }}>
              NO BLOWS STRUCK YET.
            </div>
          )}
          {log.map((entry, i) => (
            <div
              key={`${entry.at}-${i}`}
              style={{
                padding: '4px 0', borderBottom: '1px solid var(--hairline)',
                fontFamily: 'var(--font-body)', fontSize: 18,
                color: entry.crit ? 'var(--amber)' : 'var(--text-mid)',
              }}
            >
              {entry.crit
                ? `${entry.label.toUpperCase()} READY — CRIT ×1.5 −${entry.amount}`
                : `${entry.label.toUpperCase()} STRUCK −${entry.amount} HP`}
            </div>
          ))}
        </div>

        {/* Weekly summary line */}
        <div
          style={{
            fontFamily: 'var(--font-label)', fontSize: 6, letterSpacing: '0.2em',
            color: 'var(--text-faint)',
          }}
        >
          A PERFECT WEEK FELLS IT WITH ~8% TO SPARE
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center' }}>
          {closeBtn}
        </div>
      </div>
    </div>
  );
}
