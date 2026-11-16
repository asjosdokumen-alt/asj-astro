/**
 * transitions.mjs — 5 transisi 2 detik × 2 orientasi + recap 9:16 ±45 detik.
 *
 * Jalankan: node deliverables/asset-library/build/transitions.mjs
 *
 * Transisi dibuat di atas dasar HITAM, sama seperti `overlays/*.mp4`: dipakai
 * dengan blend `screen`/`add` di editor, atau sebagai selingan potong antar
 * babak. Tidak ada aset baru dari model generatif — partikelnya memakai ulang
 * overlay yang sudah dirender `overlays.mjs`.
 *
 * Recap menyambung 8 klip 9:16 dengan 7 crossfade 0,5 dtk: 8×6 − 7×0,5 =
 * 44,5 detik. Ambil 6 detik TENGAH tiap klip (mulai detik ke-2) supaya efek
 * loop kamera tidak terlihat dua kali.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const LIB = 'F:/astro/deliverables/asset-library';
const OVERLAYS = join(LIB, 'overlays');
const TRANS = join(LIB, 'transitions');
const MOTION = join(LIB, 'motion');
const RECAP = join(LIB, 'recap');
const SRC = join(TRANS, '_src');
mkdirSync(SRC, { recursive: true });

const FPS = 30;
const DUR = 2;
const ORIENT = [
  { key: '16x9', W: 1920, H: 1080 },
  { key: '9x16', W: 1080, H: 1920 },
];

const COMMON = [
  '-y', '-hide_banner', '-loglevel', 'error',
];
const ENCODE = [
  '-c:v', 'libx264', '-crf', '24', '-preset', 'veryfast',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
];

/** SVG → PNG rgba. Gradisinya berujung transparan supaya bisa di-overlay. */
async function gradientPng(name, svg, W, H) {
  const p = join(SRC, `${name}-${W}x${H}.png`);
  await sharp(Buffer.from(svg)).resize(W, H).png().toFile(p);
  return p;
}

function radialSvg(W, H, cx, cy, r, rgb, a) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><radialGradient id="g" cx="${cx}" cy="${cy}" r="${r}">
    <stop offset="0" stop-color="${rgb}" stop-opacity="${a}"/>
    <stop offset="0.42" stop-color="${rgb}" stop-opacity="${a * 0.55}"/>
    <stop offset="1" stop-color="${rgb}" stop-opacity="0"/>
  </radialGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/></svg>`;
}

function bandSvg(W, H, rgb, a) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="${rgb}" stop-opacity="0"/>
    <stop offset="0.32" stop-color="${rgb}" stop-opacity="${a}"/>
    <stop offset="0.5" stop-color="${rgb}" stop-opacity="${a * 1.2}"/>
    <stop offset="0.68" stop-color="${rgb}" stop-opacity="${a}"/>
    <stop offset="1" stop-color="${rgb}" stop-opacity="0"/>
  </linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/></svg>`;
}

async function buildTransitions({ W, H, key }) {
  const outDir = join(TRANS, key);
  mkdirSync(outDir, { recursive: true });
  const fade = 'fade=t=in:st=0:d=0.35,fade=t=out:st=1.55:d=0.45';
  const black = ['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${FPS}:d=${DUR}`];
  const loopPng = (p) => ['-loop', '1', '-framerate', String(FPS), '-t', String(DUR), '-i', p];

  const flash = await gradientPng('flash', radialSvg(W, H, 0.5, 0.5, 0.62, '#f9a8d4', 0.95), W, H);
  const band = await gradientPng('band', bandSvg(W, H, '#f472b6', 0.85), W, H);
  const leak = await gradientPng('leak', radialSvg(W, H, 0.82, 0.2, 0.7, '#fbbf24', 0.8), W, H);

  const jobs = [
    {
      id: '01-petal-sweep',
      args: ['-stream_loop', '-1', '-i', join(OVERLAYS, `petals-${W}x${H}.mp4`), '-t', String(DUR),
        '-vf', `fps=${FPS},scale=${W}:${H},eq=brightness=0.05,${fade},format=yuv420p`],
    },
    {
      id: '02-dust-dissolve',
      args: ['-stream_loop', '-1', '-i', join(OVERLAYS, `dust-${W}x${H}.mp4`), '-t', String(DUR),
        '-vf', `fps=${FPS},scale=${W}:${H},eq=brightness=0.08,${fade},format=yuv420p`],
    },
    {
      id: '03-sakura-flash',
      args: [...black, ...loopPng(flash), '-filter_complex',
        `[1:v]format=rgba[g];[0:v][g]overlay=x=0:y=0:eval=frame,${fade},format=yuv420p[out]`,
        '-map', '[out]'],
    },
    {
      id: '04-ink-wipe',
      args: [...black, ...loopPng(band), '-filter_complex',
        `[1:v]format=rgba[g];[0:v][g]overlay=x='-${W}+${W}*t':y=0:eval=frame,${fade},format=yuv420p[out]`,
        '-map', '[out]'],
    },
    {
      id: '05-light-leak',
      args: [...black, ...loopPng(leak), '-filter_complex',
        `[1:v]format=rgba[g];[0:v][g]overlay=x='70*t':y='50*t':eval=frame,${fade},format=yuv420p[out]`,
        '-map', '[out]'],
    },
  ];

  for (const j of jobs) {
    const out = join(outDir, `${j.id}.mp4`);
    execFileSync('ffmpeg', [...COMMON, ...j.args, '-r', String(FPS), ...ENCODE, out]);
    console.log(`  ${key}/${j.id}.mp4`);
  }
}

function buildRecap() {
  mkdirSync(RECAP, { recursive: true });
  const ids = ['00-hero', '01-daftar', '02-latihan', '03-wawancara', '04-paspor', '05-mcu', '05-terbang', '06-tiba'];
  const CLIP = 6;
  const XF = 0.5;
  const args = [...COMMON];
  const filters = [];
  ids.forEach((id, i) => {
    args.push('-ss', '2', '-t', String(CLIP), '-i', join(MOTION, '9x16', `${id}.mp4`));
    filters.push(`[${i}:v]setpts=PTS-STARTPTS,fps=${FPS},scale=1080:1920,setsar=1,format=yuv420p[v${i}]`);
  });
  let last = 'v0';
  for (let j = 1; j < ids.length; j += 1) {
    const out = `x${j}`;
    filters.push(`[${last}][v${j}]xfade=transition=fade:duration=${XF}:offset=${(5.5 * j).toFixed(2)}[${out}]`);
    last = out;
  }
  const total = ids.length * CLIP - (ids.length - 1) * XF;
  filters.push(`[${last}]fade=t=in:st=0:d=0.5,fade=t=out:st=${(total - 0.6).toFixed(2)}:d=0.6,format=yuv420p[out]`);
  const out = join(RECAP, 'satu-jalan-9x16.mp4');
  execFileSync('ffmpeg', [...args, '-filter_complex', filters.join(';'), '-map', '[out]',
    '-r', String(FPS), '-c:v', 'libx264', '-crf', '24', '-preset', 'medium',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out], { stdio: 'inherit' });
  console.log(`  recap/satu-jalan-9x16.mp4 ${total.toFixed(1)} dtk`);
}

for (const o of ORIENT) await buildTransitions(o);
buildRecap();
console.log('\ntransisi: 10 klip · recap: 1 klip');
