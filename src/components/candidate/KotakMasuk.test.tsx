/**
 * KotakMasuk.test.tsx — kotak masuk kandidat.
 *
 * Yang diuji adalah keputusan yang tidak terlihat dari teks (kamus di-mock,
 * jadi `t()` mengembalikan KEY): berapa yang belum dibaca, apa yang terjadi
 * saat "tandai semua", dan bahwa daftar kosong tidak ditampilkan sebagai galat.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KotakMasuk from './KotakMasuk';
import { api } from '../../lib/apiClient';

vi.mock('../../lib/apiClient', () => ({ api: { secure: vi.fn() } }));
vi.mock('../../lib/fcm', () => ({ requestNotificationPermission: vi.fn() }));
vi.mock('../../lib/navigate', () => ({ navigateTo: vi.fn() }));
vi.mock('../Toast', () => ({ showToast: vi.fn() }));
vi.mock('../../store/i18n', async () => {
  const { atom } = await import('nanostores');
  return { t: (k: string) => k, langStore: atom<'id' | 'jp'>('id'), toggleLang: vi.fn(), useLang: () => 'id' };
});

const BARIS = [
  {
    id: 1,
    jenis: 'dokumen',
    judul: 'Berkas perlu revisi',
    isi: 'KTP buram, mohon difoto ulang.',
    url: '/candidate',
    dibaca_pada: null,
    dibuat_pada: '2026-11-06T10:00:00.000Z',
  },
  {
    id: 2,
    jenis: 'jadwal',
    judul: 'MCU 7 hari lagi',
    isi: 'MCU dijadwalkan 13 November.',
    url: '/candidate',
    dibaca_pada: null,
    dibuat_pada: '2026-11-05T10:00:00.000Z',
  },
];

beforeEach(() => {
  vi.mocked(api.secure).mockReset();
});

afterEach(() => cleanup());

describe('KotakMasuk', () => {
  it('menampilkan isi dan jumlah belum dibaca', async () => {
    vi.mocked(api.secure).mockResolvedValue({ success: true, notifikasi: BARIS, belumDibaca: 2 });
    render(<KotakMasuk wa="6281234567890" />);
    await waitFor(() => expect(screen.getByText('Berkas perlu revisi')).toBeTruthy());
    expect(screen.getByText('MCU 7 hari lagi')).toBeTruthy();
    // Badge angka 2 (aria-label memakai kunci kamus + angka).
    expect(screen.getByLabelText('2 notif.belum')).toBeTruthy();
  });

  it('daftar kosong → pesan kosong, bukan galat', async () => {
    vi.mocked(api.secure).mockResolvedValue({ success: true, notifikasi: [], belumDibaca: 0 });
    render(<KotakMasuk wa="6281234567890" />);
    await waitFor(() => expect(screen.getByText('notif.kosong')).toBeTruthy());
  });

  it('"tandai semua" memanggil action dan menghapus badge', async () => {
    vi.mocked(api.secure).mockResolvedValue({ success: true, notifikasi: BARIS, belumDibaca: 2 });
    render(<KotakMasuk wa="6281234567890" />);
    await waitFor(() => expect(screen.getByText('Berkas perlu revisi')).toBeTruthy());

    fireEvent.click(screen.getByText('notif.tandai_semua'));
    await waitFor(() =>
      expect(vi.mocked(api.secure)).toHaveBeenCalledWith(
        'tandaiSemuaNotifikasiDibaca',
        ['6281234567890'],
        expect.anything(),
      ),
    );
    expect(screen.queryByLabelText('2 notif.belum')).toBeNull();
  });

  it('sesi tidak valid tidak ditampilkan sebagai daftar kosong', async () => {
    vi.mocked(api.secure).mockResolvedValue({ success: false, sessionInvalid: true });
    render(<KotakMasuk wa="6281234567890" />);
    await waitFor(() => expect(screen.getByText('notif.galat')).toBeTruthy());
  });
});

// ==========================================
// TESTS: klik & hapus (2026-11-07)
//
// Laporan pemilik: "pesannya gak bisa di pencet dan gak bisa di delete".
// Dua-duanya benar: semua pemberitahuan menunjuk `/candidate` (halaman yang
// sedang dibuka) sehingga klik tidak membawa ke mana-mana, dan tidak ada
// tombol hapus sama sekali.
// ==========================================
describe('KotakMasuk — membuka & menghapus', () => {
  it('menandai dibaca lalu membuka anchor tujuannya', async () => {
    const { navigateTo } = await import('../../lib/navigate');
    vi.mocked(api.secure).mockResolvedValue({
      success: true,
      notifikasi: [{ ...BARIS[0], url: '/candidate#revisi' }],
      belumDibaca: 1,
    });
    render(<KotakMasuk wa="6281234567890" />);
    await waitFor(() => expect(screen.getByText('Berkas perlu revisi')).toBeTruthy());

    fireEvent.click(screen.getByText('Berkas perlu revisi'));
    await waitFor(() => expect(vi.mocked(navigateTo)).toHaveBeenCalledWith('/candidate#revisi'));
    expect(vi.mocked(api.secure)).toHaveBeenCalledWith(
      'tandaiNotifikasiDibaca',
      ['6281234567890', 1],
      expect.anything(),
    );
  });

  it('TIDAK memuat ulang halaman kalau tujuannya halaman ini juga', async () => {
    const { navigateTo } = await import('../../lib/navigate');
    vi.mocked(navigateTo).mockClear();
    // jsdom: pathname = '/'. Tujuan yang sama persis = tidak ada gunanya pindah.
    vi.mocked(api.secure).mockResolvedValue({
      success: true,
      notifikasi: [{ ...BARIS[0], url: '/' }],
      belumDibaca: 1,
    });
    render(<KotakMasuk wa="6281234567890" />);
    await waitFor(() => expect(screen.getByText('Berkas perlu revisi')).toBeTruthy());

    fireEvent.click(screen.getByText('Berkas perlu revisi'));
    await waitFor(() => expect(vi.mocked(api.secure)).toHaveBeenCalled());
    expect(vi.mocked(navigateTo)).not.toHaveBeenCalled();
  });

  it('menghapus satu pemberitahuan', async () => {
    vi.mocked(api.secure).mockResolvedValue({ success: true, notifikasi: BARIS, belumDibaca: 2 });
    render(<KotakMasuk wa="6281234567890" />);
    await waitFor(() => expect(screen.getByText('Berkas perlu revisi')).toBeTruthy());

    fireEvent.click(screen.getByLabelText('notif.hapus: Berkas perlu revisi'));
    await waitFor(() => expect(screen.queryByText('Berkas perlu revisi')).toBeNull());
    // Yang lain tidak ikut terhapus.
    expect(screen.getByText('MCU 7 hari lagi')).toBeTruthy();
    expect(vi.mocked(api.secure)).toHaveBeenCalledWith(
      'hapusNotifikasi',
      ['6281234567890', 1],
      expect.anything(),
    );
  });

  it('mengembalikan baris kalau server menolak menghapus', async () => {
    const { showToast } = await import('../Toast');
    vi.mocked(api.secure)
      .mockResolvedValueOnce({ success: true, notifikasi: BARIS, belumDibaca: 2 })
      .mockResolvedValueOnce({ success: false });
    render(<KotakMasuk wa="6281234567890" />);
    await waitFor(() => expect(screen.getByText('Berkas perlu revisi')).toBeTruthy());

    fireEvent.click(screen.getByLabelText('notif.hapus: Berkas perlu revisi'));
    await waitFor(() => expect(vi.mocked(showToast)).toHaveBeenCalledWith('notif.galat_hapus', 'error'));
    // Baris yang gagal dihapus TIDAK boleh hilang dari layar.
    expect(screen.getByText('Berkas perlu revisi')).toBeTruthy();
  });

  it('"Bersihkan" hanya menghapus yang sudah dibaca', async () => {
    vi.mocked(api.secure).mockResolvedValue({
      success: true,
      notifikasi: [{ ...BARIS[0], dibaca_pada: '2026-11-06T11:00:00.000Z' }, BARIS[1]],
      belumDibaca: 1,
    });
    render(<KotakMasuk wa="6281234567890" />);
    await waitFor(() => expect(screen.getByText('notif.bersihkan')).toBeTruthy());

    fireEvent.click(screen.getByText('notif.bersihkan'));
    await waitFor(() => expect(screen.queryByText('Berkas perlu revisi')).toBeNull());
    expect(screen.getByText('MCU 7 hari lagi')).toBeTruthy();
    expect(vi.mocked(api.secure)).toHaveBeenCalledWith(
      'hapusNotifikasi',
      ['6281234567890'],
      expect.anything(),
    );
  });
});
