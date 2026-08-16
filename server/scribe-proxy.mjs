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

const PORT = 4174;

const SYSTEM = `You are SCRIBE, a nutrition estimator. Estimate macros for the foods in the user's utterance. Apply knownCorrections verbatim when a food matches. Use the requested unit system. confidence is 0-1. Put genuinely ambiguous items in needs_clarification instead of guessing wildly.

Respond with ONLY a JSON object (no prose, no code fences, no tool use) of this exact shape:
{"entries":[{"food":string,"quantity":number,"unit":string,"calories":number,"protein_g":number,"carbs_g":number,"fat_g":number,"confidence":number,"assumptions":string[]}],"needs_clarification":string[]}

The request follows as JSON:`;

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 100_000) req.destroy(); });
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
