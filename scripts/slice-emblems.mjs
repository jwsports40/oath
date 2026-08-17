// Slice the emblem sheets (1122x1402) into per-item emblem PNGs by DETECTING
// each emblem's bounding box from pixel brightness (they sit on pure black),
// so nothing is ever clipped regardless of grid drift.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const OUT = 'src/ui/loot/emblems';
mkdirSync(OUT, { recursive: true });

const TIERS = ['common', 'rare', 'mythic'];

/** 1-D runs where profile > threshold, keeping runs at least minLen long. */
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

async function sliceSheet(sheet, rowKeys, labelWidth) {
  const { data, info } = await sharp(sheet).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const px = (x, y) => data[y * W + x];

  // Column profile over the emblem region (right of the row labels).
  const colProfile = new Array(W).fill(0);
  for (let x = labelWidth; x < W; x++) {
    let sum = 0;
    for (let y = 0; y < H; y++) sum += px(x, y) > 40 ? 1 : 0;
    colProfile[x] = sum;
  }
  const cols = runs(colProfile, 40, 80); // 3 emblem columns
  if (cols.length !== 3) throw new Error(`${sheet}: expected 3 columns, got ${cols.length}`);

  for (let c = 0; c < 3; c++) {
    const [x0, x1] = cols[c];
    // Row profile within this column.
    const rowProfile = new Array(H).fill(0);
    for (let y = 0; y < H; y++) {
      let sum = 0;
      for (let x = x0; x < x1; x++) sum += px(x, y) > 40 ? 1 : 0;
      rowProfile[y] = sum;
    }
    // Emblems are tall runs; header/tier text rows are short — filter them out.
    const rows = runs(rowProfile, 8, 120).slice(-rowKeys.length);
    if (rows.length !== rowKeys.length) {
      throw new Error(`${sheet} col ${c}: expected ${rowKeys.length} rows, got ${rows.length}`);
    }
    for (let r = 0; r < rows.length; r++) {
      const [y0, y1] = rows[r];
      const pad = 4;
      const left = Math.max(0, x0 - pad);
      const top = Math.max(0, y0 - pad);
      const cell = await sharp(sheet)
        .extract({
          left, top,
          width: Math.min(W - left, x1 - x0 + pad * 2),
          height: Math.min(H - top, y1 - y0 + pad * 2),
        })
        .png().toBuffer();
      await sharp(cell)
        .resize(150, 150, { kernel: 'nearest', fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .extend({ top: 5, bottom: 5, left: 5, right: 5, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toFile(`${OUT}/${rowKeys[r]}-${TIERS[c]}.png`);
      console.log(`${rowKeys[r]}-${TIERS[c]}  x${left} y${top} ${x1 - x0}x${y1 - y0}`);
    }
  }
}

await sliceSheet('assets-src-tokens.png',
  ['tokenVigor', 'tokenIron', 'tokenClarity', 'tokenDawn'], 250);
await sliceSheet('assets-src-enchants.png',
  ['enchBulwark', 'enchKeenEdge', 'enchEmberWard', 'enchRunedAegis'], 250);

const TOTEMS = ['totemUnbroken', 'totemUndyingFlame', 'totemColossus', 'totemWarpath'];
for (let q = 0; q < 4; q++) {
  const left = (q % 2) * 561;
  const top = Math.floor(q / 2) * 701;
  await sharp('assets-src-totems.png')
    .extract({ left, top, width: 561, height: 612 })
    .resize(280, null, { kernel: 'nearest' })
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/${TOTEMS[q]}.png`);
}
console.log('emblems written');
