import type { ReactNode } from 'react';

/** Tiny wide-tracked section label. */
export default function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-label)',
        fontSize: 7,
        color: 'var(--text-faint)',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        margin: '14px 0 8px',
      }}
    >
      {children}
    </div>
  );
}
