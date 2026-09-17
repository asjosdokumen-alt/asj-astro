#!/usr/bin/env node
/**
 * build-pwa-icons.mjs — rasterise the ASJ emblem into the PWA icon set
 *
 * Source (checked in):
 *   public/icons/logo-asj.webp   the PT Amanah Sakura Japan emblem,
 *                                500×500, transparent background.
 *
 * Outputs (also checked in, so a deploy never depends on this script running):
 *   public/icons/icon-192.png
 *   public/icons/icon-512.png
 *   public/icons/icon-maskable-512.png
 *   public/icons/apple-touch-icon.png   (180×180 — referenced by BaseLayout.astro)
 *   public/icons/favicon-32.png
 *
 * WHY THE EMBLEM IS A LOCAL FILE AND NOT THE SUPABASE URL
 * ------------------------------------------------------
 * The emblem also lives in Supabase Storage, and the in-app logos still load it
 * from there. The MANIFEST must not. It used to point at that bucket, and
 * `verify:pwa` now fails any manifest icon that is a remote URL, for a measured
 * reason: an unreachable bucket meant no icon at all and an un-installable PWA.
 * A file in `public/` is copied to `dist/` verbatim and cannot 404 on a cold,
 * offline first launch — which is exactly when the install prompt reads it.
 *
 * WHY THERE IS NO LONGER AN icon.svg
 * ----------------------------------
 * The previous icon was a hand-authored SVG: a navy gradient, a five-petal
 * blossom and the letters "ASJ". It was a placeholder, and it was what the
 * launcher, the install prompt and every browser tab showed — the company's
 * actual emblem appeared nowhere in the PWA surface.
 *
 * An SVG wrapper around the raster would not help: an SVG favicon must be
 * self-contained (browsers do not resolve external references inside it), so
 * the only option would be base64 — roughly 1.4× the bytes of the PNG it wraps,
 * for a file whose whole job is to be small. The PNGs below carry every size
 * the platform actually asks for, so the SVG was removed rather than kept
 * stale. `public/favicon.svg` was a byte-copy of it and went the same way.
 *
 * WHY TWO SCALES
 * --------------
 * The emblem is a CIRCLE that fills its square. Shown as-is that reads
 * correctly, so the standard icons are near-full-bleed (FULL). Android's
 * maskable crop, however, is a circle of 80% — a full-bleed emblem would lose
 * the outer ring that carries "PT AMANAH SAKURA JAPAN" and the Japanese
 * lettering. The maskable variant is therefore inset to SAFE, inside the safe
 * zone, on the theme background.
 *
 * Every output is composited onto #020617 rather than left transparent: that is
 * `theme_color` in the manifest, and iOS renders apple-touch-icon transparency
 * as black, which would put a black disc on a dark-navy launcher.
 *
 * Re-run manually when the emblem changes:  npm run icons:pwa
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ICON_DIR = 'public/icons';
const SRC = join(ICON_DIR, 'logo-asj.webp');
const BG = '#020617'; // manifest theme_color

/** Fraction of the canvas the emblem occupies. */
const FULL = 0.96; // standard icons — the emblem's own circle is the shape
const SAFE = 0.76; // maskable — must survive Android's 80% circular crop

/**
 * 8-bit palette PNG. Measured on icon-512 (this exact emblem):
 *
 *   truecolour RGBA   341.2 KB
 *   truecolour RGB    305.5 KB   (drop alpha — the canvas is already opaque)
 *   4-bit palette      32.4 KB   ← banded the gold; rejected, see below
 *   8-bit palette      99.5 KB   ← chosen
 *
 * The emblem is nearly flat — red ring, black field, gold ornament — so a
 * palette is the right tool, and 256 entries is where the gradients stop
 * stepping. It is not a guess: at 4-bit the laurel and the curl ornaments
 * posterise into visible flat bands, which was checked by cropping the gold at
 * 3× nearest-neighbour and looking at it. 3.4× smaller than truecolour for no
 * visible loss beats 10× smaller with the company's emblem visibly degraded on
 * someone's home screen.
 *
 * Note `colours` snaps to a palette BIT DEPTH, not a count: 8→2-bit,
 * 16..128→4-bit, 256→8-bit. Asking for `colours: 64` silently yields 16 colours.
 */
const PNG_OPTS = { compressionLevel: 9, palette: true, colours: 256 };

if (!existsSync(SRC)) {
  console.error(`[pwa-icons] ERROR: ${SRC} not found — the emblem source is required.`);
  process.exit(1);
}

const meta = await sharp(SRC).metadata();
if (meta.width !== meta.height) {
  console.error(
    `[pwa-icons] ERROR: source must be square, got ${meta.width}×${meta.height}. ` +
      'A non-square source would be letterboxed into every icon.',
  );
  process.exit(1);
}
if (!meta.hasAlpha) {
  // Not fatal, but it means the emblem will sit in its own opaque box.
  console.warn('[pwa-icons] WARNING: source has no alpha channel — expect a visible box.');
}

const jobs = [
  { out: 'icon-192.png', size: 192, scale: FULL },
  { out: 'icon-512.png', size: 512, scale: FULL },
  { out: 'icon-maskable-512.png', size: 512, scale: SAFE },
  { out: 'apple-touch-icon.png', size: 180, scale: FULL },
  { out: 'favicon-32.png', size: 32, scale: FULL },
];

console.log(`[pwa-icons] source  : ${SRC} (${meta.width}×${meta.height}, ${meta.format})`);
let ok = 0;
for (const { out, size, scale } of jobs) {
  const inner = Math.round(size * scale);
  const emblem = await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const dest = join(ICON_DIR, out);
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: emblem, gravity: 'center' }])
    .png(PNG_OPTS)
    .toFile(dest);

  // statSync, not sharp().metadata().size — metadata() does not report the file
  // size for every format, and the previous version of this script printed
  // "NaN KB" for all five icons because of it.
  const bytes = statSync(dest).size;
  console.log(
    `[pwa-icons] ${out.padEnd(24)} ${size}×${size}  emblem ${(scale * 100).toFixed(0)}%  ${(bytes / 1024).toFixed(1)} KB`,
  );
  ok++;
}

const total = jobs.reduce((n, j) => n + statSync(join(ICON_DIR, j.out)).size, 0);
console.log(`[pwa-icons] done — ${ok} PNGs written to ${ICON_DIR}/ (${(total / 1024).toFixed(1)} KB)`);
