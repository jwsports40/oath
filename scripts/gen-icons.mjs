// Rasterizes public/icon.svg to the PWA manifest PNG icons.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const svg = path.join(root, 'public', 'icon.svg');
const outDir = path.join(root, 'public', 'icons');
await mkdir(outDir, { recursive: true });

for (const size of [192, 512]) {
  const out = path.join(outDir, `icon-${size}.png`);
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(out);
  console.log(`wrote ${out}`);
}
