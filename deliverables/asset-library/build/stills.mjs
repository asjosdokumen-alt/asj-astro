/**
 * stills.mjs — 5 rasio dari setiap plate + 2 grade alternatif untuk hero.
 *
 * Jalankan: node deliverables/asset-library/build/stills.mjs
 */
import { join } from 'node:path';
import {
  LIB, OUT, PLATES, PLATE, ensure, cropFocus, grade, writeWebp, sharp, clamp,
} from './lib.mjs';

ensure(OUT.stills);

const SIZES = [
  { key: '2x3', w: 1024, h: 1536, src: 'portrait', label: 'potret 2:3 — web' },
  { key: '3x2', w: 1536, h: 1024, src: 'wide', label: 'lanskap 3:2 — web' },
  { key: '9x16', w: 1080, h: 1920, src: 'portrait', label: 'vertikal 9:16 — reels/tiktok' },
  { key: '4x5', w: 1080, h: 1350, src: 'portrait', label: 'feed 4:5 — instagram' },
  { key: '1x1', w: 1080, h: 1080, src: 'portrait', label: 'persegi 1:1 — grid/thumbnail' },
];

const entries = [];

for (const plate of PLATES) {
  for (const s of SIZES) {
    const src = join(LIB, '..', '..', plate[s.src]);
    // fokus vertikal 9:16 perlu digeser ke arah model, bukan tengah frame
    const fy = s.key === '9x16' ? clamp(plate.fy + 0.02, 0.2, 0.8) : plate.fy;
    const pipe = await cropFocus(src, s.w, s.h, plate.fx, fy);
    const out = await writeWebp(await grade(pipe, plate.grade), `${s.key}/${plate.id}.webp`);
    entries.push({
      id: `${plate.id}-${s.key}`,
      kind: 'still',
      aspect: s.key,
      ...out,
      source: plate[s.src],
      focus: { x: plate.fx, y: Number(fy.toFixed(3)) },
      grade: plate.grade,
      label: `${plate.label} — ${s.label}`,
    });
    process.stdout.write(`  ${s.key}/${plate.id}.webp ${(out.bytes / 1024).toFixed(0)} KB\n`);
  }
}

/* ── OG 1200x630 per babak (JPG, bukan WebP: crawler lama) ───────────────── */
ensure(OUT.og);
for (const plate of PLATES) {
  const src = join(LIB, '..', '..', plate.wide);
  const pipe = await cropFocus(src, 1200, 630, 0.5, plate.fy * 0.9);
  const out = await grade(pipe, plate.grade).jpeg({ quality: 86, mozjpeg: true }).toFile(join(OUT.og, `${plate.id}.jpg`));
  entries.push({
    id: `${plate.id}-og`,
    kind: 'og',
    aspect: '1200x630',
    path: `og/${plate.id}.jpg`,
    bytes: out.size,
    width: out.width,
    height: out.height,
    source: plate.wide,
    label: `${plate.label} — kartu OG 1200×630`,
  });
  process.stdout.write(`  og/${plate.id}.jpg ${(out.size / 1024).toFixed(0)} KB\n`);
}

/* ── Dua alternatif suasana untuk hero (A/B & closing frame) ─────────────── */
const HERO = PLATE['00-hero'];
const heroSrc = join(LIB, '..', '..', HERO.portrait);
const variants = [
  { key: 'night', modulate: { brightness: 0.78, saturation: 0.82 }, recomb: [[0.9, 0.02, 0.02], [0.01, 0.94, 0.05], [0.04, 0.06, 1.16]] },
  { key: 'mono', mono: true },
];
for (const v of variants) {
  for (const s of [
    { key: '3x2', w: 1536, h: 1024, src: HERO.wide },
    { key: '9x16', w: 1080, h: 1920, src: HERO.portrait },
  ]) {
    const src = join(LIB, '..', '..', s.src);
    let pipe = await cropFocus(src, s.w, s.h, HERO.fx, HERO.fy);
    if (v.mono) pipe = pipe.greyscale().linear(1.04, -4);
    else {
      pipe = pipe.modulate(v.modulate).recomb(v.recomb);
    }
    const out = await writeWebp(pipe, `${s.key}/00-hero--${v.key}.webp`);
    entries.push({
      id: `00-hero--${v.key}-${s.key}`,
      kind: 'still',
      aspect: s.key,
      ...out,
      source: s.src,
      grade: v.key,
      label: `Hero — suasana ${v.key} (${s.key})`,
    });
    process.stdout.write(`  ${s.key}/00-hero--${v.key}.webp ${(out.bytes / 1024).toFixed(0)} KB\n`);
  }
}

/* ── Peta ukuran: satu file JSON kecil supaya UI lain bisa memakainya ────── */
const fs = await import('node:fs');
fs.writeFileSync(join(OUT.stills, 'index.json'), `${JSON.stringify({ sizes: SIZES, plates: PLATES }, null, 2)}\n`);

fs.writeFileSync(join(LIB, 'build', '.stills.json'), `${JSON.stringify(entries, null, 2)}\n`);
console.log(`\nstills: ${entries.filter((e) => e.kind === 'still').length} webp · ${entries.filter((e) => e.kind === 'og').length} og`);
