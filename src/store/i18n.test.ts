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
