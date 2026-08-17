// EffectsLayer — the single global consumer of the store's effects queue.
// Mounted once in App. Processes the head effect: plays its chiptune cue +
// haptic once, renders the matching visual, and pops the queue when the
// visual finishes (floats auto-pop on a timer; full-screen overlays pop on
// tap). fxIntensity: 'off' → no visuals (instant pop; sound/haptics keep
// their own toggles); 'reduced' → no full-screen overlays except level-up.
import { useEffect, useRef } from 'react';
import { useOath, type EffectEvent } from '../../app/store';
import {
  chirpComplete, chirpXp, fanfareLevelUp, haptic, sealDay, thudDamage,
} from '../../audio/sfx';
import XpFloat from './XpFloat';
import LevelUpOverlay from './LevelUpOverlay';
import DaySeal from './DaySeal';
import { emblemUrl } from '../loot/emblems';

// Display duration for transient (non-overlay) effects, ms. pr is held longer
// so SessionLogger's non-destructive read of the queue can surface its banner.
const FLOAT_MS: Record<EffectEvent['kind'], number> = {
  xp: 700, pr: 2500, siegeKill: 2000, levelUp: 0, daySeal: 0, loot: 0,
};

function playCue(e: EffectEvent): void {
  switch (e.kind) {
    case 'xp': chirpComplete(); haptic(15); break;
    case 'pr': chirpXp(); haptic(20); break;
    case 'levelUp': fanfareLevelUp(); haptic([30, 40, 30]); break;
    case 'daySeal': sealDay(); haptic(30); break;
    case 'siegeKill': thudDamage(); haptic([40, 60, 40]); break;
    case 'loot': fanfareLevelUp(); haptic([20, 30, 20]); break;
  }
}

/** Thin fixed banner for siege-kill announcements (not a full-screen overlay). */
function KillBanner({ name }: { name: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        top: 96,
        transform: 'translateX(-50%)',
        zIndex: 300,
        pointerEvents: 'none',
        padding: '8px 16px',
        background: 'var(--panel)',
        border: '1px solid var(--border)',
        fontFamily: 'var(--font-body)',
        fontSize: 22,
        color: 'var(--ember)',
        textShadow: '0 0 8px rgba(226,91,74,.5)',
        whiteSpace: 'nowrap',
        animation: 'oath-fx-in 220ms ease-out',
      }}
    >
      {name} FALLS
      <style>{`@keyframes oath-fx-in{from{opacity:0}to{opacity:1}}`}</style>
    </div>
  );
}

const TIER_COLOR: Record<string, string> = {
  common: 'var(--text-mid)', rare: 'var(--gild)', mythic: 'var(--neon)',
};

/** Full-screen chest-opening reveal: chest name, then the item card. */
function LootReveal({ name, tier, desc, chest, itemKey, onDismiss }: {
  name: string; tier: string; desc: string; chest: string; itemKey: string; onDismiss: () => void;
}) {
  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(5,7,5,0.92)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 14, cursor: 'pointer',
        animation: 'oath-fx-in 260ms ease-out',
      }}
    >
      <div style={{ fontFamily: 'var(--font-label)', fontSize: 8, letterSpacing: '0.3em', color: 'var(--gild)' }}>
        {chest} OPENED
      </div>
      <div
        style={{
          border: '1px solid var(--gild)', background: 'var(--panel)', padding: '18px 26px',
          textAlign: 'center', boxShadow: '0 0 24px rgba(201,162,60,0.25)',
        }}
      >
        <img
          src={emblemUrl(itemKey, tier as never)}
          alt=""
          style={{ width: 120, imageRendering: 'pixelated', display: 'block', margin: '0 auto 10px' }}
        />
        <div style={{ fontFamily: 'var(--font-label)', fontSize: 7, letterSpacing: '0.25em', color: TIER_COLOR[tier] ?? 'var(--text-mid)', marginBottom: 8 }}>
          {tier.toUpperCase()}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 26, color: 'var(--text-hi)' }}>{name}</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-mid)', marginTop: 6 }}>{desc}</div>
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 16, color: 'var(--text-faint)' }}>TAP TO CLAIM</div>
      <style>{`@keyframes oath-fx-in{from{opacity:0}to{opacity:1}}`}</style>
    </div>
  );
}

/** Pure render of the head effect — separable from the store for testing. */
export function EffectsView({
  head,
  fx,
  queueLen,
  onPop,
}: {
  head: EffectEvent | undefined;
  fx: 'full' | 'reduced' | 'off';
  queueLen: number;
  onPop: () => void;
}) {
  if (head === undefined || fx === 'off') return null;

  switch (head.kind) {
    case 'xp':
      return <XpFloat key={`xp-${head.at}-${queueLen}`} amount={head.amount} />;
    case 'pr':
      return (
        <XpFloat
          key={`pr-${head.label}-${queueLen}`}
          amount={head.xp}
          label={`NEW PR — ${head.label}`}
          amber
          duration={FLOAT_MS.pr}
        />
      );
    case 'siegeKill':
      return <KillBanner name={head.name} />;
    case 'levelUp':
      return (
        <LevelUpOverlay from={head.from} to={head.to} ageReveal={head.ageReveal} onDismiss={onPop} />
      );
    case 'loot':
      return (
        <LootReveal name={head.name} tier={head.tier} desc={head.desc} chest={head.chest} itemKey={head.itemKey} onDismiss={onPop} />
      );
    case 'daySeal':
      return fx === 'full' ? (
        <DaySeal
          date={head.date}
          score={head.score}
          rank={head.rank}
          xp={head.xp}
          streak={head.streak}
          onDismiss={onPop}
        />
      ) : null;
  }
}

export default function EffectsLayer() {
  const effects = useOath((s) => s.effects);
  const popEffect = useOath((s) => s.popEffect);
  const fx = useOath((s) => s.settings.fxIntensity);
  const head: EffectEvent | undefined = effects[0];
  const cued = useRef<EffectEvent | null>(null);

  // Play the audio/haptic cue exactly once per effect reaching the head.
  useEffect(() => {
    if (head === undefined || cued.current === head) return;
    cued.current = head;
    playCue(head);
  }, [head]);

  // Auto-pop transient effects; overlays are popped by their onDismiss tap.
  useEffect(() => {
    if (head === undefined) return undefined;
    const isOverlay =
      head.kind === 'levelUp' || head.kind === 'loot'
        ? fx !== 'off'
        : head.kind === 'daySeal' ? fx === 'full' : false;
    if (isOverlay) return undefined;
    const ms = fx === 'off' ? 0 : FLOAT_MS[head.kind];
    const t = window.setTimeout(popEffect, ms);
    return () => window.clearTimeout(t);
  }, [head, fx, popEffect]);

  return <EffectsView head={head} fx={fx} queueLen={effects.length} onPop={popEffect} />;
}
