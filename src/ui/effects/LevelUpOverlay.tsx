// LevelUpOverlay — full-screen `LEVEL UP {from} → {to}` with the knight at the
// new level; when `ageReveal` is set the new armor age name is revealed.
// Tap anywhere to dismiss. Amber is reserved (palette rule) — neon throughout.
import Knight from '../knight/Knight';

export default function LevelUpOverlay({
  from,
  to,
  ageReveal,
  onDismiss,
}: {
  from: number;
  to: number;
  ageReveal?: string;
  onDismiss: () => void;
}) {
  return (
    <div
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        background: 'rgba(5,7,5,.94)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        cursor: 'pointer',
        animation: 'oath-fx-in 220ms ease-out',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-title)',
          fontSize: 44,
          color: 'var(--neon)',
          textShadow: '0 0 12px rgba(70,255,125,.5)',
        }}
      >
        LEVEL UP {from} → {to}
      </div>
      <Knight level={to} size={ageReveal !== undefined ? 176 : 144} />
      {ageReveal !== undefined && (
        <>
          <div
            style={{
              fontFamily: 'var(--font-label)',
              fontSize: 7,
              letterSpacing: '0.25em',
              color: 'var(--text-faint)',
            }}
          >
            A NEW AGE OF ARMOR
          </div>
          <div
            style={{
              fontFamily: 'var(--font-title)',
              fontSize: 34,
              color: 'var(--text-hi)',
              textShadow: '0 0 10px rgba(70,255,125,.4)',
            }}
          >
            {ageReveal.toUpperCase()}
          </div>
        </>
      )}
      <div
        style={{
          marginTop: 10,
          fontFamily: 'var(--font-label)',
          fontSize: 6,
          letterSpacing: '0.3em',
          color: 'var(--text-low)',
        }}
      >
        TAP TO CONTINUE
      </div>
      <style>{`@keyframes oath-fx-in{from{opacity:0}to{opacity:1}}`}</style>
    </div>
  );
}
