#!/usr/bin/env node
/**
 * _build-art.mjs — rapikan master hasil generate menjadi aset siap pakai.
 *
 * Dijalankan: node deliverables/game-design/art/_build-art.mjs
 *
 * Kenapa ada skrip ini:
 *  1. Generator gambar menaruh watermark di pojok kanan bawah. Master disimpan
 *     utuh di `_masters/`, sedangkan yang dikirim ke game adalah hasil crop.
 *  2. Game mobile tidak butuh 1024x1536 PNG. Semua diturunkan ke WebP 720 px.
 *  3. Lembar ikon dipotong jadi 12 ikon 192 px + satu atlas 4x3, supaya Godot
 *     bisa mengimpor SATU tekstur dengan 12 region, bukan 12 berkas terpisah.
 *
 * Tidak ada teks/kanji di dalam gambar: semua tulisan tetap dirender sebagai
 * teks oleh host (DOM) atau font di Godot.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from '../../../node_modules/sharp/lib/index.js';

const ART = 'F:/astro/deliverables/game-design/art';
const MASTERS = join(ART, '_masters');
const ITEMS = join(ART, 'items');
mkdirSync(MASTERS, { recursive: true });
mkdirSync(ITEMS, { recursive: true });

/** Master → nama aset. Kunci = potongan nama berkas hasil generate. */
const KEY_ART = [
  { key: 'T12-05-28', name: 'genba-bg', cropBottom: 0.07 },
  { key: 'T12-05-44', name: 'combo-bg', cropBottom: 0.07 },
  { key: 'T12-05-58', name: 'kotoba-garden', cropBottom: 0.07 },
  { key: 'T12-06-13', name: 'figural-bg', cropBottom: 0.07 },
];
const SHEET = 'T12-07-56';
const NAMA_IKON = [
  'helm', 'kardus', 'botol', 'kunci-pas',
  'sarung-tangan', 'papan-jepit', 'sapu', 'kotak-alat',
  'apron', 'meteran', 'gerobak', 'peti',
];

const png = readdirSync(ART).filter((f) => f.endsWith('.png'));
for (const f of png) {
  const tujuan = join(MASTERS, f);
  if (!existsSync(tujuan)) renameSync(join(ART, f), tujuan);
}
const master = readdirSync(MASTERS).filter((f) => f.endsWith('.png'));
const cari = (k) => {
  const f = master.find((n) => n.includes(k));
  if (!f) throw new Error(`master tidak ketemu: ${k}`);
  return join(MASTERS, f);
};

async function keyArt({ key, name, cropBottom }) {
  const src = cari(key);
  const meta = await sharp(src).metadata();
  const h = Math.floor(meta.height * (1 - cropBottom));
  await sharp(src)
    .extract({ left: 0, top: 0, width: meta.width, height: h })
    .resize({ width: 720, withoutEnlargement: true })
    .webp({ quality: 82, effort: 6 })
    .toFile(join(ART, `${name}.webp`));
  console.log(`${name}.webp  <- ${meta.width}x${meta.height} crop ${h}`);
}

/** Grid 4x3 diukur dari master: mulai x=45 y=38, sel 234x232. */
const GX = 45, GY = 38, CW = 234, CH = 232, OUT = 192;
async function iconSheet() {
  const src = cari(SHEET);
  const cells = [];
  for (let i = 0; i < 12; i++) {
    const col = i % 4, row = Math.floor(i / 4);
    const buf = await sharp(src)
      .extract({ left: GX + col * CW, top: GY + row * CH, width: CW, height: CH })
      .resize(OUT, OUT, { fit: 'contain', background: '#101a2e' })
      .webp({ quality: 88, effort: 6 })
      .toBuffer();
    writeFileSync(join(ITEMS, `${NAMA_IKON[i]}.webp`), buf);
    cells.push({ input: buf, left: col * OUT, top: row * OUT });
  }
  await sharp({ create: { width: OUT * 4, height: OUT * 3, channels: 3, background: '#101a2e' } })
    .composite(cells)
    .webp({ quality: 86, effort: 6 })
    .toFile(join(ART, 'item-atlas.webp'));
  console.log(`item-atlas.webp (${OUT * 4}x${OUT * 3}) + 12 ikon ${OUT}px`);
}

/** Swatch palet: satu-satunya berkas yang ditulis tangan, bukan hasil AI. */
const PALET = [
  ['#101a2e', 'navy / latar'], ['#1b2740', 'navy naik'],
  ['#ff8fbf', 'sakura'], ['#f5b942', 'amber'],
  ['#34d399', 'emerald'], ['#fdf6ec', 'krem'],
];
const swatch = PALET.map(([c, n], i) => {
  const x = 20 + (i % 3) * 210, y = 20 + Math.floor(i / 3) * 90;
  return `<rect x="${x}" y="${y}" width="190" height="56" rx="8" fill="${c}" stroke="#f5b942" stroke-width="1"/>` +
    `<text x="${x + 8}" y="${y + 76}" font-family="sans-serif" font-size="12" fill="#fdf6ec">${c} · ${n}</text>`;
}).join('');
writeFileSync(join(ART, 'palet.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" width="650" height="200" viewBox="0 0 650 200">` +
  `<rect width="650" height="200" rx="12" fill="#101a2e"/>${swatch}</svg>`);

for (const k of KEY_ART) await keyArt(k);
await iconSheet();
console.log('selesai — master ber-watermark tetap di _masters/, yang dipakai game ada di art/');
