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
import { render, screen, waitFor, cleanup } from '@testing-library/preact';
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
    await waitFor(() =>
      expect(secure).toHaveBeenCalledWith('getAppData', ['admin'], { onSessionInvalid: 'throw' }),
    );
    expect(await screen.findByText('Kaigo')).toBeTruthy();
    expect(screen.getByText('TG1')).toBeTruthy();
  });

  it('tidak memakai fetch() mentah (regresi: panel menarik ulang payload penuh)', async () => {
    render(<TabKelola />);

    await waitFor(() => expect(secure).toHaveBeenCalled());
    expect(rawFetch).not.toHaveBeenCalled();
  });
});
