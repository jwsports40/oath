export interface RetroChartPoint {
  x: string;
  y: number;
  pr?: boolean;
}

/**
 * Stepped retro SVG line chart: neon step-after line, square 4px marks
 * (pr points amber 6px), hairline gridlines, min/max y labels.
 * Scrolls horizontally when there are >20 points.
 */
export default function RetroChart({
  points,
  height = 120,
  yLabel,
  marks,
}: {
  points: RetroChartPoint[];
  height?: number;
  yLabel?: string;
  marks?: { y: number; label?: string }[];
}) {
  const PAD_L = 34;
  const PAD_R = 8;
  const PAD_T = 10;
  const PAD_B = 10;
  const STEP = 24;

  if (points.length === 0) {
    return (
      <div
        style={{
          height,
          border: '1px solid var(--hairline)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-body)',
          fontSize: 18,
          color: 'var(--text-faint)',
        }}
      >
        NO DATA
      </div>
    );
  }

  const ys = points.map((p) => p.y).concat((marks ?? []).map((m) => m.y));
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  if (min === max) {
    min -= 1;
    max += 1;
  }

  const plotW = Math.max(1, (points.length - 1) * STEP);
  const width = PAD_L + plotW + PAD_R;
  const plotH = height - PAD_T - PAD_B;
  const px = (i: number) => PAD_L + (points.length === 1 ? plotW / 2 : i * STEP);
  const py = (y: number) => PAD_T + (1 - (y - min) / (max - min)) * plotH;

  // step-after path: horizontal to next x, then vertical to next y
  let d = `M ${px(0)} ${py(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` H ${px(i)} V ${py(points[i].y)}`;
  }

  const gridYs = [0.25, 0.5, 0.75].map((f) => PAD_T + f * plotH);

  return (
    <div style={{ overflowX: points.length > 20 ? 'auto' : 'hidden' }}>
      {yLabel && (
        <div
          style={{
            fontFamily: 'var(--font-label)',
            fontSize: 6,
            letterSpacing: '0.2em',
            color: 'var(--text-faint)',
            marginBottom: 4,
          }}
        >
          {yLabel}
        </div>
      )}
      <svg width={width} height={height} style={{ display: 'block' }} shapeRendering="crispEdges">
        {gridYs.map((gy, i) => (
          <line key={i} x1={PAD_L} y1={gy} x2={width - PAD_R} y2={gy} stroke="var(--hairline)" strokeWidth={1} />
        ))}
        {(marks ?? []).map((m, i) => (
          <g key={`m${i}`}>
            <line
              x1={PAD_L}
              y1={py(m.y)}
              x2={width - PAD_R}
              y2={py(m.y)}
              stroke="var(--text-faint)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {m.label && (
              <text
                x={width - PAD_R}
                y={py(m.y) - 3}
                textAnchor="end"
                fontFamily="var(--font-body)"
                fontSize={14}
                fill="var(--text-faint)"
              >
                {m.label}
              </text>
            )}
          </g>
        ))}
        <text x={2} y={py(max) + 5} fontFamily="var(--font-body)" fontSize={14} fill="var(--text-low)">
          {Math.round(max)}
        </text>
        <text x={2} y={py(min) + 5} fontFamily="var(--font-body)" fontSize={14} fill="var(--text-low)">
          {Math.round(min)}
        </text>
        <path d={d} fill="none" stroke="var(--neon)" strokeWidth={1.5} />
        {points.map((p, i) => {
          const s = p.pr ? 6 : 4;
          return (
            <rect
              key={p.x + i}
              x={px(i) - s / 2}
              y={py(p.y) - s / 2}
              width={s}
              height={s}
              fill={p.pr ? 'var(--amber)' : 'var(--neon)'}
            />
          );
        })}
      </svg>
    </div>
  );
}
