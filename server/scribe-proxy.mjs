// SCRIBE bridge — runs nutrition estimation as a headless Claude Code subagent.
// Private single-user mode: the Oath app (served on :4173) POSTs the utterance
// here; this server spawns `claude -p` using the machine's existing Claude login,
// so the app needs no API key. Listens on 0.0.0.0:4174 (LAN reachable).
//
// Endpoints:
//   GET  /health -> {"ok":true}
//   POST /scribe -> NutritionResponse JSON
//     200: estimate  ·  422: terminal (refused/unusable output)  ·  5xx: transient
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 4174;

// Master save for cross-device sync (GET/PUT /state). Written atomically.
const STATE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'state');
const STATE_FILE = join(STATE_DIR, 'oath-state.json');

function loadState() {
  if (!existsSync(STATE_FILE)) return null;
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}

function saveState(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, STATE_FILE);
}

const SYSTEM = `You are SCRIBE, a nutrition estimator. Estimate macros for the foods in the user's utterance. Apply knownCorrections verbatim when a food matches. Use the requested unit system. confidence is 0-1. Put genuinely ambiguous items in needs_clarification instead of guessing wildly.

For each entry ALSO give: "grams" (your best estimate of the entry's total edible weight in grams) and "fdc_query" (a short generic USDA food-database search term for it, e.g. "egg whole raw" or "chicken breast cooked").

Respond with ONLY a JSON object (no prose, no code fences, no tool use) of this exact shape:
{"entries":[{"food":string,"quantity":number,"unit":string,"grams":number,"fdc_query":string,"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"confidence":number,"assumptions":string[]}],"needs_clarification":string[]}

The request follows as JSON:`;

// --- USDA FoodData Central grounding -----------------------------------------
// The federal nutrient database behind FDA nutrition labeling. When a food
// matches, its lab-measured per-100g values REPLACE the model's guess, scaled
// by the model's gram estimate. Get a free key at https://fdc.nal.usda.gov/api-key-signup
// and set FDC_API_KEY (DEMO_KEY works but is rate-limited).
const FDC_KEY = process.env.FDC_API_KEY ?? 'DEMO_KEY';
const FDC_NUTRIENTS = { 1008: 'calories', 1003: 'protein_g', 1005: 'carbs_g', 1004: 'fat_g' };
// Energy sometimes appears as Atwater ids on Foundation foods.
const FDC_ENERGY_ALT = [2047, 2048];

async function fdcLookup(query) {
  const url = 'https://api.nal.usda.gov/fdc/v1/foods/search?api_key=' + FDC_KEY
    + '&query=' + encodeURIComponent(query)
    + '&dataType=' + encodeURIComponent('Foundation,SR Legacy')
    + '&pageSize=1';
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error('fdc http ' + res.status);
  const hit = (await res.json()).foods?.[0];
  if (hit === undefined) return null;
  const per100 = { calories: null, protein_g: null, carbs_g: null, fat_g: null };
  for (const n of hit.foodNutrients ?? []) {
    const key = FDC_NUTRIENTS[n.nutrientId];
    if (key !== undefined && per100[key] === null && typeof n.value === 'number') per100[key] = n.value;
    if (per100.calories === null && FDC_ENERGY_ALT.includes(n.nutrientId) && typeof n.value === 'number') {
      per100.calories = n.value;
    }
  }
  if (per100.protein_g === null && per100.calories === null) return null;
  return { description: hit.description, per100 };
}

async function groundEntries(entries) {
  await Promise.all(entries.map(async (e) => {
    const grams = typeof e.grams === 'number' && e.grams > 0 ? e.grams : null;
    const query = typeof e.fdc_query === 'string' && e.fdc_query !== '' ? e.fdc_query : e.food;
    if (grams === null || typeof query !== 'string') return;
    try {
      const hit = await fdcLookup(query);
      if (hit === null) return;
      const f = grams / 100;
      for (const key of ['calories', 'protein_g', 'carbs_g', 'fat_g']) {
        const v = hit.per100[key];
        if (typeof v === 'number') e[key] = Math.round(v * f * 10) / 10;
      }
      e.confidence = Math.max(e.confidence ?? 0, 0.9);
      e.assumptions = [...(e.assumptions ?? []), `USDA FDC: ${hit.description} (${grams}g)`];
      console.log(`[fdc] ${query} -> ${hit.description}`);
    } catch (err) {
      console.log(`[fdc] lookup failed for "${query}": ${err.message}`);
    }
  }));
}

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    // shell:true so the claude .cmd shim resolves on Windows; fixed arg string,
    // the untrusted request only ever travels via stdin.
    const child = spawn('claude -p --output-format json --model claude-opus-5', {
      shell: true, windowsHide: true,
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('claude timed out')); }, 120_000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`claude exited ${code}: ${err.slice(0, 400)}`));
      else resolve(out);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function extractJson(text) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON object in output');
  return JSON.parse(trimmed.slice(start, end + 1));
}

function readBody(req, limit = 100_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > limit) req.destroy(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }
  if (req.url === '/state' && req.method === 'GET') {
    const state = loadState();
    if (state === null) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(state));
    return;
  }
  if (req.url === '/state' && req.method === 'PUT') {
    try {
      const body = JSON.parse(await readBody(req, 25_000_000));
      if (typeof body.tables !== 'object' || body.tables === null) {
        res.writeHead(400); res.end('missing tables'); return;
      }
      const current = loadState();
      const currentRev = current === null ? 0 : current.rev;
      if ((body.baseRev ?? 0) !== currentRev) {
        // Another device saved since this client pulled — make it re-merge.
        res.writeHead(409, { 'content-type': 'application/json' });
        res.end(JSON.stringify(current));
        return;
      }
      const next = { rev: currentRev + 1, savedAt: body.savedAt ?? new Date().toISOString(), tables: body.tables };
      saveState(next);
      console.log(`[state] rev ${next.rev} saved`);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ rev: next.rev }));
    } catch (e) {
      res.writeHead(500); res.end(String(e.message));
    }
    return;
  }
  if (req.method === 'POST' && req.url === '/scribe') {
    try {
      const body = await readBody(req);
      JSON.parse(body); // validate it is JSON before spending a model call
      console.log(`[scribe] estimating: ${body.slice(0, 120)}`);
      const raw = await runClaude(`${SYSTEM}\n${body}`);
      const outer = JSON.parse(raw);
      if (outer.is_error === true || typeof outer.result !== 'string') {
        res.writeHead(422, { 'content-type': 'text/plain' });
        res.end('subagent did not produce a result');
        return;
      }
      let parsed;
      try {
        parsed = extractJson(outer.result);
      } catch {
        res.writeHead(422, { 'content-type': 'text/plain' });
        res.end('subagent output was not valid JSON');
        return;
      }
      if (!Array.isArray(parsed.entries) || !Array.isArray(parsed.needs_clarification)) {
        res.writeHead(422, { 'content-type': 'text/plain' });
        res.end('subagent output missing required fields');
        return;
      }
      await groundEntries(parsed.entries);
      console.log(`[scribe] ok: ${parsed.entries.length} entries`);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(parsed));
    } catch (e) {
      console.error('[scribe] error:', e.message);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(String(e.message));
    }
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SCRIBE bridge listening on http://0.0.0.0:${PORT} (Claude Code subagent mode)`);
});
