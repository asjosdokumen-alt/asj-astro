/**
 * lib.mjs — sumber, fokus, dan helper untuk asset library.
 *
 * Semua aset di sini DITURUNKAN dari plate yang sudah ada di repo. Tidak ada
 * model generatif: setiap piksel berasal dari render ASJ yang sudah disetujui,
 * di-crop/di-grade/di-encode ulang. Itu yang membuat wajah model tetap sama.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const require = createRequire(import.meta.url);
export const sharp = require('sharp');

export const ROOT = 'F:/astro';
export const LIB = join(ROOT, 'deliverables/asset-library');
export const OUT = {
  stills: join(LIB, 'stills'),
  motion: join(LIB, 'motion'),
  cards: join(LIB, 'cards'),
  og: join(LIB, 'og'),
  overlays: join(LIB, 'overlays'),
  transitions: join(LIB, 'transitions'),
  recap: join(LIB, 'recap'),
  contact: join(LIB, 'contact'),
};

/**
 * `fx`/`fy` = titik fokus (0..1) di plate PORTRET. Dipakai untuk memilih
 * jendela crop, bukan ditebak tengah: wajah model tidak berada di tengah
 * frame di 01/02/06.
 */
export const PLATES = [
  {
    id: '00-hero',
    label: 'Berangkat — potret model',
    portrait: 'deliverables/story-3d/assets/00-hero.png',
    wide: 'deliverables/story-3d/assets/wide/00-hero.webp',
    fx: 0.52,
    fy: 0.42,
    place: 'outdoor',
    grade: 'dusk',
  },
  {
    id: '01-daftar',
    label: 'Pendaftaran — mengisi formulir',
    portrait: 'public/assets/story/01-daftar.webp',
    wide: 'public/assets/story/wide/01-daftar.webp',
    fx: 0.56,
    fy: 0.36,
    place: 'indoor',
    grade: 'warm',
  },
  {
    id: '02-latihan',
    label: 'Pelatihan — kelas bahasa',
    portrait: 'public/assets/story/02-latihan.webp',
    wide: 'public/assets/story/wide/02-latihan.webp',
    fx: 0.6,
    fy: 0.4,
    place: 'indoor',
    grade: 'warm',
  },
  {
    id: '03-wawancara',
    label: 'Wawancara — putih hitam',
    portrait: 'public/assets/story/03-wawancara.webp',
    wide: 'public/assets/story/wide/03-wawancara.webp',
    fx: 0.53,
    fy: 0.43,
    place: 'indoor',
    grade: 'cool',
  },
  {
    id: '04-paspor',
    label: 'Paspor — dokumen',
    portrait: 'public/assets/story/04-paspor.webp',
    wide: 'public/assets/story/wide/04-paspor.webp',
    fx: 0.52,
    fy: 0.4,
    place: 'indoor',
    grade: 'warm',
  },
  {
    id: '05-mcu',
    label: 'MCU — tanda tangan kontrak',
    portrait: 'public/assets/story/05-mcu.webp',
    wide: 'public/assets/story/wide/05-mcu.webp',
    fx: 0.55,
    fy: 0.58,
    place: 'indoor',
    grade: 'warm',
  },
  {
    id: '05-terbang',
    label: 'Keberangkatan — bandara',
    portrait: 'deliverables/story-3d/assets/05-terbang.png',
    wide: 'deliverables/story-3d/assets/wide/05-terbang.webp',
    fx: 0.55,
    fy: 0.45,
    place: 'outdoor',
    grade: 'cool',
  },
  {
    id: '06-tiba',
    label: 'Tiba di Jepang — kimono',
    portrait: 'public/assets/story/06-tiba.webp',
    wide: 'public/assets/story/wide/06-tiba.webp',
    fx: 0.47,
    fy: 0.55,
    place: 'outdoor',
    grade: 'dusk',
  },
];

export const PLATE = Object.fromEntries(PLATES.map((p) => [p.id, p]));

export function ensure(...dirs) {
  for (const d of dirs) mkdirSync(d, { recursive: true });
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/** Crop jendela dengan fokus, lalu resize ke target. Semua piksel asli. */
export async function cropFocus(src, tw, th, fx = 0.5, fy = 0.5, opts = {}) {
  const img = sharp(src).rotate();
  const meta = await img.metadata();
  const sw = meta.width;
  const sh = meta.height;
  const targetRatio = tw / th;
  let cw = sw;
  let ch = sh;
  if (sw / sh > targetRatio) cw = Math.round(sh * targetRatio);
  else ch = Math.round(sw / targetRatio);
  const left = clamp(Math.round(fx * sw - cw / 2), 0, sw - cw);
  const top = clamp(Math.round(fy * sh - ch / 2), 0, sh - ch);
  let out = sharp(src).rotate().extract({ left, top, width: cw, height: ch }).resize(tw, th, {
    fit: 'fill',
    kernel: 'lanczos3',
  });
  if (opts.sharpen !== false && tw > cw * 1.15) out = out.sharpen({ sigma: 0.6, m1: 0.4, m2: 0.9 });
  return out;
}

const GRADE_MATRIX = {
  // R, G, B rows. Subtle, diukur dari palet panggung (navy + magenta).
  warm: [
    [1.06, 0.02, 0.0],
    [0.01, 1.0, 0.0],
    [0.0, 0.01, 0.94],
  ],
  cool: [
    [0.94, 0.0, 0.02],
    [0.0, 0.99, 0.02],
    [0.0, 0.02, 1.08],
  ],
  dusk: [
    [1.04, 0.01, 0.02],
    [0.01, 0.99, 0.02],
    [0.02, 0.01, 1.04],
  ],
};

export function grade(pipeline, kind) {
  if (!kind) return pipeline;
  const m = GRADE_MATRIX[kind];
  return pipeline.recomb(m);
}

export const WEBP = { quality: 82, effort: 5, smartSubsample: true };

export async function writeWebp(pipeline, relPath) {
  const abs = join(OUT.stills, relPath);
  ensure(dirname(abs));
  const info = await pipeline.webp(WEBP).toFile(abs);
  return { path: relPath, bytes: info.size, width: info.width, height: info.height };
}

export function rel(p) {
  return relative(LIB, p).replaceAll('\\', '/');
}

export function saveManifest(entries, extra = {}) {
  const manifest = {
    generatedAt: new Date().toISOString(),
    note: 'Turunan dari plate ASJ yang ada (crop/grade/encode), bukan render baru.',
    ...extra,
    assets: entries,
  };
  writeFileSync(join(LIB, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function exists(p) {
  return existsSync(p);
}
