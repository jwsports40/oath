// Emblem art lookup — hand-made emblems per item (tokens/enchants have one per
// tier; totems have a single card each).
import type { LootTier } from '../../core/types';

const URLS = import.meta.glob('./emblems/*.png', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;

export function emblemUrl(itemKey: string, tier?: LootTier): string | undefined {
  if (tier !== undefined) {
    const tiered = URLS[`./emblems/${itemKey}-${tier}.png`];
    if (tiered !== undefined) return tiered;
  }
  return URLS[`./emblems/${itemKey}.png`];
}
