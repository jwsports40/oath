// ai/nutrition.ts — SCRIBE: the Claude nutrition estimator. One job: natural
// language → structured macro estimates. Never mixed with UI logic.
import Anthropic from '@anthropic-ai/sdk';
import type { FoodEntry } from '../core/types';

/** What the model returns per food — a FoodEntry minus the local `corrected` flag. */
export type EstimatedEntry = Omit<FoodEntry, 'corrected'>;

export interface NutritionRequest {
  utterance: string;
  units: 'imperial' | 'metric';
  localDate: string;
  knownCorrections: { match: string; cal: number; p: number; c: number; f: number }[];
}

export interface NutritionResponse {
  entries: EstimatedEntry[];
  needs_clarification: string[];
}

/**
 * Thrown when the model refused or produced an unparseable/empty response.
 * The queue treats this as terminal for the item (meal → needs_review);
 * any other error (network, transport) leaves the item queued for retry.
 */
export class EstimateFailedError extends Error {}

/** lowercase, trim, collapse spaces — the cache/correction key normalizer. */
export function normalizeFood(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

export const SCRIBE_SYSTEM =
  'You are SCRIBE, a nutrition estimator. Estimate macros for the foods in the ' +
  "user's utterance. Apply knownCorrections verbatim when a food matches. Use the " +
  'requested unit system. confidence is 0–1. Put genuinely ambiguous items in ' +
  'needs_clarification instead of guessing wildly.';

export const NUTRITION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          food: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
          calories: { type: 'number' },
          protein_g: { type: 'number' },
          carbs_g: { type: 'number' },
          fat_g: { type: 'number' },
          confidence: { type: 'number' },
          assumptions: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'food', 'quantity', 'unit', 'calories', 'protein_g', 'carbs_g', 'fat_g',
          'confidence', 'assumptions',
        ],
        additionalProperties: false,
      },
    },
    needs_clarification: { type: 'array', items: { type: 'string' } },
  },
  required: ['entries', 'needs_clarification'],
  additionalProperties: false,
};

export async function estimate(req: NutritionRequest, apiKey: string): Promise<NutritionResponse> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const response = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 8000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: NUTRITION_SCHEMA } },
    system: SCRIBE_SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify(req) }],
  });
  if (response.stop_reason === 'refusal') {
    throw new EstimateFailedError('SCRIBE declined the request');
  }
  const text = response.content.find((b) => b.type === 'text');
  if (text === undefined) {
    throw new EstimateFailedError('SCRIBE returned no text block');
  }
  try {
    return JSON.parse(text.text) as NutritionResponse; // schema-constrained by output_config
  } catch {
    throw new EstimateFailedError('SCRIBE response was not valid JSON');
  }
}
