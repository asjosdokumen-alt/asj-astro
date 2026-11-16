/**
 * overlays.mjs — partikel (sakura/dust) + grain, sekali render, dipakai ulang.
 *
 * Kenapa overlay dirender terpisah: 14 klip tidak perlu menghitung ulang
 * lintasan partikel dari nol. Satu WebM alpha 12 detik dipakai semua klip,
 * jadi partikelnya konsisten dan encode klip tetap cepat.
 *
 * Dua orientasi dirender karena partikel yang jatuh di 9:16 tidak boleh
 * dipotong di 16:9 — kecepatan diskalakan ke tinggi frame.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { OUT, ensure, sharp } from './lib.mjs';

ensure(OUT.overlays);

const FPS = 30;
const DUR = 12;

/** Satu kelopak: teardrop lembut, bukan elips datar. */
function petalSvg(size, hue, alpha, seed) {
  const s = size;
  const c = s / 2;
  const tilt = (seed * 47) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <radialGradient id="g" cx="42%" cy="38%" r="62%">
      <stop offset="0" stop-color="hsl(${hue} 72% 92%)" stop-opacity="${alpha}"/>
      <stop offset="0.55" stop-color="hsl(${hue} 78% 82%)" stop-opacity="${alpha * 0.9}"/>
      <stop offset="1" stop-color="hsl(${hue} 70% 70%)" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <g transform="rotate(${tilt} ${c} ${c})">
    <path d="M ${c} ${s * 0.06}
      C ${s * 0.82} ${s * 0.1}, ${s * 0.96} ${s * 0.42}, ${c} ${s * 0.94}
      C ${s * 0.04} ${s * 0.42}, ${s * 0.18} ${s * 0.1}, ${c} ${s * 0.06} Z"
      fill="url(#g)"/>
    <path d="M ${c} ${s * 0.14} C ${c - s * 0.05} ${s * 0.4}, ${c - s * 0.04} ${s * 0.7}, ${c} ${s * 0.88}"
      stroke="hsl(${hue} 60% 96%)" stroke-opacity="${alpha * 0.55}" stroke-width="${s * 0.012}" fill="none"/>
  </g>
</svg>`;
}

const PETALS = [
  { size: 88, hue: 342, alpha: 0.38, x: 0.12, speed: 92, amp: 38, freq: 0.55, phase: 0.0 },
  { size: 58, hue: 346, alpha: 0.42, x: 0.22, speed: 130, amp: 26, freq: 0.8, phase: 1.2 },
  { size: 42, hue: 338, alpha: 0.32, x: 0.34, speed: 74, amp: 44, freq: 0.42, phase: 2.4 },
  { size: 70, hue: 350, alpha: 0.27, x: 0.46, speed: 108, amp: 30, freq: 0.66, phase: 3.1 },
  { size: 34, hue: 344, alpha: 0.38, x: 0.56, speed: 148, amp: 22, freq: 0.9, phase: 4.2 },
  { size: 102, hue: 340, alpha: 0.2, x: 0.68, speed: 60, amp: 52, freq: 0.38, phase: 5.0 },
  { size: 50, hue: 348, alpha: 0.34, x: 0.78, speed: 118, amp: 34, freq: 0.72, phase: 0.7 },
  { size: 38, hue: 336, alpha: 0.4, x: 0.9, speed: 138, amp: 20, freq: 0.84, phase: 2.0 },
  { size: 64, hue: 346, alpha: 0.24, x: 0.05, speed: 84, amp: 46, freq: 0.5, phase: 3.7 },
  { size: 30, hue: 352, alpha: 0.44, x: 0.62, speed: 160, amp: 18, freq: 1.0, phase: 4.8 },
];

const DUST = Array.from({ length: 26 }, (_, i) => ({
  size: 10 + ((i * 7) % 18),
  hue: 38,
  alpha: 0.16 + ((i * 13) % 9) / 100,
  x: ((i * 37) % 100) / 100,
  speed: 12 + ((i * 17) % 26),
  amp: 14 + ((i * 11) % 30),
  freq: 0.16 + ((i * 7) % 9) / 40,
  phase: (i * 1.7) % 6.28,
}));

async function buildOverlay(name, spec, W, H) {
  const inputs = [];
  const filters = [];
  const tmp = join(OUT.overlays, `_${name}-${W}x${H}`);
  ensure(tmp);
  const k = H / 1920;

  for (const [i, p] of spec.entries()) {
    const file = join(tmp, `p${String(i).padStart(2, '0')}.png`);
    const svg = petalSvg(p.size, p.hue, p.alpha, i + 1);
    await sharp(Buffer.from(svg)).blur(0.5).png().toFile(file);
    inputs.push('-loop', '1', '-framerate', String(FPS), '-t', String(DUR), '-i', file);
  }

  filters.push(`color=c=black@0.0:s=${W}x${H}:r=${FPS}:d=${DUR},format=rgba[base]`);
  let last = 'base';
  spec.forEach((p, i) => {
    const speed = (p.speed * k).toFixed(1);
    const y = `-${Math.round(H * 0.25)}+mod(t*${speed}+${(i * 337) % 1400}\\,${H + Math.round(H * 0.45)})`;
    const x = `W*${p.x}-w/2+${p.amp}*sin(t*${p.freq}+${p.phase})`;
    filters.push(`[${i}:v]format=rgba,scale=${p.size}:${p.size}[s${i}]`);
    filters.push(`[${last}][s${i}]overlay=x='${x}':y='${y}':eval=frame:format=auto[o${i}]`);
    last = `o${i}`;
  });
  filters.push(`[${last}]format=yuv420p[out]`);

  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[out]',
    '-c:v', 'libx264', '-crf', '24', '-preset', 'veryfast',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-an', join(OUT.overlays, `${name}-${W}x${H}.mp4`),
  ];
  const t0 = Date.now();
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  console.log(`  ${name}-${W}x${H} ${(Date.now() - t0) / 1000}s`);
}

for (const [W, H] of [[1080, 1920], [1920, 1080]]) {
  await buildOverlay('petals', PETALS, W, H);
  await buildOverlay('dust', DUST, W, H);
}

/* Grain: 1920x1080, loop 12 dtk. */
execFileSync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'lavfi', '-i', `nullsrc=s=1920x1080:r=30:d=${DUR}`,
  '-vf', 'noise=alls=7:allf=t,format=yuv420p',
  '-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast',
  '-an', join(OUT.overlays, 'grain-1920x1080.mp4'),
], { stdio: 'inherit' });

console.log('overlays selesai');

