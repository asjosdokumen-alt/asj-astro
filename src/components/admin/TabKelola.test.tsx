// ==========================================
// TESTS: TabKelola — panel admin loker membaca lewat cache (§26)
//
// Panel ini dulu memakai fetch() mentah ke getAppData sehingga MELEWATI cache
// baca 30 s di apiClient — padahal getAppData ADA di CACHEABLE_READS dan
// TabDbJob sudah memakai jalur cache itu. Akibatnya payload 107 KB yang sama
// ditarik ulang setiap mount (terukur 3x dalam satu pemuatan halaman) dan
// baris pertama tabel baru muncul ~1,8 s. Invarian yang dipaku:
//   1. TabKelola membaca lewat api.secure('getAppData', ['admin']).
//   2. Tidak ada fetch() mentah untuk endpoint itu.
// ==========================================
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const secure = vi.fn();
const rawFetch = vi.fn();

vi.mock('../../lib/apiClient', () => ({
  default: { secure: (...a: unknown[]) => secure(...a) },
}));

// Pakai kamus asli, bukan k => k: assertion di bawah memakai teks data
// ('Kaigo', 'TG1') sehingga tidak bergantung ada/tidaknya terjemahan.
vi.mock('../../store/i18n', async () => {
  const actual = await vi.importActual<typeof import('../../store/i18n')>('../../store/i18n');
  return { ...actual, t: actual.t };
});

vi.stubGlobal('fetch', rawFetch);

import TabKelola from './TabKelola';
import { invalidateAdminData } from '../../store/adminData';

const JOBS = [
  {
    code: 'TG1',
    pekerjaan: 'Kaigo',
    status: 'OPEN',
    kategori: 'KAIGO',
    gender: '',
    lokasi: 'Tokyo',
    kuota: '1',
    keterangan: '',
  },
];

beforeEach(() => {
  // Cache payload admin hidup di tingkat MODUL: tanpa reset, tes kedua di
  // berkas ini membaca hasil tes pertama dan `api.secure` tidak pernah
  // dipanggil — tesnya jadi hijau karena alasan yang salah.
  invalidateAdminData();
  secure.mockReset();
  rawFetch.mockReset();
  secure.mockResolvedValue({ success: true, jobs: JOBS });
});

afterEach(() => cleanup());

describe('TabKelola — baca loker lewat cache apiClient (§26)', () => {
  it('memakai api.secure("getAppData", ["admin"]) lalu menampilkan barisnya', async () => {
    render(<TabKelola />);

    // Opsi ketiga ikut ditegaskan: tanpa `onSessionInvalid: 'throw'`, sesi yang
    // tidak bisa diverifikasi memicu logout + redirect global dari apiClient —
    // dan `/admin` (tab default = TabKelola) langsung terlempar ke `/`, yang
    // membuat gate e2e judul halaman (§23) merah. Perf tidak boleh mengubah
    // semantik sesi.
    //
    // `objectContaining` (bukan objek persis): panggilan sekarang lewat
    // `store/adminData`, yang menambahkan `silent` (tab ini tidak pernah
    // menampilkan toast sendiri) dan kadang `force`. Yang diuji adalah
    // KEHADIRAN `onSessionInvalid: 'throw'`, bukan tidak adanya kunci lain.
    await waitFor(() =>
      expect(secure).toHaveBeenCalledWith('getAppData', ['admin'], expect.objectContaining({ onSessionInvalid: 'throw' })),
    );
    expect(await screen.findByText('Kaigo')).toBeTruthy();
    expect(screen.getByText('TG1')).toBeTruthy();
  });

  it('tidak memakai fetch() mentah (regresi: panel menarik ulang payload penuh)', async () => {
    render(<TabKelola />);

    await waitFor(() => expect(secure).toHaveBeenCalled());
    expect(rawFetch).not.toHaveBeenCalled();
  });

  /**
   * Permintaan pemilik 2026-10-22: *"lowongan publik kok gak di 10 baris
   * saja? … bisa saja pakai buka lebih banyak"*. Daftar loker admin dulu
   * merender SEMUA baris sekaligus.
   */
  it(
    'merender 10 baris pertama, sisanya lewat "Muat Lebih Banyak"',
    async () => {
      const many = Array.from({ length: 25 }, (_, i) => ({
        code: `TG${i + 1}`, pekerjaan: `Job ${i + 1}`, status: 'OPEN',
        kategori: 'KAIGO', gender: '', lokasi: 'Tokyo', kuota: '1', keterangan: '',
      }));
      secure.mockResolvedValue({ success: true, jobs: many });

      render(<TabKelola />);
      await waitFor(() => expect(screen.getByText('TG1')).toBeTruthy());

      const rows = () => document.querySelectorAll('tbody tr').length;
      expect(rows()).toBe(10);
      expect(screen.queryByText('TG11')).toBeNull();
      expect(screen.getByText(`25 ${(await import('../../store/i18n')).t('ui.jobs_suffix')}`)).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: /Muat Lebih Banyak/ }));
      expect(rows()).toBe(20);
      expect(screen.getByText('TG11')).toBeTruthy();
      expect(screen.queryByText('TG21')).toBeNull();
    },
  );
});
