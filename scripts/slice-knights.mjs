// Slice the knight card sheet (assets-src-knights.png) into 11 per-age PNGs by
// DETECTING each card's bounds from pixel brightness (cards sit on pure black),
// so no card is ever cut off by grid drift.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'assets-src-knights.png';
const OUT = 'src/ui/knight/cards';
mkdirSync(OUT, { recursive: true });

const AGES = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

/** Merge runs separated by gaps smaller than maxGap. */
function mergeRuns(rs, maxGap) {
  const out = [];
  for (const r of rs) {
    const last = out[out.length - 1];
    if (last !== undefined && r[0] - last[1] < maxGap) last[1] = r[1];
    else out.push([...r]);
  }
  return out;
}

function runs(profile, threshold, minLen) {
  const out = [];
  let start = -1;
  for (let i = 0; i <= profile.length; i++) {
    const on = i < profile.length && profile[i] > threshold;
    if (on && start === -1) start = i;
    if (!on && start !== -1) {
      if (i - start >= minLen) out.push([start, i]);
      start = -1;
    }
  }
  return out;
}

const { data, info } = await sharp(SRC).greyscale().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const px = (x, y) => data[y * W + x];

// Row bands: two tall bright runs across the full width.
const rowProfile = new Array(H).fill(0);
for (let y = 0; y < H; y++) {
  let sum = 0;
  for (let x = 0; x < W; x++) sum += px(x, y) > 20 ? 1 : 0;
  rowProfile[y] = sum;
}
const bands = mergeRuns(runs(rowProfile, 8, 100), 20);
if (bands.length !== 2) throw new Error(`expected 2 row bands, got ${bands.length}`);

const expected = [6, 5];
let i = 0;
for (let b = 0; b < 2; b++) {
  const [y0, y1] = bands[b];
  const colProfile = new Array(W).fill(0);
  for (let x = 0; x < W; x++) {
    let sum = 0;
    for (let y = y0; y < y1; y++) sum += px(x, y) > 20 ? 1 : 0;
    colProfile[x] = sum;
  }
  // Cards nearly touch, so gaps can't split them — instead find the band's
  // exact bright span and divide it equally by the card count.
  const span = mergeRuns(runs(colProfile, 6, 40), 30);
  if (span.length === 0) throw new Error(`band ${b}: no bright span`);
  const sx0 = span[0][0];
  const sx1 = span[span.length - 1][1];
  const n = expected[b];
  const cardW = (sx1 - sx0) / n;
  const cols = Array.from({ length: n }, (_, k) => [
    Math.round(sx0 + k * cardW), Math.round(sx0 + (k + 1) * cardW),
  ]);
  for (const [x0, x1] of cols) {
    const pad = 3;
    const left = Math.max(0, x0 - pad);
    const top = Math.max(0, y0 - pad);
    const width = Math.min(W - left, x1 - x0 + pad * 2);
    const height = Math.min(H - top, y1 - y0 + pad * 2);
    await sharp(SRC).extract({ left, top, width, height })
      .png({ compressionLevel: 9 })
      .toFile(`${OUT}/age-${AGES[i]}.png`);
    console.log(`age-${AGES[i]}.png  x${left} y${top} ${width}x${height}`);
    i++;
  }
}
