import {
  ageLayersForLevel,
  backdropForBand,
  BASE,
  GRID_H,
  GRID_W,
  SIGIL,
  VISOR,
  type Px,
} from './ages';

/** Bust crops to head + torso (grid rows 0..BUST_ROWS). */
const BUST_ROWS = 19;

function rects(pixels: Px[], keyPrefix: string) {
  return pixels.map(([x, y, w, h, color], i) => (
    <rect key={`${keyPrefix}-${i}`} x={x} y={y} width={w} height={h} fill={color} />
  ));
}

/**
 * Layered SVG pixel-art knight on a 24×32 logical grid, scaled up with crisp edges.
 * Armor age derives from level (ages.ts); visor slit + chest sigil stay neon across
 * ages except SENTINEL/PALADIN where the visor burns ember, per spec §3.
 */
export default function Knight({
  level,
  pose = 'bust',
  vigorBand,
  size = 160,
}: {
  level: number;
  pose?: 'bust' | 'full';
  vigorBand?: string;
  size?: number;
}) {
  const age = ageLayersForLevel(level);
  const full = pose === 'full';
  const viewH = full ? GRID_H : BUST_ROWS;
  const [vx, vy, vw, vh] = VISOR;

  return (
    <svg
      viewBox={`0 0 ${GRID_W} ${viewH}`}
      width={size}
      height={Math.round((size * viewH) / GRID_W)}
      style={{ shapeRendering: 'crispEdges', display: 'block' }}
      role="img"
      aria-label={`${age.name} knight, level ${level}`}
    >
      {full && rects(backdropForBand(vigorBand), 'bg')}
      {full && <rect x={0} y={29} width={GRID_W} height={1} fill="var(--hairline)" />}
      {rects(BASE, 'base')}
      {rects(age.layers, 'gear')}
      <rect x={vx} y={vy} width={vw} height={vh} fill={age.visorColor} />
      {rects(SIGIL, 'sigil')}
    </svg>
  );
}
