// ==========================================
// TESTS: AiCvForm (C03, 2026-09-05) — login gate + simpan tanpa sesi
//
// Parity facts: backend minta sesi untuk chat (processAIChat H4 guard) DAN
// simpan (submitDataAsj admin/kandidat + owner scope); apiClient tanpa sesi
// menampilkan toast + logout + window.location.href='/' → seluruh state CV
// hilang. Fix (pola MasterFullForm): gate login saat mount tanpa sesi, guard
// di saveToDatabase (buka gate, bukan redirect), chat membawa token sesi.
// ==========================================
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AiCvForm from './AiCvForm';
import { showToast } from '../Toast';
import { apiClient } from '../../lib/apiClient';
import { uploadMany } from '../../lib/cloudinary';
import { authStore, type AuthState } from '../../store/authReactive';

vi.mock('../Toast', () => ({ showToast: vi.fn() }));
vi.mock('../../store/i18n', async () => {
  const { atom } = await import('nanostores');
  return {
    t: (k: string) => {
      if (k === 'ai_cv.verify_account') return 'Verifikasi Akun Kandidat';
      if (k === 'login.btn_masuk') return 'Masuk';
      return k;
    },
    langStore: atom<'id' | 'jp'>('id'),
    toggleLang: vi.fn(),
  };
});
vi.mock('../../lib/cloudinary', () => ({
  uploadToCloudinary: vi.fn(async (f: File) => 'https://cloud.test/' + (f && f.name || 'doc')),
  uploadMany: vi.fn(async (files: Record<string, File | null>, map: Record<string, string>) => {
    const urls: Record<string, string> = {};
    for (const [k, pk] of Object.entries(map)) {
      const f = files[k];
      if (f) urls[pk] = 'https://cloud.test/' + (f && f.name || 'doc');
    }
    return urls;
  }),
}));
vi.mock('../../lib/apiClient', () => ({ apiClient: vi.fn() }));

const fetchMock = vi.fn();
function jsonRes(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

const GUEST: AuthState = { role: 'guest', name: '', wa: '', sessionToken: '', refreshToken: '', isLoggedIn: false, lastChecked: 0 };
const KANDIDAT: AuthState = { role: 'kandidat', name: 'Budi', wa: '081234567890', sessionToken: 'tok123', refreshToken: '', isLoggedIn: true, lastChecked: Date.now() };

describe('AiCvForm (C03) — login gate & simpan tanpa sesi', () => {
  beforeEach(() => {
    localStorage.clear();
    authStore.set({ ...GUEST });
    fetchMock.mockReset();
    vi.mocked(showToast).mockReset();
    vi.mocked(apiClient).mockReset();
    vi.mocked(apiClient).mockResolvedValue({ success: true } as any);
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('tanpa sesi → gate login tampil saat mount, TANPA panggilan API (tidak redirect / tidak drop CV)', () => {
    render(<AiCvForm />);
    expect(screen.getByText('Verifikasi Akun Kandidat')).toBeTruthy();
    expect(screen.getByPlaceholderText('08xxxxxxxxxx')).toBeTruthy();
    // Chat & tombol simpan di belakang gate — tidak bisa diakses tanpa login
    expect(screen.queryByRole('button', { name: 'button.save_db' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(apiClient).not.toHaveBeenCalled();
  });

  it('login lewat gate → gate tertutup, CV hp terisi, SIMPAN DB jalan dengan sesi baru', async () => {
    fetchMock.mockResolvedValue(jsonRes({ sessionToken: 'tok123', user: 'Budi' }));
    render(<AiCvForm />);
    await fireEvent.input(screen.getByPlaceholderText('08xxxxxxxxxx'), { target: { value: '081234567890' } });
    await fireEvent.input(screen.getByPlaceholderText('••••••••'), { target: { value: 'rahasia123' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));

    await waitFor(() => expect(screen.queryByText('Verifikasi Akun Kandidat')).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/.netlify/functions/auth');
    const body = JSON.parse(String(init.body));
    expect(body.action).toBe('loginKandidat');
    expect(body.payload[0]).toEqual({ wa: '081234567890', password: 'rahasia123' });

    await fireEvent.click(screen.getByRole('button', { name: 'button.save_db' }));
    await waitFor(() => expect(apiClient).toHaveBeenCalledTimes(1));
    const call0 = vi.mocked(apiClient).mock.calls[0]!;
    expect(call0[0]).toBe('submitDataAsj');
    expect((call0[1] as any)[0].context.wa).toBe('081234567890');
    expect(showToast).toHaveBeenCalledWith('toast.saved', 'success');
  });

  it('sudah login → tanpa gate; SIMPAN DB dengan WA kosong → toast validasi, tanpa API', async () => {
    authStore.set({ ...KANDIDAT });
    render(<AiCvForm />);
    expect(screen.queryByText('Verifikasi Akun Kandidat')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'button.save_db' }));
    expect(showToast).toHaveBeenCalledWith('Nomor WA belum diisi.', 'error');
    expect(apiClient).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sesi hilang di tengah → SIMPAN DB membuka gate, TANPA redirect (fetch/API tidak dipanggil)', async () => {
    authStore.set({ ...KANDIDAT });
    render(<AiCvForm />);
    authStore.set({ ...GUEST });
    await fireEvent.click(screen.getByRole('button', { name: 'button.save_db' }));
    expect(screen.getByText('Verifikasi Akun Kandidat')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(apiClient).not.toHaveBeenCalled();
  });

  it('chat membawa token sesi (Authorization + body.sessionToken) — backend processAIChat butuh sesi', async () => {
    authStore.set({ ...KANDIDAT });
    fetchMock.mockResolvedValue(jsonRes({ reply: 'Halo Budi!', cvData: {} }));
    render(<AiCvForm />);
    const input = screen.getByPlaceholderText('form.placeholder_chat');
    await fireEvent.input(input, { target: { value: 'Perkenalkan diriku' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/.netlify/functions/ai-chat');
    expect(String(init.headers['Authorization'])).toBe('Bearer tok123');
    const body = JSON.parse(String(init.body));
    expect(body.action).toBe('processAIChat');
    expect(body.sessionToken).toBe('tok123');
    await waitFor(() => expect(screen.getByText('Halo Budi!')).toBeTruthy());
  });

  it('upload gagal → toast "Gagal upload <key>: <msg>" EKSAK + TANPA submitDataAsj (error-return contract dedup)', async () => {
    fetchMock.mockResolvedValue(jsonRes({ sessionToken: 'tok123', user: 'Budi' }));
    render(<AiCvForm />);
    await fireEvent.input(screen.getByPlaceholderText('08xxxxxxxxxx'), { target: { value: '081234567890' } });
    await fireEvent.input(screen.getByPlaceholderText('••••••••'), { target: { value: 'rahasia123' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));
    await waitFor(() => expect(screen.queryByText('Verifikasi Akun Kandidat')).toBeNull());
    // Bentuk nyata error uploadMany: Error + key file (UploadCollectionError).
    const uploadErr = new Error('Upload Cloudinary gagal (HTTP 500): boom') as any;
    uploadErr.key = 'foto';
    vi.mocked(uploadMany).mockRejectedValueOnce(uploadErr);
    await fireEvent.click(screen.getByRole('button', { name: 'button.save_db' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Gagal upload foto: Upload Cloudinary gagal (HTTP 500): boom', 'error'));
    expect(apiClient).not.toHaveBeenCalled(); // return path: submitDataAsj tidak pernah dipanggil
  });
});
