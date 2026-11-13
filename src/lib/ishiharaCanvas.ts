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
 * ── KENAPA DIGANTI 2026-11-13 ───────────────────────────────────────────────
 * Versi pertama mengambil warna titik dari SATU PIXEL di pusat titik. Akibatnya
 * angka pada plate hanya berupa "stempel" titik: garis yang lebarnya dua titik
 * hilang, ujung angka membulat, dan `1`/`7`/`9` terbaca sebagai gumpalan. Pemilik
 * melaporkannya apa adanya: *"gambarnya gak bener ya itu gak jelas banget buta
 * warnanya dan beda kali kek yg di tes online"*.
 *
 * Versi ini menilai CAKUPAN: tiap titik diperiksa di 13 sampel di dalam
 * lingkarannya, lalu dirata-rata terhadap topeng glyph. Titik di tepi angka
 * (cakupan 0,3–0,6) diputuskan secara acak-deterministik supaya tepinya tetap
 * organik seperti plate cetak, bukan bertangga. Titiknya juga diperkecil
 * (r 2,4–5,4 px, dulu 3,2–9,6) sehingga satu goresan angka selebar ~20 px
 * ditutup 4–6 titik, bukan 2.
 *
 * Yang TIDAK berubah: warna tetap diambil dari `PlateIshihara`
 * (`src/lib/tesSeleksi.ts`) supaya kunci jawaban dan gambarnya tidak bisa
 * berbeda di dua tempat, dan hasilnya deterministik per `seed`.
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

export const UKURAN_PLATE = 280;
export const RADIUS_PLATE = 128;
/** Topeng glyph digambar 3x lalu dirata-rata — cakupan jadi halus, bukan biner. */
const SKALA_MASK = 3;
/** Satu goresan angka ~20 px harus tertutup 4–6 titik, bukan 2. */
const R_MIN = 2.2;
const R_MAX = 5.0;
const UPAYA_TITIK = 60000;
/** Jarak minimum antar titik (px). Kecil = padat seperti plate cetak. */
const JARAK_MIN = 0.25;
/** Sisi sel spatial hash; harus >= 2 * R_MAX supaya 3x3 sel cukup. */
const SEL = R_MAX * 2;

export type JenisTitik = 'angka' | 'angka2' | 'latar';

export interface TitikPlate {
  x: number;
  y: number;
  r: number;
  jenis: JenisTitik;
}

/**
 * Cakupan glyph di satu titik: `[kiri, kanan]` masing-masing 0..1.
 *
 * `baca(x, y, r)` menerima koordinat dalam piksel CSS dan jari-jari titik, lalu
 * mengembalikan rata-rata cakupan glyph kiri (kanal merah) dan kanan (kanal
 * biru) di dalam lingkaran itu.
 */
export type BacaKover = (x: number, y: number, r: number) => [number, number];

/** 13 sampel: pusat + 8 di 0,6r + 4 di 0,9r. Cukup untuk r sekecil 2,4 px. */
const SAMPEL: Array<[number, number]> = (() => {
  const out: Array<[number, number]> = [[0, 0]];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    out.push([Math.cos(a) * 0.6, Math.sin(a) * 0.6]);
  }
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    out.push([Math.cos(a) * 0.9, Math.sin(a) * 0.9]);
  }
  return out;
})();

/**
 * Susun titik plate. MURNI — tanpa canvas — supaya bisa diuji di node.
 *
 * `rnd` disuntikkan supaya determinisme bisa dibuktikan, bukan diasumsikan.
 */
export function susunTitik(
  plate: PlateIshihara,
  baca: BacaKover,
  opsi: { ukuran?: number; radius?: number; seed?: number; rnd?: () => number } = {},
): TitikPlate[] {
  const ukuran = opsi.ukuran ?? UKURAN_PLATE;
  const radius = opsi.radius ?? RADIUS_PLATE;
  const rnd = opsi.rnd ?? acak(opsi.seed ?? plate.no * 7919);
  const titik: TitikPlate[] = [];
  const pusat = ukuran / 2;
  /* Spatial hash: pemeriksaan tabrakan hanya ke sel tetangga. Tanpa ini 42.000
     percobaan x ~1.000 titik = 42 juta perbandingan per plate, dan halaman
     tersendat saat plate pertama digambar. */
  const sel = new Map<string, TitikPlate[]>();
  const kunci = (x: number, y: number) => `${Math.floor(x / SEL)},${Math.floor(y / SEL)}`;

  for (let i = 0; i < UPAYA_TITIK; i += 1) {
    const r = R_MIN + rnd() * (R_MAX - R_MIN);
    const sudut = rnd() * Math.PI * 2;
    const jarak = Math.sqrt(rnd()) * (radius - r);
    const x = pusat + Math.cos(sudut) * jarak;
    const y = pusat + Math.sin(sudut) * jarak;

    const gx = Math.floor(x / SEL);
    const gy = Math.floor(y / SEL);
    let bentrok = false;
    for (let ox = -1; ox <= 1 && !bentrok; ox += 1) {
      for (let oy = -1; oy <= 1 && !bentrok; oy += 1) {
        const tetangga = sel.get(`${gx + ox},${gy + oy}`);
        if (!tetangga) continue;
        for (const t of tetangga) {
          const dx = x - t.x;
          const dy = y - t.y;
          if (dx * dx + dy * dy < (r + t.r + JARAK_MIN) * (r + t.r + JARAK_MIN)) {
            bentrok = true;
            break;
          }
        }
      }
    }
    if (bentrok) continue;

    const [kiri, kanan] = baca(x, y, r);
    /* Ambang digeser sedikit per titik: tepi angka jadi organik seperti plate
       cetak, bukan garis bertangga. Satu angka penuh (cakupan 1,0) selalu lolos,
       latar penuh (0,0) selalu gagal. */
    const ambang = 0.45 + (rnd() - 0.5) * 0.12;
    let jenis: JenisTitik = 'latar';
    if (kiri >= ambang) jenis = 'angka';
    else if (kanan >= ambang && plate.angka2) jenis = 'angka2';

    const t: TitikPlate = { x, y, r, jenis };
    titik.push(t);
    const k = kunci(x, y);
    const isi = sel.get(k);
    if (isi) isi.push(t);
    else sel.set(k, [t]);
  }
  return titik;
}

/** Warna satu titik, mengikuti palet plate + jitter terang-gelap. */
function warnaTitik(plate: PlateIshihara, jenis: JenisTitik, rnd: () => number): string {
  const palet = jenis === 'angka2' ? plate.angka2 ?? plate.angka : jenis === 'angka' ? plate.angka : plate.latar;
  return palet[Math.floor(rnd() * palet.length)];
}

/** Gambar satu plate ke `<canvas>`. */
export function gambarPlate(canvas: HTMLCanvasElement, plate: PlateIshihara, seed = plate.no * 7919): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const ukuran = UKURAN_PLATE;
  const dpr = Math.min(2, Number(globalThis.devicePixelRatio) || 1);
  canvas.width = Math.round(ukuran * dpr);
  canvas.height = Math.round(ukuran * dpr);
  canvas.style.width = `${ukuran}px`;
  canvas.style.height = `${ukuran}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const baca = buatPembacaMask(plate, ukuran);
  if (!baca) return;
  const rndWarna = acak(seed ^ 0x9e3779b9);
  const titik = susunTitik(plate, baca, { ukuran, radius: RADIUS_PLATE, seed });

  ctx.clearRect(0, 0, ukuran, ukuran);
  for (const t of titik) {
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
    ctx.fillStyle = jitter(warnaTitik(plate, t.jenis, rndWarna), Math.floor((rndWarna() - 0.5) * 18));
    ctx.fill();
  }
}

/**
 * Pembaca cakupan glyph untuk satu plate. Diekspor supaya gerbang kualitas
 * (`deliverables/probe-plate-render.mjs`) bisa mengukur IoU titik vs glyph
 * TANPA menggambar ulang topengnya sendiri — kalau topengnya disalin, gerbang
 * mengukur salinannya, bukan yang dipakai aplikasi.
 */
export function pembacaKoverPlate(plate: PlateIshihara, ukuran = UKURAN_PLATE): BacaKover | null {
  return buatPembacaMask(plate, ukuran);
}

/**
 * Gambar glyph ke canvas tak terlihat (kiri = kanal merah, kanan = kanal biru),
 * lalu kembalikan pembaca cakupan.
 *
 * Dua digit hanya dipakai plate diagnostik: penderita protan hanya melihat
 * digit kanan, deutan hanya digit kiri — itulah yang membuat plate ini bisa
 * membedakan keduanya.
 */
function buatPembacaMask(plate: PlateIshihara, ukuran: number): BacaKover | null {
  const skala = SKALA_MASK;
  const off = document.createElement('canvas');
  off.width = ukuran * skala;
  off.height = ukuran * skala;
  const octx = off.getContext('2d');
  if (!octx) return null;

  octx.fillStyle = '#000000';
  octx.fillRect(0, 0, off.width, off.height);
  octx.scale(skala, skala);
  /* `900` + sans-serif: goresan tebal, seperti angka plate cetak. Ukuran dipilih
     supaya angka mengisi ~55% diameter — plate asli 50–60%. */
  octx.font = '900 150px "Arial Black", "Segoe UI", system-ui, sans-serif';
  octx.textAlign = 'left';
  octx.textBaseline = 'middle';

  const duaDigit = Boolean(plate.angka2) && plate.normal.length === 2;
  const teks = duaDigit ? [plate.normal[0], plate.normal[1]] : [plate.normal];
  const lebar = teks.map((t) => octx.measureText(t).width);
  const jarak = ukuran * 0.03;
  const total = lebar.reduce((a, b) => a + b, 0) + jarak * (teks.length - 1);
  let x = ukuran / 2 - total / 2;
  const y = ukuran / 2 + ukuran * 0.02;

  teks.forEach((t, i) => {
    octx.fillStyle = i === 0 ? '#ff0000' : '#0000ff';
    octx.fillText(t, x, y);
    x += lebar[i] + jarak;
  });

  const peta = octx.getImageData(0, 0, off.width, off.height).data;
  const batas = off.width;

  return (cx, cy, r) => {
    let kiri = 0;
    let kanan = 0;
    for (const [dx, dy] of SAMPEL) {
      const px = Math.min(batas - 1, Math.max(0, Math.round((cx + dx * r) * skala)));
      const py = Math.min(batas - 1, Math.max(0, Math.round((cy + dy * r) * skala)));
      const idx = (py * batas + px) * 4;
      kiri += peta[idx] / 255;
      kanan += peta[idx + 2] / 255;
    }
    return [kiri / SAMPEL.length, kanan / SAMPEL.length];
  };
}

/**
 * Ukuran kanvas untuk tes Landolt. Dipisah supaya komponen tidak perlu tahu
 * soal DPR dan pembulatan.
 */
export function ukuranKanvasLandolt(px: number): number {
  return Math.max(80, Math.ceil(px + 24));
}
