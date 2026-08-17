import { describe, expect, it } from 'vitest';
import {
  CATALOG, chestEntitlements, lootEffects, rollChest,
} from '../loot';
import type { LootItem } from '../../core/types';

const item = (itemKey: string, tier: LootItem['tier'] = 'mythic'): LootItem => {
  const def = CATALOG.find((d) => d.key === itemKey)!;
  return { id: itemKey, chestId: 'c', itemKey, genre: def.genre, tier, name: def.name, obtainedAt: 't' };
};

describe('rollChest', () => {
  it('is deterministic given an injected rand and respects genre odds', () => {
    // rand always 0 -> first genre bucket (token), first item, common tier
    const r0 = rollChest('wooden', () => 0);
    expect(r0.genre).toBe('token');
    expect(r0.tier).toBe('common');
    // rand always 0.999 -> last bucket (totem), last item; totems are always mythic
    const r1 = rollChest('gilded', () => 0.999);
    expect(r1.genre).toBe('totem');
    expect(r1.tier).toBe('mythic');
    const def = CATALOG.find((d) => d.key === r1.itemKey)!;
    expect(def.genre).toBe('totem');
  });
  it('totems never roll a tier below mythic', () => {
    for (const v of [0, 0.5, 0.99]) {
      const roll = rollChest('gilded', (() => { let first = true; return () => { if (first) { first = false; return 0.95; } return v; }; })());
      if (roll.genre === 'totem') expect(roll.tier).toBe('mythic');
    }
  });
});

describe('chestEntitlements', () => {
  it('derives chests deterministically from history', () => {
    const ents = chestEntitlements({
      overallBest: 15, sRankBest: 7,
      kills: [{ weekStart: '2026-08-10', generation: 0 }, { weekStart: '2026-08-17', generation: 2 }],
    });
    const ids = ents.map((e) => e.id).sort();
    expect(ids).toContain('chest-wooden-streak-7');
    expect(ids).toContain('chest-wooden-streak-14');
    expect(ids).not.toContain('chest-wooden-streak-21');
    expect(ids).toContain('chest-war-2026-08-10');
    expect(ids).toContain('chest-gilded-risen-2026-08-17');
    expect(ids).toContain('chest-gilded-srank-7');
    // Same input -> same ids (idempotent for sync/recompute).
    expect(chestEntitlements({ overallBest: 15, sRankBest: 7, kills: [] }).map((e) => e.id))
      .toEqual(chestEntitlements({ overallBest: 15, sRankBest: 7, kills: [] }).map((e) => e.id));
  });
});

describe('lootEffects', () => {
  it('aggregates equipped item effects', () => {
    const fx = lootEffects([item('tokenIron', 'rare'), item('enchBulwark', 'mythic'), item('totemColossus')]);
    expect(fx.xpWorkout).toBeCloseTo(0.2);
    expect(fx.strikeArmor).toBe(5);
    expect(fx.maxHpBonus).toBe(20);
    expect(fx.wardEmber).toBe(false);
  });
  it('totem flags come through', () => {
    const fx = lootEffects([item('totemUndyingFlame')]);
    expect(fx.wardEmber).toBe(true);
    const fx2 = lootEffects([item('totemUnbroken')]);
    expect(fx2.unbroken).toBe(true);
  });
  it('empty equipment is all zeroes', () => {
    const fx = lootEffects([]);
    expect(fx.xpAll).toBe(0);
    expect(fx.siegeDmg).toBe(0);
    expect(fx.unbroken).toBe(false);
  });
});
