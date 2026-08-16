import { useEffect, useState } from 'react';
import { TABS, type Tab, type IconName } from './tabs';
import { useOath } from './store';
import TodayScreen from '../ui/today/TodayScreen';
import QuestsScreen from '../ui/quests/QuestsScreen';
import TrainScreen from '../ui/train/TrainScreen';
import FuelScreen from '../ui/fuel/FuelScreen';
import HeroScreen from '../ui/hero/HeroScreen';
import {
  PageFrame,
  Panel,
  DiamondCheckbox,
  SegmentedBar,
  QuantityBar,
  RankDiamond,
  DifficultyPips,
  SectionLabel,
  Icon,
  CrtOverlay,
  WeekStrip,
  RetroChart,
  type DiamondState,
} from '../ui/atoms';
import type { Difficulty, Rank } from '../core/types';
import { addDays, dayKey } from '../core/dates';

const SCREENS: Record<Tab, () => JSX.Element> = {
  today: TodayScreen,
  quests: QuestsScreen,
  train: TrainScreen,
  fuel: FuelScreen,
  hero: HeroScreen,
};

/** Visual-QA gallery of every atom in every state. Kept as a permanent `?gallery` route. */
function GalleryScreen() {
  const [toggled, setToggled] = useState(false);
  const today = dayKey(new Date());
  const ranks: Rank[] = ['F', 'D', 'C', 'B', 'A', 'S', 'S+'];
  const difficulties: Difficulty[] = ['trivial', 'easy', 'medium', 'hard', 'elite'];
  const diamondStates: DiamondState[] = ['todo', 'done', 'optional', 'main', 'failed'];
  const iconNames: IconName[] = [
    'diamond', 'list', 'dumbbell', 'flask', 'helm', 'plus', 'gear', 'flame', 'skull', 'drop', 'check',
  ];
  const weekRanks: (Rank | null)[] = ['A', 'S', 'C', null, null, null, null];
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i - 3);
    return { date, rank: weekRanks[i] ?? null, isToday: date === today };
  });
  const chartPoints = Array.from({ length: 12 }, (_, i) => ({
    x: `2026-0${(i % 9) + 1}-01`,
    y: 200 + i * 5 + (i % 3) * 8,
    pr: i === 7,
  }));
  const longChartPoints = Array.from({ length: 30 }, (_, i) => ({
    x: `pt${i}`,
    y: 100 + Math.round(30 * Math.sin(i / 3)) + i,
    pr: i === 22,
  }));

  return (
    <div className="app-shell">
      <PageFrame title="Gallery" day="XLII">
        <SectionLabel>Panel / Panel amber</SectionLabel>
        <Panel>Standard ledger panel with neon corner ticks.</Panel>
        <div style={{ height: 8 }} />
        <Panel amber>Main-quest panel with amber corner ticks.</Panel>

        <SectionLabel>DiamondCheckbox — all states</SectionLabel>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {diamondStates.map((s) => (
            <div key={s} style={{ textAlign: 'center' }}>
              <DiamondCheckbox state={s} />
              <div style={{ fontSize: 14, color: 'var(--text-faint)' }}>{s}</div>
            </div>
          ))}
          <div style={{ textAlign: 'center' }}>
            <DiamondCheckbox state={toggled ? 'done' : 'todo'} onToggle={() => setToggled((v) => !v)} />
            <div style={{ fontSize: 14, color: 'var(--text-faint)' }}>tap me</div>
          </div>
        </div>

        <SectionLabel>SegmentedBar</SectionLabel>
        <SegmentedBar value={7} max={10} />
        <div style={{ height: 8 }} />
        <SegmentedBar value={13} max={20} segments={20} color="var(--amber)" />

        <SectionLabel>QuantityBar</SectionLabel>
        <QuantityBar value={92} max={128} label="oz" />

        <SectionLabel>RankDiamond</SectionLabel>
        <div style={{ display: 'flex', gap: 6 }}>
          {ranks.map((r) => (
            <RankDiamond key={r} rank={r} />
          ))}
        </div>

        <SectionLabel>DifficultyPips</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {difficulties.map((d) => (
            <div key={d} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <DifficultyPips difficulty={d} />
              <span style={{ fontSize: 16, color: 'var(--text-low)' }}>{d.toUpperCase()}</span>
            </div>
          ))}
        </div>

        <SectionLabel>Icons</SectionLabel>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', color: 'var(--text-mid)' }}>
          {iconNames.map((n) => (
            <div key={n} style={{ textAlign: 'center' }}>
              <Icon name={n} />
              <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>{n}</div>
            </div>
          ))}
        </div>

        <SectionLabel>WeekStrip</SectionLabel>
        <WeekStrip days={week} />

        <SectionLabel>RetroChart (12 pts, 1 PR)</SectionLabel>
        <RetroChart points={chartPoints} yLabel="E1RM" />

        <SectionLabel>RetroChart (30 pts, scrolls)</SectionLabel>
        <RetroChart points={longChartPoints} marks={[{ y: 120, label: 'GOAL' }]} />

        <SectionLabel>RetroChart (empty)</SectionLabel>
        <RetroChart points={[]} />
      </PageFrame>
      <CrtOverlay />
    </div>
  );
}

export default function App() {
  const ready = useOath((s) => s.ready);
  const tab = useOath((s) => s.tab);
  const setTab = useOath((s) => s.setTab);
  const crt = useOath((s) => s.settings.crt);
  const isGallery =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('gallery');

  useEffect(() => {
    if (!isGallery) void useOath.getState().init();
  }, [isGallery]);

  if (isGallery) return <GalleryScreen />;

  if (!ready) {
    return (
      <div
        className="app-shell"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-label)',
          fontSize: 8,
          letterSpacing: '0.3em',
          color: 'var(--text-low)',
        }}
      >
        LOADING
      </div>
    );
  }

  const Screen = SCREENS[tab];

  return (
    <div className="app-shell">
      <div style={{ paddingBottom: 56 }}>
        <Screen />
      </div>
      {crt && <CrtOverlay />}
      <nav
        className="tab-bar"
        style={{
          position: 'fixed',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: 430,
          height: 56,
          background: 'var(--panel)',
          borderTop: '1px solid var(--hairline)',
          display: 'flex',
          alignItems: 'stretch',
          zIndex: 100,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-label)',
              fontSize: 7,
              letterSpacing: '0.15em',
              color: tab === t.id ? 'var(--neon)' : 'var(--text-low)',
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
