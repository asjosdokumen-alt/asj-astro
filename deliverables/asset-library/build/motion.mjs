/**
 * motion.mjs — 16 klip 10 detik (16:9 + 9:16) + 4 klip situs 5 detik.
 *
 * Resep kamera per babak ditulis di MOVE, bukan dipilih acak: arah gerak
 * mengikuti isi frame (06 = pull-out untuk membuka Gunung Fuji; 02 = push-in
 * ke papan tulis; 01/05-terbang = pan mendatar).
 *
 * Loop-safe: zoom memakai sin(PI*on/N) dan pan memakai sin(2*PI*on/N), jadi
 * frame terakhir kembali ke posisi frame pertama.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { OUT, PLATE, ensure, clamp } from './lib.mjs';

ensure(OUT.motion, join(OUT.motion, '16x9'), join(OUT.motion, '9x16'), join(OUT.motion, 'site'));

const FPS = 30;
const DUR = 10;
const N = FPS * DUR;

const MOVE = {
  '00-hero': { type: 'push', amp: 0.05, overlay: 'petals' },
  '01-daftar': { type: 'pan', amp: 0.012, overlay: 'dust' },
  '02-latihan': { type: 'push', amp: 0.045, overlay: 'dust' },
  '03-wawancara': { type: 'pull', amp: 0.05, overlay: 'dust' },
  '04-paspor': { type: 'rise', amp: 0.012, overlay: 'dust' },
  '05-mcu': { type: 'push', amp: 0.05, overlay: 'dust' },
  '05-terbang': { type: 'pan', amp: 0.014, overlay: 'petals' },
  '06-tiba': { type: 'pull', amp: 0.055, overlay: 'petals' },
};

/**
 * 06-tiba punya dua plate yang berbeda komposisi: portrait = profil model
 * menghadap Fuji (senja), wide = gang dengan pilar gelap selebar 38% frame.
 * Untuk 16:9, plate portrait yang dipakai — pilar itu terbaca sebagai bar
 * hitam di layar ponsel, bukan foreground yang disengaja.
 */
const WIDE_SOURCE = {
  '06-tiba': { file: 'public/assets/story/06-tiba.webp', fx: 0.5, fy: 0.48 },
};

function zoomExpr(type, amp) {
  const tri = `(0.5-0.5*cos(2*PI*on/${N}))`;
  if (type === 'pull') return `1.0+${amp}*(1-${tri})`;
  if (type === 'push') return `1.0+${amp}*${tri}`;
  return `1.03`;
}

function panExpr(type, amp) {
  if (type === 'pan') return { px: amp, py: 0, xf: 'sin(2*PI*on/N)', yf: '0' };
  if (type === 'rise') return { px: 0, py: amp, xf: '0', yf: '-sin(2*PI*on/N)' };
  return { px: 0, py: 0, xf: '0', yf: '0' };
}

function buildClip({ id, aspect, still, out, W, H, dur, fps, crf, overlay, move, focus }) {
  const plate = PLATE[id];
  const fx = clamp(focus?.fx ?? plate.fx, 0.15, 0.85);
  const fy = clamp(focus?.fy ?? plate.fy, 0.2, 0.8);
  const n = fps * dur;
  const base = move.base ?? 1.03;
  const z = zoomExpr(move.type, move.amp);
  const { px, py, xf, yf } = panExpr(move.type, move.amp);
  const panPx = Math.round(px * W);
  const panPy = Math.round(py * H);

  const cam = [
    `scale=${W}:${H}:force_original_aspect_ratio=increase`,
    `crop=${W}:${H}`,
  ];
  // zoompan membaca `on` (frame keluaran). Base 1.03 memberi ruang gerak pan.
  cam.push(
    `zoompan=z='${z.replaceAll('/N', `/${n}`)}':` +
      `x='max(0,min(iw-iw/zoom,iw*${fx}-(iw/zoom/2)${panPx ? `+${panPx}*${xf.replaceAll('/N', `/${n}`)}` : ''}))':` +
      `y='max(0,min(ih-ih/zoom,ih*${fy}-(ih/zoom/2)${panPy ? `+${panPy}*${yf.replaceAll('/N', `/${n}`)}` : ''}))':` +
      `d=${n}:fps=${fps}:s=${W}x${H}`,
  );
  cam.push('eq=contrast=1.025:saturation=1.03');
  cam.push('vignette=PI/5.5');

  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', still, '-t', String(dur)];
  const filters = [`[0:v]${cam.join(',')}[base]`];
  let video = 'base';

  if (overlay && move.overlay !== 'none') {
    const ov = join(OUT.overlays, `${move.overlay}-${W}x${H}.mp4`);
    args.push('-stream_loop', '-1', '-i', ov);
    // PENTING: `blend` bekerja per-PLANE. Kalau diberi yuv420p, plane U/V
    // (chroma netral 128) ikut di-screen menjadi ~192, dan seluruh frame jadi
    // magenta. `gbrp` = planar RGB: tiga plane-nya benar-benar R/G/B, jadi
    // screen di sini secara matematis sama dengan screen di Photoshop.
    filters.push(`[1:v]format=gbrp[ov]`);
    filters.push(`[base]format=gbrp[bb]`);
    filters.push(`[bb][ov]blend=all_mode=screen:shortest=1[ovl]`);
    video = 'ovl';
  }

  filters.push(`[${video}]noise=alls=4:allf=t,format=yuv420p[out]`);

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '[out]',
    '-r', String(fps),
    '-c:v', 'libx264', '-crf', String(crf), '-preset', 'medium',
    '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an', out,
  );

  const t0 = Date.now();
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
  return { id, aspect, path: out, ms: Date.now() - t0, W, H, dur };
}

const built = [];
for (const [id, move] of Object.entries(MOVE)) {
  const wide = WIDE_SOURCE[id];
  const variants = [
    {
      aspect: '16x9',
      still: wide ? join('F:/astro', wide.file) : join(OUT.stills, '3x2', `${id}.webp`),
      focus: wide ? { fx: wide.fx, fy: wide.fy } : undefined,
      out: join(OUT.motion, '16x9', `${id}.mp4`),
      W: 1920,
      H: 1080,
    },
    { aspect: '9x16', still: join(OUT.stills, '9x16', `${id}.webp`), out: join(OUT.motion, '9x16', `${id}.mp4`), W: 1080, H: 1920 },
  ];
  for (const v of variants) {
    const r = buildClip({ id, ...v, dur: DUR, fps: FPS, crf: 25, overlay: true, move });
    built.push(r);
    console.log(`  ${v.aspect}/${id}.mp4 ${(r.ms / 1000).toFixed(1)}s`);
  }
}

/* ── Klip situs 5 detik: melengkapi babak 03 & 04 yang masih still ───────── */
const SITE = [
  { id: '03-wawancara', aspect: 'portrait', W: 800, H: 1076, crf: 26 },
  { id: '03-wawancara', aspect: 'wide', W: 1248, H: 664, crf: 26 },
  { id: '04-paspor', aspect: 'portrait', W: 800, H: 1076, crf: 26 },
  { id: '04-paspor', aspect: 'wide', W: 1248, H: 664, crf: 26 },
];
for (const s of SITE) {
  const still = join(OUT.stills, s.aspect === 'portrait' ? '9x16' : '3x2', `${s.id}.webp`);
  const out = join(OUT.motion, 'site', `${s.aspect === 'portrait' ? '' : 'wide-'}${s.id}.mp4`);
  const r = buildClip({
    id: s.id, aspect: s.aspect, still, out, W: s.W, H: s.H, dur: 5, fps: 24, crf: s.crf,
    overlay: false, move: MOVE[s.id],
  });
  built.push(r);
  console.log(`  site/${s.aspect}-${s.id}.mp4 ${(r.ms / 1000).toFixed(1)}s`);
}

writeFileSync(join(OUT.motion, 'index.json'), `${JSON.stringify(built, null, 2)}\n`);
console.log(`\nmotion: ${built.length} klip`);

