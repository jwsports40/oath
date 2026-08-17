// Smoke test: TodayScreen renders against the store's initial (empty) state.
// fake-indexeddb backs the Dexie import chain; no store init is performed —
// the screen must render safely from defaults.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import TodayScreen from '../TodayScreen';

describe('TodayScreen', () => {
  it('renders the quest log page from the initial store state', () => {
    // renderToString inserts <!-- --> markers between adjacent text nodes.
    const html = renderToString(<TodayScreen />).replace(/<!-- -->/g, '');
    expect(html).toContain('Quest Log');
    expect(html).toContain('OATH');
    expect(html).toContain('DAY I');            // no sealed days yet → DAY I
    expect(html).toContain('DAILY QUESTS 0/0');
    expect(html).toContain('THE LEDGER IS EMPTY.');
    expect(html).toContain('RANK ');            // footer band
    expect(html).toContain('LV 1 ROOKIE KNIGHT');    // knight bust panel
    expect(html).not.toContain('MAIN QUEST');   // no main instance in empty state
    expect(html).not.toContain('SIEGE —');      // no siege in empty state
  });
});
