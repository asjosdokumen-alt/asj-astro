// ==========================================
// TESTS: AiCvForm (C03, 2026-09-05) — login gate + simpan tanpa sesi
//
// Parity facts: backend minta sesi untuk chat (processAIChat H4 guard) DAN
// simpan (submitDataAsj admin/kandidat + owner scope); apiClient tanpa sesi
// menampilkan toast + logout + window.location.href='/' → seluruh state CV
// hilang. Fix (pola MasterFullForm): gate login saat mount tanpa sesi, guard
// di saveToDatabase (buka gate, bukan redirect), chat membawa token sesi.
// ==========================================
import { readFileSync } from 'node:fs';
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
    useLang: () => 'id',
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

/**
 * Router `apiClient` per action.
 *
 * Komponen ini tidak lagi memanggil `fetch` sendiri, jadi tes harus memberi tahu
 * KLIEN apa yang harus dijawab. Nilai berupa `Error` akan DILEMPAR — itu cara
 * menyatakan kegagalan non-2xx (mis. `AI_UNAVAILABLE` 503), yang kini sampai ke
 * pemanggil sebagai `ApiError` dengan `.code` dan `.status`.
 */
function routeApi(map: Record<string, unknown>) {
  vi.mocked(apiClient).mockImplementation(async (action: string) => {
    const v = action in map ? map[action] : { success: true };
    if (v instanceof Error) throw v;
    return v as never;
  });
}

/** ApiError tiruan: yang penting `.code` dan `.status`, seperti klien sungguhan. */
function apiErr(message: string, code: string, status: number) {
  const e = new Error(message) as Error & { code?: string; status?: number };
  e.code = code;
  e.status = status;
  return e;
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

  // §4.1(a): the gate used to be a `.u-modal-shell` with no semantics at all.
  // It is a WALL — cleared only by a successful gateLogin(), with the form
  // behind it not rendered — so the contract it owes is "announce + trap", not
  // "close". Both halves are asserted, because a role without the trap would
  // be the same false claim §25 removed from RejectMailModal.
  it('gate login memenuhi kontrak overlay: role=dialog + aria-modal + nama yang RESOLVE', () => {
    render(<AiCvForm />);
    const shell = document.querySelector('.u-modal-shell') as HTMLElement | null;
    if (!shell) throw new Error('gate rendered without a .u-modal-shell');
    expect(shell.getAttribute('role')).toBe('dialog');
    expect(shell.getAttribute('aria-modal')).toBe('true');
    // The gate has no <h1>-<h6> (its title is a styled <div>), so the name can
    // only come from `label`. Asserted against the rendered attribute, not the
    // source — a dangling aria-labelledby would silently yield no name.
    expect(shell.getAttribute('aria-labelledby')).toBeNull();
    expect(shell.getAttribute('aria-label')).toBe('Verifikasi Akun Kandidat');
  });

  it('gate login TIDAK bisa ditutup dengan Escape — dinding, bukan dialog biasa', () => {
    render(<AiCvForm />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.u-modal-shell')).not.toBeNull();
    expect(screen.getByText('Verifikasi Akun Kandidat')).toBeTruthy();
  });

  it('login lewat gate → gate tertutup, CV hp terisi, SIMPAN DB jalan dengan sesi baru', async () => {
    // Per-action: `mockResolvedValue` untuk SEMUA action akan membuat
    // `submitDataAsj` ikut menjawab {sessionToken,user} alih-alih {success:true}.
    routeApi({ loginKandidat: { sessionToken: 'tok123', user: 'Budi' } });
    render(<AiCvForm />);
    await fireEvent.input(screen.getByPlaceholderText('08xxxxxxxxxx'), { target: { value: '081234567890' } });
    await fireEvent.input(screen.getByPlaceholderText('••••••••'), { target: { value: 'rahasia123' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));

    await waitFor(() => expect(screen.queryByText('Verifikasi Akun Kandidat')).toBeNull());
    // KONTRAK WIRE: `loginKandidat` divalidasi dengan z.tuple([waField,
    // passwordField]) di kernel/validate.ts — payload-nya DUA PRIMITIF, bukan
    // satu objek. Bentuk lama `[{wa,password}]` ditolak zod dengan "Array must
    // contain at least 2 element(s)", jadi gate ini selalu gagal dan user selalu
    // melihat "Password salah atau akun tidak ditemukan." LoginModal — yang
    // memakai [wa, password] — memang jalan; hanya kedua gate ini yang menyimpang.
    const login = vi.mocked(apiClient).mock.calls.find((c) => c[0] === 'loginKandidat');
    if (!login) throw new Error('loginKandidat tidak dipanggil');
    expect(login[1]).toEqual(['081234567890', 'rahasia123']);
    // Gerbang login TIDAK boleh menuntut sesi (itu justru yang sedang dibuat) dan
    // tidak boleh logout+redirect global saat gagal.
    expect(login[2]).toEqual({ requireAuth: false, onSessionInvalid: 'throw', silent: true });
    // Tidak ada lagi fetch mentah dari komponen ini.
    expect(fetchMock).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole('button', { name: 'button.save_db' }));
    await waitFor(() =>
      expect(vi.mocked(apiClient).mock.calls.some((c) => c[0] === 'submitDataAsj')).toBe(true),
    );
    const save = vi.mocked(apiClient).mock.calls.find((c) => c[0] === 'submitDataAsj')!;
    const savedArg = (save[1] as Array<{ context: { wa: string } }>)[0];
    expect(savedArg.context.wa).toBe('081234567890');
    expect(showToast).toHaveBeenCalledWith('toast.saved', 'success');
  });

  it('sudah login → tanpa gate; SIMPAN DB dengan WA kosong → toast validasi, tanpa API', async () => {
    authStore.set({ ...KANDIDAT });
    render(<AiCvForm />);
    expect(screen.queryByText('Verifikasi Akun Kandidat')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'button.save_db' }));
    expect(showToast).toHaveBeenCalledWith('Nomor WA belum diisi.', 'error');
    // §6 gap 2: kandidat yang sudah login memang memicu SATU panggilan penjaga
    // (getAppData) saat mount — yang tidak boleh terjadi adalah SIMPAN.
    expect(vi.mocked(apiClient).mock.calls.some((c) => c[0] === 'submitDataAsj')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sesi hilang di tengah → SIMPAN DB membuka gate, TANPA redirect (fetch/API tidak dipanggil)', async () => {
    authStore.set({ ...KANDIDAT });
    render(<AiCvForm />);
    authStore.set({ ...GUEST });
    await fireEvent.click(screen.getByRole('button', { name: 'button.save_db' }));
    expect(screen.getByText('Verifikasi Akun Kandidat')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    // Sama seperti di atas: penjaga boleh memanggil getAppData, SIMPAN tidak.
    expect(vi.mocked(apiClient).mock.calls.some((c) => c[0] === 'submitDataAsj')).toBe(false);
  });

  it('chat lewat apiClient: payload currentData + giliran user ada DI DALAM history', async () => {
    authStore.set({ ...KANDIDAT });
    vi.mocked(apiClient).mockResolvedValue({ reply: 'Halo Budi!', data: {} } as never);
    render(<AiCvForm />);
    const input = screen.getByPlaceholderText('form.placeholder_chat');
    await fireEvent.input(input, { target: { value: 'Perkenalkan diriku' } });
    await fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(vi.mocked(apiClient).mock.calls.some((c) => c[0] === 'processAIChat')).toBe(true),
    );
    const call = vi.mocked(apiClient).mock.calls.find((c) => c[0] === 'processAIChat')!;
    // `requireAuth` dibiarkan default (true): backend processAIChat butuh sesi,
    // dan gate login di komponen yang menjamin sesinya ada.
    expect(call[2]).toEqual({ onSessionInvalid: 'throw', silent: true });
    const arg = (
      call[1] as Array<{
        history: Array<{ role: string; content: string }>;
        currentData: unknown;
      }>
    )[0];
    // KONTRAK PAYLOAD: handler membaca `history` dan `currentData`. Kunci `cvData`
    // tidak pernah dibaca siapa pun, jadi blok "DATA KANDIDAT SAAT INI" selalu
    // kosong dan Jeklin menanyakan ulang data yang sudah ada di database.
    expect(arg.currentData).toBeDefined();
    expect(arg).not.toHaveProperty('cvData');
    // Handler juga TIDAK membaca field `message` (hanya flow/history/lang/
    // currentData), jadi giliran user harus ada DI DALAM history — kalau tidak,
    // model tidak pernah melihat apa yang baru saja diketik user.
    const history = arg.history;
    expect(history[history.length - 1]).toEqual({ role: 'user', content: 'Perkenalkan diriku' });
    // Token kini disuntik klien, bukan komponen — tidak ada fetch mentah lagi.
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Halo Budi!')).toBeTruthy());
  });

  it('upload gagal → toast "Gagal upload <key>: <msg>" EKSAK + TANPA submitDataAsj (error-return contract dedup)', async () => {
    routeApi({ loginKandidat: { sessionToken: 'tok123', user: 'Budi' } });
    render(<AiCvForm />);
    await fireEvent.input(screen.getByPlaceholderText('08xxxxxxxxxx'), { target: { value: '081234567890' } });
    await fireEvent.input(screen.getByPlaceholderText('••••••••'), { target: { value: 'rahasia123' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));
    await waitFor(() => expect(screen.queryByText('Verifikasi Akun Kandidat')).toBeNull());
    // Bentuk nyata error uploadMany: Error + key file (UploadCollectionError).
    const uploadErr = new Error('Upload Cloudinary gagal (HTTP 500): boom') as Error & { key?: string };
    uploadErr.key = 'foto';
    vi.mocked(uploadMany).mockRejectedValueOnce(uploadErr);
    await fireEvent.click(screen.getByRole('button', { name: 'button.save_db' }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Gagal upload foto: Upload Cloudinary gagal (HTTP 500): boom', 'error'));
    // return path: submitDataAsj tidak pernah dipanggil. Login SENDIRI memang
    // lewat apiClient, jadi yang diperiksa adalah action-nya, bukan jumlah panggilan.
    expect(vi.mocked(apiClient).mock.calls.some((c) => c[0] === 'submitDataAsj')).toBe(false);
  });
});

// ==========================================
// TESTS: status paspor/SIM (paritas ai_form.html:150-151)
//
// Legacy punya <select id="f_paspor_status"> + <select id="f_sim_status">
// (— / ADA / TIDAK ADA) yang nilainya ditulis ke identitas.paspor_status dan
// identitas.sim_status. Astro tidak pernah mem-port-nya: pertanyaan "kandidat
// punya paspor/SIM atau tidak" hilang total, dan kolom nomor kosong jadi ambigu
// (tidak diisi vs memang tidak punya).
//
// Satu perilaku legacy yang SENGAJA tidak diikuti: legacy men-default status ke
// `TIDAK ADA` saat data kosong, lalu syncSimPasporVisibility() mengosongkan
// nomor yang baru dimuat → nomor paspor tersimpan hilang. Dijaga tes terakhir.
// ==========================================
describe('AiCvForm — status paspor/SIM (paritas ai_form.html:150-151)', () => {
  beforeEach(() => {
    localStorage.clear();
    authStore.set({ ...KANDIDAT });
    fetchMock.mockReset();
    vi.mocked(showToast).mockReset();
    vi.mocked(apiClient).mockReset();
    vi.mocked(apiClient).mockResolvedValue({ success: true } as any);
    vi.mocked(uploadMany).mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  /** Buka gate login supaya cv.hp terisi (tanpa hp, saveToDatabase berhenti). */
  async function loginViaGate() {
    authStore.set({ ...GUEST }); // gate hanya muncul tanpa sesi
    // Login kini lewat apiClient. Token WAJIB non-kosong: saveToDatabase menolak
    // jalan tanpa `sessionToken`, jadi gate tidak akan benar-benar "lewat".
    routeApi({ loginKandidat: { sessionToken: 'tok123', user: 'Budi' } });
    render(<AiCvForm />);
    await fireEvent.input(screen.getByPlaceholderText('08xxxxxxxxxx'), { target: { value: '081234567890' } });
    await fireEvent.input(screen.getByPlaceholderText('••••••••'), { target: { value: 'rahasia123' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));
    await waitFor(() => expect(screen.queryByText('Verifikasi Akun Kandidat')).toBeNull());
  }

  const statusValues = (sel: HTMLSelectElement) => [...sel.options].map((o) => o.value);
  /** Payload `submitDataAsj`. Dicari per-action: sejak login juga lewat
   *  apiClient, `calls[0]` bukan lagi panggilan simpan. */
  const savedPayload = (): { identitas: Record<string, string> } => {
    const call = vi.mocked(apiClient).mock.calls.find((c) => c[0] === 'submitDataAsj');
    if (!call) throw new Error('submitDataAsj tidak dipanggil');
    return (call[1] as Array<{ identitas: Record<string, string> }>)[0];
  };

  it('merender select status paspor & SIM dengan 3 opsi (— / ADA / TIDAK ADA), label lewat t()', () => {
    render(<AiCvForm />);
    const paspor = screen.getByLabelText('form.mf_paspor_status') as HTMLSelectElement;
    const sim = screen.getByLabelText('form.mf_sim_status') as HTMLSelectElement;
    expect(statusValues(paspor)).toEqual(['', 'ADA', 'TIDAK ADA']);
    expect(statusValues(sim)).toEqual(['', 'ADA', 'TIDAK ADA']);
    // Mock t() mengembalikan kunci → bukti label memang lewat t(), bukan hardcode.
    expect([...paspor.options].map((o) => o.textContent)).toEqual([
      '\u2014', 'form.mf_status_ada', 'form.mf_status_tidak_ada',
    ]);
    // Deviasi yang disengaja dari legacy: form kosong TIDAK mengklaim "TIDAK ADA"
    // (legacy men-default ke TIDAK ADA, jadi kolom nomor langsung tersembunyi dan
    // nomor yang baru dimuat ikut dikosongkan). Status kosong + kolom nomor tampil.
    expect(paspor.value).toBe('');
    expect(sim.value).toBe('');
    expect(screen.getByPlaceholderText('form.mf_ph_no_paspor')).toBeTruthy();
    expect(screen.getByPlaceholderText('form.mf_ph_no_sim')).toBeTruthy();
  });

  it('pilih TIDAK ADA → kolom nomor disembunyikan & dikosongkan; kembali ke ADA → muncul lagi', async () => {
    render(<AiCvForm />);
    const sel = screen.getByLabelText('form.mf_paspor_status') as HTMLSelectElement;
    await fireEvent.input(screen.getByPlaceholderText('form.mf_ph_no_paspor'), { target: { value: 'P123456' } });
    expect(screen.getByPlaceholderText('form.mf_ph_no_paspor')).toBeTruthy();

    await fireEvent.change(sel, { target: { value: 'TIDAK ADA' } });
    expect(screen.queryByPlaceholderText('form.mf_ph_no_paspor')).toBeNull();

    await fireEvent.change(sel, { target: { value: 'ADA' } });
    const back = screen.getByPlaceholderText('form.mf_ph_no_paspor') as HTMLInputElement;
    expect(back.value).toBe(''); // nomor ikut dikosongkan saat TIDAK ADA
  });

  it('simpan → identitas.paspor_status / sim_status ikut terkirim (bukan cuma kolom kosong)', async () => {
    await loginViaGate();
    await fireEvent.change(screen.getByLabelText('form.mf_paspor_status'), { target: { value: 'TIDAK ADA' } });
    await fireEvent.change(screen.getByLabelText('form.mf_sim_status'), { target: { value: 'ADA' } });
    await fireEvent.input(screen.getByPlaceholderText('form.mf_ph_no_sim'), { target: { value: 'SIM-99' } });

    await fireEvent.click(screen.getByRole('button', { name: 'button.save_db' }));
    await waitFor(() =>
      expect(vi.mocked(apiClient).mock.calls.some((c) => c[0] === 'submitDataAsj')).toBe(true),
    );
    const identitas = savedPayload().identitas;
    expect(identitas.paspor_status).toBe('TIDAK ADA');
    expect(identitas.paspor).toBe('');
    expect(identitas.sim_status).toBe('ADA');
    expect(identitas.sim).toBe('SIM-99');
  });

  it('status belum dipilih → diturunkan dari ada/tidaknya nomor (ADA bila ada nomor, "" bila tidak)', async () => {
    await loginViaGate();
    await fireEvent.input(screen.getByPlaceholderText('form.mf_ph_no_paspor'), { target: { value: 'P777' } });

    await fireEvent.click(screen.getByRole('button', { name: 'button.save_db' }));
    await waitFor(() =>
      expect(vi.mocked(apiClient).mock.calls.some((c) => c[0] === 'submitDataAsj')).toBe(true),
    );
    const identitas = savedPayload().identitas;
    expect(identitas.paspor_status).toBe('ADA');
    // Deviasi yang disengaja: legacy akan menulis 'TIDAK ADA' di sini dan
    // mengosongkan nomornya. Status kosong lebih jujur daripada klaim "tidak ada".
    expect(identitas.sim_status).toBe('');
    expect(identitas.sim).toBe('');
  });

  it('nomor dari AI TIDAK dihapus diam-diam (regresi syncSimPasporVisibility legacy)', async () => {
    // KONTRAK RESPONS: `handleProcessAIChat` mengembalikan data terekstraksi di
    // kunci `data` (lihat `return { reply, data: aiData }` di _lib/ai/chat.ts),
    // dan itu juga kunci yang dibaca SiswaBaruForm (`res.data`). Mock lama memakai
    // `cvData`, jadi tes ini hijau terhadap bentuk yang TIDAK PERNAH dikirim
    // server — sementara di produksi field-nya tetap kosong.
    //
    // Bentuk NESTED — itu yang benar-benar dikirim server. Prompt di
    // _lib/ai/chat.ts meminta AI menjawab {"identitas": {…}, "fisik": {…}, …},
    // dan handler mengembalikan objek itu apa adanya di `data`. Mock lama juga
    // memakai kunci FLAT, yang tidak pernah dihasilkan siapa pun; tanpa
    // mapAiCvDraft, objek bersarang yang ditebar ke state flat tidak mengisi satu
    // kolom pun.
    routeApi({ processAIChat: { reply: 'ok', data: { identitas: { paspor: 'X1234567', sim: 'SIM-A' } } } });
    render(<AiCvForm />);
    const chat = screen.getByPlaceholderText('form.placeholder_chat');
    await fireEvent.input(chat, { target: { value: 'isi paspor' } });
    await fireEvent.keyDown(chat, { key: 'Enter' });

    await waitFor(() => expect((screen.getByPlaceholderText('form.mf_ph_no_paspor') as HTMLInputElement).value).toBe('X1234567'));
    expect((screen.getByPlaceholderText('form.mf_ph_no_sim') as HTMLInputElement).value).toBe('SIM-A');
    // Status diturunkan jadi ADA (bukan TIDAK ADA) → kolom nomor tetap tampil.
    expect((screen.getByLabelText('form.mf_paspor_status') as HTMLSelectElement).value).toBe('ADA');
    expect((screen.getByLabelText('form.mf_sim_status') as HTMLSelectElement).value).toBe('ADA');
  });
});

// ==========================================
// TESTS: mode admin — panel CV AI di tab Pelamar (P2, 2026-09-14)
//
// Owner: "panel admin cv ai itu di tab pelamar sama dengan cv ai dashboard
// kandidat, cuma admin bisa bypass lewat admin authority bisa edit punya
// kandidat, soalnya sering kali kandidat salah isi, admin yg perbaiki."
//
// Backend sudah mengizinkan (isOwnerOrAdmin benar untuk role:'admin' di WA mana
// pun, submitDataAsj menerima sesi admin). Yang diuji di sini adalah sisi UI:
// gate dilewati, draf kandidat DIMUAT dulu, dan yang dimuat ditulis kembali —
// kalau tidak, admin melihat form kosong lalu menyimpan = CV kandidat terhapus.
// ==========================================
describe('AiCvForm — mode admin (panel CV AI di tab Pelamar)', () => {
  const WA = '081234567890';

  /** Balasan getDrafCvMaster yang realistis: bentuk bersarang + AIDATAJSON. */
  const DRAFT = {
    identitas: { nama_lengkap: 'BUDI', hp: WA },
    fisik: { tb: '170' },
    wawancara: { promosi_id: 'Disiplin' },
    // Kunci khusus AI hanya ada di sini — tanpa deep-merge, hilang.
    AIDATAJSON: JSON.stringify({ medis: { alergi_id: 'Udang' }, wawancara: { kelebihan_id: 'Rajin' } }),
  };

  beforeEach(() => {
    localStorage.clear();
    authStore.set({ ...GUEST }); // TANPA sesi: kandidat akan kena gate, admin tidak
    fetchMock.mockReset();
    vi.mocked(showToast).mockReset();
    vi.mocked(apiClient).mockReset();
    vi.mocked(uploadMany).mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const settled = () => waitFor(() => expect(screen.queryByText('ai_cv.loading_draft')).toBeNull());

  it('adminMode tanpa sesi → TANPA gate login, dan draf CV kandidat dimuat ke field', async () => {
    vi.mocked(apiClient).mockResolvedValue(DRAFT as any);
    render(<AiCvForm waTarget={WA} adminMode />);
    await settled();

    expect(screen.queryByText('Verifikasi Akun Kandidat')).toBeNull();
    expect(apiClient).toHaveBeenCalledWith('getDrafCvMaster', [WA]);
    // Nilai draf benar-benar terpasang (bentuk bersarang → kunci flat).
    expect((screen.getByDisplayValue('BUDI') as HTMLInputElement).value).toBe('BUDI');
    expect((screen.getByDisplayValue('170') as HTMLInputElement).value).toBe('170');
    expect((screen.getByDisplayValue('Disiplin') as HTMLTextAreaElement).value).toBe('Disiplin');
    // Dari AIDATAJSON.
    expect((screen.getByDisplayValue('Udang') as HTMLTextAreaElement).value).toBe('Udang');
    expect((screen.getByDisplayValue('Rajin') as HTMLTextAreaElement).value).toBe('Rajin');
  });

  it('selama draf dimuat → overlay loading tampil dan tombol Simpan BELUM ada (cegah simpan form kosong)', () => {
    vi.mocked(apiClient).mockReturnValue(new Promise(() => {}) as any);
    render(<AiCvForm waTarget={WA} adminMode />);
    expect(screen.getByText('ai_cv.loading_draft')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'button.save_db' })).toBeNull();
    // §4.1(a): a wait screen is a live region, NOT a dialog. `aria-modal` here
    // would claim the page is inert while nothing is trapped — and trapping
    // focus in a screen with nothing to act on would be worse than leaving it
    // free. Same treatment MasterFullForm's "Menyinkronkan Data…" already uses.
    const shell = document.querySelector('.u-modal-shell') as HTMLElement | null;
    if (!shell) throw new Error('wait screen rendered without a .u-modal-shell');
    expect(shell.getAttribute('role')).toBe('status');
    expect(shell.getAttribute('aria-live')).toBe('polite');
    expect(shell.getAttribute('aria-modal')).toBeNull();
  });

  it('simpan di mode admin → context.wa = WA kandidat, dan yang dimuat TIDAK terhapus', async () => {
    vi.mocked(apiClient).mockImplementation((async (action: string) =>
      action === 'getDrafCvMaster' ? DRAFT : { success: true }) as any);
    render(<AiCvForm waTarget={WA} adminMode />);
    await settled();

    await fireEvent.click(screen.getByRole('button', { name: 'button.save_db' }));
    await waitFor(() => expect(vi.mocked(apiClient).mock.calls.some((c) => c[0] === 'submitDataAsj')).toBe(true));
    const call = vi.mocked(apiClient).mock.calls.find((c) => c[0] === 'submitDataAsj')!;
    const payload = (call[1] as any)[0];

    // Admin menulis ke WA kandidat, bukan ke akunnya sendiri.
    expect(payload.context.wa).toBe(WA);
    // Round-trip: yang dimuat ikut tersimpan kembali (bukti tidak ada penghapusan).
    expect(payload.identitas.nama_lengkap).toBe('BUDI');
    expect(payload.fisik.tb).toBe('170');
    expect(payload.medis.alergi_id).toBe('Udang');
    expect(payload.wawancara.promosi_id).toBe('Disiplin');
    expect(payload.wawancara.kelebihan_id).toBe('Rajin');
    expect(showToast).toHaveBeenCalledWith('toast.saved', 'success');
  });

  it('draf tidak ada → toast pesan server apa adanya, form tetap tampil (tidak crash)', async () => {
    vi.mocked(apiClient).mockResolvedValue({ error: 'Data Master belum ada untuk BUDI (0812). Isi Form Master dulu.' } as any);
    render(<AiCvForm waTarget={WA} adminMode />);
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Data Master belum ada untuk BUDI (0812). Isi Form Master dulu.', 'error'));
    expect(screen.queryByText('Verifikasi Akun Kandidat')).toBeNull();
    expect(screen.getByRole('button', { name: 'button.save_db' })).toBeTruthy();
  });

  it('tanpa props (kandidat) → perilaku lama utuh: gate muncul, TANPA memuat draf', () => {
    render(<AiCvForm />);
    expect(screen.getByText('Verifikasi Akun Kandidat')).toBeTruthy();
    expect(apiClient).not.toHaveBeenCalled();
  });
});

// ==========================================
// TESTS: pesan penolakan server ditampilkan apa adanya (§6 gap 3, 2026-09-14)
//
// Server menolak flow=master untuk non-siswa dengan { success:false, error }
// TANPA `reply` (netlify/functions/_lib/ai/chat.ts LOCK VIP). Klien dulu hanya
// membaca `data.reply` → jatuh ke copy generik "Jeklin sibuk", jadi kandidat
// tidak pernah tahu ALASANNYA (dan menyangka AI-nya rusak).
// ==========================================
describe('AiCvForm — pesan penolakan server (VIP locked)', () => {
  const LOCKED =
    'Fitur AI CV Master eksklusif untuk Siswa ASJ (VIP / Kelas LPK). Hubungi Admin untuk akses.';

  beforeEach(() => {
    localStorage.clear();
    authStore.set({ ...KANDIDAT });
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

  async function send(text: string) {
    const input = screen.getByPlaceholderText('form.placeholder_chat');
    await fireEvent.input(input, { target: { value: text } });
    await fireEvent.keyDown(input, { key: 'Enter' });
  }

  it('{ success:false, error } → teks server tampil, BUKAN "Jeklin sibuk"', async () => {
    // Server menjawab **200** dengan {success:false, error}: `outcomeStatusCode`
    // hanya memetakan `code` (tidak ada) dan `message` (tidak ada — fieldnya
    // `error`), jadi statusnya tetap 200 dan apiClient TIDAK melempar. Jalur ini
    // karenanya masih lewat `data.error`.
    routeApi({ processAIChat: { success: false, error: LOCKED } });
    render(<AiCvForm />);
    await send('halo');

    await waitFor(() => expect(screen.getByText(LOCKED)).toBeTruthy());
    expect(screen.queryByText(/Jeklin lagi sibuk/i)).toBeNull();
  });

  it('AI_UNAVAILABLE (503 + code) → copy ramah server tampil, BUKAN "Jeklin sibuk"', async () => {
    // Bentuk nyata: `aiReplyFailure` mengisi `reply` DAN `error` dengan string
    // yang SAMA (keduanya `f.error`), plus `code` — dan statusnya 503, jadi
    // apiClient MELEMPAR. Copy ramah itu sampai ke pemanggil lewat
    // ApiError.message, dan `code` lewat ApiError.code: itulah yang menyalakan
    // AiUnavailableBanner. Mock lama memakai `reply`/`error` yang BERBEDA, yaitu
    // kombinasi yang tidak pernah dihasilkan server.
    const FRIENDLY = 'Asisten AI sedang tidak tersedia. Coba lagi beberapa saat ya!';
    routeApi({ processAIChat: apiErr(FRIENDLY, 'AI_UNAVAILABLE', 503) });
    render(<AiCvForm />);
    await send('halo');

    // Muncul di chat DAN di banner — karena itu `getAllByText`, bukan `getByText`.
    await waitFor(() => expect(screen.getAllByText(FRIENDLY).length).toBeGreaterThan(0));
    expect(screen.queryByText(/Jeklin lagi sibuk/i)).toBeNull();
  });
});

// ==========================================
// TESTS: penjaga akses halaman AI CV (§6 gap 2, 2026-09-14)
//
// Legacy verifikasiAksesAiCv() (js/pages/ai_form.ts:771) mengarahkan kandidat
// NON-siswa yang membuka /ai-cv langsung ke Form Master Lengkap. Astro tidak
// punya penjaga halaman: siapa pun bisa membuka /ai-cv dan baru ditolak server
// dengan pesan generik. Tiga aturan legacy diuji di sini:
//   1. non-siswa → redirect /master?wa=…&nama=…
//   2. siswa (VIP / KELAS) → dibiarkan masuk
//   3. admin (adminMode) → penjaga dilewati (tidak memanggil getAppData)
// Keputusan murninya diuji di src/lib/vip.test.ts; di sini yang diuji adalah
// KABELNYA (efek benar-benar memanggil getAppData dan memasang redirect).
// ==========================================
describe('AiCvForm — penjaga akses VIP halaman AI CV (§6 gap 2)', () => {
  const WA = '081234567890';
  let realLocation: Location;

  /** jsdom menolak navigasi sungguhan — ganti location dengan stub yang terbaca. */
  function stubLocation() {
    realLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: '' },
    });
  }
  const href = () => (window as unknown as { location: { href: string } }).location.href;

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.mocked(showToast).mockReset();
    vi.mocked(apiClient).mockReset();
    vi.stubGlobal('fetch', fetchMock);
    stubLocation();
  });
  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: realLocation });
    vi.unstubAllGlobals();
  });

  it('kandidat non-siswa → diarahkan ke Form Master Lengkap, bukan dibiarkan di /ai-cv', async () => {
    authStore.set({ ...KANDIDAT });
    vi.mocked(apiClient).mockResolvedValue({ candidates: [{ catatanInt: 'kandidat umum' }] } as any);
    render(<AiCvForm />);

    await waitFor(() => expect(href()).toContain('/master'));
    expect(href()).toBe('/master?wa=' + encodeURIComponent(KANDIDAT.wa) + '&nama=' + encodeURIComponent(KANDIDAT.name));
    expect(apiClient).toHaveBeenCalledWith('getAppData', ['kandidat', KANDIDAT.wa]);
  });

  it('kandidat siswa ([KELAS G]) → TIDAK diarahkan (boleh masuk)', async () => {
    authStore.set({ ...KANDIDAT });
    vi.mocked(apiClient).mockResolvedValue({ candidates: [{ catatanInt: '[KELAS G] murid' }] } as any);
    render(<AiCvForm />);

    await waitFor(() => expect(apiClient).toHaveBeenCalledWith('getAppData', ['kandidat', KANDIDAT.wa]));
    expect(href()).toBe('');
  });

  it('catatan dari myData (bentuk lama) juga dibaca sebelum memutuskan', async () => {
    authStore.set({ ...KANDIDAT });
    vi.mocked(apiClient).mockResolvedValue({ myData: { catatanInt: '[VIP]' } } as any);
    render(<AiCvForm />);

    await waitFor(() => expect(apiClient).toHaveBeenCalledWith('getAppData', ['kandidat', KANDIDAT.wa]));
    expect(href()).toBe(''); // VIP dari myData → jangan redirect
  });

  it('admin (adminMode) → penjaga dilewati sepenuhnya (TANPA getAppData)', async () => {
    authStore.set({ ...KANDIDAT });
    vi.mocked(apiClient).mockResolvedValue({ identitas: { nama_lengkap: 'BUDI' } } as any);
    render(<AiCvForm waTarget={WA} adminMode />);

    await waitFor(() => expect(apiClient).toHaveBeenCalledWith('getDrafCvMaster', [WA]));
    expect(vi.mocked(apiClient).mock.calls.some((c) => c[0] === 'getAppData')).toBe(false);
    expect(href()).toBe('');
  });

  it('tanpa sesi kandidat (guest) → penjaga tidak memanggil API (keputusan final di server)', () => {
    authStore.set({ ...GUEST });
    render(<AiCvForm />);
    expect(vi.mocked(apiClient).mock.calls.some((c) => c[0] === 'getAppData')).toBe(false);
    expect(href()).toBe('');
  });
});

// ==========================================
// TESTS: datalist wiring (2026-09-14, revised 2026-09-19)
//
// A `<datalist id="x">` with no `<Field list="x">` is dead markup: it renders,
// it looks correct in a diff, and it gives the user nothing. That is exactly
// how three of them shipped — ai_pekerjaan_options / ai_jurusan_options /
// ai_hubungan_options — because the dynamic pendidikan/pekerjaan/keluarga
// sections were still placeholders, so there was no field to attach them to.
// The review doc meanwhile claimed the pekerjaan autocomplete had been
// restored.
//
// A DOM test cannot catch this: an orphan datalist is invisible to queries —
// there is no element to assert against. So this check reads the source and
// asserts the referenced and defined sets match exactly.
//
// REVISION 2026-09-19: the count floor dropped from >5 to >2 on purpose. Four
// datalists (gender/agama/goldar/status-nikah) were the WRONG control for their
// job: the fields were `readonly`, so a datalist could only suggest a spelling
// to a box the user cannot type in — it offered nothing. They are now
// `<PairSelect>` dropdowns over `aiCvPairs.ts`, which is strictly better: the
// value is constrained, and choosing it fills the matching JP column. The three
// remaining datalists (JFT / SSW / pekerjaan) are on genuinely free-text fields
// that want autocomplete rather than an enum, which is what a datalist is for.
//
// The floor is 3, not 0, because the assertion below must not pass vacuously if
// the regexes stop matching. `ai_pekerjaan_options` is now referenced for real
// (the job repeater's jabatan field), which is the outcome the original comment
// asked for: "when the dynamic sections gain real fields, point them at these
// ids rather than deleting this test."
// ==========================================
describe('AiCvForm — datalist wiring (no orphan datalists)', () => {
  // Vitest runs with cwd = repo root (asserted in fcm-server.test.ts), and
  // import.meta.url is not a file: URL under this transform, so resolve from cwd.
  const src = readFileSync('src/components/forms/AiCvForm.tsx', 'utf8');
  const referenced = [...src.matchAll(/list="([a-z0-9_]+)"/g)].map((m) => m[1]).sort();
  const defined = [...src.matchAll(/<datalist id="([a-z0-9_]+)"/g)].map((m) => m[1]).sort();

  it('the probe itself works — both scans found something', () => {
    // Guards the guard: if the regexes stop matching (e.g. the source switches
    // to single quotes or a template literal), both lists go empty and the two
    // assertions below would pass vacuously.
    //
    // The bound is 1, not 2, and it is deliberately loose. What it has to prove
    // is that the scan is not silently blind; pinning it to the current count
    // (JFT + SSW) would make this test fail whenever a field is legitimately
    // migrated off a datalist — as the occupation fields were, to ComboSelect —
    // and that failure says nothing about datalist wiring.
    expect(defined.length).toBeGreaterThan(1);
    expect(referenced.length).toBeGreaterThan(1);
  });

  it('every referenced datalist is defined', () => {
    const dangling = referenced.filter((id) => !defined.includes(id));
    expect(dangling, 'list="…" with no <datalist id="…">').toEqual([]);
  });

  it('every defined datalist is referenced', () => {
    // When the dynamic sections gain real fields, point them at these ids
    // rather than deleting this test.
    const orphan = defined.filter((id) => !referenced.includes(id));
    expect(orphan, 'orphan <datalist> (never referenced)').toEqual([]);
  });
});

// ==========================================
// TESTS: invarian sumber — tidak ada `fetch` mentah yang tersisa
//
// Sebuah tes DOM tidak bisa membuktikan konversi ke apiClient: kalau komponen
// memanggil `fetch` sendiri, mock apiClient tetap hijau dan yang hilang hanya
// batas waktu 20 s + read cache — persis kerusakan yang tidak terlihat di diff.
// Karena itu diperiksa dari SUMBER, dan ditegakkan juga saat runtime oleh
// `expect(fetchMock).not.toHaveBeenCalled()` di tes chat dan tes gate di atas.
// ==========================================
describe('AiCvForm — invarian sumber', () => {
  it('sumbernya tidak memanggil fetch() mentah sama sekali', () => {
    const src = readFileSync('src/components/forms/AiCvForm.tsx', 'utf8');
    const offenders = src
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /\bfetch\s*\(/.test(line) && !/^(\/\/|\*|\/\*)/.test(line));
    expect(offenders).toEqual([]);
  });
});

// ==========================================
// TESTS: edit manual + seksi dinamis + state tombol SIMPAN (2026-09-19)
//
// Why these exist
// ---------------
// A side-by-side read of legacy `ai_form.html` against this component found
// four regressions that no existing test could catch, because each one was
// about something MISSING rather than something wrong:
//
//   1. every field was `readonly` — legacy `enableManualPreview()` removed
//      `readonly` at init, so a candidate could always correct the AI;
//   2. gender/agama/goldar/status were `readonly` + `datalist`, i.e. a
//      suggestion attached to a box that cannot be typed in — useless twice
//      over, where legacy rendered a real paired `<select>`;
//   3. the pendidikan/pekerjaan/keluarga sections rendered only
//      "Belum ada data…" with no controls, so education and work history could
//      not be entered at all — a CV with a height but no school;
//   4. SIMPAN DB had no `disabled` state, so a slow document upload left the
//      button live and a second click resent the whole payload.
//
// These tests assert the capability directly, because "the field is missing"
// is invisible to a suite that only checks what the component does render.
// ==========================================
describe('AiCvForm — edit manual & seksi dinamis', () => {
  const WA = '081234567890';

  /**
   * The payload of the last `submitDataAsj` call.
   *
   * Typed to the fields these tests assert rather than `any`, so a rename on the
   * component side (say `nama_sekolah` → `sekolah`) fails to compile here
   * instead of silently reading `undefined` and looking like a broken submit.
   * Deliberately narrow: only the paths under test are declared.
   */
  interface SavedPayload {
    identitas: { gender: string; gender_jp: string };
    // The period halves are part of the wire contract, not incidental: the
    // backend stores them in single text columns (`tahun_masuk` etc.) and
    // `fmtMonthYearJp` renders whichever shape arrives, so a regression that
    // dropped the month — or invented one — would show up here first.
    pendidikan: Array<{ nama_sekolah: string; tingkat: string; tahun_masuk?: string; tahun_lulus?: string }>;
    pekerjaan: Array<{
      nama_perusahaan: string;
      jabatan?: string;
      jabatan_jp?: string;
      tahun_masuk?: string;
      tahun_keluar?: string;
    }>;
    keluarga: unknown[];
  }

  function savedPayload(): SavedPayload {
    const call = vi.mocked(apiClient).mock.calls.find(c => c[0] === 'submitDataAsj');
    if (!call) throw new Error('submitDataAsj was never called — the save did not run');
    const args = call[1] as unknown[];
    return args[0] as SavedPayload;
  }

  beforeEach(() => {
    localStorage.clear();
    authStore.set({ ...KANDIDAT });
    fetchMock.mockReset();
    vi.mocked(showToast).mockReset();
    vi.mocked(apiClient).mockReset();
    vi.mocked(apiClient).mockResolvedValue({ success: true } as never);
    vi.mocked(uploadMany).mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('field identitas BISA diketik — bukan readonly lagi', () => {
    render(<AiCvForm />);
    // The regression was `readonly` on every input. Asserting the attribute is
    // absent is the whole point: a DOM query for a value would pass either way,
    // because a readonly input still holds and displays its value.
    const nama = document.getElementById('ai_nama') as HTMLInputElement;
    expect(nama).toBeTruthy();
    expect(nama.readOnly).toBe(false);

    fireEvent.input(nama, { target: { value: 'BUDI SANTOSO' } });
    expect(nama.value).toBe('BUDI SANTOSO');
  });

  it('mengedit field menandainya dengan border-sky-400 (koreksi manusia terlihat)', () => {
    render(<AiCvForm />);
    const nama = document.getElementById('ai_nama') as HTMLInputElement;
    // Before any edit there is no marker — otherwise every field would look
    // hand-corrected and the marker would carry no information.
    expect(nama.className).not.toContain('border-sky-400');

    fireEvent.input(nama, { target: { value: 'BUDI' } });
    expect(nama.className).toContain('border-sky-400');
  });

  it('gender memakai <select> berpasangan, dan memilihnya mengisi kolom JP', () => {
    render(<AiCvForm />);
    const sel = screen.getByTestId('ai-pair-gender') as HTMLSelectElement;
    expect(sel.tagName).toBe('SELECT');

    fireEvent.change(sel, { target: { value: 'PEREMPUAN' } });
    // The JP half is a separate column the employer reads. Choosing the
    // Indonesian term must fill it, or the two halves disagree on the printout.
    const jp = document.getElementById('ai_gender_jp') as HTMLInputElement;
    expect(jp.value).toBe('女性');
  });

  it('agama & status nikah juga berpasangan (bukan kotak readonly)', () => {
    render(<AiCvForm />);
    const agama = screen.getByTestId('ai-pair-agama') as HTMLSelectElement;
    fireEvent.change(agama, { target: { value: 'ISLAM' } });
    expect((document.getElementById('ai_agama_jp') as HTMLInputElement).value).toBe('イスラム教');

    const status = screen.getByTestId('ai-pair-status') as HTMLSelectElement;
    fireEvent.change(status, { target: { value: 'MENIKAH' } });
    expect((document.getElementById('ai_status_jp') as HTMLInputElement).value).toBe('既婚');
  });

  it('ukuran sepatu/baju/topi memakai dropdown ukuran JP, bukan teks bebas', () => {
    render(<AiCvForm />);
    // "XL" alone is ambiguous on a Japanese form; the dropdown carries the JP
    // equivalent as the label so the candidate picks the right one.
    const sepatu = document.getElementById('ai_sepatu') as HTMLSelectElement;
    expect(sepatu.tagName).toBe('SELECT');
    const labels = [...sepatu.options].map(o => o.textContent);
    expect(labels.some(l => l?.includes('JP 26.0cm'))).toBe(true);

    const baju = document.getElementById('ai_baju') as HTMLSelectElement;
    expect([...baju.options].map(o => o.textContent).some(l => l?.includes('JP LL'))).toBe(true);
  });

  it('tanggal lahir mengisi umur otomatis (turunan, bukan dua pertanyaan)', () => {
    render(<AiCvForm />);
    const tgl = document.getElementById('ai_tgllahir') as HTMLInputElement;
    const umur = document.getElementById('ai_umur') as HTMLInputElement;
    expect(umur.value).toBe('');

    fireEvent.input(tgl, { target: { value: '2000-01-15' } });
    // Computed, not hardcoded: the test must not break every January.
    const expected = String(new Date().getFullYear() - 2000 - (new Date() < new Date(new Date().getFullYear(), 0, 15) ? 1 : 0));
    expect(umur.value).toBe(expected);
  });

  it('tanggal lahir tidak masuk akal TIDAK menulis umur palsu', () => {
    render(<AiCvForm />);
    fireEvent.input(document.getElementById('ai_tgllahir') as HTMLInputElement, { target: { value: '2000-02-31' } });
    // 31 February rolls over to 2 March in JS Date. Accepting it would show a
    // plausible age derived from a date the candidate never entered.
    expect((document.getElementById('ai_umur') as HTMLInputElement).value).toBe('');
  });

  it('seksi pendidikan punya kontrol nyata, bukan hanya teks "Belum ada data"', () => {
    render(<AiCvForm />);
    expect(document.getElementById('ai-edu-tingkat-0')).toBeTruthy();
    expect(document.getElementById('ai_edu-sekolah-id-0')).toBeTruthy();
    // Periods are a month+year pair now, so each one is two controls. Asserting
    // both halves is the point: a single leftover <select> would mean the
    // MonthYearField swap only half-landed, and the month (or the year) would
    // be unreachable for that row.
    expect(document.getElementById('ai-edu-masuk-0-month')).toBeTruthy();
    expect(document.getElementById('ai-edu-masuk-0-year')).toBeTruthy();
    expect(document.getElementById('ai-edu-lulus-0-month')).toBeTruthy();
    expect(document.getElementById('ai-edu-lulus-0-year')).toBeTruthy();
    expect(document.getElementById('ai-job-masuk-0-month')).toBeTruthy();
    expect(document.getElementById('ai-job-masuk-0-year')).toBeTruthy();
    expect(document.getElementById('ai-job-keluar-0-month')).toBeTruthy();
    expect(document.getElementById('ai-job-keluar-0-year')).toBeTruthy();
    // And the old single-select ids are gone, so nothing renders both controls.
    expect(document.getElementById('ai-edu-masuk-0')).toBeNull();
  });

  it('baris pendidikan bisa ditambah sampai batas legacy (5) lalu berhenti', () => {
    render(<AiCvForm />);
    const addBtn = () => screen.getAllByText('ai_cv.row_tambah')[0];
    for (let i = 1; i < 5; i++) fireEvent.click(addBtn());
    expect(document.getElementById('ai_edu-sekolah-id-4')).toBeTruthy();
    // EDU_MAX is a property of the printed template — a sixth row would be
    // dropped at render time, so the form must not accept one.
    expect(document.getElementById('ai_edu-sekolah-id-5')).toBeNull();
  });

  it('pekerjaan dibatasi 3 baris dan keluarga 5, seperti legacy', () => {
    render(<AiCvForm />);
    expect(document.getElementById('ai_job-perusahaan-id-0')).toBeTruthy();
    expect(document.getElementById('ai_fam-nama-0')).toBeTruthy();
    // The caps differ per section, so asserting one does not prove the others.
    const src = readFileSync('src/components/forms/AiCvForm.tsx', 'utf8');
    expect(src).toContain('const JOB_MAX = 3;');
    expect(src).toContain('const FAM_MAX = 5;');
    expect(src).toContain('const EDU_MAX = 5;');
  });

  it('baris dinamis ikut terkirim di payload saat terisi', async () => {
    render(<AiCvForm />);
    // `saveToDatabase` refuses to run without a WA (it is the payload's
    // `context.wa`), so the field has to be filled before the button does
    // anything — otherwise this test would pass by asserting nothing.
    fireEvent.input(document.getElementById('ai_hp') as HTMLInputElement, { target: { value: WA } });
    fireEvent.input(document.getElementById('ai_edu-sekolah-id-0') as HTMLInputElement, { target: { value: 'SMA NEGERI 1' } });
    fireEvent.change(document.getElementById('ai-edu-tingkat-0') as HTMLSelectElement, { target: { value: 'SMA/SMK' } });
    fireEvent.input(document.getElementById('ai_job-perusahaan-id-0') as HTMLInputElement, { target: { value: 'PT TEST' } });

    await fireEvent.click(screen.getByRole('button', { name: 'button.save_db' }));
    await waitFor(() => expect(vi.mocked(apiClient).mock.calls.some(c => c[0] === 'submitDataAsj')).toBe(true));
    const payload = savedPayload();

    expect(payload.pendidikan).toHaveLength(1);
    expect(payload.pendidikan[0].nama_sekolah).toBe('SMA NEGERI 1');
    expect(payload.pendidikan[0].tingkat).toBe('SMA/SMK');
    expect(payload.pekerjaan).toHaveLength(1);
    expect(payload.pekerjaan[0].nama_perusahaan).toBe('PT TEST');
    // Untouched family row is filtered out rather than sent as an empty object,
    // which would print as a blank line on the CV.
    expect(payload.keluarga).toHaveLength(0);
  });

  it('urutan baris pendidikan dipaksa SD → SMP → SMA/SMK, bukan urutan ketik', () => {
    render(<AiCvForm />);
    // Fill the first row with SMA, then add a second and fill it with SD. The
    // candidate typed the most recent school first — the reported complaint —
    // and the form has to put SD back on top regardless.
    fireEvent.input(document.getElementById('ai_edu-sekolah-id-0') as HTMLInputElement, { target: { value: 'SMA NEGERI 1' } });
    fireEvent.change(document.getElementById('ai-edu-tingkat-0') as HTMLSelectElement, { target: { value: 'SMA/SMK' } });

    fireEvent.click(screen.getAllByText('ai_cv.row_tambah')[0]);
    fireEvent.input(document.getElementById('ai_edu-sekolah-id-1') as HTMLInputElement, { target: { value: 'SD NEGERI 2' } });
    fireEvent.change(document.getElementById('ai-edu-tingkat-1') as HTMLSelectElement, { target: { value: 'SD' } });

    // Values, not just select states: the school name has to travel with its
    // level, or the reorder would silently swap the two schools' attributes.
    expect((document.getElementById('ai_edu-sekolah-id-0') as HTMLInputElement).value).toBe('SD NEGERI 2');
    expect((document.getElementById('ai-edu-tingkat-0') as HTMLSelectElement).value).toBe('SD');
    expect((document.getElementById('ai_edu-sekolah-id-1') as HTMLInputElement).value).toBe('SMA NEGERI 1');
    expect((document.getElementById('ai-edu-tingkat-1') as HTMLSelectElement).value).toBe('SMA/SMK');
  });

  it('tingkat di luar daftar (mis. "SMK" bawaan data lama) tetap ikut terurut benar', () => {
    render(<AiCvForm />);

    // The form's own list spells this "SMA/SMK"; legacy rows carry bare "SMK".
    // Two things have to hold for such a row to survive a round-trip:
    //   - the value stays reachable as an <option> (or the control snaps to the
    //     blank option), and
    //   - the value still ranks correctly (or the row sorts to the bottom).
    // `levelOptions` is asserted directly in cvRows.test.ts; what can only be
    // tested here is that the form actually routes the level through the
    // ranker, so a legacy "SMK" row lands below SMP and above nothing.
    fireEvent.input(document.getElementById('ai_edu-sekolah-id-0') as HTMLInputElement, { target: { value: 'SMK NEGERI 3' } });
    fireEvent.change(document.getElementById('ai-edu-tingkat-0') as HTMLSelectElement, { target: { value: 'SMA/SMK' } });

    fireEvent.click(screen.getAllByText('ai_cv.row_tambah')[0]);
    fireEvent.input(document.getElementById('ai_edu-sekolah-id-1') as HTMLInputElement, { target: { value: 'SMP NEGERI 1' } });
    fireEvent.change(document.getElementById('ai-edu-tingkat-1') as HTMLSelectElement, { target: { value: 'SMP' } });

    // SMP was entered second and must end up first — the same guarantee as the
    // SD/SMA case, asserted with the spellings the dropdown does not offer.
    expect((document.getElementById('ai_edu-sekolah-id-0') as HTMLInputElement).value).toBe('SMP NEGERI 1');
    expect((document.getElementById('ai_edu-sekolah-id-1') as HTMLInputElement).value).toBe('SMK NEGERI 3');
  });

  it('periode sekolah terkirim sebagai "YYYY-MM" saat bulan dipilih', async () => {
    render(<AiCvForm />);
    fireEvent.input(document.getElementById('ai_hp') as HTMLInputElement, { target: { value: WA } });
    fireEvent.input(document.getElementById('ai_edu-sekolah-id-0') as HTMLInputElement, { target: { value: 'SMA NEGERI 1' } });
    fireEvent.change(document.getElementById('ai-edu-masuk-0-month') as HTMLSelectElement, { target: { value: '02' } });
    fireEvent.change(document.getElementById('ai-edu-masuk-0-year') as HTMLSelectElement, { target: { value: '2018' } });

    await fireEvent.click(screen.getByRole('button', { name: 'button.save_db' }));
    await waitFor(() => expect(vi.mocked(apiClient).mock.calls.some(c => c[0] === 'submitDataAsj')).toBe(true));
    const payload = savedPayload();

    // The backend stores one text column per period, so this is the whole wire
    // contract — and fmtMonthYearJp already renders '2018-02' as 2018年2月.
    expect(payload.pendidikan[0].tahun_masuk).toBe('2018-02');
  });

  it('periode tahun-saja terkirim tanpa bulan karangan', async () => {
    render(<AiCvForm />);
    fireEvent.input(document.getElementById('ai_hp') as HTMLInputElement, { target: { value: WA } });
    fireEvent.input(document.getElementById('ai_edu-sekolah-id-0') as HTMLInputElement, { target: { value: 'SMP NEGERI 1' } });
    // Year only — the shape most legacy rows have, and the one a bare
    // <input type="month"> would have silently erased.
    fireEvent.change(document.getElementById('ai-edu-lulus-0-year') as HTMLSelectElement, { target: { value: '2021' } });

    await fireEvent.click(screen.getByRole('button', { name: 'button.save_db' }));
    await waitFor(() => expect(vi.mocked(apiClient).mock.calls.some(c => c[0] === 'submitDataAsj')).toBe(true));
    const payload = savedPayload();

    // NOT '2021-01'. A defaulted month would print 2021年1月 — a graduation
    // date the candidate never gave.
    expect(payload.pendidikan[0].tahun_lulus).toBe('2021');
  });

  it('jabatan pakai ComboSelect: mengetik nama resmi mengisi kolom kanji otomatis', async () => {
    render(<AiCvForm />);
    fireEvent.input(document.getElementById('ai_hp') as HTMLInputElement, { target: { value: WA } });
    fireEvent.input(document.getElementById('ai_job-perusahaan-id-0') as HTMLInputElement, { target: { value: 'PT TEST' } });

    const combo = document.getElementById('ai_job-jabatan-id-0') as HTMLInputElement;
    // Type the list's own spelling. The KI is what matters: the kanji column
    // must receive 工場作業員, NOT the whole bilingual label.
    fireEvent.input(combo, { target: { value: 'OPERATOR PRODUKSI' } });

    expect((document.getElementById('ai_job-jabatan-jp-0') as HTMLInputElement).value).toBe('工場作業員');
  });

  it('jabatan di luar daftar tetap terkirim apa adanya, bukan ditolak', async () => {
    render(<AiCvForm />);
    fireEvent.input(document.getElementById('ai_hp') as HTMLInputElement, { target: { value: WA } });
    fireEvent.input(document.getElementById('ai_job-perusahaan-id-0') as HTMLInputElement, { target: { value: 'PT TEST' } });
    // Owner's requirement: typing must not be blocked. A candidate whose job is
    // not on the list of 100 keeps their own words.
    fireEvent.input(document.getElementById('ai_job-jabatan-id-0') as HTMLInputElement, { target: { value: 'PENJAGA KEBUN' } });

    await fireEvent.click(screen.getByRole('button', { name: 'button.save_db' }));
    await waitFor(() => expect(vi.mocked(apiClient).mock.calls.some(c => c[0] === 'submitDataAsj')).toBe(true));
    const payload = savedPayload();

    expect(payload.pekerjaan[0].jabatan ?? (payload.pekerjaan[0] as Record<string, unknown>).jabatan_id).toBe('PENJAGA KEBUN');
  });

  it('gender_jp ikut terkirim supaya kolom kanji tidak hilang saat submit', async () => {
    render(<AiCvForm />);
    fireEvent.input(document.getElementById('ai_hp') as HTMLInputElement, { target: { value: WA } });
    fireEvent.change(screen.getByTestId('ai-pair-gender') as HTMLSelectElement, { target: { value: 'LAKI-LAKI' } });
    await fireEvent.click(screen.getByRole('button', { name: 'button.save_db' }));
    await waitFor(() => expect(vi.mocked(apiClient).mock.calls.some(c => c[0] === 'submitDataAsj')).toBe(true));
    const payload = savedPayload();
    expect(payload.identitas.gender).toBe('LAKI-LAKI');
    expect(payload.identitas.gender_jp).toBe('男性');
  });
});

describe('AiCvForm — state tombol SIMPAN & guard ekstensi', () => {
  const WA = '081234567890';

  beforeEach(() => {
    localStorage.clear();
    authStore.set({ ...KANDIDAT });
    fetchMock.mockReset();
    vi.mocked(showToast).mockReset();
    vi.mocked(apiClient).mockReset();
    vi.mocked(uploadMany).mockClear();
    vi.stubGlobal('fetch', fetchMock);
    // Every action succeeds; `submitDataAsj` is the one that matters here.
    // `as never` (not `as any`) is the convention `routeApi` above uses: the
    // mock's return type is the apiClient promise, and `never` satisfies it
    // without widening the value to `any` and losing the checks around it.
    vi.mocked(apiClient).mockImplementation(async () => ({ success: true }) as never);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('tombol SIMPAN menjadi disabled selama submit (cegah kirim dua kali)', async () => {
    let release: (v: unknown) => void = () => {};
    const gate = new Promise((r) => { release = r; });
    // `submitDataAsj` never settles until `release()` runs, which is what makes
    // the button's in-flight state observable. Everything else resolves at once
    // so the form reaches the save path. `as never` matches `routeApi` above.
    vi.mocked(apiClient).mockImplementation((async (action: string) => {
      if (action === 'submitDataAsj') return gate;
      return { success: true };
    }) as never);

    render(<AiCvForm />);
    fireEvent.input(document.getElementById('ai_hp') as HTMLInputElement, { target: { value: WA } });
    const btn = screen.getByRole('button', { name: 'button.save_db' }) as HTMLButtonElement;

    await fireEvent.click(btn);
    // The load-bearing assertion: while the submit is in flight the same
    // control cannot be pressed again.
    await waitFor(() => expect(btn.disabled).toBe(true));

    release({ success: true });
    await waitFor(() => expect(btn.disabled).toBe(false));
  });

  it('ekstensi salah DITOLAK sebelum ada byte yang diunggah', async () => {
    render(<AiCvForm />);
    fireEvent.input(document.getElementById('ai_hp') as HTMLInputElement, { target: { value: WA } });
    const file = new File(['x'], 'sertifikat.docx', { type: 'application/vnd.openxmlformats' });
    const input = document.getElementById('ai_doc_jft') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    await fireEvent.click(screen.getByRole('button', { name: 'button.save_db' }));

    // JFT is a certificate: PDF only. `accept=` is a picker hint that a dialog
    // or a rename gets past, so the rule is enforced in code.
    expect(vi.mocked(uploadMany)).not.toHaveBeenCalled();
    expect(vi.mocked(showToast).mock.calls.some(c => String(c[0]).includes('sertifikat.docx'))).toBe(true);
    expect(vi.mocked(apiClient).mock.calls.some(c => c[0] === 'submitDataAsj')).toBe(false);
  });

  it('KTP boleh foto HP (jpg) — aturan per-kelas dokumen, bukan satu aturan', async () => {
    render(<AiCvForm />);
    fireEvent.input(document.getElementById('ai_hp') as HTMLInputElement, { target: { value: WA } });
    const file = new File(['x'], 'ktp.jpg', { type: 'image/jpeg' });
    const input = document.getElementById('ai_doc_ktp') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    await fireEvent.click(screen.getByRole('button', { name: 'button.save_db' }));
    await waitFor(() => expect(vi.mocked(uploadMany)).toHaveBeenCalled());
  });
});
