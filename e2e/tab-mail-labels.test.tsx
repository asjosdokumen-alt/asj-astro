/**
 * TESTS: TabMail — setiap checkbox baris punya nama aksesibel.
 *
 * KENAPA DI `e2e/`, BUKAN DI SEBELAH KOMPONENNYA
 * ---------------------------------------------
 * Sama alasannya dengan `e2e/ai-cv-submit.test.ts`: `indexer` menghitung
 * `src/**` (semua ekstensi), jadi menambah satu berkas `.test.tsx` di sana
 * memindahkan counter beku (`files.length`, `fileCount`, `count('ts')`) yang
 * hanya boleh diedit team-lead. `.ts` di bawah `e2e/` tidak dihitung, dan
 * `vitest.config.ts` menjalankan `e2e/**\/*.test.ts` di project `frontend`
 * (jsdom) secara default — jadi berkas ini tidak perlu masuk daftar `exclude`.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Diukur 2026-10-08 di browser, di `#mail` dengan satu baris mail nyata:
 * accessibility tree melaporkan satu `checkbox` TANPA nama. Sumbernya baris
 * `<input type="checkbox">` per-kandidat di tabel Mail — checkbox header punya
 * `aria-label={t('ui.select_all')}`, barisnya tidak punya apa pun. Pengguna
 * pembaca layar mendengar "checkbox" tanpa tahu baris mana yang ia pilih.
 *
 * TIDAK ADA GATE YANG BISA MELIHATNYA:
 *   - `e2e/test-aria-names.mjs` menyapu `/admin` termasuk tab `mail`, TETAPI
 *     fixture-nya tidak punya baris mail — jadi checkbox barisnya tidak pernah
 *     dirender dan tidak pernah diukur. (Gate itu menyapu kontrol yang ADA;
 *     ia tidak bisa menuntut kontrol yang seharusnya ada.)
 *   - Kontrak overlay (`overlay-contract.test.tsx`) hanya membaca `.u-modal-shell`.
 *
 * Karena itu tes ini merender tabelnya DENGAN satu baris, dan menuntut nama pada
 * setiap checkbox baris — bukan pada "semua kontrol di halaman", supaya tidak
 * ikut mengukur hal lain yang bukan tanggung jawabnya.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/preact';
import { atom } from 'nanostores';

vi.mock('../src/store/i18n', () => ({
  // `ui.select_row` HARUS mengembalikan teks yang benar-benar memuat `{nama}`.
  // Mock yang mengembalikan kunci apa adanya (`t: (k) => k`) membuat
  // `.replace('{nama}', …)` di komponen tidak menemukan apa pun, sehingga
  // labelnya tetap "ui.select_row" dan tes ini mengukur mock-nya sendiri,
  // bukan perilaku produk. Kunci lain tetap dikembalikan apa adanya supaya
  // asersi nama header (`ui.select_all`) tidak ikut berubah.
  t: (k: string) => (k === 'ui.select_row' ? 'Pilih {nama}' : k),
  langStore: atom('id'),
  toggleLang: () => {},
  useLang: () => 'id',
}));
vi.mock('../src/components/Toast', () => ({ showToast: () => {} }));
// Tidak pernah selesai: `fetchMailFromAPI()` berjalan di effect mount, dan
// promise yang resolve akan menimpa `mailList` yang sudah dipasang tes ini —
// yaitu baris yang justru sedang diuji.
vi.mock('../src/lib/apiClient', () => {
  const pending = () => new Promise(() => {});
  return {
    default: { call: pending, secure: pending },
    api: { call: pending, secure: pending },
    apiClient: pending,
  };
});

import { mailList, mailFilterStatus, mailSearchText } from '../src/store/adminStore';
import TabMail from '../src/components/admin/TabMail';

const ROW = {
  id: 'm1',
  idLoker: 'TG591ASJ',
  kategori: 'NOUGYOU SAYURAN',
  nama: 'Aria Uji',
  status: 'MENUNGGU',
  wa: '081234567890',
  timestamp: '2026-10-08T00:00:00Z',
};

beforeEach(() => {
  // Filter default bisa menyembunyikan barisnya, dan baris yang tak terlihat
  // membuat tes ini lulus secara hampa.
  mailFilterStatus.set('SEMUA');
  mailSearchText.set('');
  mailList.set([ROW]);
});
afterEach(() => {
  cleanup();
  mailList.set([]);
});

describe('TabMail — checkbox baris punya nama', () => {
  it('kontrol positif: barisnya benar-benar dirender', () => {
    render(<TabMail />);
    const rows = document.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(document.querySelectorAll('tbody input[type="checkbox"]').length).toBe(1);
  });

  it('setiap checkbox baris punya nama aksesibel yang menyebut subjek barisnya', () => {
    render(<TabMail />);
    const boxes = [...document.querySelectorAll('tbody input[type="checkbox"]')];
    expect(boxes.length).toBeGreaterThan(0);

    const nameless = boxes.filter((el) => !(el.getAttribute('aria-label') || '').trim());
    expect(nameless.length, `${nameless.length} checkbox baris tanpa nama`).toBe(0);

    // Nama harus menyebut kandidatnya, bukan sekadar ada: `aria-label="x"`
    // akan lolos pemeriksaan di atas tanpa memberi tahu baris mana.
    for (const el of boxes) {
      expect(el.getAttribute('aria-label')).toContain('Aria Uji');
    }
  });

  it('checkbox header tetap punya namanya sendiri (tidak ikut tertukar)', () => {
    render(<TabMail />);
    const head = document.querySelector('thead input[type="checkbox"]');
    expect(head).toBeTruthy();
    expect((head?.getAttribute('aria-label') || '').trim()).toBe('ui.select_all');
  });
});
