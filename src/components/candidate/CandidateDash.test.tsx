// ==========================================
// TESTS: CandidateDash — gerbang AI CV Master + lencana VIP (§6, 2026-09-14)
//
// Owner: "fungsi vip itu gate buat fitur fitur khusus siswa ASJ, sesuai legacy
// saja 100%."
//
// Ground truth legacy:
//   • bukaMasterEksternal()  js/03_candidate.ts:124 — tombol AI CV Master hanya
//     membuka halaman untuk siswa ASJ (isVipCatatan: [VIP] ATAU [KELAS xx]);
//     selain itu `showToast(ui.toast_ai_cv_locked, 'info')`. Sebelumnya Astro
//     memakai <a href="/ai-cv"> TANPA gate — kandidat luar masuk lalu ditolak
//     server dengan pesan generik.
//   • lencana "Siswa Resmi ASJ" js/engine/dashboard.ts:218 — <img> logo ASJ
//     (title ui.badge_official) HANYA saat tag [VIP] literal.
//   • "PERFECT ASJ STUDENT" js/engine/dashboard.ts:246 — VIP + CV Mini 100% +
//     CV Master 100%.
//
// Dua predikat yang SENGAJA berbeda dan diuji di sini:
//   gate  → isVipCatatan  ([VIP] ATAU [KELAS xx])
//   badge → tag [VIP] literal saja (data.isVIP)
// ==========================================
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CandidateDash from './CandidateDash';
import { showToast } from '../Toast';
import { authStore, type AuthState } from '../../store/authReactive';

vi.mock('../Toast', () => ({ showToast: vi.fn() }));
vi.mock('../../store/i18n', async () => {
  const { atom } = await import('nanostores');
  return { t: (k: string) => k, langStore: atom<'id' | 'jp'>('id'), toggleLang: vi.fn() };
});
vi.mock('../../lib/apiClient', () => ({ apiClient: vi.fn(async () => ({ success: true })), api: {}, default: {} }));

const KANDIDAT: AuthState = {
  role: 'kandidat', name: 'Budi', wa: '081234567890',
  sessionToken: 'tok123', refreshToken: '', isLoggedIn: true, lastChecked: Date.now(),
};

const fetchMock = vi.fn();

/** Baris getAppData('kandidat') yang realistis (bentuk hasil attachBerkasBio). */
function row(over: Record<string, unknown> = {}) {
  return {
    nama: 'Budi', idLoker: 'JOB-1', tahapan: 'MCU', status: 'PROSES',
    idKandidat: 'ASJ-001', catatanInt: '', cvMiniProgress: 0, cvMasterProgress: 0,
    ...over,
  };
}

function mockDash(over: Record<string, unknown> = {}) {
  // Adapter A05 membaca progres dari `kandidatData` (kontrak GAS legacy), bukan
  // dari baris candidates[0] — jadi keduanya harus diisi.
  const { cvMiniProgress = 0, cvMasterProgress = 0, ...rest } = over as Record<string, unknown> & {
    cvMiniProgress?: number; cvMasterProgress?: number;
  };
  fetchMock.mockResolvedValue({
    json: async () => ({
      success: true,
      candidates: [row(rest)],
      kandidatData: { cvMiniProgress, cvMasterProgress },
      kandidatRiwayat: [], mySchedules: [],
    }),
  });
}

let realLocation: Location;
function stubLocation() {
  realLocation = window.location;
  Object.defineProperty(window, 'location', { configurable: true, writable: true, value: { href: '' } });
}
const href = () => (window as unknown as { location: { href: string } }).location.href;

async function renderDash(over: Record<string, unknown> = {}) {
  mockDash(over);
  render(<CandidateDash />);
  // Tunggu dashboard selesai memuat (tombol aksi muncul setelah data ada).
  await waitFor(() => expect(screen.getByRole('button', { name: 'ui.ai_cv_assistant' })).toBeTruthy());
}

describe('CandidateDash — gerbang AI CV Master (§6 gap 1)', () => {
  beforeEach(() => {
    localStorage.clear();
    authStore.set({ ...KANDIDAT });
    fetchMock.mockReset();
    vi.mocked(showToast).mockReset();
    vi.stubGlobal('fetch', fetchMock);
    stubLocation();
  });
  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: realLocation });
    vi.unstubAllGlobals();
  });

  it('kandidat NON-siswa → toast ui.toast_ai_cv_locked (info) dan TIDAK membuka /ai-cv', async () => {
    await renderDash({ catatanInt: 'kandidat umum' });
    await fireEvent.click(screen.getByRole('button', { name: 'ui.ai_cv_assistant' }));
    expect(showToast).toHaveBeenCalledWith('ui.toast_ai_cv_locked', 'info');
    expect(href()).toBe('');
  });

  it('siswa VIP ([VIP]) → membuka /ai-cv tanpa toast terkunci', async () => {
    await renderDash({ catatanInt: '[VIP]' });
    await fireEvent.click(screen.getByRole('button', { name: 'ui.ai_cv_assistant' }));
    expect(href()).toBe('/ai-cv');
    expect(showToast).not.toHaveBeenCalledWith('ui.toast_ai_cv_locked', 'info');
  });

  it('siswa KELAS ([KELAS G], tanpa [VIP]) → gate TERBUKA (isVipCatatan mencakup KELAS)', async () => {
    await renderDash({ catatanInt: '[KELAS G] murid' });
    await fireEvent.click(screen.getByRole('button', { name: 'ui.ai_cv_assistant' }));
    expect(href()).toBe('/ai-cv');
  });
});

describe('CandidateDash — lencana VIP + PERFECT ASJ STUDENT (§6 gap 4/5)', () => {
  beforeEach(() => {
    localStorage.clear();
    authStore.set({ ...KANDIDAT });
    fetchMock.mockReset();
    vi.mocked(showToast).mockReset();
    vi.stubGlobal('fetch', fetchMock);
    stubLocation();
  });
  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: realLocation });
    vi.unstubAllGlobals();
  });

  it('VIP → lencana logo ASJ (title ui.badge_official) tampil di header', async () => {
    await renderDash({ catatanInt: '[VIP]' });
    expect(screen.getByTitle('ui.badge_official')).toBeTruthy();
  });

  it('NON-VIP → tanpa lencana logo ASJ', async () => {
    await renderDash({ catatanInt: 'kandidat umum' });
    expect(screen.queryByTitle('ui.badge_official')).toBeNull();
  });

  it('KELAS saja → tanpa lencana (badge legacy memakai [VIP] literal, bukan isVipCatatan)', async () => {
    await renderDash({ catatanInt: '[KELAS G] murid' });
    expect(screen.queryByTitle('ui.badge_official')).toBeNull();
  });

  it('VIP + CV Mini 100% + CV Master 100% → "PERFECT ASJ STUDENT"', async () => {
    await renderDash({ catatanInt: '[VIP]', cvMiniProgress: 100, cvMasterProgress: 100 });
    expect(screen.getByText('ui.perfect_student')).toBeTruthy();
  });

  it('NON-VIP + keduanya 100% → bukan PERFECT (tetap pesan profil biasa)', async () => {
    await renderDash({ catatanInt: 'kandidat umum', cvMiniProgress: 100, cvMasterProgress: 100 });
    expect(screen.queryByText('ui.perfect_student')).toBeNull();
    expect(screen.getByText('ui.profile_100')).toBeTruthy();
  });
});
