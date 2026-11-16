/**
 * manifest.mjs — inventori + verifikasi seluruh isi asset library.
 *
 * Jalankan: node deliverables/asset-library/build/manifest.mjs
 *
 * Dibuat untuk melanjutkan sesi opencode yang terputus kuota (2026-11-15 16:59).
 * Skrip ini TIDAK menggenerate apa pun: ia membaca ukuran/dimensi/durasi berkas
 * yang SUDAH ada, menolak berkas kosong atau tak terbaca, lalu menulis
 * `manifest.json`. Jadi manifest tidak bisa mengklaim aset yang tidak ada.
 *
 * Semua path di manifest RELATIF terhadap `deliverables/asset-library/` supaya
 * folder ini bisa dipindah tanpa mengedit JSON.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const LIB = 'F:/astro/deliverables/asset-library';
const IMG = new Set(['.webp', '.jpg', '.jpeg', '.png']);
const VID = new Set(['.mp4', '.webm']);

/** Folder yang berisi bahan antara, bukan aset siap pakai. */
const INTERMEDIATE = /^(build|_[^/]*)$/;

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      // `build/` dan folder `_*` berisi skrip + bahan antara, bukan aset final.
      if (!INTERMEDIATE.test(e.name)) walk(p, out);
    } else if (IMG.has(extname(e.name).toLowerCase()) || VID.has(extname(e.name).toLowerCase())) {
      out.push(p);
    }
  }
  return out;
}

function kindOf(rel) {
  const parts = rel.split('/');
  if (parts[0] === 'stills') return { kind: 'still', aspect: parts[1] };
  if (parts[0] === 'og') return { kind: 'og', aspect: '1200x630' };
  if (parts[0] === 'overlays') return { kind: 'overlay', aspect: 'video' };
  if (parts[0] === 'motion') return { kind: 'motion', aspect: parts[1] };
  if (parts[0] === 'cards') return { kind: 'card', aspect: parts[1] };
  if (parts[0] === 'transitions') return { kind: 'transition', aspect: parts[1] };
  if (parts[0] === 'recap') return { kind: 'recap', aspect: '9x16' };
  if (parts[0] === 'contact') return { kind: 'contact-sheet', aspect: 'sheet' };
  return { kind: 'other', aspect: null };
}

function probeVideo(abs) {
  const raw = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,nb_frames,r_frame_rate,codec_name,pix_fmt',
    '-show_entries', 'format=duration', '-of', 'json', abs,
  ], { encoding: 'utf8' });
  const j = JSON.parse(raw);
  const s = j.streams?.[0] ?? {};
  const [num, den] = String(s.r_frame_rate ?? '0/1').split('/').map(Number);
  return {
    width: s.width ?? null,
    height: s.height ?? null,
    codec: s.codec_name ?? null,
    pixFmt: s.pix_fmt ?? null,
    frames: s.nb_frames ? Number(s.nb_frames) : null,
    fps: den ? Math.round((num / den) * 100) / 100 : null,
    duration: j.format?.duration ? Math.round(Number(j.format.duration) * 100) / 100 : null,
  };
}

const problems = [];
const assets = [];
for (const abs of walk(join(LIB)).sort()) {
  const rel = relative(LIB, abs).split('\\').join('/');
  const st = statSync(abs);
  if (st.size === 0) {
    problems.push(`${rel}: berkas kosong`);
    continue;
  }
  const base = { path: rel, bytes: st.size, ...kindOf(rel) };
  try {
    if (IMG.has(extname(abs).toLowerCase())) {
      const m = await sharp(abs).metadata();
      assets.push({ ...base, width: m.width ?? null, height: m.height ?? null, format: m.format });
      if (!m.width || !m.height) problems.push(`${rel}: dimensi gambar tidak terbaca`);
    } else {
      const v = probeVideo(abs);
      assets.push({ ...base, ...v, format: extname(abs).slice(1) });
      if (!v.width || !v.duration) problems.push(`${rel}: video tidak terbaca ffprobe`);
      if (v.duration && v.duration < 0.4) problems.push(`${rel}: durasi terlalu pendek (${v.duration}s)`);
    }
  } catch (e) {
    problems.push(`${rel}: GAGAL dibaca — ${e.message.split('\n')[0]}`);
  }
}

const byKind = {};
let totalBytes = 0;
for (const a of assets) {
  byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;
  totalBytes += a.bytes;
}

const manifest = {
  generatedAt: new Date().toISOString(),
  note: 'Semua aset diturunkan dari plate ASJ yang sudah ada (crop/grade/encode + kamera + overlay). Bukan render model baru; wajah model tetap sama.',
  source: 'public/assets/story/** + deliverables/story-3d/assets/**',
  totals: { assets: assets.length, bytes: totalBytes, byKind },
  verification: { problems, status: problems.length === 0 ? 'OK' : 'FAIL' },
  assets,
};
writeFileSync(join(LIB, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`manifest: ${assets.length} aset · ${(totalBytes / 1048576).toFixed(1)} MiB`);
for (const [k, n] of Object.entries(byKind).sort()) console.log(`  ${k.padEnd(14)} ${n}`);
console.log(`verifikasi: ${problems.length === 0 ? 'OK — 0 masalah' : `FAIL — ${problems.length} masalah`}`);
for (const p of problems) console.log(`  ! ${p}`);
if (problems.length) process.exitCode = 1;
