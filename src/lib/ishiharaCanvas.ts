/**
 * ishiharaCanvas.ts — generator plate Ishihara prosedural.
 *
 * KENAPA DIGAMBAR, BUKAN BERKAS GAMBAR
 * ------------------------------------
 * Tiga alasan, semuanya praktis:
 *   1. Plate Ishihara asli berhak cipta; menyalinnya ke `/public` bukan pilihan.
 *   2. Gambar statis bisa diintip lewat Inspect Element — nama berkasnya
 *      (`plate-9.webp`) sudah memberi tahu jawabannya.
 *   3. Kompresi WebP/JPEG menggeser spektrum jingga-hijau, dan plate yang
 *      warnanya bergeser berhenti mengukur apa pun.
 *
 * HASILNYA BUKAN ALAT DIAGNOSIS
 * -----------------------------
 * Ini saringan mandiri: titik, palet, dan ukurannya mendekati plate klinis,
 * tetapi tidak identik. Karena itu hasilnya dipakai untuk mengarahkan siswa
 * memeriksa mata, BUKAN untuk menyatakan buta warna.
 *
 * Warna diambil dari `PlateIshihara` (src/lib/tesSeleksi.ts) supaya kunci
 * jawaban dan gambarnya tidak bisa berbeda di dua tempat.
 */
import type { PlateIshihara } from './tesSeleksi';

/** PRNG deterministik — plate yang sama harus terlihat sama tiap render. */
function acak(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Geser terang-gelap satu warna hex; jitter membuat titik tidak terlihat rata. */
function jitter(hex: string, delta: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + delta));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + delta));
  const b = Math.max(0, Math.min(255, (n & 0xff) + delta));
  return `rgb(${r},${g},${b})`;
}

const UKURAN = 280;
const RADIUS = 128;

/**
 * Gambar satu plate ke `<canvas>`.
 *
 * Digit digambar dulu ke canvas tak terlihat: digit kiri dengan kanal merah,
 * digit kanan dengan kanal biru. Saat menaruh titik, warna titik dipilih dari
 * kanal mana yang ada di posisi itu — itulah yang membuat penderita protan
 * hanya melihat digit kanan dan deutan hanya digit kiri.
 */
export function gambarPlate(canvas: HTMLCanvasElement, plate: PlateIshihara, seed = plate.no * 7919): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = Math.min(2, Number(globalThis.devicePixelRatio) || 1);
  canvas.width = Math.round(UKURAN * dpr);
  canvas.height = Math.round(UKURAN * dpr);
  canvas.style.width = `${UKURAN}px`;
  canvas.style.height = `${UKURAN}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // ── 1. Peta digit ────────────────────────────────────────────────────────
  const off = document.createElement('canvas');
  off.width = UKURAN;
  off.height = UKURAN;
  const octx = off.getContext('2d');
  if (!octx) return;
  octx.fillStyle = '#000000';
  octx.fillRect(0, 0, UKURAN, UKURAN);
  octx.font = '900 150px system-ui, -apple-system, "Segoe UI", sans-serif';
  octx.textAlign = 'center';
  octx.textBaseline = 'middle';

  const duaDigit = plate.kategori === 'diagnostik' && plate.normal.length === 2;
  if (duaDigit) {
    octx.fillStyle = '#ff0000';
    octx.fillText(plate.normal[0], UKURAN / 2 - 44, UKURAN / 2 + 6);
    octx.fillStyle = '#0000ff';
    octx.fillText(plate.normal[1], UKURAN / 2 + 44, UKURAN / 2 + 6);
  } else {
    octx.fillStyle = '#ff0000';
    octx.fillText(plate.normal, UKURAN / 2, UKURAN / 2 + 6);
  }
  const peta = octx.getImageData(0, 0, UKURAN, UKURAN).data;

  // ── 2. Circle packing ────────────────────────────────────────────────────
  ctx.clearRect(0, 0, UKURAN, UKURAN);
  const rnd = acak(seed);
  const titik: { x: number; y: number; r: number }[] = [];
  const upaya = 5200;

  for (let i = 0; i < upaya; i += 1) {
    const r = 3.2 + rnd() * 6.4;
    const sudut = rnd() * Math.PI * 2;
    const jarak = Math.sqrt(rnd()) * (RADIUS - r);
    const x = UKURAN / 2 + Math.cos(sudut) * jarak;
    const y = UKURAN / 2 + Math.sin(sudut) * jarak;

    let bentrok = false;
    for (const t of titik) {
      const dx = x - t.x;
      const dy = y - t.y;
      if (dx * dx + dy * dy < (r + t.r + 1.1) * (r + t.r + 1.1)) {
        bentrok = true;
        break;
      }
    }
    if (bentrok) continue;
    titik.push({ x, y, r });

    const px = Math.min(UKURAN - 1, Math.max(0, Math.floor(x)));
    const py = Math.min(UKURAN - 1, Math.max(0, Math.floor(y)));
    const idx = (py * UKURAN + px) * 4;
    const kiri = peta[idx] > 128;
    const kanan = peta[idx + 2] > 128;

    let warna: string;
    if (kiri) warna = plate.angka[Math.floor(rnd() * plate.angka.length)];
    else if (kanan && plate.angka2) warna = plate.angka2[Math.floor(rnd() * plate.angka2.length)];
    else warna = plate.latar[Math.floor(rnd() * plate.latar.length)];

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = jitter(warna, Math.floor((rnd() - 0.5) * 20));
    ctx.fill();
  }
}

/**
 * Ukuran kanvas untuk tes Landolt. Dipisah supaya komponen tidak perlu tahu
 * soal DPR dan pembulatan.
 */
export function ukuranKanvasLandolt(px: number): number {
  return Math.max(80, Math.ceil(px + 24));
}
