/**
 * ishiharaCanvas.test.ts — kualitas plate Ishihara.
 *
 * APA YANG DIJAGA
 *   1. KESETIAAN BENTUK. Angka pada plate dibentuk oleh titik, dan titik
 *      diwarnai menurut CAKUPAN glyph di lingkarannya — bukan warna pixel di
 *      pusatnya. Versi pertama memakai pusat pixel: goresan setebal 2 titik
 *      hilang dan angka terbaca sebagai gumpalan. Pemilik 2026-11-13:
 *      *"gambarnya gak bener ya itu gak jelas banget"*. Tes `goresan` di bawah
 *      mengunci sifat itu: pita 6 px harus tersambung UTUH dari kiri ke kanan,
 *      tanpa lubang.
 *   2. KEPADATAN. Plate cetak mengisi lingkarannya; plate yang titiknya jarang
 *      terlihat seperti konfeti dan angkanya tenggelam.
 *   3. DETERMINISME. Plate yang sama harus tampil sama tiap render — kalau
 *      tidak, kandidat bisa melihat dua gambar berbeda untuk satu nomor.
 *   4. GEOMETRI. Tidak ada titik yang keluar lingkaran atau bertumpuk.
 *
 * Yang TIDAK diukur di sini: rupa glyph hasil rasterisasi font di browser.
 * Itu diukur `deliverables/probe-plate-render.mjs` (IoU titik vs glyph, di
 * Chromium sungguhan) karena jsdom tidak punya canvas.
 */
import { describe, it, expect } from 'vitest';
import { RADIUS_PLATE, UKURAN_PLATE, susunTitik, type BacaKover } from './ishiharaCanvas';
import { PLATE_ISHIHARA } from './tesSeleksi';

/** Plate netral: semua latar, supaya yang diukur hanya kepadatan packing. */
const plateLatar = PLATE_ISHIHARA[0];

const tanpaGlyph: BacaKover = () => [0, 0];

/**
 * Topeng analitik: pita horizontal setebal `tebal` px.
 *
 * Cakupan dihitung dengan integrasi numerik 12x12 DI DALAM lingkaran titik —
 * implementasi yang sengaja tidak berbagi kode dengan renderer, supaya tes ini
 * mengukur perilaku renderer, bukan menyalinnya.
 */
function pita(cy: number, tebal: number): BacaKover {
  return (x, y, r) => {
    const N = 12;
    let dalam = 0;
    let kena = 0;
    for (let i = 0; i < N; i += 1) {
      for (let j = 0; j < N; j += 1) {
        const px = x - r + (2 * r * (i + 0.5)) / N;
        const py = y - r + (2 * r * (j + 0.5)) / N;
        if ((px - x) ** 2 + (py - y) ** 2 > r * r) continue;
        dalam += 1;
        if (Math.abs(py - cy) <= tebal / 2) kena += 1;
      }
    }
    return dalam ? [kena / dalam, 0] : [0, 0];
  };
}

describe('ishiharaCanvas · geometri', () => {
  const titik = susunTitik(plateLatar, tanpaGlyph, { seed: 12345 });

  it('semua titik berada di dalam lingkaran plate', () => {
    const pusat = UKURAN_PLATE / 2;
    const luar = titik.filter((t) => Math.hypot(t.x - pusat, t.y - pusat) + t.r > RADIUS_PLATE + 0.01);
    expect(luar).toEqual([]);
  });

  it('tidak ada dua titik yang bertumpuk', () => {
    let tumpuk = 0;
    for (let i = 0; i < titik.length; i += 1) {
      for (let j = i + 1; j < titik.length; j += 1) {
        const a = titik[i];
        const b = titik[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) tumpuk += 1;
      }
    }
    expect(tumpuk).toBe(0);
  });

  it('deterministik: seed yang sama menghasilkan susunan identik', () => {
    const a = susunTitik(plateLatar, tanpaGlyph, { seed: 777 });
    const b = susunTitik(plateLatar, tanpaGlyph, { seed: 777 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('seed berbeda menghasilkan susunan berbeda', () => {
    const a = susunTitik(plateLatar, tanpaGlyph, { seed: 1 });
    const b = susunTitik(plateLatar, tanpaGlyph, { seed: 2 });
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

describe('ishiharaCanvas · kepadatan', () => {
  it('setiap plate punya cukup titik untuk mengisi lingkarannya', () => {
    /* Versi pertama hanya ~400 titik dan terlihat seperti konfeti. Ambang 600
       di bawah angka terukur (700–750) supaya perubahan packing yang wajar
       tidak memerahkan tes ini. */
    for (const p of PLATE_ISHIHARA) {
      const titik = susunTitik(p, tanpaGlyph, { seed: p.no });
      expect(titik.length, `plate #${p.no}`).toBeGreaterThanOrEqual(600);
    }
  });

  it('titik menutup lebih dari sepertiga luas lingkaran', () => {
    const titik = susunTitik(plateLatar, tanpaGlyph, { seed: 99 });
    const luas = titik.reduce((a, t) => a + Math.PI * t.r * t.r, 0);
    const rasio = luas / (Math.PI * RADIUS_PLATE * RADIUS_PLATE);
    expect(rasio).toBeGreaterThan(0.38);
  });
});

describe('ishiharaCanvas · kesetiaan bentuk', () => {
  /* Goresan angka pada font 150 px di kanvas 280 px setebal ~20 px. */
  const CY = UKURAN_PLATE / 2;
  const TEBAL = 20;
  const titik = susunTitik(plateLatar, pita(CY, TEBAL), { seed: 4242 });
  const angka = titik.filter((t) => t.jenis === 'angka');

  it('titik cukup kecil untuk membentuk goresan: r maksimum ≤ 5,5 px', () => {
    /* Versi pertama memakai r 3,2–9,6 px. Satu goresan 20 px hanya tertutup
       2–3 titik, dan angka terbaca sebagai gumpalan — inilah yang dikeluhkan
       pemilik. Ambang ini yang menahan plate kembali ke resolusi kasar. */
    const terbesar = Math.max(...titik.map((t) => t.r));
    expect(terbesar).toBeLessThanOrEqual(5.5);
    expect(terbesar).toBeGreaterThan(3.5); // variasinya harus tetap ada
  });

  it('goresan 20 px tersambung hampir utuh dari kiri ke kanan', () => {
    let ada = 0;
    let total = 0;
    for (let x = CY - 80; x <= CY + 80; x += 2) {
      total += 1;
      if (angka.some((t) => Math.abs(t.x - x) <= 2.5 && Math.abs(t.y - CY) <= TEBAL / 2)) ada += 1;
    }
    // Terukur 72/81 = 89 %. Lantai 80 % memberi ruang untuk packing acak,
    // tetapi tetap menolak goresan yang berlubang-lubang.
    expect(ada / total).toBeGreaterThanOrEqual(0.8);
  });

  it('tebal goresan tetap ± 20 px, tidak melebar jadi blob', () => {
    const atas = Math.min(...angka.map((t) => t.y - t.r));
    const bawah = Math.max(...angka.map((t) => t.y + t.r));
    // Titik di tepi boleh menonjol paling banyak satu radius di tiap sisi.
    expect(bawah - atas).toBeLessThanOrEqual(TEBAL + 2 * 5.5);
    expect(bawah - atas).toBeGreaterThanOrEqual(TEBAL);
  });

  it('di luar pita tetap latar — tidak ada angka yang bocor', () => {
    const jauh = titik.filter((t) => Math.abs(t.y - CY) > TEBAL / 2 + 6);
    expect(jauh.every((t) => t.jenis === 'latar')).toBe(true);
  });
});
