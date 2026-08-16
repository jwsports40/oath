import { describe, it, expect } from 'vitest';
import {
  dayKey, parseDay, addDays, weekdayOf, weekStartOf,
  daysBetween, romanNumeral, eachDay,
} from '../dates';

describe('dates', () => {
  it('weekdayOf: 2026-08-16 is Sunday (7)', () => {
    expect(weekdayOf('2026-08-16')).toBe(7);
  });

  it('weekStartOf: Monday of the week containing 2026-08-16 is 2026-08-10', () => {
    expect(weekStartOf('2026-08-16')).toBe('2026-08-10');
  });

  it('addDays crosses month boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('romanNumeral(37) === XXXVII', () => {
    expect(romanNumeral(37)).toBe('XXXVII');
  });

  it('daysBetween 2026-08-10 → 2026-08-16 is 6', () => {
    expect(daysBetween('2026-08-10', '2026-08-16')).toBe(6);
  });

  it('eachDay inclusive over one week has length 7', () => {
    const days = eachDay('2026-08-10', '2026-08-16');
    expect(days).toHaveLength(7);
    expect(days[0]).toBe('2026-08-10');
    expect(days[6]).toBe('2026-08-16');
  });

  it('dayKey/parseDay roundtrip on a local date', () => {
    const d = new Date(2026, 7, 16); // local Aug 16 2026
    expect(dayKey(d)).toBe('2026-08-16');
    const p = parseDay('2026-08-16');
    expect(p.getFullYear()).toBe(2026);
    expect(p.getMonth()).toBe(7);
    expect(p.getDate()).toBe(16);
    expect(p.getHours()).toBe(0);
  });
});
