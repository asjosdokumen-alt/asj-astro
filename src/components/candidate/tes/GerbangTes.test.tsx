/**
 * GerbangTes.test.tsx — tiga lapis gerbang dua tes mandiri.
 *
 * YANG DIJAGA
 *   Bukan teksnya (kamus di-mock, jadi `t()` mengembalikan KEY), melainkan
 *   KEPUTUSANNYA, dibaca lewat `data-testid`:
 *
 *   1. belum login        → formulir masuk, bukan kuis;
 *   2. bukan siswa ASJ    → kartu "khusus siswa", bukan kuis;
 *   3. sakelar admin OFF  → kartu "belum dibuka" + ajakan menghubungi admin;
 *   4. sakelar ON         → kuis dirender.
 *
 *   Kasus 3 adalah permintaan pemilik 2026-11-06: *"ketika toggle di panel admin
 *   offkan maka gak bisa di akses lagi walau mereka vip"*. Kalau gerbang ini
 *   hanya membaca status VIP, siswa VIP tetap bisa masuk saat tes ditutup.
 */
import { render, screen, waitFor, cleanup } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IsiTes, useGerbangTes } from './GerbangTes';
import { apiClient } from '../../../lib/apiClient';
import { authStore } from '../../../store/authReactive';

vi.mock('../../../lib/apiClient', () => ({ apiClient: vi.fn() }));
vi.mock('../../../store/i18n', async () => {
  const { atom } = await import('nanostores');
  return { t: (k: string) => k, langStore: atom<'id' | 'jp'>('id'), toggleLang: vi.fn(), useLang: () => 'id' };
});

function Probe() {
  const gerbang = useGerbangTes('mbti');
  return (
    <IsiTes gerbang={gerbang} jenis="mbti">
      <p data-testid="kuis">KUIS</p>
    </IsiTes>
  );
}

function masukSebagaiKandidat() {
  authStore.set({
    role: 'kandidat',
    name: 'tes',
    wa: '6281234567890',
    sessionToken: 'tok',
    refreshToken: '',
    isLoggedIn: true,
    lastChecked: Date.now(),
  });
}

beforeEach(() => {
  vi.mocked(apiClient).mockReset();
  window.history.replaceState({}, '', '/tes-mbti');
  authStore.set({
    role: 'guest',
    name: '',
    wa: '',
    sessionToken: '',
    refreshToken: '',
    isLoggedIn: false,
    lastChecked: 0,
  });
});

afterEach(() => cleanup());

describe('GerbangTes', () => {
  it('belum login → formulir masuk, kuis tidak dirender', async () => {
    render(<Probe />);
    await waitFor(() => expect(screen.queryByTestId('kuis')).toBeNull());
    // LoginGate memakai kunci kotoba.gate_title sebagai aria-label.
    expect(document.querySelector('[aria-label="kotoba.gate_title"]')).toBeTruthy();
    expect(apiClient).not.toHaveBeenCalled();
  });

  it('bukan siswa ASJ → kartu khusus siswa', async () => {
    masukSebagaiKandidat();
    vi.mocked(apiClient).mockResolvedValue({ success: false, isVip: false } as never);
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('tes-khusus-siswa')).toBeTruthy());
    expect(screen.queryByTestId('kuis')).toBeNull();
  });

  it('sakelar admin OFF → kartu "belum dibuka", walau VIP', async () => {
    masukSebagaiKandidat();
    vi.mocked(apiClient).mockResolvedValue({
      success: true,
      isVip: true,
      aktif: { mbti: false, mata: true },
      selesai: {},
      hasil: {},
    } as never);
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('tes-tertutup')).toBeTruthy());
    expect(screen.queryByTestId('kuis')).toBeNull();
  });

  it('sakelar admin ON → kuis dirender', async () => {
    masukSebagaiKandidat();
    vi.mocked(apiClient).mockResolvedValue({
      success: true,
      isVip: true,
      aktif: { mbti: true, mata: false },
      selesai: {},
      hasil: {},
    } as never);
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('kuis')).toBeTruthy());
    expect(screen.queryByTestId('tes-tertutup')).toBeNull();
  });

  it('status belum terbaca → TIDAK merender kuis (tidak ada kilasan soal)', () => {
    masukSebagaiKandidat();
    // Promise yang tidak pernah selesai: status tetap null.
    vi.mocked(apiClient).mockImplementation(() => new Promise(() => {}) as never);
    render(<Probe />);
    expect(screen.queryByTestId('kuis')).toBeNull();
    expect(screen.getByTestId('tes-memuat')).toBeTruthy();
  });
});
