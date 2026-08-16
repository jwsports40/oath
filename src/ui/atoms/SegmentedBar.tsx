/** Segmented XP bar — filled segments glow. */
export default function SegmentedBar({
  value,
  max,
  segments = 10,
  color = 'var(--neon)',
}: {
  value: number;
  max: number;
  segments?: number;
  color?: string;
}) {
  const frac = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const filled = Math.round(frac * segments);
  return (
    <div style={{ display: 'flex', gap: 3 }} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          style={{
            flex: 1,
            height: 10,
            background: i < filled ? color : 'var(--panel)',
            border: `1px solid ${i < filled ? color : 'var(--hairline)'}`,
            boxShadow: i < filled ? `0 0 6px ${color}` : 'none',
          }}
        />
      ))}
    </div>
  );
}
