import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../data/db';
import { dayKey } from '../../core/dates';
import { newId } from '../../core/ids';
import { useOath } from '../store';
import type { Meal } from '../../core/types';

const today = dayKey(new Date());

function meal(cal: number, p: number): Meal {
  return {
    id: newId(), date: today, at: new Date().toISOString(), status: 'done',
    entries: [{ food: 'test food', quantity: 1, unit: 'serving', calories: cal,
      protein_g: p, carbs_g: 0, fat_g: 0, confidence: 1, corrected: false }],
  };
}

describe('deleteMeal', () => {
  beforeAll(async () => {
    await db.delete();
    await db.open();
    await useOath.getState().init();
  });

  it('removes the meal and recomputes macros', async () => {
    const m1 = meal(500, 40);
    const m2 = meal(300, 20);
    await db.meals.bulkAdd([m1, m2]);
    await useOath.getState().refresh();
    expect(useOath.getState().macros.cal).toBe(800);

    await useOath.getState().deleteMeal(m1.id);
    expect(useOath.getState().macros.cal).toBe(300);
    expect(useOath.getState().macros.p).toBe(20);
    expect(await db.meals.get(m1.id)).toBeUndefined();
  });

  it('is safe on an already-deleted meal', async () => {
    await useOath.getState().deleteMeal('nope');
    expect(useOath.getState().macros.cal).toBe(300);
  });
});
