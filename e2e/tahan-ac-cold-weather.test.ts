/**
 * e2e/tahan-ac-cold-weather.test.ts
 *
 * Keluhan pemilik 2026-10-12:
 *   "hapus bekerja dalam ac? harusnya kan bekerja di cuaca dingin itu. soalnya
 *    kan jepang beda cuaca dengan indo ada musim panas ada musim dinginnya."
 *
 * Kolomnya tetap `tahan_ac` — nilainya `YA`/`TIDAK` dan barisnya sudah tersimpan.
 * Yang salah adalah PERTANYAANNYA. "Tahan kerja tanpa AC?" menanyakan hal yang
 * tidak pernah jadi masalah di Jepang: hampir semua tempat kerja di sana
 * ber-AC, dan yang benar-benar menyaring kandidat adalah MUSIM DINGIN —
 * Indonesia tidak punya musim dingin, jadi kandidat tidak punya cara menilai
 * dirinya sendiri. Pertanyaan yang salah menghasilkan jawaban yang tidak bisa
 * dipakai: seorang kandidat bisa menjawab "YA" (sanggup tanpa AC) dan tetap
 * tidak siap bekerja di suhu 0 °C.
 *
 * KENAPA DI `e2e/`, BUKAN DI SEBELAH MODULNYA
 * -------------------------------------------
 * Sama alasannya dengan `e2e/write-body-coercion.test.ts` dan
 * `e2e/biodata-export.test.ts`: `indexer` menghitung SELURUH berkas di bawah
 * `src/**` (semua ekstensi), jadi satu `.test.ts` baru di sana memindahkan
 * counter beku (`files.length`, `fileCount`, `count('ts')`) yang hanya boleh
 * diedit team-lead. Tier `e2e/` hanya memuat `mjs`/`cjs`/`js`, dan
 * `vitest.config.ts` tetap menjalankannya di project `frontend` (jsdom).
 *
 * SATU LABEL, ENAM SITUS — dan tes ini menutup KETUJuhnya
 * ------------------------------------------------------
 * Label ini tidak hidup di satu tempat. Teksnya muncul di dua kamus (id + jp),
 * di berkas biodata yang diunduh kandidat, di CV Excel, di ringkasan yang
 * disuntikkan ke system prompt AI, dan di catatan perubahan data master yang
 * dibaca admin. Mengubah kamus saja akan meninggalkan lima salinan lain yang
 * tetap bertanya soal AC — jadi setiap situs punya pemeriksaan sendiri di sini.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildBiodataText } from '../src/lib/biodataExport';
import { FIELD_LABELS } from '../src/lib/cv-template-factory/loaders/tEMPLATE-loader';

const I18N_ID = 'src/store/i18n.ts';
const I18N_JP = 'src/store/i18n-jp.ts';

/**
 * Konsep "AC" — dan huruf besarnya DISENGAJA.
 *
 * Kata Indonesia "Cuaca" memuat "ac" huruf kecil (`c-u-a-c-a`), jadi sebuah
 * `/AC|エアコン/i` akan menyala pada kalimat BARU yang justru kita inginkan.
 * Pemeriksaan ini harus menangkap kata "AC" sebagai istilah (selalu huruf
 * besar di seluruh repo ini) tanpa salah menuduh "Cuaca".
 */
const AC_CONCEPT = /AC|エアコン/;

/** Nilai satu kunci kamus, dibaca sebagai teks sumber (idiom `i18n.keys.test.ts`). */
function dictValue(file: string, key: string): string {
  const text = readFileSync(file, 'utf8');
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`"${esc}":\\s*"([^"]*)"`).exec(text);
  expect(m, `kunci ${key} tidak ditemukan di ${file}`).toBeTruthy();
  return m?.[1] ?? '';
}

describe('tahan_ac — pertanyaan "AC" diganti "bekerja di cuaca dingin"', () => {
  it('kedua kamus (id + jp) menyebut cuaca dingin dan tidak lagi menyebut AC', () => {
    const cases: Array<[string, string, RegExp]> = [
      [I18N_ID, 'form.mf_tahan_ac', /dingin/i],
      [I18N_ID, 'cv.field_tahan_ac', /dingin/i],
      [I18N_JP, 'form.mf_tahan_ac', /寒/],
      [I18N_JP, 'cv.field_tahan_ac', /寒/],
    ];
    for (const [file, key, mustMatch] of cases) {
      const v = dictValue(file, key);
      expect(v, `${key} di ${file} harus menyebut cuaca dingin`).toMatch(mustMatch);
      expect(v, `${key} di ${file} masih menyebut AC: ${JSON.stringify(v)}`).not.toMatch(AC_CONCEPT);
    }
  });

  it('berkas biodata yang diunduh kandidat memakai label cuaca dingin', () => {
    const text = buildBiodataText({
      nama: 'UJI CUACA',
      wa: '6285700000001',
      master: { fisik: { tahan_ac: 'YA' } },
    });
    expect(text, 'label baru tidak muncul di biodata').toMatch(/Cuaca Dingin/);
    expect(text, 'label lama masih muncul di biodata').not.toMatch(/Tahan AC/);
  });

  it('CV teks (Excel, ringkasan AI, catatan perubahan master) tidak lagi menyebut AC', () => {
    const sites: Array<[string, RegExp]> = [
      ['src/lib/cv-template-factory/renderers/excel.ts', /Tahan AC/],
      ['netlify/functions/_lib/ai/cv.ts', /Tahan AC/],
      // Label catatan perubahan: `tahan_ac: 'tahan AC'`. Pola `\s+` sengaja —
      // kunci kolom `tahan_ac` (garis bawah) tidak boleh ikut tertangkap.
      ['netlify/functions/contexts/master-data/service.ts', /tahan\s+AC/i],
    ];
    for (const [file, old] of sites) {
      const src = readFileSync(file, 'utf8');
      expect(src, `${file} masih memuat label lama`).not.toMatch(old);
      expect(src, `${file} tidak memuat label baru`).toMatch(/Cuaca Dingin|cuaca dingin/i);
    }
  });

  it('loader template mengenali label BARU tanpa kehilangan label LAMA', () => {
    const entry = FIELD_LABELS.find((f) => f.path === 'fisik.tahan_ac');
    // Gagal keras, bukan `entry!`: assertion non-null dilarang gate lint repo ini,
    // dan pesan yang jelas lebih berguna daripada `undefined.pattern`.
    if (!entry) throw new Error('FIELD_LABELS tidak punya entri fisik.tahan_ac');
    const { pattern } = entry;

    // Label lama tetap harus terbaca: template yang sudah diunggah memakainya.
    expect(pattern.test('Tahan AC'), 'label lama tidak lagi dikenali').toBe(true);
    expect(pattern.test('TAHANAC'), 'placeholder lama tidak lagi dikenali').toBe(true);

    // Label baru — kalimat penuh maupun potongannya.
    expect(pattern.test('Bekerja di Cuaca Dingin'), 'label baru tidak dikenali').toBe(true);
    expect(pattern.test('Kerja Cuaca Dingin'), 'label baru tidak dikenali').toBe(true);

    // Tidak boleh jadi pencocokan longgar atas "AC": "Kacamata" memuat "ac"
    // huruf kecil, dan baris itu milik field lain.
    expect(pattern.test('Kacamata'), 'pola terlalu longgar — cocok dengan Kacamata').toBe(false);
  });
});
