// game/vigor.ts — World Vigor (cosmetic, spec §5):
// V(t) = round(0.25·S(t) + 0.75·V(t−1)), clamped 0..100. Bands from VIGOR_BANDS.
import { VIGOR_BANDS } from '../core/types';

export const INITIAL_VIGOR = 50;

/** Next vigor value: round half-up of 0.25·score + 0.75·prev, clamped 0..100. */
export function nextVigor(prev: number, score: number): number {
  const v = Math.floor(0.25 * score + 0.75 * prev + 0.5);
  return Math.min(100, Math.max(0, v));
}

/** Band name for a vigor value (BEACON / STRONGHOLD / CAMP / EMBER CAMP / RUINS). */
export function vigorBand(v: number): string {
  for (const [min, name] of VIGOR_BANDS) {
    if (v >= min) return name;
  }
  return VIGOR_BANDS[VIGOR_BANDS.length - 1][1];
}
