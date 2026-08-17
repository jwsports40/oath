// Slice the emblem sheets (1122x1402 each) into final per-item emblem PNGs:
// src/ui/loot/emblems/{itemKey}-{tier}.png and {totemKey}.png
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const OUT = 'src/ui/loot/emblems';
mkdirSync(OUT, { recursive: true });

const COLS = [278, 560, 842];
const TIERS = ['common', 'rare', 'mythic'];

async function grid(sheet, rowKeys, rowsY, rowH, cellW) {
  for (let r = 0; r < rowKeys.length; r++) {
    for (let c = 0; c < COLS.length; c++) {
      // Trim the black surround so the medallion is perfectly centered,
      // then place it on a square transparent canvas.
      const extracted = await sharp(sheet)
        .extract({ left: COLS[c], top: rowsY[r], width: cellW, height: rowH })
        .png().toBuffer();
      const cell = await sharp(extracted)
        .trim({ background: '#000000', threshold: 30 })
        .toBuffer();
      await sharp(cell)
        .resize(150, 150, { kernel: 'nearest', fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .extend({ top: 5, bottom: 5, left: 5, right: 5, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toFile(`${OUT}/${rowKeys[r]}-${TIERS[c]}.png`);
    }
  }
}

await grid('assets-src-tokens.png',
  ['tokenVigor', 'tokenIron', 'tokenClarity', 'tokenDawn'],
  [175, 495, 815, 1130], 272, 248);
await grid('assets-src-enchants.png',
  ['enchBulwark', 'enchKeenEdge', 'enchEmberWard', 'enchRunedAegis'],
  [215, 525, 835, 1140], 262, 240);

const TOTEMS = ['totemUnbroken', 'totemUndyingFlame', 'totemColossus', 'totemWarpath'];
for (let q = 0; q < 4; q++) {
  const left = (q % 2) * 561;
  const top = Math.floor(q / 2) * 701;
  // Crop off the engraved description plaque (bottom ~90px) — the app shows
  // the real in-game effect text instead. Keep the frame + name plaque.
  await sharp('assets-src-totems.png')
    .extract({ left, top, width: 561, height: 612 })
    .resize(280, null, { kernel: 'nearest' })
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/${TOTEMS[q]}.png`);
}
console.log('emblems written');
