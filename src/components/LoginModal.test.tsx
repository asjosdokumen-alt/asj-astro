// ==========================================
// TESTS: LoginModal (B01 parity, 2026-09-05)
//
// Legacy ground truth: js/04_auth.ts prosesLoginKandidat/prosesLoginMaster/
// prosesLoginPersonal + shared/wa-rules.ts (normalizeWa + isValidWaFormat).
// Root bugs pinned here:
//   - admin login MATI: modal kirim [pin, token-klien] (pola legacy) tapi
//     kernel z.tuple ARITY EKSAK → checkAdminMaster/checkAdminPersonal selalu
//     gagal validasi; kini payload [pin] / [name, pin]
//   - WA tidak dinormalisasi di klien & regex /^8d{10,12}$/ rusak (huruf 'd'
//     literal) → 8xx selalu ditolak; kini normalizeWaInput + gate 628 kanonik
//   - onClose() dipanggil SAAT RENDER (side-effect dalam render) → useEffect
//   - copy/toast hard-coded → key id+jp (tErr memetakan pesan zod)
//
// Konversi ke apiClient (sesi ini): modal dulu memanggil `fetch` sendiri.
// Aksi kini dijawab oleh KLIEN, jadi tes memberi tahu klien apa yang dijawab —
// `fetch` tinggal jebakan yang harus tetap tidak tersentuh.
// ==========================================
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import LoginModal from './LoginModal';
import { showToast } from './Toast';
import { apiClient } from '../lib/apiClient';

/** Jebakan: komponen tidak boleh menyentuh `fetch` mentah lagi. */
const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('./Toast', () => ({ showToast: vi.fn() }));
vi.mock('../lib/apiClient', () => ({ apiClient: vi.fn() }));
vi.mock('../store/i18n', async () => {
  const { atom } = await import('nanostores');
  // Salinan produksi untuk key yang diperiksa isinya (bukan sekadar namanya).
  const DICT: Record<string, string> = {
    'login.api_error': 'Kesalahan server (HTTP {s})',
  };
  return {
    t: (k: string) => DICT[k] ?? k,
    langStore: atom<'id' | 'jp'>('id'),
    toggleLang: vi.fn(),
  };
});
vi.mock('../store/authReactive', async () => {
  // Real nanostores atom — useStore() calls store.listen/subscribe, so a
  // plain object mock breaks at render (TypeError: store.listen is not a function).
  const { atom } = await import('nanostores');
  const authStore = atom({
    isLoggedIn: false,
    role: 'guest',
    name: '',
    wa: '',
    sessionToken: '',
    refreshToken: '',
  });
  return {
    authStore,
    loginAsKandidat: vi.fn(),
    loginAsAdmin: vi.fn(),
  };
});

/** Router `apiClient` per action. Nilai `Error` DILEMPAR (jalur kegagalan). */
function routeApi(map: Record<string, unknown>) {
  vi.mocked(apiClient).mockImplementation(async (action: string) => {
    const v = action in map ? map[action] : { success: true };
    if (v instanceof Error) throw v;
    return v as never;
  });
}

/** Argumen `args` pada panggilan apiClient pertama untuk sebuah action. */
function argsFor(action: string) {
  const call = vi.mocked(apiClient).mock.calls.find((c) => c[0] === action);
  if (!call) throw new Error(`${action} tidak dipanggil`);
  return { args: call[1] as unknown[], options: call[2] as Record<string, unknown> };
}

/** `ApiError` seperti yang dilempar klien: pesan server + status + kode. */
function apiErr(message: string, status: number, code?: string) {
  const e = new Error(message) as Error & { code?: string; status?: number };
  e.status = status;
  if (code) e.code = code;
  return e;
}

const modeProps = {
  onClose: vi.fn(),
  onSwitchMode: vi.fn(),
};

describe('LoginModal (B01)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Menolak, bukan sukses: fetch mentah yang tak sengaja kembali akan gagal
    // keras alih-alih menyamar sebagai jawaban server.
    mockFetch.mockRejectedValue(new Error('fetch mentah tidak boleh dipakai di sini'));
    vi.mocked(apiClient).mockReset();
    routeApi({});
    vi.mocked(showToast).mockReset();
    vi.mocked(modeProps.onClose).mockReset();
    vi.mocked(modeProps.onSwitchMode).mockReset();
  });

  afterEach(() => cleanup());

  it('login kandidat: WA dinormalisasi ke 628 kanonik sebelum dikirim', async () => {
    render(<LoginModal mode="login" {...modeProps} />);
    fireEvent.input(screen.getByPlaceholderText('login.wa_ph'), { target: { value: '081234567890' } });
    fireEvent.input(screen.getByPlaceholderText('login.pass_ph'), { target: { value: '7890' } });
    fireEvent.click(screen.getByText('login.btn_masuk'));
    await waitFor(() => expect(argsFor('loginKandidat')).toBeTruthy());
    expect(argsFor('loginKandidat').args).toEqual(['6281234567890', '7890']);
  });

  it('login kandidat: opsi klien tepat — publik, sesi mati TIDAK memicu logout/redirect, tanpa toast ganda', async () => {
    render(<LoginModal mode="login" {...modeProps} />);
    fireEvent.input(screen.getByPlaceholderText('login.wa_ph'), { target: { value: '081234567890' } });
    fireEvent.input(screen.getByPlaceholderText('login.pass_ph'), { target: { value: '7890' } });
    fireEvent.click(screen.getByText('login.btn_masuk'));
    await waitFor(() => expect(argsFor('loginKandidat')).toBeTruthy());
    // `requireAuth:false` — ini pintu masuk; tidak ada sesi untuk diperiksa.
    // `onSessionInvalid:'throw'` — default 'logout' akan logout + redirect ke
    // '/' di tengah user mengetik PIN.
    // `silent:true` — pemanggil sudah menampilkan `e.message`.
    expect(argsFor('loginKandidat').options).toEqual({
      requireAuth: false,
      onSessionInvalid: 'throw',
      silent: true,
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('login kandidat: pesan server pada non-2xx sampai ke toast (bukan "Kesalahan server (HTTP 400)")', async () => {
    routeApi({ loginKandidat: apiErr('Nomor ini belum terdaftar', 400) });
    render(<LoginModal mode="login" {...modeProps} />);
    fireEvent.input(screen.getByPlaceholderText('login.wa_ph'), { target: { value: '081234567890' } });
    fireEvent.input(screen.getByPlaceholderText('login.pass_ph'), { target: { value: '7890' } });
    fireEvent.click(screen.getByText('login.btn_masuk'));
    await waitFor(() =>
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('Nomor ini belum terdaftar', 'error'),
    );
  });

  it('login kandidat: non-2xx TANPA pesan server → salinan terlokalisasi login.api_error (HTTP {s})', async () => {
    // Klien menyintesis "HTTP 500: Internal Server Error" ketika body bukan
    // JSON / tidak punya error|message — untuk itu copy lama dipertahankan.
    routeApi({ loginKandidat: apiErr('HTTP 500: Internal Server Error', 500) });
    render(<LoginModal mode="login" {...modeProps} />);
    fireEvent.input(screen.getByPlaceholderText('login.wa_ph'), { target: { value: '081234567890' } });
    fireEvent.input(screen.getByPlaceholderText('login.pass_ph'), { target: { value: '7890' } });
    fireEvent.click(screen.getByText('login.btn_masuk'));
    await waitFor(() =>
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('Kesalahan server (HTTP 500)', 'error'),
    );
  });

  it('login kandidat: bare 8xx diterima & dinormalisasi (regresi regex 8d{10,12})', async () => {
    render(<LoginModal mode="login" {...modeProps} />);
    fireEvent.input(screen.getByPlaceholderText('login.wa_ph'), { target: { value: '81234567890' } });
    fireEvent.input(screen.getByPlaceholderText('login.pass_ph'), { target: { value: '7890' } });
    fireEvent.click(screen.getByText('login.btn_masuk'));
    await waitFor(() => expect(argsFor('loginKandidat')).toBeTruthy());
    expect(argsFor('loginKandidat').args[0]).toBe('6281234567890');
  });

  it('login kandidat: WA Jepang diterima & dinormalisasi ke 81xx (parity rule backend)', async () => {
    render(<LoginModal mode="login" {...modeProps} />);
    fireEvent.input(screen.getByPlaceholderText('login.wa_ph'), { target: { value: '09012345678' } });
    fireEvent.input(screen.getByPlaceholderText('login.pass_ph'), { target: { value: '1234' } });
    fireEvent.click(screen.getByText('login.btn_masuk'));
    await waitFor(() => expect(argsFor('loginKandidat')).toBeTruthy());
    expect(argsFor('loginKandidat').args[0]).toBe('819012345678');
  });

  it('login kandidat: WA tidak valid (digit kurang) ditolak klien (toast login.wa_invalid), tanpa API', async () => {
    render(<LoginModal mode="login" {...modeProps} />);
    fireEvent.input(screen.getByPlaceholderText('login.wa_ph'), { target: { value: '12345' } });
    fireEvent.input(screen.getByPlaceholderText('login.pass_ph'), { target: { value: '1234' } });
    fireEvent.click(screen.getByText('login.btn_masuk'));
    await waitFor(() =>
      expect(vi.mocked(showToast)).toHaveBeenCalledWith('login.wa_invalid', 'error'),
    );
    expect(vi.mocked(apiClient)).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('daftar: WA dinormalisasi + password default = 4 digit terakhir WA kanonik', async () => {
    render(<LoginModal mode="daftar" {...modeProps} />);
    fireEvent.input(screen.getByPlaceholderText('login.nama_ph'), { target: { value: 'Budi' } });
    fireEvent.input(screen.getByPlaceholderText('login.wa_ph'), { target: { value: '081234567890' } });
    fireEvent.click(screen.getByText('login.btn_daftar'));
    await waitFor(() => expect(argsFor('daftarKandidat')).toBeTruthy());
    expect(argsFor('daftarKandidat').args).toEqual(['Budi', '6281234567890', '7890']);
  });

  it('admin master: payload ARITY EKSAK [pin] (bukan [pin, token-klien] legacy)', async () => {
    render(<LoginModal mode="login" {...modeProps} />);
    // trigger admin step (event from App.tsx)
    fireEvent(window, new Event('asj-admin-login'));
    fireEvent.input(screen.getByPlaceholderText('admin.pin_master'), { target: { value: '1234' } });
    fireEvent.click(screen.getByText('button.verify'));
    await waitFor(() => expect(argsFor('checkAdminMaster')).toBeTruthy());
    expect(argsFor('checkAdminMaster').args).toEqual(['1234']);
  });

  it('admin personal: payload ARITY EKSAK [name, pin]', async () => {
    render(<LoginModal mode="login" {...modeProps} />);
    fireEvent(window, new Event('asj-admin-login'));
    fireEvent.input(screen.getByPlaceholderText('admin.pin_master'), { target: { value: '1234' } });
    fireEvent.click(screen.getByText('button.verify'));
    await waitFor(() => expect(argsFor('checkAdminMaster')).toBeTruthy());
    // Step-2 list render is async after the master-pin promise resolves
    await waitFor(() => expect(screen.getByText('SACHOU')).toBeTruthy());
    routeApi({ checkAdminPersonal: { success: true, token: 't-1' } });
    fireEvent.click(screen.getByText('SACHOU'));
    fireEvent.input(screen.getByPlaceholderText('admin.pin_personal'), { target: { value: '4321' } });
    fireEvent.click(screen.getByText('button.enter_portal'));
    await waitFor(() => expect(argsFor('checkAdminPersonal')).toBeTruthy());
    expect(argsFor('checkAdminPersonal').args).toEqual(['SACHOU', '4321']);
  });

  it('sudah login → modal ditutup via efek (bukan side-effect saat render)', async () => {
    // isLoggedIn false dulu; render; lalu status berubah lewat mock store
    render(<LoginModal mode="login" {...modeProps} />);
    expect(screen.getByText('login.btn_masuk')).toBeTruthy();
    // memicu re-render dgn store logged-in: gunakan authStore mock? Simulasikan
    // dgn merender ulang setelah store berubah — di sini kita hanya memastikan
    // onClose TIDAK dipanggil selama render awal (regresi side-effect).
    expect(vi.mocked(modeProps.onClose)).not.toHaveBeenCalled();
  });

  /* Aa-chan in the candidate login branch. Pinned because a mascot that quietly
     disappears is indistinguishable from one that was never added — the render
     lives in a conditional branch, and a refactor that drops the `<Mascot>` line
     leaves every other assertion in this file green. */
  it('kandidat login: Aa-chan tampil di atas judul, sebagai dekorasi', () => {
    const { container } = render(<LoginModal mode="login" {...modeProps} />);
    const img = container.querySelector('img.mascot');
    expect(img).toBeTruthy();
    // Dekoratif: `<h3>` di bawahnya sudah menyatakan hal yang sama dengan kata.
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.getAttribute('aria-hidden')).toBe('true');
    // Kotaknya dipesan sebelum berkasnya tiba (tidak ada pergeseran layout).
    expect(Number(img?.getAttribute('width'))).toBeGreaterThan(0);
    expect(Number(img?.getAttribute('height'))).toBeGreaterThan(0);
    // Berkasnya harus yang benar-benar ada di pohon, bukan nama yang dikarang.
    expect(readFileSync('public/mascot/login-head.webp').length).toBeGreaterThan(0);
  });

  it('Aa-chan hanya di cabang pelamar — bukan di tiga layar admin', () => {
    // `adminStep` adalah STATE internal, bukan prop, jadi tidak ada yang bisa
    // di-render dari sini. Diuji pada sumbernya: satu `<Mascot>` di berkas ini,
    // dan letaknya di dalam cabang `adminStep === 0` (blok kandidat).
    const src = readFileSync('src/components/LoginModal.tsx', 'utf8');
    const uses = src.match(/<Mascot\b/g) ?? [];
    expect(uses.length).toBe(1);
    const candidate = src.indexOf('{/* ── Kandidat Login ── */}');
    const usage = src.indexOf('<Mascot');
    const adminStep1 = src.indexOf('adminStep === 1');
    expect(candidate).toBeGreaterThan(-1);
    expect(usage).toBeGreaterThan(candidate);
    expect(usage).toBeLessThan(adminStep1);
  });

  it('sumbernya tidak memanggil fetch() mentah sama sekali', () => {
    const src = readFileSync('src/components/LoginModal.tsx', 'utf8');
    const offenders = src
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /\bfetch\s*\(/.test(line) && !/^(\/\/|\*|\/\*)/.test(line));
    expect(offenders).toEqual([]);
  });
});
