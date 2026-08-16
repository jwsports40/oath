import type { ReactNode } from 'react';
import { CornerTicks } from './PageFrame';

/** Ledger panel: 1px --border on --panel bg, 2px corner ticks (neon; amber for main quest). */
export default function Panel({
  children,
  amber = false,
  className,
}: {
  children: ReactNode;
  amber?: boolean;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        border: '1px solid var(--border)',
        background: 'var(--panel)',
        padding: 12,
      }}
    >
      <CornerTicks color={amber ? 'var(--amber)' : 'var(--neon)'} />
      {children}
    </div>
  );
}
