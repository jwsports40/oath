import { describe, expect, it } from 'vitest';
import { hashPin, validPin } from '../pin';

describe('pin', () => {
  it('validates exactly 4 digits', () => {
    expect(validPin('1234')).toBe(true);
    expect(validPin('123')).toBe(false);
    expect(validPin('12345')).toBe(false);
    expect(validPin('12a4')).toBe(false);
  });
  it('hash is deterministic, hex, and distinct per pin', () => {
    expect(hashPin('1234')).toBe(hashPin('1234'));
    expect(hashPin('1234')).toMatch(/^[a-f0-9]{16}$/);
    expect(hashPin('1234')).not.toBe(hashPin('1235'));
  });
});
