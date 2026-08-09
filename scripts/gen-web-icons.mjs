// Regenerate web/PWA icon PNGs from the SVGs in public/icons.
// Run with `node scripts/gen-web-icons.mjs`.
//
// Requires `sharp` (dev-only). Install ad-hoc with `npm install --no-save sharp`
// if it's not already present.

import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = path.join(ROOT, 'public', 'icons');

async function renderPng(svgBuffer, size, outPath) {
  await sharp(svgBuffer, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

(async () => {
  console.log('Generating web/PWA icons from public/icons/*.svg...');
  const svg512 = await readFile(path.join(ICONS, 'icon-512.svg'));
  const svg192 = await readFile(path.join(ICONS, 'icon-192.svg'));

  await renderPng(svg512, 512, path.join(ICONS, 'icon-512.png'));
  await renderPng(svg192, 192, path.join(ICONS, 'icon-192.png'));
  await renderPng(svg512, 180, path.join(ICONS, 'apple-touch-icon.png'));

  console.log('  ✓ icon-512.png, icon-192.png, apple-touch-icon.png regenerated');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
