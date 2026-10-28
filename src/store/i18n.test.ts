import { describe, expect, it, vi } from 'vitest';
import { translations, ensureJpLoaded } from './i18n';

describe('i18n lazy JP dict (P9b)', () => {
  it('ensureJpLoaded installs the JP dict before resolving', async () => {
    await ensureJpLoaded();
    expect(Object.keys(translations.jp).length).toBeGreaterThan(0);
    expect(translations.jp['public.all']).toBeTruthy();
  });

  it('a page loaded with lang=jp preloads the dict and notifies jpReady', async () => {
    vi.resetModules();
    localStorage.setItem('asj_lang', JSON.stringify('jp'));
    const fresh = await import('./i18n');
    await fresh.ensureJpLoaded();
    expect(Object.keys(fresh.translations.jp).length).toBeGreaterThan(0);
    expect(fresh.translations.jp['public.all']).toBeTruthy();
    expect(fresh.jpReady.get()).toBe(true);
    localStorage.setItem('asj_lang', JSON.stringify('id'));
    fresh.langStore.set('id');
  });
});

// ==========================================
// TESTS: kamus JP tidak boleh diunduh oleh pembaca berbahasa Indonesia
//
// DIUKUR 2026-10-28 pada artefak build: `i18n-jp` = 110,3 KB mentah / 35,6 KB
// gzip. Komentar di i18n.ts menyebutnya "only loaded when user switches to
// Japanese", tapi kenyataannya `loadJp()` dipanggil di module scope SETIAP kali
// modul ini dievaluasi di browser — dan `preloadJpDict()` dipanggil lagi dari
// BaseLayout. Jadi setiap pengunjung anonim membayar 35,6 KB untuk kamus yang
// tidak akan pernah dia baca, di atas 34,5 KB kamus Indonesia.
//
// Kontrol positif di bawah penting: ia membuktikan jeda yang dipakai tes negatif
// cukup panjang untuk MELIHAT pemuatan terjadi. Tanpa kontrol, tes "tidak
// dimuat" akan hijau hanya karena terlalu cepat memeriksa.
// ==========================================
describe('kamus JP hanya untuk pembaca JP', () => {
  /** Muat modul segar dengan bahasa tersimpan tertentu, lalu beri waktu impor. */
  async function freshWith(lang: 'id' | 'jp') {
    vi.resetModules();
    localStorage.setItem('asj_lang', JSON.stringify(lang));
    const m = await import('./i18n');
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
    return m;
  }

  it('KONTROL: lang=jp memuat kamus dan menandai jpReady', async () => {
    const m = await freshWith('jp');
    expect(Object.keys(m.translations.jp).length).toBeGreaterThan(0);
    expect(m.jpReady.get()).toBe(true);
    m.langStore.set('id');
  });

  it('lang=id tidak memuat kamus JP saat modul dievaluasi', async () => {
    const m = await freshWith('id');
    expect(Object.keys(m.translations.jp).length).toBe(0);
    expect(m.jpReady.get()).toBe(false);
  });

  it('preloadJpDict() tidak melakukan apa pun saat lang=id', async () => {
    const m = await freshWith('id');
    m.preloadJpDict();
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
    expect(Object.keys(m.translations.jp).length).toBe(0);
  });
});

// ==========================================
// TESTS: anggaran panjang placeholder di kolom sempit
//
// DIUKUR 2026-10-22 (390px, probe Playwright): `#mf-tempatLahir` di
// `/master` dan `/ai-cv` hanya punya 261px ruang teks. String lama
// "Otomatis diterjemahkan ke Jepang saat disimpan" (45 karakter) mengukur
// 286px ⇒ terpotong 25px, dan itu terbaca sebagai teks rusak.
//
// jsdom tidak menerapkan CSS, jadi lebarnya TIDAK bisa diukur di sini. Yang
// dijaga adalah anggaran karakternya — proksi yang diturunkan dari pengukuran:
// 286px / 45 karakter ≈ 6,4px per karakter pada font 14px, jadi 38 karakter
// ≈ 242px, masih di bawah 261px. Batas ini akan MERAH kalau ada yang
// memanjangkan placeholder-nya lagi, dan pesannya menunjuk pengukuran di atas.
// ==========================================
describe('placeholder form muat di kolom 261px (390px)', () => {
  it('form.mf_ph_auto_jp ≤ 38 karakter', () => {
    const id = translations.id['form.mf_ph_auto_jp'];
    expect(typeof id).toBe('string');
    expect(id.length).toBeLessThanOrEqual(38);
  });
});
