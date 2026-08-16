import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, kvGet, kvSet } from '../../data/db';
import { DEFAULT_SETTINGS } from '../../data/seed';
import {
  EstimateFailedError, normalizeFood, NUTRITION_SCHEMA, type NutritionResponse,
} from '../nutrition';
import { drain, enqueue } from '../queue';
import type { AiQueueItem } from '../../app/store';
import type { Meal } from '../../core/types';

const RESPONSE: NutritionResponse = {
  entries: [{
    food: 'Cooked chicken breast', quantity: 10, unit: 'oz',
    calories: 468, protein_g: 88, carbs_g: 0, fat_g: 10,
    confidence: 0.91, assumptions: ['boneless, skinless'],
  }],
  needs_clarification: [],
};

async function addMeal(id: string, utterance: string): Promise<void> {
  const meal: Meal = {
    id, date: '2026-08-16', at: new Date().toISOString(),
    entries: [], utterance, status: 'estimating',
  };
  await db.meals.add(meal);
}

async function queueItem(mealId: string, utterance: string): Promise<void> {
  const queue = await kvGet<AiQueueItem[]>('aiQueue', []);
  await kvSet('aiQueue', [...queue, { mealId, utterance }]);
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await kvSet('settings', { ...DEFAULT_SETTINGS, anthropicKey: 'sk-test' });
});

describe('normalizeFood', () => {
  it('lowercases, trims, collapses spaces', () => {
    expect(normalizeFood('  10 OZ  Chicken   Breast ')).toBe('10 oz chicken breast');
  });
});

describe('NUTRITION_SCHEMA', () => {
  interface SchemaNode {
    type?: string;
    additionalProperties?: boolean;
    required?: string[];
    properties?: Record<string, SchemaNode>;
    items?: SchemaNode;
  }
  const schema = NUTRITION_SCHEMA as SchemaNode;

  it('is strict at the top level', () => {
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['entries', 'needs_clarification']);
  });

  it('entry objects are strict with a full required list', () => {
    const entry = schema.properties?.entries?.items;
    expect(entry?.additionalProperties).toBe(false);
    expect(entry?.required).toEqual([
      'food', 'quantity', 'unit', 'calories', 'protein_g', 'carbs_g', 'fat_g',
      'confidence', 'assumptions',
    ]);
  });
});

describe('queue drain', () => {
  it('estimates a queued meal, marks it done, and caches the result', async () => {
    const est = vi.fn().mockResolvedValue(RESPONSE);
    await addMeal('m1', '10 oz chicken breast');
    await queueItem('m1', '10 oz chicken breast');
    await drain(est);

    expect(est).toHaveBeenCalledTimes(1);
    expect(est.mock.calls[0][0].utterance).toBe('10 oz chicken breast');
    expect(est.mock.calls[0][0].units).toBe('imperial');
    expect(est.mock.calls[0][1]).toBe('sk-test');

    const meal = await db.meals.get('m1');
    expect(meal?.status).toBe('done');
    expect(meal?.entries[0]?.calories).toBe(468);
    expect(meal?.entries[0]?.corrected).toBe(false);

    expect(await kvGet<AiQueueItem[]>('aiQueue', [])).toEqual([]);
    const cache = await kvGet<Record<string, NutritionResponse>>('foodCache', {});
    expect(cache['10 oz chicken breast']).toEqual(RESPONSE);
  });

  it('serves a cache hit without calling the estimator', async () => {
    await kvSet('foodCache', { '10 oz chicken breast': RESPONSE });
    const est = vi.fn();
    await addMeal('m2', '  10 OZ  chicken breast ');
    await queueItem('m2', '  10 OZ  chicken breast ');
    await drain(est);

    expect(est).not.toHaveBeenCalled();
    expect((await db.meals.get('m2'))?.status).toBe('done');
    expect(await kvGet<AiQueueItem[]>('aiQueue', [])).toEqual([]);
  });

  it('marks the meal needs_review when clarification is needed', async () => {
    const est = vi.fn().mockResolvedValue({
      entries: [], needs_clarification: ['which soda?'],
    } satisfies NutritionResponse);
    await addMeal('m3', 'a soda');
    await queueItem('m3', 'a soda');
    await drain(est);

    expect((await db.meals.get('m3'))?.status).toBe('needs_review');
    expect(await kvGet<AiQueueItem[]>('aiQueue', [])).toEqual([]);
  });

  it('leaves the item queued on a network error', async () => {
    const est = vi.fn().mockRejectedValue(new Error('fetch failed'));
    await addMeal('m4', 'an apple');
    await queueItem('m4', 'an apple');
    await drain(est);

    expect((await db.meals.get('m4'))?.status).toBe('estimating');
    expect(await kvGet<AiQueueItem[]>('aiQueue', [])).toHaveLength(1);
  });

  it('marks needs_review and dequeues on refusal/parse failure', async () => {
    const est = vi.fn().mockRejectedValue(new EstimateFailedError('refused'));
    await addMeal('m5', 'a mystery');
    await queueItem('m5', 'a mystery');
    await drain(est);

    expect((await db.meals.get('m5'))?.status).toBe('needs_review');
    expect(await kvGet<AiQueueItem[]>('aiQueue', [])).toEqual([]);
  });

  it('does not call the estimator when no API key is set', async () => {
    await kvSet('settings', { ...DEFAULT_SETTINGS });
    const est = vi.fn();
    await addMeal('m6', 'an apple');
    await queueItem('m6', 'an apple');
    await drain(est);

    expect(est).not.toHaveBeenCalled();
    expect(await kvGet<AiQueueItem[]>('aiQueue', [])).toHaveLength(1);
  });

  it('drops orphan items whose meal no longer exists', async () => {
    const est = vi.fn();
    await queueItem('ghost', 'nothing');
    await drain(est);

    expect(est).not.toHaveBeenCalled();
    expect(await kvGet<AiQueueItem[]>('aiQueue', [])).toEqual([]);
  });

  it('passes the last 20 corrections through to the estimator', async () => {
    const corrections = Array.from({ length: 25 }, (_, i) => ({
      match: `food ${i}`, cal: i, p: 0, c: 0, f: 0,
    }));
    await kvSet('corrections', corrections);
    const est = vi.fn().mockResolvedValue(RESPONSE);
    await addMeal('m7', 'corrected food');
    await queueItem('m7', 'corrected food');
    await drain(est);

    const sent = est.mock.calls[0][0].knownCorrections;
    expect(sent).toHaveLength(20);
    expect(sent[0].match).toBe('food 5');
    expect(sent[19].match).toBe('food 24');
  });

  it('enqueue appends and drain stops at the keyless gate', async () => {
    await kvSet('settings', { ...DEFAULT_SETTINGS });
    await addMeal('m8', 'an apple');
    await enqueue('m8', 'an apple');

    expect(await kvGet<AiQueueItem[]>('aiQueue', [])).toEqual([
      { mealId: 'm8', utterance: 'an apple' },
    ]);
    expect((await db.meals.get('m8'))?.status).toBe('estimating');
  });
});
