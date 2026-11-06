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
