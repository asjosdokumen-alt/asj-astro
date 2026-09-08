// ==========================================
// TESTS: SiswaBaruForm (C04 parity, 2026-09-05)
//
// Legacy ground truth: js/pages/siswa_baru.js xe()/Xe() (sendMessage /
// saveToDatabase) on siswa-baru.html. Root bugs pinned here:
//   1. chat used to POST action `processSiswaAIChat` to the REGISTER surface
//      (submitDaftarSiswa endpoint) → 404 "not handled by this surface"
//   2. chat payload was `[{message, history, biodata}]` — the handler reads a
//      bare OBJECT {history, currentData}, and the just-typed message (sent in
//      a field the handler ignores) never reached the AI
//   3. AI auto-fill read `data.biodata` — handler returns `data.data` with
//      snake_case keys (wa_siswa/wa_ortu)
//   4. submit was multipart FormData → /ai-form-submit (silent no-op, res.ok
//      toasted success) instead of Cloudinary uploads + JSON
//      callAPI("submitDaftarSiswa", flatSnakeObject) — public, no session
//   5. only `nama` was required — legacy saveToDatabase requires all 9 fields
//      + all 3 scans and lists the missing ones
// ==========================================
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SiswaBaruForm from './SiswaBaruForm';
import { showToast } from '../Toast';
import { uploadToCloudinary, uploadMany } from '../../lib/cloudinary';

vi.mock('../Toast', () => ({ showToast: vi.fn() }));
vi.mock('../../store/i18n', async () => {
  const { atom } = await import('nanostores');
  return { t: (k: string) => k, langStore: atom<'id' | 'jp'>('id'), toggleLang: vi.fn() };
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

const fetchMock = vi.fn();
function jsonRes(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

describe('SiswaBaruForm (C04)', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonRes({ reply: 'oke', data: {} }));
    vi.mocked(showToast).mockReset();
    vi.mocked(uploadToCloudinary).mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const typeChat = async (text: string) => {
    const input = screen.getByPlaceholderText('siswa.placeholder_chat');
    await fireEvent.input(input, { target: { value: text } });
    await fireEvent.click(screen.getByRole('button', { name: 'siswa.send' }));
  };

  it('chat → ai-chat surface with OBJECT payload whose history ends with the new user turn + snake currentData (bukan register / bukan array-of-one / bukan field message)', async () => {
    render(<SiswaBaruForm />);
    await typeChat('Nama saya Budi');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/.netlify/functions/ai-chat');
    const body = JSON.parse(String(init.body));
    expect(body.action).toBe('processSiswaAIChat');
    // payload must be the bare OBJECT (legacy callAPI contract) — not wrapped
    expect(Array.isArray(body.payload)).toBe(false);
    expect(body.payload.currentData).toMatchObject({
      nama: '', email: '', wa_siswa: '', wa_ortu: '',
    });
    const hist = body.payload.history;
    expect(Array.isArray(hist)).toBe(true);
    expect(hist.length).toBeLessThanOrEqual(20);
    expect(hist[hist.length - 1]).toEqual({ role: 'user', content: 'Nama saya Budi' });
  });

  it('AI reply renders (legacy **bold**) and data.data (snake) auto-fills the camelCase form', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({
      reply: 'Halo **Budi**!',
      data: { nama: 'Budi Santoso', gender: 'LAKI-LAKI', wa_siswa: '081234567890' },
    }));
    render(<SiswaBaruForm />);
    await typeChat('Nama saya Budi Santoso');

    await waitFor(() => expect(screen.getByText('Budi', { selector: 'strong' })).toBeTruthy());
    const inputs = screen.getAllByRole('textbox'); // [0] = chat input, then biodata order
    await waitFor(() => expect((inputs[1] as HTMLInputElement).value).toBe('Budi Santoso'));
    expect((inputs[3] as HTMLInputElement).value).toBe('LAKI-LAKI');
    expect((inputs[8] as HTMLInputElement).value).toBe('081234567890');
  });

  it('chat network failure → assistant error bubble, tidak mengirim ke surface register', async () => {
    fetchMock.mockRejectedValueOnce(new Error('net down'));
    render(<SiswaBaruForm />);
    await typeChat('Halo');
    await waitFor(() => expect(screen.getByText('siswa.chat_error')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/.netlify/functions/ai-chat');
  });

  it('submit dengan data kurang → toast daftar field+scan yang hilang (legacy saveToDatabase), TANPA panggilan API', async () => {
    render(<SiswaBaruForm />);
    await fireEvent.click(screen.getByRole('button', { name: 'siswa.submit_btn' }));
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('siswa.missing_header'),
      'error',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  const fillAll = async () => {
    const inputs = screen.getAllByRole('textbox'); // [0] chat, 1..9 biodata (BIODATA_FIELDS order)
    const values = ['Budi Santoso', 'Sleman, 1 Jan 2000', 'LAKI-LAKI', 'Islam', 'budi@mail.com', 'Jl. Merdeka 1', 'SMA', '081234567890', '081298765432'];
    for (let i = 0; i < values.length; i++) {
      await fireEvent.input(inputs[i + 1], { target: { value: values[i] } });
    }
    const fileInputs = document.querySelectorAll('input[type=file]');
    const docs = [new File(['x'], 'ktp.pdf', { type: 'application/pdf' }), new File(['x'], 'kk.pdf', { type: 'application/pdf' }), new File(['x'], 'ijazah.pdf', { type: 'application/pdf' })];
    for (let i = 0; i < docs.length; i++) {
      await fireEvent.change(fileInputs[i], { target: { files: [docs[i]] } });
    }
  };

  it('submit lengkap → Cloudinary dulu lalu JSON submitDaftarSiswa (register, payload objek snake + url dokumen), public tanpa header auth', async () => {
    fetchMock.mockResolvedValue(jsonRes({ success: true }));
    render(<SiswaBaruForm />);
    await fillAll();
    await fireEvent.click(screen.getByRole('button', { name: 'siswa.submit_btn' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('/.netlify/functions/register');
    expect(String(init.headers['Authorization'] || '')).toBe('');
    const body = JSON.parse(String(init.body));
    expect(body.action).toBe('submitDaftarSiswa');
    expect(Array.isArray(body.payload)).toBe(false);
    expect(body.payload).toMatchObject({
      nama: 'Budi Santoso', gender: 'LAKI-LAKI', wa_siswa: '081234567890',
      wa_ortu: '081298765432', email: 'budi@mail.com',
      ktp: 'https://cloud.test/ktp.pdf', kk: 'https://cloud.test/kk.pdf',
      ijazah: 'https://cloud.test/ijazah.pdf',
    });
    // success → toast sukses + tombol jadi BERHASIL + draf dibersihkan
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('siswa.success', 'success'));
    await waitFor(() => expect(screen.getByRole('button', { name: '✓ siswa.success_btn' })).toBeTruthy());
    expect(localStorage.getItem('asj_siswa_draft_v1')).toBeNull();
  });

  it('submit gagal dari server → toast siswa.failed + pesan, tombol kembali ke SUBMIT DATA', async () => {
    fetchMock.mockResolvedValue(jsonRes({ success: false, message: 'Nama wajib diisi.' }));
    render(<SiswaBaruForm />);
    await fillAll();
    await fireEvent.click(screen.getByRole('button', { name: 'siswa.submit_btn' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('siswa.failed Nama wajib diisi.', 'error'));
    expect(screen.getByRole('button', { name: 'siswa.submit_btn' })).toBeTruthy();
  });

  it('upload gagal (Cloudinary) → toast siswa.upload_failed + pesan asli, TANPA panggilan register, tombol kembali ke SUBMIT DATA', async () => {
    vi.mocked(uploadMany).mockRejectedValueOnce(new Error('Upload Cloudinary gagal (HTTP 500): boom'));
    render(<SiswaBaruForm />);
    await fillAll();
    await fireEvent.click(screen.getByRole('button', { name: 'siswa.submit_btn' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('siswa.upload_failed Upload Cloudinary gagal (HTTP 500): boom', 'error'));
    expect(fetchMock).not.toHaveBeenCalled(); // register tidak pernah dipanggil
    expect(screen.getByRole('button', { name: 'siswa.submit_btn' })).toBeTruthy();
  });

  it('gagal di tahap SIMPAN (network) → toast siswa.network_error (BUKAN upload_failed) — FIX label per tahap', async () => {
    fetchMock.mockRejectedValueOnce(new Error('net down')); // uploadMany mock sukses; postAction gagal
    render(<SiswaBaruForm />);
    await fillAll();
    await fireEvent.click(screen.getByRole('button', { name: 'siswa.submit_btn' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('siswa.network_error', 'error'));
    expect(screen.getByRole('button', { name: 'siswa.submit_btn' })).toBeTruthy();
  });
});
