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
import { readFileSync } from 'node:fs';
import SiswaBaruForm from './SiswaBaruForm';
import { showToast } from '../Toast';
import { uploadToCloudinary, uploadMany } from '../../lib/cloudinary';
import { apiClient } from '../../lib/apiClient';

vi.mock('../Toast', () => ({ showToast: vi.fn() }));
vi.mock('../../lib/apiClient', () => ({ apiClient: vi.fn() }));
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

/**
 * Router `apiClient` per action.
 *
 * Komponen ini tidak lagi memanggil `fetch` sendiri, jadi tes harus memberi tahu
 * KLIEN apa yang dijawab. Nilai berupa `Error` DILEMPAR — itu cara menyatakan
 * kegagalan transport maupun non-2xx, yang kini sampai ke pemanggil sebagai
 * `ApiError` dengan `.code`/`.status` (dipakai banner AI_UNAVAILABLE).
 */
function routeApi(map: Record<string, unknown>) {
  vi.mocked(apiClient).mockImplementation(async (action: string) => {
    const v = action in map ? map[action] : { success: true };
    if (v instanceof Error) throw v;
    return v as never;
  });
}

/** Panggilan `apiClient` pertama untuk sebuah action. */
function callFor(action: string) {
  const call = vi.mocked(apiClient).mock.calls.find((c) => c[0] === action);
  if (!call) throw new Error(`${action} tidak dipanggil`);
  return call;
}

/** `ApiError` seperti yang dilempar klien: pesan server + status + kode. */
function apiErr(message: string, code: string, status: number) {
  const e = new Error(message) as Error & { code?: string; status?: number };
  e.code = code;
  e.status = status;
  return e;
}

describe('SiswaBaruForm (C04)', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.mocked(apiClient).mockReset();
    routeApi({ processSiswaAIChat: { reply: 'oke', data: {} } });
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

  it('chat → processSiswaAIChat lewat apiClient: history berakhir dengan giliran user + currentData snake_case', async () => {
    render(<SiswaBaruForm />);
    await typeChat('Nama saya Budi');

    const call = callFor('processSiswaAIChat');
    // `requireAuth: false` — pendaftaran siswa baru publik, tanpa sesi.
    // `silent: true` — pemanggil punya toast-nya sendiri, jadi klien tidak boleh
    // menambahkan toast kedua untuk satu kegagalan.
    expect(call[2]).toEqual({ requireAuth: false, onSessionInvalid: 'throw', silent: true });
    // PAYLOAD kini ARRAY-of-one, bukan objek telanjang.
    //
    // Ini perubahan yang disengaja, dan bukan regresi dari bug #2 di header:
    // bug itu terjadi karena handler TIDAK meng-unwrap, sehingga `p.history`
    // dibaca dari sebuah array dan jatuh ke []. Handler sekarang memakai
    // `unwrapPayloadArgs` dan menerima KEDUA bentuk — dipaku di
    // netlify/functions/_lib/ai/chat.payload-contract.test.ts — dan bentuk array
    // inilah yang dikirim setiap pemanggil apiClient lain (termasuk AiCvForm).
    // Yang dibeli dengan konversi ini: batas waktu 20 s, yang sebelumnya tidak
    // ada sehingga koneksi macet mengunci tombol kirim selamanya.
    const arg = (
      call[1] as Array<{
        history: Array<{ role: string; content: string }>;
        currentData: unknown;
      }>
    )[0];
    expect(arg.currentData).toMatchObject({
      nama: '', email: '', wa_siswa: '', wa_ortu: '',
    });
    const hist = arg.history;
    expect(Array.isArray(hist)).toBe(true);
    expect(hist.length).toBeLessThanOrEqual(20);
    // Handler tidak pernah membaca field `message` — giliran user harus ADA di
    // dalam history, atau model tidak melihat apa yang baru diketik.
    expect(hist[hist.length - 1]).toEqual({ role: 'user', content: 'Nama saya Budi' });
    // Tidak ada fetch mentah yang tersisa di komponen ini.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('AI reply renders (legacy **bold**) and data.data (snake) auto-fills the camelCase form', async () => {
    routeApi({
      processSiswaAIChat: {
        reply: 'Halo **Budi**!',
        data: { nama: 'Budi Santoso', gender: 'LAKI-LAKI', wa_siswa: '081234567890' },
      },
    });
    render(<SiswaBaruForm />);
    await typeChat('Nama saya Budi Santoso');

    await waitFor(() => expect(screen.getByText('Budi', { selector: 'strong' })).toBeTruthy());
    const inputs = screen.getAllByRole('textbox'); // [0] = chat input, then biodata order
    await waitFor(() => expect((inputs[1] as HTMLInputElement).value).toBe('Budi Santoso'));
    expect((inputs[3] as HTMLInputElement).value).toBe('LAKI-LAKI');
    expect((inputs[8] as HTMLInputElement).value).toBe('081234567890');
  });

  it('chat network failure → assistant error bubble, tidak mengirim ke surface register', async () => {
    routeApi({ processSiswaAIChat: new Error('net down') });
    render(<SiswaBaruForm />);
    await typeChat('Halo');
    await waitFor(() => expect(screen.getByText('siswa.chat_error')).toBeTruthy());
    // Satu-satunya panggilan adalah chat — tidak ada yang nyasar ke register.
    expect(vi.mocked(apiClient).mock.calls.map((c) => c[0])).toEqual(['processSiswaAIChat']);
  });

  it('submit dengan data kurang → toast daftar field+scan yang hilang (legacy saveToDatabase), TANPA panggilan API', async () => {
    render(<SiswaBaruForm />);
    await fireEvent.click(screen.getByRole('button', { name: 'siswa.submit_btn' }));
    expect(showToast).toHaveBeenCalledWith(
      expect.stringContaining('siswa.missing_header'),
      'error',
    );
    // TANPA panggilan API sama sekali — baik lewat klien maupun fetch mentah.
    expect(vi.mocked(apiClient)).not.toHaveBeenCalled();
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

  it('submit lengkap → Cloudinary dulu lalu apiClient submitDaftarSiswa (payload snake + url dokumen), publik tanpa sesi', async () => {
    render(<SiswaBaruForm />);
    await fillAll();
    await fireEvent.click(screen.getByRole('button', { name: 'siswa.submit_btn' }));

    await waitFor(() => expect(callFor('submitDaftarSiswa')).toBeTruthy());
    const call = callFor('submitDaftarSiswa');
    // `requireAuth: false` — pendaftaran siswa baru publik, tanpa sesi.
    // `silent: true` — pemanggil punya toast sendiri ("siswa.failed" + pesan
    // server); tanpa ini satu kegagalan memunculkan DUA toast.
    expect(call[2]).toEqual({ requireAuth: false, onSessionInvalid: 'throw', silent: true });
    // PAYLOAD kini ARRAY-of-one (konvensi apiClient: `payload: [args]`), bukan
    // objek telanjang. Bukan regresi: handler memakai `unwrapPayloadArgs` dan
    // menerima kedua bentuk (dipaku di chat.payload-contract.test.ts).
    const body = (call[1] as unknown[])[0] as Record<string, unknown>;
    expect(body).toMatchObject({
      nama: 'Budi Santoso', gender: 'LAKI-LAKI', wa_siswa: '081234567890',
      wa_ortu: '081298765432', email: 'budi@mail.com',
      ktp: 'https://cloud.test/ktp.pdf', kk: 'https://cloud.test/kk.pdf',
      ijazah: 'https://cloud.test/ijazah.pdf',
    });
    // Tidak ada fetch mentah yang tersisa di komponen ini.
    expect(fetchMock).not.toHaveBeenCalled();
    // success → toast sukses + tombol jadi BERHASIL + draf dibersihkan
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('siswa.success', 'success'));
    await waitFor(() => expect(screen.getByRole('button', { name: '✓ siswa.success_btn' })).toBeTruthy());
    expect(localStorage.getItem('asj_siswa_draft_v1')).toBeNull();
  });

  it('submit gagal dari server → toast siswa.failed + pesan, tombol kembali ke SUBMIT DATA', async () => {
    routeApi({ submitDaftarSiswa: { success: false, message: 'Nama wajib diisi.' } });
    render(<SiswaBaruForm />);
    await fillAll();
    await fireEvent.click(screen.getByRole('button', { name: 'siswa.submit_btn' }));

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('siswa.failed Nama wajib diisi.', 'error'));
    expect(screen.getByRole('button', { name: 'siswa.submit_btn' })).toBeTruthy();
  });

  it('upload gagal (Cloudinary) → toast siswa.upload_failed + pesan asli, TANPA panggilan submitDaftarSiswa, tombol kembali ke SUBMIT DATA', async () => {
    vi.mocked(uploadMany).mockRejectedValueOnce(new Error('Upload Cloudinary gagal (HTTP 500): boom'));
    render(<SiswaBaruForm />);
    await fillAll();
    await fireEvent.click(screen.getByRole('button', { name: 'siswa.submit_btn' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('siswa.upload_failed Upload Cloudinary gagal (HTTP 500): boom', 'error'));
    // Tahap upload gagal → simpan tidak pernah dipanggil sama sekali.
    expect(vi.mocked(apiClient)).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'siswa.submit_btn' })).toBeTruthy();
  });

  it('gagal di tahap SIMPAN (network) → toast siswa.network_error (BUKAN upload_failed) — FIX label per tahap', async () => {
    routeApi({ submitDaftarSiswa: new Error('net down') }); // uploadMany mock sukses; simpan gagal
    render(<SiswaBaruForm />);
    await fillAll();
    await fireEvent.click(screen.getByRole('button', { name: 'siswa.submit_btn' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('siswa.network_error', 'error'));
    expect(screen.getByRole('button', { name: 'siswa.submit_btn' })).toBeTruthy();
  });

  it('sumbernya tidak memanggil fetch() mentah sama sekali', () => {
    const src = readFileSync('src/components/forms/SiswaBaruForm.tsx', 'utf8');
    const offenders = src
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /\bfetch\s*\(/.test(line) && !/^(\/\/|\*|\/\*)/.test(line));
    expect(offenders).toEqual([]);
  });

  // §6.5 baris 3: hanya `code: 'AI_UNAVAILABLE'` yang menyalakan banner.
  // Sebelum FIX-C, klien membuang `code`, sehingga banner ini mustahil dipicu
  // oleh pemanggil apiClient — dan itulah alasan komponen ini dulu menyimpan
  // `fetch`-nya sendiri.
  it('AI_UNAVAILABLE (503) → banner ai.unavailable_title + pesan server tampil', async () => {
    routeApi({
      processSiswaAIChat: apiErr('Asisten AI sedang tidak tersedia. Coba lagi beberapa saat ya!', 'AI_UNAVAILABLE', 503),
    });
    render(<SiswaBaruForm />);
    await typeChat('Halo');

    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
    expect(screen.getByRole('status').textContent).toContain('ai.unavailable_title');
    expect(screen.getByRole('status').textContent).toContain('Asisten AI sedang tidak tersedia');
  });

  it('kegagalan BUKAN AI_UNAVAILABLE → TIDAK ada banner (kode harus diperiksa, bukan sekadar "ada error")', async () => {
    routeApi({ processSiswaAIChat: apiErr('Terlalu banyak permintaan.', 'RATE_LIMITED', 429) });
    render(<SiswaBaruForm />);
    await typeChat('Halo');

    await waitFor(() => expect(screen.getByText('siswa.chat_error')).toBeTruthy());
    expect(screen.queryByRole('status')).toBeNull();
  });
});
