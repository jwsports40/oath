import { useEffect } from 'react';
import { TABS, type Tab } from './tabs';
import { useOath } from './store';
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
  const ready = useOath((s) => s.ready);
  const tab = useOath((s) => s.tab);
  const setTab = useOath((s) => s.setTab);
  const crt = useOath((s) => s.settings.crt);

  useEffect(() => {
    void useOath.getState().init();
  }, []);

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
      {crt && (
        // Placeholder until Task 11's CrtOverlay atom.
        <div
          aria-hidden
          style={{
            position: 'fixed',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 200,
            background: 'repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 1px, transparent 1px 2px)',
          }}
        />
      )}
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
