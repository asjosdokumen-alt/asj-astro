/**
 * TESTS: "gagal memuat" harus BEDA dari "memang kosong".
 *
 * KENAPA DI `e2e/`: `indexer` menghitung SELURUH berkas di bawah `src/**`, jadi
 * `.test.tsx` baru di sana memindahkan counter beku.
 *
 * BUG YANG DIKUNCI (sweep 2026-10-11)
 * ----------------------------------
 * Lima tab menangkap kegagalan permintaan dengan `catch { console.error(...) }`
 * saja. Daftarnya tetap kosong, lalu layar menampilkan teks "belum ada data" —
 * jadi admin TIDAK BISA membedakan "memang tidak ada job/jadwal/template" dari
 * "permintaannya gagal". Tindakannya berbeda: yang satu selesai, yang satu lagi
 * tinggal dicoba lagi.
 *
 * ── KENAPA TIDAK ADA `mockReset()` DI `beforeEach` ───────────────────────────
 * Versi pertama tes ini memasang `beforeEach(() => mockSecure.mockReset())`.
 * Tes GAGAL dengan `Error: network down` — dan itu menyesatkan, karena
 * komponennya benar: `load_failed` memang dirender (diperiksa terpisah lewat
 * probe DOM). Penyebabnya `mockReset()`: ia mencabut implementasi seketika,
 * sementara promise yang ditolak mock masih dalam penerbangan, lalu vitest
 * menimpakan penolakan itu ke tes yang memulainya.
 *
 * Diisolasi dengan satu variabel: probe yang sama, bedanya HANYA baris
 * `mockReset()` — dengan reset ⇒ merah, tanpa reset ⇒ hijau. Karena setiap
 * `it()` di sini memasang implementasinya sendiri, reset tidak dibutuhkan.
 */
import { render, screen, cleanup } from '@testing-library/preact';
import { describe, it, expect, vi, afterEach } from 'vitest';
import TabJadwal from '../src/components/admin/TabJadwal';

const { mockSecure } = vi.hoisted(() => ({ mockSecure: vi.fn() }));

vi.mock('../src/components/Toast', () => ({ showToast: vi.fn() }));
vi.mock('../src/lib/apiClient', () => ({
  default: { secure: (...a: unknown[]) => mockSecure(...a) },
}));
vi.mock('../src/store/i18n', async () => {
  const { atom } = await import('nanostores');
  return { t: (k: string) => k, langStore: atom<'id' | 'jp'>('id'), toggleLang: vi.fn() };
});

// Tidak ada `beforeEach(mockReset)`: lihat catatan di kepala berkas — reset
// mencabut implementasi saat penolakan masih dalam penerbangan dan membuat tes
// merah padahal komponennya benar. Tiap `it()` memasang implementasinya sendiri.
afterEach(cleanup);

describe('TabJadwal — kegagalan permintaan', () => {
  it('permintaan GAGAL ⇒ tampil "gagal memuat" + tombol coba lagi, bukan "belum ada jadwal"', async () => {
    mockSecure.mockImplementation(async () => { throw new Error('network down'); });
    render(<TabJadwal />);

    // `findByText`, bukan `queryByText`: `load()` dipanggil dari `useEffect` dan
    // tidak di-`await` komponen, jadi penolakan mock baru selesai satu putaran
    // event loop SETELAH `render` — lihat catatan di kepala berkas.
    await screen.findByText('ui.load_failed');
    expect(screen.queryByText('admin.jadwal_empty')).toBeNull();
    expect(screen.getByText('ui.retry')).toBeTruthy();
  });

  it('permintaan BERHASIL tapi kosong ⇒ tetap "belum ada jadwal"', async () => {
    mockSecure.mockResolvedValue({ success: true, schedules: [], dropdowns: { tsk: [] } });
    render(<TabJadwal />);

    await screen.findByText('admin.jadwal_empty');
    expect(screen.queryByText('ui.load_failed')).toBeNull();
  });
});
