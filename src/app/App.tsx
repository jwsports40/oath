import { useState } from 'react';
import { TABS, type Tab } from './tabs';
import TodayScreen from '../ui/today/TodayScreen';
import QuestsScreen from '../ui/quests/QuestsScreen';
import TrainScreen from '../ui/train/TrainScreen';
import FuelScreen from '../ui/fuel/FuelScreen';
import HeroScreen from '../ui/hero/HeroScreen';

const SCREENS: Record<Tab, () => JSX.Element> = {
  today: TodayScreen,
  quests: QuestsScreen,
  train: TrainScreen,
  fuel: FuelScreen,
  hero: HeroScreen,
};

export default function App() {
  // Tab state moves into the zustand store in Task 10; local for now.
  const [tab, setTab] = useState<Tab>('today');
  const Screen = SCREENS[tab];

  return (
    <div className="app-shell">
      <div style={{ paddingBottom: 56 }}>
        <Screen />
      </div>
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
