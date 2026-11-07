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

function masukSebagaiAdmin() {
  authStore.set({
    role: 'admin',
    name: 'admin',
    wa: '',
    sessionToken: 'tok-admin',
    refreshToken: '',
    isLoggedIn: true,
    lastChecked: Date.now(),
  });
}

const AKTIF_MBTI = { success: true, aktif: { mbti: true, mata: false }, selesai: {}, hasil: {} };

beforeEach(() => {
  vi.mocked(apiClient).mockReset();
  window.history.replaceState({}, '', '/tes-mbti');
  /* Nomor uji disimpan di localStorage; tanpa pembersihan, satu kasus bisa
     mewarisi nomor dari kasus sebelumnya dan lulus karena alasan yang salah. */
  localStorage.removeItem('asj_wa_uji');
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

  /* ── Mode uji admin (2026-11-07) ──────────────────────────────────────────
   * Pemilik: *"kasih jalur khusus di panel admin biar bisa kami coba … jadi
   * admin gak perlu login logout mulu"*. Yang dijaga di sini BUKAN tampilan,
   * melainkan dua keputusan: siapa yang boleh masuk tanpa nomor, dan nomor
   * siapa yang dipakai saat masuk. */
  it('admin + ?uji=1 tanpa nomor → kuis dirender, bukan formulir masuk', async () => {
    masukSebagaiAdmin();
    window.history.replaceState({}, '', '/tes-mbti?uji=1');
    vi.mocked(apiClient).mockResolvedValue(AKTIF_MBTI as never);
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('kuis')).toBeTruthy());
    // Tanpa nomor, status tetap diminta: `getStatusTes('')` melaporkan sakelar.
    expect(vi.mocked(apiClient).mock.calls[0][1]).toEqual(['']);
  });

  it('admin: ?wa= di URL dipakai sebagai identitas uji', async () => {
    masukSebagaiAdmin();
    window.history.replaceState({}, '', '/tes-mbti?uji=1&wa=6289999999999');
    vi.mocked(apiClient).mockResolvedValue(AKTIF_MBTI as never);
    render(<Probe />);
    await waitFor(() => expect(vi.mocked(apiClient)).toHaveBeenCalled());
    expect(vi.mocked(apiClient).mock.calls[0][1]).toEqual(['6289999999999']);
  });

  it('admin: nomor uji tersimpan dipakai saat URL tidak membawa ?wa=', async () => {
    masukSebagaiAdmin();
    localStorage.setItem('asj_wa_uji', '6281111111111');
    window.history.replaceState({}, '', '/tes-mbti?uji=1');
    vi.mocked(apiClient).mockResolvedValue(AKTIF_MBTI as never);
    render(<Probe />);
    await waitFor(() => expect(vi.mocked(apiClient)).toHaveBeenCalled());
    expect(vi.mocked(apiClient).mock.calls[0][1]).toEqual(['6281111111111']);
  });

  it('kandidat: ?wa= orang lain diabaikan — yang dipakai WA sesinya sendiri', async () => {
    masukSebagaiKandidat();
    window.history.replaceState({}, '', '/tes-mbti?wa=6289999999999');
    vi.mocked(apiClient).mockResolvedValue({ ...AKTIF_MBTI, isVip: true } as never);
    render(<Probe />);
    await waitFor(() => expect(vi.mocked(apiClient)).toHaveBeenCalled());
    expect(vi.mocked(apiClient).mock.calls[0][1]).toEqual(['6281234567890']);
  });

  it('bukan admin: ?uji=1 TIDAK membuka gerbang — formulir masuk tetap muncul', async () => {
    /* Kasus terkuat: tamu tanpa sesi. Kalau `modeUji()` tidak memeriksa peran,
       siapa pun yang menambahkan `?uji=1` akan masuk ke soal tanpa login. */
    window.history.replaceState({}, '', '/tes-mbti?uji=1');
    render(<Probe />);
    await waitFor(() => expect(document.querySelector('[aria-label="kotoba.gate_title"]')).toBeTruthy());
    expect(screen.queryByTestId('kuis')).toBeNull();
    expect(apiClient).not.toHaveBeenCalled();
  });

  it('admin TANPA ?uji=1: nomor tersimpan tidak dipakai — jalur itu MENULIS hasil', async () => {
    /* Nomor uji adalah identitas percobaan. Kalau ia dipakai juga di luar mode
       uji, admin yang membuka `/tes-mbti` langsung akan diam-diam menyimpan
       hasil atas nama siswa itu — tepat hal yang mode uji ada untuk mencegah. */
    masukSebagaiAdmin();
    localStorage.setItem('asj_wa_uji', '6281111111111');
    window.history.replaceState({}, '', '/tes-mbti');
    render(<Probe />);
    await waitFor(() => expect(document.querySelector('[aria-label="kotoba.gate_title"]')).toBeTruthy());
    expect(apiClient).not.toHaveBeenCalled();
  });
});
