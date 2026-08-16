import { ARMOR_AGES } from '../../core/types';

/** One chunky pixel-art rect on the 24×32 logical grid: [x, y, w, h, color]. */
export type Px = [number, number, number, number, string];

export const GRID_W = 24;
export const GRID_H = 32;

export const NEON = 'var(--neon)';
export const EMBER = '#E25B4A';

const BODY = '#0d130e';
const GOLD = '#c9a23c';
const RED_CROSS = '#8f2f24';

/** Dark base knight silhouette shared by every age (big rectangles, no curves). */
export const BASE: Px[] = [
  // helm / head
  [8, 2, 8, 7, BODY],
  // neck
  [10, 9, 4, 1, BODY],
  // torso
  [7, 10, 10, 8, BODY],
  // arms
  [5, 10, 2, 7, BODY],
  [17, 10, 2, 7, BODY],
  // hands
  [5, 17, 2, 2, BODY],
  [17, 17, 2, 2, BODY],
  // legs
  [8, 18, 3, 10, BODY],
  [13, 18, 3, 10, BODY],
  // feet
  [7, 28, 4, 1, BODY],
  [13, 28, 4, 1, BODY],
];

/** Visor slit rect [x, y, w, h] (constant across ages; ember for SENTINEL/PALADIN). */
export const VISOR: [number, number, number, number] = [9, 5, 6, 1];
/** Neon chest sigil diamond (constant across all ages). */
export const SIGIL: Px[] = [
  [11, 12, 2, 1, NEON],
  [10, 13, 4, 1, NEON],
  [11, 14, 2, 1, NEON],
];

/** Per-age gear layers, keyed by armor-age level band. */
const GEAR: Record<number, Px[]> = {
  // WANDERER — roughspun cloak, walking staff
  1: [
    [6, 9, 12, 2, '#241f18'],
    [6, 11, 2, 7, '#241f18'],
    [16, 11, 2, 7, '#241f18'],
    [21, 6, 1, 22, '#5a4630'],
    [20, 5, 2, 1, '#5a4630'],
  ],
  // SWORN — gambeson, iron cap, buckler
  10: [
    [8, 2, 8, 2, '#5c6164'],
    [7, 10, 10, 8, '#332e24'],
    [7, 12, 10, 1, '#241f18'],
    [7, 15, 10, 1, '#241f18'],
    [3, 12, 3, 3, '#4a4f52'],
    [4, 13, 1, 1, '#6b7074'],
  ],
  // CRUSADER — mail + surcoat, red cross, kite shield
  20: [
    [8, 7, 8, 2, '#565b5e'],
    [7, 10, 10, 8, '#b3aa97'],
    [11, 10, 2, 2, RED_CROSS],
    [9, 15, 6, 1, RED_CROSS],
    [11, 15, 2, 3, RED_CROSS],
    [2, 11, 4, 5, '#b3aa97'],
    [3, 16, 2, 2, '#b3aa97'],
    [3, 12, 2, 3, RED_CROSS],
  ],
  // SERGEANT — riveted plate, heater shield
  30: [
    [7, 10, 10, 8, '#5d6266'],
    [5, 9, 3, 2, '#6d7276'],
    [16, 9, 3, 2, '#6d7276'],
    [8, 11, 1, 1, '#8b9094'],
    [15, 11, 1, 1, '#8b9094'],
    [8, 16, 1, 1, '#8b9094'],
    [15, 16, 1, 1, '#8b9094'],
    [2, 11, 4, 5, '#5d6266'],
    [3, 16, 2, 1, '#5d6266'],
  ],
  // VETERAN — battle-notched plate, greatsword
  40: [
    [7, 10, 10, 8, '#565b60'],
    [5, 9, 3, 2, '#565b60'],
    [16, 9, 3, 2, '#565b60'],
    [9, 11, 1, 1, BODY],
    [14, 14, 1, 1, BODY],
    [11, 16, 1, 1, BODY],
    [20, 4, 1, 16, '#9aa0a4'],
    [19, 20, 3, 1, '#6b7074'],
    [20, 21, 1, 3, '#3a2f22'],
  ],
  // WARDEN — cape, gold trim, gold sigil
  50: [
    [4, 9, 3, 12, '#26343a'],
    [17, 9, 3, 12, '#26343a'],
    [7, 10, 10, 8, '#4c5156'],
    [7, 10, 10, 1, GOLD],
    [7, 17, 10, 1, GOLD],
    [5, 9, 3, 1, GOLD],
    [16, 9, 3, 1, GOLD],
  ],
  // CHAMPION — gilt greaves, halo sigil
  60: [
    [7, 10, 10, 8, '#666b70'],
    [8, 22, 3, 6, GOLD],
    [13, 22, 3, 6, GOLD],
    [9, 0, 6, 1, GOLD],
    [8, 1, 1, 1, GOLD],
    [15, 1, 1, 1, GOLD],
  ],
  // BANNERET — war banner, gold cross
  70: [
    [7, 10, 10, 8, '#5d6266'],
    [2, 2, 1, 26, '#4a3b28'],
    [3, 3, 6, 5, '#26343a'],
    [5, 4, 1, 3, GOLD],
    [4, 5, 3, 1, GOLD],
    [11, 10, 2, 2, GOLD],
    [9, 15, 6, 1, GOLD],
    [11, 15, 2, 2, GOLD],
  ],
  // SENTINEL — blackened plate, ember visor, dark mantle
  80: [
    [8, 2, 8, 7, '#14181a'],
    [7, 10, 10, 8, '#14181a'],
    [5, 9, 14, 2, '#0e1113'],
    [5, 11, 2, 8, '#0e1113'],
    [17, 11, 2, 8, '#0e1113'],
  ],
  // PALADIN — rune-etched plate, ember cross
  90: [
    [8, 2, 8, 7, '#1a2024'],
    [7, 10, 10, 8, '#1a2024'],
    [8, 11, 1, 1, '#3d6b4f'],
    [15, 13, 1, 1, '#3d6b4f'],
    [9, 16, 1, 1, '#3d6b4f'],
    [11, 10, 2, 2, EMBER],
    [9, 15, 6, 1, EMBER],
    [11, 15, 2, 2, EMBER],
  ],
  // LEGEND — hooded black requiem plate
  100: [
    [7, 1, 10, 3, '#0b0e10'],
    [7, 4, 2, 5, '#0b0e10'],
    [15, 4, 2, 5, '#0b0e10'],
    [7, 10, 10, 8, '#0b0e10'],
    [5, 10, 2, 7, '#0b0e10'],
    [17, 10, 2, 7, '#0b0e10'],
    [8, 18, 3, 10, '#0b0e10'],
    [13, 18, 3, 10, '#0b0e10'],
  ],
};

/** SENTINEL and PALADIN carry an ember visor per spec §3; all other ages neon. */
const EMBER_VISOR_LEVELS = new Set([80, 90]);

export interface AgeLayers {
  level: number;
  name: string;
  gear: string;
  visorColor: string;
  layers: Px[];
}

/** Highest armor-age band ≤ level, resolved to its pixel layer config. */
export function ageLayersForLevel(level: number): AgeLayers {
  let best = ARMOR_AGES[0];
  for (const age of ARMOR_AGES) {
    if (age[0] <= level) best = age;
  }
  const [band, name, gear] = best;
  return {
    level: band,
    name,
    gear,
    visorColor: EMBER_VISOR_LEVELS.has(band) ? EMBER : NEON,
    layers: GEAR[band] ?? [],
  };
}

/** Simple world backdrop pixels behind the full pose, keyed by vigor band. */
export function backdropForBand(band: string | undefined): Px[] {
  switch (band) {
    case 'RUINS':
      return [
        [0, 0, GRID_W, GRID_H, '#0a0806'],
        // rain streak lines
        [3, 2, 1, 3, '#1c2622'],
        [19, 5, 1, 3, '#1c2622'],
        [14, 3, 1, 3, '#1c2622'],
        [1, 12, 1, 3, '#1c2622'],
        [22, 10, 1, 3, '#1c2622'],
        [11, 0, 1, 2, '#1c2622'],
      ];
    case 'EMBER CAMP':
      return [
        [0, 0, GRID_W, GRID_H, '#0a0908'],
        [2, 27, 2, 1, '#8A4A2E'],
        [3, 26, 1, 1, '#5C2E22'],
      ];
    case 'CAMP':
      return [
        [0, 0, GRID_W, GRID_H, 'var(--panel)'],
        [2, 26, 1, 2, '#8A4A2E'],
        [21, 27, 1, 1, '#5C2E22'],
      ];
    case 'STRONGHOLD':
      return [
        [0, 0, GRID_W, GRID_H, 'var(--panel)'],
        // subtle banner shapes
        [1, 2, 2, 8, '#1C2E22'],
        [21, 2, 2, 8, '#1C2E22'],
        [1, 10, 2, 1, '#14211A'],
        [21, 10, 2, 1, '#14211A'],
      ];
    case 'BEACON':
      return [
        [0, 0, GRID_W, GRID_H, 'var(--panel)'],
        [1, 2, 2, 8, '#1C2E22'],
        [21, 2, 2, 8, '#1C2E22'],
        // neon beacon fire pixels
        [2, 24, 1, 4, '#2E7A47'],
        [3, 23, 1, 5, '#46FF7D'],
        [4, 25, 1, 3, '#2E7A47'],
        [20, 25, 1, 3, '#2E7A47'],
      ];
    default:
      return [];
  }
}
