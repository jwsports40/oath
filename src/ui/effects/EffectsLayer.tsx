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

// Display duration for transient (non-overlay) effects, ms. pr is held longer
// so SessionLogger's non-destructive read of the queue can surface its banner.
const FLOAT_MS: Record<EffectEvent['kind'], number> = {
  xp: 700, pr: 2500, siegeKill: 2000, levelUp: 0, daySeal: 0,
};

function playCue(e: EffectEvent): void {
  switch (e.kind) {
    case 'xp': chirpComplete(); haptic(15); break;
    case 'pr': chirpXp(); haptic(20); break;
    case 'levelUp': fanfareLevelUp(); haptic([30, 40, 30]); break;
    case 'daySeal': sealDay(); haptic(30); break;
    case 'siegeKill': thudDamage(); haptic([40, 60, 40]); break;
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
      head.kind === 'levelUp' ? fx !== 'off' : head.kind === 'daySeal' ? fx === 'full' : false;
    if (isOverlay) return undefined;
    const ms = fx === 'off' ? 0 : FLOAT_MS[head.kind];
    const t = window.setTimeout(popEffect, ms);
    return () => window.clearTimeout(t);
  }, [head, fx, popEffect]);

  return <EffectsView head={head} fx={fx} queueLen={effects.length} onPop={popEffect} />;
}
