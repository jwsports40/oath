// Slice the AI-generated knight card sheet (assets-src-knights.png, 1494x1052)
// into 11 per-age card PNGs bundled by the Knight component.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'assets-src-knights.png';
const OUT = 'src/ui/knight/cards';
mkdirSync(OUT, { recursive: true });

const AGES = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

// Card regions [left, top, width, height] measured on the 1494x1052 sheet.
const TOP = { y: 36, h: 492 };
const BOT = { y: 552, h: 442 };
const regions = [
  ...[8, 255, 502, 749, 996, 1243].map((x) => [x, TOP.y, 246, TOP.h]),
  ...[66, 340, 614, 888, 1162].map((x) => [x, BOT.y, 268, BOT.h]),
];

for (let i = 0; i < regions.length; i++) {
  const [left, top, width, height] = regions[i];
  await sharp(SRC).extract({ left, top, width, height })
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/age-${AGES[i]}.png`);
  console.log(`age-${AGES[i]}.png  ${width}x${height}`);
}
