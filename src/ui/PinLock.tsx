// ui/PinLock.tsx — full-screen 4-digit PIN gate shown at launch when a login
// PIN exists. Unlock lasts for the browser session.
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { hashPin } from '../core/pin';

const keyStyle: CSSProperties = {
  fontFamily: 'var(--font-body)', fontSize: 26, color: 'var(--text-hi)',
  background: 'var(--panel)', border: '1px solid var(--border)',
  width: 72, height: 56, cursor: 'pointer',
};

export default function PinLock({ pinHash, onUnlock }: {
  pinHash: string;
  onUnlock: () => void;
}) {
  const [entry, setEntry] = useState('');
  const [error, setError] = useState(false);

  const press = (d: string): void => {
    if (entry.length >= 4) return;
    const next = entry + d;
    setEntry(next);
    setError(false);
    if (next.length === 4) {
      if (hashPin(next) === pinHash) {
        onUnlock();
      } else {
        setError(true);
        setTimeout(() => setEntry(''), 350);
      }
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 500, background: '#000',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 18,
      }}
    >
      <div style={{ fontFamily: 'var(--font-title)', fontSize: 42, color: 'var(--gild-bright)' }}>
        Oath
      </div>
      <div style={{ fontFamily: 'var(--font-label)', fontSize: 7, letterSpacing: '0.25em', color: error ? 'var(--ember)' : 'var(--text-mid)' }}>
        {error ? 'WRONG PIN' : 'ENTER YOUR PIN'}
      </div>
      <div style={{ display: 'flex', gap: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            style={{
              width: 12, height: 12, transform: 'rotate(45deg)',
              border: `1px solid ${error ? 'var(--ember)' : 'var(--gild)'}`,
              background: i < entry.length ? (error ? 'var(--ember)' : 'var(--gild)') : 'transparent',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: 8, marginTop: 8 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} style={keyStyle} onClick={() => press(d)}>{d}</button>
        ))}
        <span />
        <button style={keyStyle} onClick={() => press('0')}>0</button>
        <button
          style={{ ...keyStyle, fontSize: 16, color: 'var(--text-mid)' }}
          onClick={() => { setEntry(''); setError(false); }}
        >
          CLR
        </button>
      </div>
    </div>
  );
}
