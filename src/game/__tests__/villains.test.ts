import { describe, expect, it } from 'vitest';
import { VILLAINS, mergeMods, villainFor } from '../villains';

describe('villain ladder', () => {
  it('has 20 villains, two per band', () => {
    expect(VILLAINS).toHaveLength(20);
    for (let band = 0; band <= 90; band += 10) {
      expect(VILLAINS.filter((v) => v.band === band)).toHaveLength(2);
    }
  });
  it('selects from the player band; level 100 is always the final boss', () => {
    expect(villainFor(5, '2026-08-10').band).toBe(0);
    expect(villainFor(47, '2026-08-10').band).toBe(40);
    expect(villainFor(100, '2026-08-10').key).toBe('ultimateDarkLord');
  });
  it('week parity is deterministic', () => {
    const a = villainFor(15, '2026-08-10');
    expect(villainFor(15, '2026-08-10').key).toBe(a.key);
  });
  it('normal strikes scale 3 to 15; signatures 5 to 22', () => {
    expect(VILLAINS[0]!.normal.dmg).toBe(3);
    expect(VILLAINS[19]!.normal.dmg).toBe(15);
    expect(VILLAINS[19]!.signature.dmg).toBe(22);
  });
  it('mergeMods stacks additively/multiplicatively', () => {
    const m = mergeMods([{ xpAll: 0.1, regenMult: 0.5 }, { xpAll: 0.15, regenMult: 0.5, emberSeal: 1 }]);
    expect(m.xpAll).toBeCloseTo(0.25);
    expect(m.regenMult).toBeCloseTo(0.25);
    expect(m.emberSeal).toBe(1);
  });
});
