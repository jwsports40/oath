import { describe, it, expect } from 'vitest';
import { nextVigor, vigorBand, INITIAL_VIGOR } from '../vigor';

describe('nextVigor', () => {
  it('starts at 50', () => {
    expect(INITIAL_VIGOR).toBe(50);
  });

  it('nextVigor(50, 85) === 59 (0.25·85 + 0.75·50 = 58.75 → 59)', () => {
    expect(nextVigor(50, 85)).toBe(59);
  });

  it('clamps to 0..100', () => {
    expect(nextVigor(0, 0)).toBe(0);
    expect(nextVigor(100, 100)).toBe(100);
  });
});

describe('vigorBand', () => {
  it('band(59) === EMBER CAMP', () => {
    expect(vigorBand(59)).toBe('EMBER CAMP');
  });
  it('band(60) === CAMP', () => {
    expect(vigorBand(60)).toBe('CAMP');
  });
  it('band(92) === BEACON', () => {
    expect(vigorBand(92)).toBe('BEACON');
  });
  it('band(80) === STRONGHOLD', () => {
    expect(vigorBand(80)).toBe('STRONGHOLD');
  });
  it('band(20) === RUINS', () => {
    expect(vigorBand(20)).toBe('RUINS');
  });
});
