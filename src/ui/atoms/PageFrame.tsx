import type { CSSProperties, ReactNode } from 'react';

/** Card-frame corner diamond: small rotated square, like the knight cards. */
export function CornerDiamonds({ color = 'var(--gild)' }: { color?: string }) {
  const base: CSSProperties = {
    position: 'absolute',
    width: 7,
    height: 7,
    border: `1px solid ${color}`,
    background: 'var(--bg0)',
    transform: 'rotate(45deg)',
    pointerEvents: 'none',
  };
  return (
    <>
      <span aria-hidden style={{ ...base, top: -4, left: -4 }} />
      <span aria-hidden style={{ ...base, top: -4, right: -4 }} />
      <span aria-hidden style={{ ...base, bottom: -4, left: -4 }} />
      <span aria-hidden style={{ ...base, bottom: -4, right: -4 }} />
    </>
  );
}

/** 2px corner tick, absolutely positioned inside a bordered box. */
export function CornerTicks({ color = 'var(--gild)' }: { color?: string }) {
  const base: CSSProperties = {
    position: 'absolute',
    width: 7,
    height: 7,
    pointerEvents: 'none',
  };
  return (
    <>
      <span aria-hidden style={{ ...base, top: -1, left: -1, borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <span aria-hidden style={{ ...base, top: -1, right: -1, borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
      <span aria-hidden style={{ ...base, bottom: -1, left: -1, borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <span aria-hidden style={{ ...base, bottom: -1, right: -1, borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
    </>
  );
}

/**
 * Page frame: inset 1px border + 4 corner ticks, OATH wordmark top-left,
 * Jacquard 12 page title, roman-numeral day counter right.
 */
export default function PageFrame({
  title,
  day,
  children,
}: {
  title: string;
  day?: string;
  children: ReactNode;
}) {
  return (
    <div className="page" style={{ position: 'relative' }}>
      <CornerDiamonds />
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-label)',
            fontSize: 8,
            letterSpacing: '0.35em',
            color: 'var(--gild)',
          }}
        >
          OATH
        </span>
        {day && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 18, color: 'var(--text-mid)' }}>
            DAY {day}
          </span>
        )}
      </header>
      <h1
        style={{
          fontFamily: 'var(--font-title)',
          fontWeight: 400,
          fontSize: 34,
          margin: '2px 0 12px',
          color: 'var(--gild-bright)',
        }}
      >
        {title}
      </h1>
      {children}
    </div>
  );
}
