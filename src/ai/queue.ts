// ai/queue.ts — kv-backed offline FIFO for SCRIBE estimates.
// pending → estimating → done | needs_review. Items survive reloads (kv 'aiQueue');
// network errors leave the item queued, refusals/parse failures mark the meal
// needs_review. Registers itself as the store's AI drain on import.
import { db, kvGet, kvSet } from '../data/db';
import { DEFAULT_SETTINGS } from '../data/seed';
import { registerAiDrain, type AiQueueItem, type FoodCorrection } from '../app/store';
import {
  EstimateFailedError, bridgeAvailable, estimate as scribeEstimate, resolveBridgeUrlAuto,
  estimateViaBridge, normalizeFood,
  type NutritionRequest, type NutritionResponse,
} from './nutrition';
import type { FoodEntry, Meal, UserSettings } from '../core/types';

export type Estimator = (req: NutritionRequest, apiKey: string) => Promise<NutritionResponse>;

const QUEUE_KEY = 'aiQueue';
const CACHE_KEY = 'foodCache';
const CORRECTIONS_KEY = 'corrections';

function toFoodEntries(res: NutritionResponse): FoodEntry[] {
  return res.entries.map((e) => ({ ...e, corrected: false }));
}

async function applyResult(mealId: string, res: NutritionResponse): Promise<void> {
  const meal = await db.meals.get(mealId);
  if (meal === undefined) return;
  const status: Meal['status'] = res.needs_clarification.length > 0 ? 'needs_review' : 'done';
  await db.meals.put({ ...meal, entries: toFoodEntries(res), status });
}

/** Remove one item by mealId, re-reading the queue so concurrent enqueues survive. */
async function dequeue(mealId: string): Promise<void> {
  const queue = await kvGet<AiQueueItem[]>(QUEUE_KEY, []);
  await kvSet(QUEUE_KEY, queue.filter((i) => i.mealId !== mealId));
}

let draining = false;

/**
 * Process the FIFO in order. For each item: cache hit applies instantly;
 * otherwise (online + API key set) call the estimator. Stops at the head item
 * when offline, keyless, or on a transient network error — strict FIFO.
 */
export async function drain(estimator: Estimator = scribeEstimate): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    // Probe the Claude Code bridge once per drain; when reachable it takes
    // priority over the direct API-key path (private single-user mode, no key
    // needed). A user-configured URL (e.g. an https tunnel) beats the default.
    const drainSettings = await kvGet<UserSettings>('settings', DEFAULT_SETTINGS);
    const bridgeUrl = await resolveBridgeUrlAuto(drainSettings.bridgeUrl);
    const useBridge = bridgeUrl !== null && (await bridgeAvailable(bridgeUrl));
    for (;;) {
      const queue = await kvGet<AiQueueItem[]>(QUEUE_KEY, []);
      const item = queue[0];
      if (item === undefined) break;
      const meal = await db.meals.get(item.mealId);
      if (meal === undefined) {
        await dequeue(item.mealId); // meal vanished — drop the orphan item
        continue;
      }
      const cacheKey = normalizeFood(item.utterance);
      const cache = await kvGet<Record<string, NutritionResponse>>(CACHE_KEY, {});
      const cached = cache[cacheKey];
      if (cached !== undefined) {
        await applyResult(item.mealId, cached);
        await dequeue(item.mealId);
        continue;
      }
      const settings = await kvGet<UserSettings>('settings', DEFAULT_SETTINGS);
      const apiKey = settings.anthropicKey;
      const online = typeof navigator === 'undefined' || navigator.onLine !== false;
      if (!online) break; // leave queued
      const hasKey = apiKey !== undefined && apiKey !== '';
      if (!useBridge && !hasKey) break; // no way to estimate — leave queued
      const corrections = await kvGet<FoodCorrection[]>(CORRECTIONS_KEY, []);
      const request: NutritionRequest = {
        utterance: item.utterance,
        units: settings.units === 'ml' ? 'metric' : 'imperial',
        localDate: meal.date,
        knownCorrections: corrections.slice(-20),
      };
      try {
        const res = useBridge && bridgeUrl !== null
          ? await estimateViaBridge(request, bridgeUrl)
          : await estimator(request, apiKey as string);
        await applyResult(item.mealId, res);
        await kvSet(CACHE_KEY, { ...cache, [cacheKey]: res });
        await dequeue(item.mealId);
      } catch (err) {
        if (err instanceof EstimateFailedError) {
          // Refusal / unparseable — terminal for this item.
          await db.meals.put({ ...meal, status: 'needs_review' });
          await dequeue(item.mealId);
        } else {
          break; // network/transport error — keep queued, retry on next drain
        }
      }
    }
  } finally {
    draining = false;
  }
}

/** Append an item and immediately attempt a drain. */
export async function enqueue(mealId: string, utterance: string): Promise<void> {
  const queue = await kvGet<AiQueueItem[]>(QUEUE_KEY, []);
  await kvSet(QUEUE_KEY, [...queue, { mealId, utterance }]);
  await drain();
}

// Wire this queue into the store: logMealUtterance/init/online drains now reach us.
registerAiDrain(() => drain());
