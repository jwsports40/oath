// Effects layer render tests (renderToString — no DOM; useEffect does not run,
// so no audio plays and no timers pop the queue). The store-connected layer
// reads zustand's INITIAL state under SSR, so the queue-driven rendering is
// tested through the pure EffectsView. fake-indexeddb backs the Dexie chain
// pulled in through the store import.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { type EffectEvent } from '../../../app/store';
import EffectsLayer, { EffectsView } from '../EffectsLayer';
import XpFloat from '../XpFloat';
import LevelUpOverlay from '../LevelUpOverlay';
import DaySeal from '../DaySeal';
import { chirpComplete, chirpXp, fanfareLevelUp, haptic, sealDay, thudDamage } from '../../../audio/sfx';

const render = (el: JSX.Element): string => renderToString(el).replace(/<!-- -->/g, '');

const view = (head: EffectEvent | undefined, fx: 'full' | 'reduced' | 'off' = 'full', queueLen = 1) =>
  render(<EffectsView head={head} fx={fx} queueLen={queueLen} onPop={() => {}} />);

describe('XpFloat', () => {
  it('renders +{n} XP', () => {
    expect(render(<XpFloat amount={75} />)).toContain('+75 XP');
  });
  it('renders the labelled PR variant', () => {
    const html = render(<XpFloat amount={25} label="NEW PR — 225×5" amber />);
    expect(html).toContain('NEW PR — 225×5 · +25 XP');
  });
});

describe('LevelUpOverlay', () => {
  it('renders LEVEL UP {from} → {to}', () => {
    const html = render(<LevelUpOverlay from={17} to={18} onDismiss={() => {}} />);
    expect(html).toContain('LEVEL UP 17 → 18');
    expect(html).not.toContain('A NEW AGE OF ARMOR');
  });
  it('reveals the armor age when set', () => {
    const html = render(<LevelUpOverlay from={19} to={20} ageReveal="CRUSADER" onDismiss={() => {}} />);
    expect(html).toContain('A NEW AGE OF ARMOR');
    expect(html).toContain('CRUSADER');
  });
});

describe('DaySeal', () => {
  it('renders the full seal copy', () => {
    const html = render(
      <DaySeal date="2026-08-15" score={94} rank="S" xp={280} streak={5} onDismiss={() => {}} />,
    );
    expect(html).toContain('DAY COMPLETE');
    expect(html).toContain('94% · S RANK');
    expect(html).toContain('+280 XP · 5 DAY STREAK');
  });
});

describe('EffectsView', () => {
  it('renders nothing with an empty queue', () => {
    expect(view(undefined, 'full', 0)).toBe('');
  });
  it('renders the head xp effect as a float', () => {
    expect(view({ kind: 'xp', amount: 50, at: 1 })).toContain('+50 XP');
  });
  it('renders the levelUp overlay, also under reduced intensity', () => {
    const head: EffectEvent = { kind: 'levelUp', from: 17, to: 18 };
    expect(view(head, 'full')).toContain('LEVEL UP 17 → 18');
    expect(view(head, 'reduced')).toContain('LEVEL UP 17 → 18');
  });
  it('suppresses the daySeal overlay under reduced intensity', () => {
    const head: EffectEvent = {
      kind: 'daySeal', date: '2026-08-15', score: 94, rank: 'S', xp: 280, streak: 5,
    };
    expect(view(head, 'full')).toContain('DAY COMPLETE');
    expect(view(head, 'reduced')).toBe('');
  });
  it('renders nothing when fxIntensity is off', () => {
    expect(view({ kind: 'xp', amount: 50, at: 1 }, 'off')).toBe('');
  });
  it('renders pr and siegeKill announcements', () => {
    expect(view({ kind: 'pr', label: '225×5', xp: 25 })).toContain('NEW PR — 225×5 · +25 XP');
    expect(view({ kind: 'siegeKill', name: 'THE HOLLOW KING' })).toContain('THE HOLLOW KING FALLS');
  });
});

describe('EffectsLayer', () => {
  it('renders nothing from the initial (empty) store state', () => {
    expect(render(<EffectsLayer />)).toBe('');
  });
});

describe('sfx', () => {
  it('cues are no-ops without a window/AudioContext and never throw', () => {
    expect(() => {
      chirpComplete(); chirpXp(); fanfareLevelUp(); thudDamage(); sealDay(); haptic(15); haptic([30, 40, 30]);
    }).not.toThrow();
  });
});
