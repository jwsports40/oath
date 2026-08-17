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

// Hand-made card art (scripts/slice-knights.mjs) — one framed dungeon card per
// armor age. When a card exists it replaces the procedural SVG sprite.
const CARD_URLS = import.meta.glob('./cards/*.png', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;

const AGE_BANDS = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 1];

function cardFor(level: number): string | undefined {
  const band = AGE_BANDS.find((b) => level >= b) ?? 1;
  return CARD_URLS[`./cards/age-${band}.png`];
}

/** World vigor dims/brightens the card's torchlight. */
function vigorFilter(band?: string): string | undefined {
  switch (band) {
    case 'RUINS': return 'grayscale(0.45) brightness(0.62)';
    case 'EMBER CAMP': return 'brightness(0.82)';
    case 'STRONGHOLD': return 'brightness(1.06)';
    case 'BEACON': return 'brightness(1.14) saturate(1.15)';
    default: return undefined;
  }
}

function CardKnight({ src, level, full, vigorBand, size }: {
  src: string; level: number; full: boolean; vigorBand?: string; size: number;
}) {
  const filter = vigorFilter(vigorBand);
  const label = `knight card, level ${level}`;
  if (full) {
    return (
      <img
        src={src}
        alt={label}
        style={{ width: size, height: 'auto', display: 'block', imageRendering: 'pixelated', filter }}
      />
    );
  }
  // Bust: window onto the card's head + torso (knight is centered, head ~30-40%).
  const imgW = size * 2.1;
  const imgH = imgW * 1.85; // approximate card aspect
  return (
    <div
      role="img"
      aria-label={label}
      style={{ width: size, height: Math.round(size * 0.82), overflow: 'hidden', position: 'relative' }}
    >
      <img
        src={src}
        alt=""
        style={{
          position: 'absolute', width: imgW, height: 'auto',
          left: -(imgW - size) / 2, top: -imgH * 0.27,
          imageRendering: 'pixelated', filter,
        }}
      />
    </div>
  );
}

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

  const card = cardFor(level);
  if (card !== undefined) {
    return <CardKnight src={card} level={level} full={full} vigorBand={vigorBand} size={size} />;
  }

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
