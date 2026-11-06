/**
 * KartuNotifikasiAdmin.test.tsx — tombol izin push untuk perangkat admin.
 *
 * Yang dijaga: kartu ini HARUS membedakan "izin diberikan" dari "token
 * terdaftar". Dua keadaan itu terlihat sama di UI yang buruk, dan pada
 * 2026-11-06 perbedaannya nyata: tidak ada satu perangkat admin pun terdaftar.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KartuNotifikasiAdmin from './KartuNotifikasiAdmin';
import { api } from '../../lib/apiClient';
import { requestNotificationPermission } from '../../lib/fcm';

vi.mock('../../lib/apiClient', () => ({ api: { secure: vi.fn() } }));
vi.mock('../../lib/fcm', () => ({ requestNotificationPermission: vi.fn() }));
vi.mock('../../store/i18n', async () => {
  const { atom } = await import('nanostores');
  return { t: (k: string) => k, langStore: atom<'id' | 'jp'>('id'), toggleLang: vi.fn(), useLang: () => 'id' };
});

beforeEach(() => {
  vi.mocked(api.secure).mockReset();
  vi.mocked(requestNotificationPermission).mockReset();
  vi.stubGlobal('Notification', { permission: 'default' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('KartuNotifikasiAdmin', () => {
  it('menampilkan "belum ada perangkat" saat server melaporkan 0', async () => {
    vi.mocked(api.secure).mockResolvedValue({ success: true, perangkat: 0 });
    render(<KartuNotifikasiAdmin />);
    await waitFor(() => expect(screen.getByText(/notif\.admin_belum/)).toBeTruthy());
    expect(screen.getByText('notif.admin_aktifkan')).toBeTruthy();
  });

  it('menampilkan jumlah perangkat saat sudah terdaftar', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' });
    vi.mocked(api.secure).mockResolvedValue({ success: true, perangkat: 2 });
    render(<KartuNotifikasiAdmin />);
    await waitFor(() => expect(screen.getByText(/2 notif\.admin_perangkat/)).toBeTruthy());
    expect(screen.getByText('notif.admin_aktif')).toBeTruthy();
  });

  it('izin sudah diberikan tapi 0 perangkat → tombol "daftarkan"', async () => {
    vi.stubGlobal('Notification', { permission: 'granted' });
    vi.mocked(api.secure).mockResolvedValue({ success: true, perangkat: 0 });
    render(<KartuNotifikasiAdmin />);
    await waitFor(() => expect(screen.getByText('notif.admin_daftarkan')).toBeTruthy());
  });

  it('menekan tombol mendaftarkan perangkat lalu memuat ulang jumlahnya', async () => {
    vi.mocked(api.secure)
      .mockResolvedValueOnce({ success: true, perangkat: 0 })
      .mockResolvedValueOnce({ success: true, perangkat: 1 });
    vi.mocked(requestNotificationPermission).mockResolvedValue('registered');
    render(<KartuNotifikasiAdmin />);
    await waitFor(() => expect(screen.getByText('notif.admin_aktifkan')).toBeTruthy());

    fireEvent.click(screen.getByText('notif.admin_aktifkan'));
    await waitFor(() => expect(requestNotificationPermission).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(/1 notif\.admin_perangkat/)).toBeTruthy());
  });

  it('ditolak permanen → tidak menawarkan tombol lagi', async () => {
    vi.stubGlobal('Notification', { permission: 'denied' });
    vi.mocked(api.secure).mockResolvedValue({ success: true, perangkat: 0 });
    render(<KartuNotifikasiAdmin />);
    await waitFor(() => expect(screen.getByText('notif.admin_ditolak')).toBeTruthy());
    expect(screen.queryByText('notif.admin_aktifkan')).toBeNull();
  });
});
