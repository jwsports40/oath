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

// --- Claude Code bridge (private single-user mode) ---------------------------
// When the app is served from the owner's PC, a local bridge (server/scribe-proxy.mjs,
// port 4174) runs SCRIBE as a headless Claude Code subagent using the machine's
// existing Claude login — no API key needed. The bridge is only reachable from
// http pages (an https page may not call an http endpoint), so defaultBridgeUrl
// returns null on https and the direct API-key path is used instead.
export const BRIDGE_PORT = 4174;

export function defaultBridgeUrl(): string | null {
  if (typeof window === 'undefined') return null;
  if (window.location.protocol !== 'http:') return null;
  return `http://${window.location.hostname}:${BRIDGE_PORT}`;
}

/**
 * The bridge endpoint to try: an explicit user-configured URL (Settings →
 * SCRIBE bridge URL, e.g. an https tunnel to the home PC) wins; otherwise the
 * same-host default on http pages, or null when there is nothing to try.
 */
export function resolveBridgeUrl(configured: string | undefined): string | null {
  const explicit = configured?.trim();
  if (explicit !== undefined && explicit !== '') return explicit.replace(/\/+$/, '');
  return defaultBridgeUrl();
}

// The serve script publishes each new tunnel URL here; the deployed app
// discovers it automatically so the bridge reconnects without any pasting.
const DISCOVERY_URL = 'https://raw.githubusercontent.com/jwsports40/oath/bridge/bridge-url.txt';
let discovered: { url: string | null; at: number } | null = null;

/**
 * Async resolution: explicit Settings URL > same-host default (http pages) >
 * the auto-published tunnel URL (cached 5 minutes).
 */
export async function resolveBridgeUrlAuto(configured: string | undefined): Promise<string | null> {
  const direct = resolveBridgeUrl(configured);
  if (direct !== null) return direct;
  // Discovery is a browser concern — never in tests or workers.
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return null;
  if (import.meta.env?.MODE === 'test') return null;
  const now = Date.now();
  if (discovered !== null && now - discovered.at < 5 * 60_000) return discovered.url;
  try {
    const res = await fetch(`${DISCOVERY_URL}?t=${now}`, { signal: AbortSignal.timeout(4000) });
    const text = (await res.text()).trim();
    const url = res.ok && text.startsWith('https://') ? text.replace(/\/+$/, '') : null;
    discovered = { url, at: now };
    return url;
  } catch {
    discovered = { url: null, at: now };
    return null;
  }
}

export async function bridgeAvailable(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function estimateViaBridge(
  req: NutritionRequest, baseUrl: string,
): Promise<NutritionResponse> {
  const res = await fetch(`${baseUrl}/scribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (res.status === 422) {
    // The subagent refused or produced unusable output — terminal for this item.
    throw new EstimateFailedError(await res.text());
  }
  if (!res.ok) throw new Error(`bridge responded ${res.status}`); // transient
  const data = (await res.json()) as NutritionResponse;
  if (!Array.isArray(data.entries) || !Array.isArray(data.needs_clarification)) {
    throw new EstimateFailedError('bridge returned malformed response');
  }
  return data;
}

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
