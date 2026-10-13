/**
 * TESTS: ikon PWA/favicon harus PUNYA kanal alfa dan sudut yang bening.
 *
 * KENAPA: `public/icons/*.png` dulu PNG palet (colorType 3) TANPA chunk `tRNS`
 * — jadi gambar persegi OPAQUE dengan latar `#020617` (gelap) yang di-bake.
 * Di tab browser, ikon PWA di Android, dan notifikasi push, latar persegi itu
 * terbaca sebagai "kotak hitam" dengan sudut yang tidak membulat. Terukur
 * 2026-10-13 pada berkas lama: sudut (0,0) = rgb(2,6,23), alpha tidak ada.
 *
 * YANG DIPERIKSA: setiap berkas di bawah memuat kanal alfa DAN keempat sudutnya
 * bening (alpha rendah). Sumber kebenarannya `logo-asj.webp`, yang sudutnya
 * memang transparan ⇒ manifest tetap memakai berkas yang sama.
 *
 * KENAPA DI `e2e/`: `.ts` baru di bawah `src/**` memindahkan counter beku
 * `indexer` (R15). Berkas ini juga murni membaca biner — tanpa DOM — jadi ia
 * milik project `backend` dan WAJIB didaftarkan di `exclude` frontend
 * `vitest.config.ts`, kalau tidak ia jalan DUA KALI (R13f-bis).
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';

/** Semua ikon yang dirujuk `public/manifest.webmanifest` + `BaseLayout.astro`. */
const ICONS = [
  'public/icons/favicon-32.png',
  'public/icons/icon-192.png',
  'public/icons/icon-512.png',
  'public/icons/apple-touch-icon.png',
  'public/icons/icon-maskable-512.png',
];

/** Sudut yang diuji, sebagai pecahan (x, y) dari lebar/tinggi. */
const CORNERS: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

/** Ambang: sudut harus hampir seluruhnya bening. */
const CORNER_MAX_ALPHA = 16;

describe('ikon PWA — transparansi', () => {
  it('probe-nya bekerja — daftarnya tidak kosong dan sharp membaca sesuatu', async () => {
    // Penjaga penjaga: kalau daftar dikosongkan, tes di bawah lulus tanpa arti.
    expect(ICONS.length).toBeGreaterThan(0);
    const meta = await sharp(ICONS[0]).metadata();
    expect(meta.width).toBeGreaterThan(0);
  });

  for (const file of ICONS) {
    it(`${file} punya kanal alfa`, async () => {
      const meta = await sharp(file).metadata();
      // `hasAlpha` false = gambar persegi opaque ⇒ kotak gelap di tab/notifikasi.
      expect(meta.hasAlpha, `${file} tidak punya kanal alfa (channels=${meta.channels})`).toBe(true);
      expect(meta.channels, `${file} bukan RGBA`).toBe(4);
    });

    it(`${file} sudutnya bening`, async () => {
      const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({
        resolveWithObject: true,
      });
      const alphaAt = (fx: number, fy: number): number => {
        const x = fx === 0 ? 0 : info.width - 1;
        const y = fy === 0 ? 0 : info.height - 1;
        return data[(y * info.width + x) * 4 + 3];
      };
      for (const [fx, fy] of CORNERS) {
        const a = alphaAt(fx, fy);
        expect(
          a,
          `${file}: sudut (${fx},${fy}) alpha=${a} — sudut harus bening, bukan kotak gelap`,
        ).toBeLessThanOrEqual(CORNER_MAX_ALPHA);
      }
    });
  }

  it('PNG-nya bukan PNG palet tanpa tRNS (bentuk cacat yang asli)', () => {
    for (const f of ICONS) {
      const b = readFileSync(f);
      expect(b.slice(1, 4).toString('latin1'), `${f} bukan PNG`).toBe('PNG');
      // colorType ada di byte 25: 3 = palet. Palet BOLEH, asal ada `tRNS`.
      const colorType = b[25];
      const hasTRNS = b.includes(Buffer.from('tRNS', 'latin1'));
      expect(
        colorType !== 3 || hasTRNS,
        `${f}: PNG palet TANPA tRNS ⇒ sudut opaque (cacat lama)`,
      ).toBe(true);
    }
  });
});
