// data/sync.ts — one shared save across devices, through the bridge.
// The PC (bridge server) holds the master snapshot at /state. Every device
// pulls on open, merges, restores, recomputes derived state, and pushes back.
// Merging is union-first: append-only event tables are united by id so real
// history (completions, meals, XP) is never lost; instances dedupe by their
// natural key (templateId+date); config tables last-write-win by which side
// showed more recent activity; device-specific kv keys stay local.
import { db, kvGet, kvSet } from './db';
import { recomputeDerived } from './lifecycle';

export type Dump = Record<string, unknown[]>;

type Row = Record<string, unknown>;

const APPEND_ONLY = ['completions', 'xpEvents', 'meals', 'hydration', 'sessions', 'prs', 'loot'];
const CONFIG_BY_ID = ['categories', 'templates', 'programs', 'exercises'];
const KV_LOCAL = new Set(['settings', 'aiQueue']);

function rows(d: Dump, table: string): Row[] {
  const r = d[table];
  return Array.isArray(r) ? (r as Row[]) : [];
}

function unionBy(a: Row[], b: Row[], key: string, prefer: (x: Row, y: Row) => Row): Row[] {
  const out = new Map<string, Row>();
  for (const r of a) out.set(String(r[key]), r);
  for (const r of b) {
    const k = String(r[key]);
    const existing = out.get(k);
    out.set(k, existing === undefined ? r : prefer(existing, r));
  }
  return [...out.values()];
}

/** Most recent event timestamp on a side — the tiebreaker for config rows. */
function activityAt(d: Dump): string {
  let max = '';
  for (const t of ['completions', 'xpEvents', 'meals', 'hydration']) {
    for (const r of rows(d, t)) {
      const at = typeof r.at === 'string' ? r.at : '';
      if (at > max) max = at;
    }
  }
  return max;
}

const STATUS_RANK: Record<string, number> = { done: 2, failed: 1, todo: 0 };

function betterInstance(a: Row, b: Row): Row {
  const ra = STATUS_RANK[String(a.status)] ?? 0;
  const rb = STATUS_RANK[String(b.status)] ?? 0;
  if (ra !== rb) return ra > rb ? a : b;
  const pa = typeof a.progress === 'number' ? a.progress : 0;
  const pb = typeof b.progress === 'number' ? b.progress : 0;
  if (pa !== pb) return pa > pb ? a : b;
  return String(a.id) <= String(b.id) ? a : b; // deterministic
}

function kvMap(d: Dump): Map<string, unknown> {
  return new Map(rows(d, 'kv').map((r) => [String(r.key), r.value]));
}

export function mergeDumps(local: Dump, remote: Dump): Dump {
  const remoteNewer = activityAt(remote) > activityAt(local);
  const preferActive = (l: Row, r: Row): Row => (remoteNewer ? r : l);
  const out: Dump = {};

  // Instances: dedupe by templateId+date, remember loser→winner id remaps.
  const remap = new Map<string, string>();
  const instances = new Map<string, Row>();
  for (const side of [local, remote]) {
    for (const inst of rows(side, 'instances')) {
      const k = `${String(inst.templateId)}|${String(inst.date)}`;
      const existing = instances.get(k);
      if (existing === undefined) { instances.set(k, inst); continue; }
      const winner = betterInstance(existing, inst);
      const loser = winner === existing ? inst : existing;
      if (String(loser.id) !== String(winner.id)) remap.set(String(loser.id), String(winner.id));
      instances.set(k, winner);
    }
  }
  out.instances = [...instances.values()];

  // Append-only unions (completions get their instanceId remapped first).
  const remapCompletion = (c: Row): Row => {
    const target = remap.get(String(c.instanceId));
    return target === undefined ? c : { ...c, instanceId: target };
  };
  for (const t of APPEND_ONLY) {
    const a = t === 'completions' ? rows(local, t).map(remapCompletion) : rows(local, t);
    const b = t === 'completions' ? rows(remote, t).map(remapCompletion) : rows(remote, t);
    out[t] = unionBy(a, b, 'id', preferActive);
  }

  for (const t of CONFIG_BY_ID) out[t] = unionBy(rows(local, t), rows(remote, t), 'id', preferActive);

  out.dailyScores = unionBy(rows(local, 'dailyScores'), rows(remote, 'dailyScores'), 'date', preferActive);
  // Chests: deterministic ids; an opened copy always beats an unopened one.
  out.chests = unionBy(rows(local, 'chests'), rows(remote, 'chests'), 'id', (a, b) =>
    (typeof a.openedAt === 'string' ? a : typeof b.openedAt === 'string' ? b : a));
  out.sieges = unionBy(rows(local, 'sieges'), rows(remote, 'sieges'), 'weekStart', (a, b) => {
    const winner = (typeof a.hp === 'number' ? a.hp : 0) <= (typeof b.hp === 'number' ? b.hp : 0) ? a : b;
    return { ...winner, killed: a.killed === true || b.killed === true };
  });

  // kv: per-key policy.
  const lk = kvMap(local);
  const rk = kvMap(remote);
  const mergedKv = new Map<string, unknown>();
  for (const key of new Set([...lk.keys(), ...rk.keys()])) {
    if (KV_LOCAL.has(key)) { if (lk.has(key)) mergedKv.set(key, lk.get(key)); continue; }
    const l = lk.get(key);
    const r = rk.get(key);
    if (l === undefined) { mergedKv.set(key, r); continue; }
    if (r === undefined) { mergedKv.set(key, l); continue; }
    switch (key) {
      case 'fragments':
        mergedKv.set(key, Math.max(Number(l) || 0, Number(r) || 0)); break;
      case 'seedDay':
        mergedKv.set(key, String(l) <= String(r) ? l : r); break;
      case 'unlocks':
        mergedKv.set(key, unionBy(l as Row[], r as Row[], 'id', preferActive)); break;
      case 'achievements': {
        const merged = unionBy(l as Row[], r as Row[], 'id', (a, b) => {
          const pa = Number(a.progress) || 0;
          const pb = Number(b.progress) || 0;
          const unlockedAt = [a.unlockedAt, b.unlockedAt].filter((x): x is string => typeof x === 'string').sort()[0];
          const base = pa >= pb ? a : b;
          return unlockedAt !== undefined ? { ...base, progress: Math.max(pa, pb), unlockedAt } : { ...base, progress: Math.max(pa, pb) };
        });
        mergedKv.set(key, merged); break;
      }
      case 'corrections': {
        const all = [...(l as Row[]), ...(r as Row[])];
        const byMatch = new Map<string, Row>();
        for (const c of all) byMatch.set(String(c.match), c);
        mergedKv.set(key, [...byMatch.values()].slice(-20)); break;
      }
      case 'foodCache':
        mergedKv.set(key, { ...(l as object), ...(r as object) }); break;
      default:
        // character / streaks / vigor / nutritionGoal / anything new:
        // recomputed or last-write-wins by activity.
        mergedKv.set(key, remoteNewer ? r : l);
    }
  }
  out.kv = [...mergedKv.entries()].map(([key, value]) => ({ key, value }));

  // Any table not handled above (future additions): union by id when possible.
  for (const t of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    if (out[t] !== undefined) continue;
    out[t] = unionBy(rows(local, t), rows(remote, t), 'id', preferActive);
  }
  return out;
}

export async function dumpAll(): Promise<Dump> {
  const dump: Dump = {};
  for (const table of db.tables) dump[table.name] = await table.toArray();
  return dump;
}

export async function restoreAll(dump: Dump): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
      const r = dump[table.name];
      // Dexie/JSON boundary: snapshot rows are untyped at rest.
      if (Array.isArray(r) && r.length > 0) await table.bulkPut(r as never[]);
    }
  });
}

export interface SyncResult { status: 'synced' | 'offline'; }

/** Pull → merge → restore → recompute → push. Safe to call repeatedly. */
export async function syncNow(bridgeUrl: string): Promise<SyncResult> {
  let res: Response;
  try {
    res = await fetch(`${bridgeUrl}/state`, { signal: AbortSignal.timeout(8000) });
  } catch {
    return { status: 'offline' };
  }
  let baseRev = 0;
  let merged: Dump;
  if (res.status === 404) {
    merged = await dumpAll();
  } else if (res.ok) {
    const remote = (await res.json()) as { rev: number; tables: Dump };
    baseRev = remote.rev;
    merged = mergeDumps(await dumpAll(), remote.tables);
    // Preserve this device's identity before restore wipes kv wholesale.
    const settings = await kvGet<unknown>('settings', null);
    const aiQueue = await kvGet<unknown>('aiQueue', []);
    await restoreAll(merged);
    if (settings !== null) await kvSet('settings', settings);
    await kvSet('aiQueue', aiQueue);
    await recomputeDerived();
    merged = await dumpAll();
  } else {
    throw new Error(`bridge /state responded ${res.status}`);
  }
  const put = await fetch(`${bridgeUrl}/state`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ baseRev, savedAt: new Date().toISOString(), tables: merged }),
    signal: AbortSignal.timeout(15000),
  });
  if (put.status === 409) return syncNow(bridgeUrl); // raced another device — re-merge once more
  if (!put.ok) throw new Error(`bridge /state PUT responded ${put.status}`);
  return { status: 'synced' };
}
