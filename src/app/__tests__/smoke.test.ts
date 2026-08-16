import { expect, it } from 'vitest';
import { TABS } from '../tabs';

it('has 5 tabs', () => {
  expect(TABS.length).toBe(5);
});
