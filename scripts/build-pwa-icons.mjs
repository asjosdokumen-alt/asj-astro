#!/usr/bin/env node
/**
 * build-pwa-icons.mjs — Rasterise the PWA icon sources into PNGs
 *
 * Sources (hand-authored SVGs, checked in):
 *   public/icons/icon.svg           → standard icon
 *   public/icons/icon-maskable.svg  → maskable variant (content inset to the
 *                                     central 80% safe zone)
 *
 * Outputs (also checked in, so a deploy never depends on this script running):
 *   public/icons/icon-192.png
 *   public/icons/icon-512.png
 *   public/icons/icon-maskable-512.png
 *   public/icons/apple-touch-icon.png   (180×180 — referenced by BaseLayout.astro)
 *   public/favicon.svg                  (copy of icon.svg)
 *
 * Why sharp directly rather than a build plugin: the icons change roughly never,
 * and committing the PNGs keeps `astro build` free of a native-image dependency
 * in CI. Re-run manually when the SVG changes:  npm run icons:pwa
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ICON_DIR = 'public/icons';
const ROOT_ICON = join(ICON_DIR, 'icon.svg');
const MASK_ICON = join(ICON_DIR, 'icon-maskable.svg');

if (!existsSync(ICON_DIR)) mkdirSync(ICON_DIR, { recursive: true });

const jobs = [
  { src: ROOT_ICON, out: 'icon-192.png', size: 192 },
  { src: ROOT_ICON, out: 'icon-512.png', size: 512 },
  { src: MASK_ICON, out: 'icon-maskable-512.png', size: 512 },
  { src: ROOT_ICON, out: 'apple-touch-icon.png', size: 180, flatten: true },
  { src: ROOT_ICON, out: 'favicon-32.png', size: 32 },
];

let ok = 0;
for (const { src, out, size, flatten } of jobs) {
  const svg = readFileSync(src);
  let pipe = sharp(svg, { density: 384 }).resize(size, size, {
    fit: 'contain',
    background: { r: 2, g: 6, b: 23, alpha: 1 }, // #020617
  });
  if (flatten) pipe = pipe.flatten({ background: '#020617' });
  const dest = join(ICON_DIR, out);
  await pipe.png({ compressionLevel: 9 }).toFile(dest);
  const { size: bytes } = await sharp(dest).metadata().then((m) => ({ size: m.size ?? 0 }));
  console.log(`[pwa-icons] ${out.padEnd(24)} ${size}×${size}  ${(bytes / 1024).toFixed(1)} KB`);
  ok++;
}

// Keep the served favicon in sync with the icon source.
writeFileSync('public/favicon.svg', readFileSync(ROOT_ICON));
console.log('[pwa-icons] favicon.svg updated from icon.svg');
console.log(`[pwa-icons] done — ${ok} PNGs written to ${ICON_DIR}/`);
