// Smoke test: the siege page renders from props (SiegeView is the pure
// presentational half of SiegeScreen — zustand's SSR snapshot pins useOath to
// the initial state, so the store-wired default export is exercised only for
// its safe empty render). fake-indexeddb backs the Dexie import chain.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import SiegeScreen, { SiegeView } from '../SiegeScreen';
import type { SiegeState } from '../../../core/types';

const noop = (): void => {};

function render(siege: SiegeState | null, fragments = 0): string {
  // renderToString inserts <!-- --> markers between adjacent text nodes.
  return renderToString(
    <SiegeView siege={siege} level={1} fragments={fragments} onClose={noop} />,
  ).replace(/<!-- -->/g, '');
}

const baseSiege: SiegeState = {
  weekStart: '2026-08-10',
  name: 'MOURNGRAVE',
  maxHp: 9100,
  hp: 8875,
  generation: 0,
  carryover: 0,
  overkill: 0,
  log: [
    { at: '2026-08-10T08:00:00.000Z', label: 'MEAL PLAN', amount: 40, crit: false },
    { at: '2026-08-10T18:00:00.000Z', label: 'GYM', amount: 112, crit: true },
  ],
  killed: false,
  fragmentsAwarded: false,
};

describe('SiegeScreen', () => {
  it('renders a safe empty state when no siege exists (store-wired default export)', () => {
    const html = renderToString(<SiegeScreen onClose={noop} />).replace(/<!-- -->/g, '');
    expect(html).toContain('THE SIEGE');
    expect(html).toContain('NO BOSS STIRS THIS WEEK.');
    expect(html).toContain('CLOSE');
  });

  it('renders boss name, hp bar, and the attack log', () => {
    const html = render(baseSiege);
    expect(html).toContain('MOURNGRAVE');
    expect(html).toContain('8,875 / 9,100 HP');
    expect(html).toContain('MEAL PLAN STRUCK −40 HP');
    expect(html).toContain('GYM READY — CRIT ×1.5 −112');
    expect(html).toContain('A PERFECT WEEK FELLS IT WITH ~8% TO SPARE');
    expect(html).not.toContain('IT REMEMBERS.');
    expect(html).not.toContain('CREST FRAGMENT');
  });

  it('shows the risen note for a returning boss', () => {
    const html = render({ ...baseSiege, name: 'MOURNGRAVE RISEN', generation: 1 });
    expect(html).toContain('MOURNGRAVE RISEN');
    expect(html).toContain('IT REMEMBERS.');
    // Engine-renamed boss must not get a duplicate RISEN prefix.
    expect(html).not.toContain('RISEN · MOURNGRAVE RISEN');
  });

  it('shows the kill reward band with dimmed boss when killed', () => {
    const html = render({ ...baseSiege, hp: 0, killed: true, overkill: 350 }, 1);
    expect(html).toContain('CREST FRAGMENT 1/3 · +150 XP');
    expect(html).toContain('opacity:0.35');
  });

  it('shows the forged triad when the 3rd fragment wrapped the counter to 0', () => {
    const html = render({ ...baseSiege, hp: 0, killed: true, overkill: 350 }, 0);
    expect(html).toContain('CREST FRAGMENT 3/3 · +150 XP');
  });
});
