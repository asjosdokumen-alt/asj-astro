/**
 * TESTS: anchor relatif di komponen BERSAMA harus menunjuk ke suatu tempat.
 *
 * KENAPA DI `e2e/`: `indexer` menghitung SELURUH berkas di bawah `src/**`, jadi
 * `.test.ts` baru di sana memindahkan counter beku (R15). Ini juga membaca
 * berkas `.astro` sebagai TEKS — satu-satunya cara memeriksanya tanpa merender
 * Astro di jsdom.
 *
 * BUG YANG DIKUNCI (2026-10-13, audit halaman /loker)
 * ---------------------------------------------------
 * Footer memasang empat tautan nav sebagai anchor RELATIF:
 * `#program` / `#alur` / `#fasilitas` / `#tentang`. Empat id itu hanya ada di
 * halaman BERANDA. Terukur di Chromium atas situs yang tayang:
 *
 *   /          -> keempat anchor ADA
 *   /loker     -> keempat HILANG  => klik = URL jadi /loker#program, tidak
 *   /public    -> keempat HILANG     menuju apa pun
 *   /candidate -> ADA
 *
 * Jadi di SEMUA halaman selain beranda, empat tautan footer itu mati — dan
 * footer dirender di setiap halaman. Perbaikannya `/#program`: terukur (a) di
 * beranda TIDAK memuat ulang halaman (penanda `window` bertahan, hanya scroll),
 * dan (b) dari /loker benar-benar berpindah ke beranda lalu ke bagiannya.
 *
 * YANG DIPERIKSA: di komponen yang dirender di SETIAP halaman, setiap
 * `href="#…"` harus salah satu dari:
 *   - `#main-content` — satu-satunya anchor yang ADA di setiap halaman
 *     (diperiksa: 11/11 berkas di `src/pages/*.astro` merendernya), atau
 *   - referensi sprite SVG (`/icons/sprite.svg#fas-…`), yang bukan navigasi, atau
 *   - absolut (`/#…`), sehingga halaman mana pun tetap menuju ke sana.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

/** Dirender di SETIAP halaman — lihat BaseLayout.astro + Footer.astro. */
const SHARED = [
  'src/components/Footer.astro',
  'src/layouts/BaseLayout.astro',
  'src/components/App.tsx',
  'src/components/BottomNav.tsx',
];

/** Satu-satunya anchor relatif yang aman: ada di setiap halaman. */
const UNIVERSAL = new Set(['#main-content']);

/** `<use href="/icons/sprite.svg#fas-spinner">` — referensi sprite, bukan tautan. */
const SPRITE_REF = /^(?:\/icons\/sprite\.svg)?#(fas|fab|far|faso)-/;

/**
 * Setiap href yang memuat fragmen: `#x` (relatif) DAN `/#x` (absolut).
 *
 * Pola pertama hanya cocok untuk `#…`, sehingga setelah perbaikan daftarnya
 * KOSONG dan kontrol positif di bawah gagal karena alasan yang salah. Yang
 * diperiksa adalah "href ini punya fragmen", bukan "href ini diawali #".
 */
function anchorsIn(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of src.matchAll(/href=["']([^"']*#[^"']*)["']/g)) out.push(m[1]);
  return out;
}

/** Hanya yang relatif — inilah yang bergantung pada halaman tempat ia dirender. */
const relativeOnly = (list: string[]): string[] => list.filter((h) => h.startsWith('#'));

describe('anchor relatif di komponen bersama', () => {
  it('probe-nya bekerja — pemindaian menemukan sesuatu', () => {
    // Penjaga penjaga: kalau regex berhenti cocok (mis. kutip tunggal), daftarnya
    // kosong dan pemeriksaan di bawah lulus tanpa arti.
    const total = SHARED.reduce((n, f) => n + anchorsIn(f).length, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('setiap anchor relatif menunjuk ke halaman yang memuatnya', () => {
    const offenders: string[] = [];
    for (const file of SHARED) {
      for (const href of relativeOnly(anchorsIn(file))) {
        if (SPRITE_REF.test(href)) continue;
        if (UNIVERSAL.has(href)) continue;
        offenders.push(`${file}: ${href}`);
      }
    }
    expect(offenders, `anchor relatif yang hanya ada di sebagian halaman:\n${offenders.join('\n')}`).toEqual([]);
  });

  // KONTROL POSITIF: keempat tautan nav footer harus tetap ada sebagai tautan,
  // supaya "jadikan absolut" tidak berubah jadi "hapus tautannya".
  it('footer masih punya empat tautan bagian, sekarang absolut', () => {
    const footer = anchorsIn('src/components/Footer.astro');
    for (const id of ['/#program', '/#alur', '/#fasilitas', '/#tentang']) {
      expect(footer, `footer kehilangan ${id}`).toContain(id);
    }
  });
});
