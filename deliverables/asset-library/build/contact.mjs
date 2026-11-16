/**
 * contact.mjs — 8 lembar kontak (satu gambar per kategori aset).
 *
 * Jalankan: node deliverables/asset-library/build/contact.mjs
 *
 * Untuk video, satu frame diambil dengan ffmpeg ke `contact/_frames/` (bahan
 * antara, tidak masuk manifest). Semua lembar diberi label nama berkas supaya
 * pemilik bisa menunjuk aset tanpa membuka 100+ berkas satu per satu.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const LIB = 'F:/astro/deliverables/asset-library';
const CONTACT = join(LIB, 'contact');
const FRAMES = join(CONTACT, '_frames');
mkdirSync(FRAMES, { recursive: true });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ids = ['00-hero', '01-daftar', '02-latihan', '03-wawancara', '04-paspor', '05-mcu', '05-terbang', '06-tiba'];
const transIds = ['01-petal-sweep', '02-dust-dissolve', '03-sakura-flash', '04-ink-wipe', '05-light-leak'];

/** Satu frame tengah dari klip — detik ke-3 untuk 10 dtk, ke-1 untuk 2 dtk. */
function frame(rel, name, at, W, H) {
  const out = join(FRAMES, `${name}.png`);
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-ss', String(at), '-i', join(LIB, rel), '-frames:v', '1',
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`,
    out]);
  return out;
}

function textSvg(w, h, text, size, color, weight = 'normal') {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="none"/>
  <text x="0" y="${Math.round(h * 0.72)}" font-family="Arial,Helvetica,sans-serif"
    font-size="${size}" font-weight="${weight}" fill="${color}">${esc(text)}</text></svg>`);
}

async function sheet({ title, entries, cols, cellW, cellH, out }) {
  const gap = 18;
  const pad = 28;
  const labelH = 30;
  const headerH = 76;
  const rows = Math.ceil(entries.length / cols);
  const W = pad * 2 + cols * cellW + (cols - 1) * gap;
  const H = headerH + pad + rows * (cellH + labelH + gap);
  const layers = [
    { input: textSvg(W - pad * 2, 52, title, 30, '#f9a8d4', 'bold'), left: pad, top: 14 },
    { input: textSvg(W - pad * 2, 26, `${entries.length} aset · ${title}`, 15, '#94a3b8'), left: pad, top: 50 },
  ];
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    const left = pad + (i % cols) * (cellW + gap);
    const top = headerH + Math.floor(i / cols) * (cellH + labelH + gap);
    const thumb = await sharp(e.file).resize(cellW, cellH, { fit: 'cover' }).png().toBuffer();
    layers.push({ input: thumb, left, top });
    layers.push({ input: textSvg(cellW, labelH, e.label, 15, '#e2e8f0'), left, top: top + cellH + 4 });
  }
  const info = await sharp({ create: { width: W, height: H, channels: 3, background: '#0f172a' } })
    .composite(layers).webp({ quality: 84, effort: 5 }).toFile(join(CONTACT, out));
  console.log(`  ${out} ${info.width}×${info.height} ${(info.size / 1024).toFixed(0)} KB`);
}

/* ── stills ─────────────────────────────────────────────────────────────── */
await sheet({
  title: 'STILLS · lanskap 3:2', out: 'stills-3x2.webp', cols: 4, cellW: 440, cellH: 293,
  entries: ids.map((id) => ({ file: join(LIB, 'stills/3x2', `${id}.webp`), label: id })),
});
await sheet({
  title: 'STILLS · vertikal 9:16', out: 'stills-9x16.webp', cols: 4, cellW: 220, cellH: 391,
  entries: ids.map((id) => ({ file: join(LIB, 'stills/9x16', `${id}.webp`), label: id })),
});
await sheet({
  title: 'OG · kartu 1200×630', out: 'og.webp', cols: 4, cellW: 440, cellH: 231,
  entries: ids.map((id) => ({ file: join(LIB, 'og', `${id}.jpg`), label: id })),
});

/* ── motion ─────────────────────────────────────────────────────────────── */
await sheet({
  title: 'MOTION · 16:9 (frame detik 3)', out: 'motion-16x9.webp', cols: 4, cellW: 440, cellH: 248,
  entries: ids.map((id) => ({ file: frame(`motion/16x9/${id}.mp4`, `16x9-${id}`, 3, 440, 248), label: id })),
});
await sheet({
  title: 'MOTION · 9:16 (frame detik 3)', out: 'motion-9x16.webp', cols: 4, cellW: 220, cellH: 391,
  entries: ids.map((id) => ({ file: frame(`motion/9x16/${id}.mp4`, `9x16-${id}`, 3, 220, 391), label: id })),
});

/* ── cards ──────────────────────────────────────────────────────────────── */
for (const ratio of ['4x5', '9x16']) {
  const files = ['01-01-daftar', '02-02-latihan', '03-03-wawancara', '04-04-paspor',
    '05-05-mcu', '06-05-terbang', 'manifesto', 'cta'];
  await sheet({
    title: `CARDS · ${ratio}`, out: `cards-${ratio}.webp`, cols: 4,
    cellW: ratio === '4x5' ? 260 : 200, cellH: ratio === '4x5' ? 325 : 356,
    entries: files.map((f) => ({ file: join(LIB, 'cards', ratio, `${f}.webp`), label: f })),
  });
}

/* ── transisi ───────────────────────────────────────────────────────────── */
await sheet({
  title: 'TRANSITIONS · 16:9 (frame detik 1)', out: 'transitions-16x9.webp', cols: 5, cellW: 330, cellH: 186,
  entries: transIds.map((id) => ({ file: frame(`transitions/16x9/${id}.mp4`, `t16-${id}`, 1, 330, 186), label: id })),
});

console.log('\ncontact: 8 lembar');
