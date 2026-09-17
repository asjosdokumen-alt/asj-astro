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
    fetchMock.mockResolvedValue(jsonRes({ sessionToken: 'tok123', user: 'Budi' }));
    render(<AiCvForm />);
    await fireEvent.input(screen.getByPlaceholderText('08xxxxxxxxxx'), { target: { value: '081234567890' } });
    await fireEvent.input(screen.getByPlaceholderText('••••••••'), { target: { value: 'rahasia123' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));
    await waitFor(() => expect(screen.queryByText('Verifikasi Akun Kandidat')).toBeNull());
  }

  const statusValues = (sel: HTMLSelectElement) => [...sel.options].map((o) => o.value);
  const savedPayload = () => (vi.mocked(apiClient).mock.calls[0]![1] as any)[0];

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
    await waitFor(() => expect(apiClient).toHaveBeenCalledTimes(1));
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
    await waitFor(() => expect(apiClient).toHaveBeenCalledTimes(1));
    const identitas = savedPayload().identitas;
    expect(identitas.paspor_status).toBe('ADA');
    // Deviasi yang disengaja: legacy akan menulis 'TIDAK ADA' di sini dan
    // mengosongkan nomornya. Status kosong lebih jujur daripada klaim "tidak ada".
    expect(identitas.sim_status).toBe('');
    expect(identitas.sim).toBe('');
  });

  it('nomor dari AI TIDAK dihapus diam-diam (regresi syncSimPasporVisibility legacy)', async () => {
    fetchMock.mockResolvedValue(jsonRes({ reply: 'ok', cvData: { paspor: 'X1234567', sim: 'SIM-A' } }));
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
    fetchMock.mockResolvedValue(jsonRes({ success: false, error: LOCKED }));
    render(<AiCvForm />);
    await send('halo');

    await waitFor(() => expect(screen.getByText(LOCKED)).toBeTruthy());
    expect(screen.queryByText(/Jeklin lagi sibuk/i)).toBeNull();
  });

  it('AI_UNAVAILABLE (punya `reply` ramah + `error`) → tetap pakai `reply`', async () => {
    fetchMock.mockResolvedValue(
      jsonRes({ success: false, code: 'AI_UNAVAILABLE', reply: 'Jeklin sedang istirahat.', error: 'quota' }),
    );
    render(<AiCvForm />);
    await send('halo');

    await waitFor(() => expect(screen.getByText('Jeklin sedang istirahat.')).toBeTruthy());
    // Banner outage tetap menampilkan alasan teknis (`error`) — perilaku §6.5
    // yang sudah ada; yang diuji di sini hanya prioritas copy di CHAT.
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
// TESTS: datalist wiring (2026-09-14)
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
    expect(defined.length).toBeGreaterThan(5);
    expect(referenced.length).toBeGreaterThan(5);
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
