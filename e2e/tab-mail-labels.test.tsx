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
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
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
// yaitu baris yang justru sedang diuji. `secure` sekaligus MEREKAM panggilan,
// supaya tes bisa memeriksa argumen yang dikirim tombol aksi.
const { secureMock } = vi.hoisted(() => ({ secureMock: vi.fn(() => new Promise(() => {})) }));
vi.mock('../src/lib/apiClient', () => ({
  default: { call: secureMock, secure: secureMock },
  api: { call: secureMock, secure: secureMock },
  apiClient: secureMock,
}));

import { mailList, mailFilterStatus, mailSearchText } from '../src/store/adminStore';
import TabMail from '../src/components/admin/TabMail';

// Bentuk baris mengikuti payload NYATA: `mapForm(row, i)` mengirim `rowIndex`
// (posisi di daftar penuh) dan `code` (dari kolom `code_job`). Sebelumnya fixture
// memakai `idLoker` — field milik KANDIDAT, bukan mail — sehingga tes ini dulu
// tidak pernah melihat ketidakcocokan yang ada di produksi.
const ROW = {
  id: 'm1',
  rowIndex: 0,
  code: 'TG591ASJ',
  kategori: 'NOUGYOU SAYURAN',
  nama: 'Aria Uji',
  status: 'MENUNGGU',
  wa: '081234567890',
  timestamp: '2026-10-08T00:00:00Z',
};

beforeEach(() => {
  secureMock.mockClear();
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

describe('TabMail — nama checkbox baris + payload aksi', () => {
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

  // ── Payload aksi: `rowIndex`, bukan `id` ───────────────────────────────
  // Backend mail membaca argumennya sebagai POSISI baris
  // (`findFormByIndexFiltered` = `order=timestamp.desc&limit=1&offset=<idx>`).
  // Mengirim `id` membuatnya dibaca sebagai offset — di daftar besar itu
  // meng-approve kandidat LAIN tanpa error. Tes ini merah kalau kembali ke `id`.

  it('tombol Lulus mengirim rowIndex (posisi), BUKAN id baris', () => {
    render(<TabMail />);
    const pass = screen.getByText('button.pass').closest('button') as HTMLButtonElement;
    fireEvent.click(pass);

    const call = secureMock.mock.calls.find((c) => c[0] === 'approveForm');
    expect(call, 'approveForm tidak dipanggil').toBeTruthy();
    expect(call?.[1]).toEqual([0]);
    expect(call?.[1]).not.toEqual(['m1']);
  });

  it('tombol Review juga mengirim rowIndex', () => {
    render(<TabMail />);
    const review = screen.getByText('button.review').closest('button') as HTMLButtonElement;
    fireEvent.click(review);

    const call = secureMock.mock.calls.find((c) => c[0] === 'reviewForm');
    expect(call, 'reviewForm tidak dipanggil').toBeTruthy();
    expect(call?.[1]).toEqual([0]);
  });

  it('kolom Kode Job menampilkan kode dari field `code`', () => {
    render(<TabMail />);
    // Kolom ke-3 tabel: [0] checkbox, [1] tanggal, [2] kode job.
    const cell = document.querySelectorAll('tbody tr td')[2];
    expect(cell?.textContent).toContain('TG591ASJ');
  });
});
