// Regenerate native app-icon PNGs for the Coach and Student Capacitor apps from
// each variant's `native/<variant>/icon.svg`. Run with `node scripts/gen-app-icons.mjs`.
//
// Requires `sharp` to be installed (a dev-only dependency — install ad-hoc with
// `npm install --no-save sharp` if it's not already in node_modules). All output
// paths are the standard Capacitor icon locations, so re-running just overwrites
// the existing PNGs in place.

import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const VARIANTS = ['coach', 'student'];

const ANDROID_MIPMAPS = [
  { dir: 'mipmap-mdpi', launcher: 48, foreground: 108 },
  { dir: 'mipmap-hdpi', launcher: 72, foreground: 162 },
  { dir: 'mipmap-xhdpi', launcher: 96, foreground: 216 },
  { dir: 'mipmap-xxhdpi', launcher: 144, foreground: 324 },
  { dir: 'mipmap-xxxhdpi', launcher: 192, foreground: 432 },
];

async function renderPng(svgBuffer, size, outPath) {
  await sharp(svgBuffer, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

async function renderRoundPng(svgBuffer, size, outPath) {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
       <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#ffffff"/>
     </svg>`,
  );
  const base = await sharp(svgBuffer, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp(base)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
}

async function generateForVariant(variant) {
  const svgPath = path.join(ROOT, 'native', variant, 'icon.svg');
  const svg = await readFile(svgPath);

  const androidBase = path.join(ROOT, 'native', variant, 'android/app/src/main/res');
  for (const { dir, launcher, foreground } of ANDROID_MIPMAPS) {
    await renderPng(svg, launcher, path.join(androidBase, dir, 'ic_launcher.png'));
    await renderRoundPng(svg, launcher, path.join(androidBase, dir, 'ic_launcher_round.png'));
    await renderPng(svg, foreground, path.join(androidBase, dir, 'ic_launcher_foreground.png'));
  }

  const iosOut = path.join(
    ROOT,
    'native',
    variant,
    'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
  );
  await renderPng(svg, 1024, iosOut);

  console.log(`  ✓ ${variant}: android mipmaps + ios AppIcon regenerated`);
}

(async () => {
  console.log('Generating native app icons from native/<variant>/icon.svg...');
  for (const variant of VARIANTS) {
    await generateForVariant(variant);
  }
  console.log('Done.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
