import { useRef } from 'react';
import type { CSSProperties } from 'react';

export type DiamondState = 'todo' | 'done' | 'optional' | 'main' | 'failed';

/**
 * Rotated-square quest checkbox.
 * hollow --text-low = todo · filled neon+glow = done · dashed = optional ·
 * amber outline = main (todo) · ember ✕ = failed.
 * onToggle fires on pointerdown held >=150ms OR on click (whichever first).
 */
export default function DiamondCheckbox({
  state,
  onToggle,
  size = 22,
}: {
  state: DiamondState;
  onToggle?: () => void;
  size?: number;
}) {
  const holdTimer = useRef<number | null>(null);
  const firedByHold = useRef(false);

  const fire = () => {
    if (onToggle) onToggle();
  };

  const clearHold = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const inner = size * 0.66;
  const border =
    state === 'done'
      ? '1.5px solid var(--neon)'
      : state === 'optional'
        ? '1.5px dashed var(--text-low)'
        : state === 'main'
          ? '1.5px solid var(--amber)'
          : '1.5px solid var(--text-low)';

  const diamond: CSSProperties = {
    width: inner,
    height: inner,
    transform: 'rotate(45deg)',
    border,
    background: state === 'done' ? 'var(--neon)' : 'transparent',
    boxShadow: state === 'done' ? '0 0 8px var(--neon)' : 'none',
    transition: 'background-color 220ms ease, box-shadow 220ms ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <button
      type="button"
      aria-label={`quest ${state}`}
      onPointerDown={() => {
        firedByHold.current = false;
        clearHold();
        holdTimer.current = window.setTimeout(() => {
          holdTimer.current = null;
          firedByHold.current = true;
          fire();
        }, 150);
      }}
      onPointerUp={clearHold}
      onPointerLeave={clearHold}
      onPointerCancel={clearHold}
      onClick={() => {
        if (firedByHold.current) {
          firedByHold.current = false;
          return;
        }
        fire();
      }}
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'manipulation',
      }}
    >
      <span aria-hidden style={diamond}>
        {state === 'failed' && (
          <span
            style={{
              transform: 'rotate(-45deg)',
              color: 'var(--ember)',
              fontFamily: 'var(--font-body)',
              fontSize: inner * 0.9,
              lineHeight: 1,
            }}
          >
            ✕
          </span>
        )}
      </span>
    </button>
  );
}
