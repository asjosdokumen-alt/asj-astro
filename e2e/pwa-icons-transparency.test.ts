/**
 * TESTS: ikon PWA/favicon harus PUNYA kanal alfa dan sudut yang bening.
 *
 * KENAPA: `public/icons/*.png` dulu PNG palet (colorType 3) TANPA chunk `tRNS`
 * — jadi gambar persegi OPAQUE dengan latar `#020617` (gelap) yang di-bake.
 * Di tab browser, ikon PWA di Android, dan notifikasi push, latar persegi itu
 * terbaca sebagai "kotak hitam" dengan sudut yang tidak membulat. Terukur
 * 2026-10-13 pada berkas lama: sudut (0,0) = rgb(2,6,23), alpha tidak ada.
 *
 * YANG DIPERIKSA: setiap ikon `purpose: any` di manifest memuat kanal alfa DAN
 * keempat sudutnya bening (alpha rendah). Ikon `maskable` DIBALIK: sudutnya
 * harus OPAQUE, karena Android memotongnya sendiri dan area di luar safe zone
 * justru diisi warna ikon — sudut bening di situ menghasilkan cincin gelap.
 *
 * ── KENAPA DAFTARNYA DIBACA DARI MANIFEST (2026-10-23) ──────────────────────
 * Berkas ini dulu memegang daftar hardcoded yang berisi
 * `icon-maskable-512.png`. Manifest kemudian dipindah ke
 * `icon-maskable-512-v2.png`, dan daftar itu tidak ikut — jadi gate ini
 * menguji berkas yang SUDAH TIDAK DIRUJUK siapa pun sementara berkas yang
 * benar-benar dipakai tidak diuji sama sekali. Membaca manifest membuat drift
 * itu mustahil: yang diuji selalu yang dikirim.
 *
 * KENAPA DI `e2e/`: `.ts` baru di bawah `src/**` memindahkan counter beku
 * `indexer` (R15). Berkas ini juga murni membaca biner — tanpa DOM — jadi ia
 * milik project `backend` dan WAJIB didaftarkan di `exclude` frontend
 * `vitest.config.ts`, kalau tidak ia jalan DUA KALI (R13f-bis).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';

interface ManifestIcon {
  src: string;
  sizes?: string;
  purpose?: string;
}

const MANIFEST = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
  icons?: ManifestIcon[];
};

const ALL_ICONS: ManifestIcon[] = MANIFEST.icons ?? [];
/** Path repo untuk sebuah `src` manifest. */
const fileOf = (src: string) => join('public', src.replace(/^\//, ''));
const isMaskable = (i: ManifestIcon) => String(i.purpose ?? '').includes('maskable');

const ANY_ICONS = ALL_ICONS.filter((i) => !isMaskable(i));
const MASKABLE_ICONS = ALL_ICONS.filter(isMaskable);

/** Sudut yang diuji, sebagai pecahan (x, y) dari lebar/tinggi. */
const CORNERS: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
];

/** Ambang: sudut harus hampir seluruhnya bening. */
const CORNER_MAX_ALPHA = 16;
/** Ambang untuk maskable: sudut harus praktis penuh. */
const MASKABLE_MIN_ALPHA = 240;

async function corners(file: string): Promise<number[]> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  const alphaAt = (fx: number, fy: number): number => {
    const x = fx === 0 ? 0 : info.width - 1;
    const y = fy === 0 ? 0 : info.height - 1;
    return data[(y * info.width + x) * 4 + 3];
  };
  return CORNERS.map(([fx, fy]) => alphaAt(fx, fy));
}

describe('ikon PWA — transparansi', () => {
  it('probe-nya bekerja — manifest mendeklarasikan ikon `any` DAN `maskable`', async () => {
    // Penjaga penjaga: kalau manifest kehilangan salah satu kelompok, tes di
    // bawah lulus tanpa menguji apa pun.
    expect(ANY_ICONS.length).toBeGreaterThan(0);
    expect(MASKABLE_ICONS.length).toBeGreaterThan(0);
    expect(ALL_ICONS.every((i) => existsSync(fileOf(i.src))), 'ada src manifest yang filenya tidak ada').toBe(
      true,
    );
    const meta = await sharp(fileOf(ANY_ICONS[0].src)).metadata();
    expect(meta.width).toBeGreaterThan(0);
  });

  for (const icon of ANY_ICONS) {
    const file = fileOf(icon.src);

    it(`${icon.src} punya kanal alfa`, async () => {
      const meta = await sharp(file).metadata();
      // `hasAlpha` false = gambar persegi opaque ⇒ kotak gelap di tab/notifikasi.
      expect(meta.hasAlpha, `${file} tidak punya kanal alfa (channels=${meta.channels})`).toBe(true);
      expect(meta.channels, `${file} bukan RGBA`).toBe(4);
    });

    it(`${icon.src} sudutnya bening`, async () => {
      const alphas = await corners(file);
      alphas.forEach((a, idx) => {
        expect(
          a,
          `${file}: sudut (${CORNERS[idx].join(',')}) alpha=${a} — sudut harus bening, bukan kotak gelap`,
        ).toBeLessThanOrEqual(CORNER_MAX_ALPHA);
      });
    });
  }

  for (const icon of MASKABLE_ICONS) {
    it(`${icon.src} sudutnya OPAQUE (Android memotongnya sendiri)`, async () => {
      // Kebalikan dari ikon `any`: area di luar safe zone diisi warna ikon,
      // bukan dibiarkan transparan. Sudut bening di sini menghasilkan cincin
      // gelap setelah Android menerapkan mask-nya.
      const alphas = await corners(fileOf(icon.src));
      alphas.forEach((a, idx) => {
        expect(
          a,
          `${fileOf(icon.src)}: sudut (${CORNERS[idx].join(',')}) alpha=${a} — ikon maskable harus penuh sampai tepi`,
        ).toBeGreaterThanOrEqual(MASKABLE_MIN_ALPHA);
      });
    });
  }

  it('PNG-nya bukan PNG palet tanpa tRNS (bentuk cacat yang asli)', () => {
    for (const icon of ANY_ICONS) {
      const f = fileOf(icon.src);
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

/**
 * TESTS: NAMA APLIKASI harus "PT Amanah Sakura Japan" di SEMUA titik branding.
 *
 * KENAPA: nama app di header notifikasi Android, label ikon PWA, dan halaman
 * beranda iOS datang dari TIGA tempat berbeda. Dulu ketiganya "ASJ Portal",
 * jadi notifikasi berbunyi "ASJ Portal" alih-alih nama perusahaan. Tiga titik
 * yang mudah lepas sinkron:
 *   1. `manifest.webmanifest` `name`   → label app ter-install (Android)
 *   2. `BaseLayout.astro` apple-mobile-web-app-title → label iOS
 *   3. `public/sw.js` fallback judul   → dipakai bila payload push tanpa title
 *
 * DIPERIKSA: ketiganya memuat nama brand, dan TIDAK ada yang masih memakai
 * nama lama sebagai nama APLIKASI (bukan sekadar judul halaman SEO).
 */
const BRAND = 'PT Amanah Sakura Japan';

describe('nama aplikasi konsisten di titik branding', () => {
  it('manifest.webmanifest memakai nama brand untuk name & short_name', () => {
    const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
      name: string;
      short_name: string;
    };
    expect(manifest.name, 'manifest.name masih nama lama').toBe(BRAND);
    // short_name dipakai di bawah ikon home-screen, ruangnya sempit ⇒
    // wajib pendek tapi tetap brand ASJ.
    expect(manifest.short_name, 'manifest.short_name masih nama lama').toContain('ASJ');
    expect(manifest.short_name.length, 'short_name terlalu panjang untuk home-screen').toBeLessThanOrEqual(
      12,
    );
  });

  it('BaseLayout menyetel apple-mobile-web-app-title ke nama brand', () => {
    const layout = readFileSync('src/layouts/BaseLayout.astro', 'utf8');
    expect(
      layout.includes(`apple-mobile-web-app-title" content="${BRAND}"`),
      'apple-mobile-web-app-title masih nama lama ⇒ label iOS salah',
    ).toBe(true);
  });

  it('service worker TIDAK lagi memakai "ASJ Portal" sebagai judul app', () => {
    const sw = readFileSync('public/sw.js', 'utf8');
    // Hanya baris fallback judul yang diuji — komentar header menyebut nama
    // proyek dan itu sah.
    const pushBlock = sw.slice(sw.indexOf("addEventListener('push'"));
    expect(
      pushBlock.includes("'ASJ Portal'"),
      'sw.js masih menjadikan "ASJ Portal" fallback judul push',
    ).toBe(false);
    expect(pushBlock.includes(BRAND), 'sw.js tidak memakai nama brand sebagai fallback').toBe(true);
  });
});
