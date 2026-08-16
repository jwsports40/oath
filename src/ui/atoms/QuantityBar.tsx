/** Thin 6px quantity bar with `value / max UNIT` text (water etc.). */
export default function QuantityBar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  const frac = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div>
      <div
        style={{
          height: 6,
          background: 'var(--panel)',
          border: '1px solid var(--hairline)',
          position: 'relative',
        }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemax={max}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${frac * 100}%`,
            background: 'var(--neon)',
            boxShadow: '0 0 6px var(--neon)',
          }}
        />
      </div>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 18,
          color: 'var(--text-mid)',
          marginTop: 2,
        }}
      >
        {value} / {max} {label.toUpperCase()}
      </div>
    </div>
  );
}
