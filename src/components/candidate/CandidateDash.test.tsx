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
import { apiClient } from '../../lib/apiClient';
import { showToast } from '../Toast';
import { authStore, type AuthState } from '../../store/authReactive';
// Daftar dokumen yang SAMA dengan yang dipakai CandidateDash — supaya tes bentuk
// `berkas` tidak menebak key mana yang dibaca (kalau katalognya berubah, tes ini
// ikut berubah alih-alih diam-diam lolos).
import { ALL_BERKAS } from '../../lib/berkasCatalog';

vi.mock('../Toast', () => ({ showToast: vi.fn() }));
vi.mock('../../store/i18n', async () => {
  const { atom } = await import('nanostores');
  return { t: (k: string) => k, langStore: atom<'id' | 'jp'>('id'), toggleLang: vi.fn(), useLang: () => 'id' };
});
vi.mock('../../lib/apiClient', () => ({ apiClient: vi.fn(async () => ({ success: true })), api: {}, default: {} }));
// Unggahan revisi menembus storage nyata tanpa mock ini (dulu tidak tersentuh
// tes karena `fetch`-nya belum pernah dijalankan).
vi.mock('../../lib/uploadBerkas', () => ({
  uploadBerkasToStorage: vi.fn(async () => 'https://cdn.test/revisi.pdf'),
}));

const KANDIDAT: AuthState = {
  role: 'kandidat', name: 'Budi', wa: '081234567890',
  sessionToken: 'tok123', refreshToken: '', isLoggedIn: true, lastChecked: Date.now(),
};

const fetchMock = vi.fn();
// Handle ke apiClient tiruan. Setelah konversi, `getAppData` HARUS lewat sini
// (supaya kena cache baca 30 s), dan `fetch` mentah harus TIDAK dipanggil.
const apiClientMock = vi.mocked(apiClient);

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
  // apiClient mengembalikan BADAN yang sudah di-parse; `fetch` mentah dulu
  // mengembalikan Response dan tes ini memanggil `.json()`. Payload-nya sama,
  // bungkusnya yang berbeda — dan itu memang inti konversinya.
  apiClientMock.mockResolvedValue({
    success: true,
    candidates: [row(rest)],
    kandidatData: { cvMiniProgress, cvMasterProgress },
    kandidatRiwayat: [], mySchedules: [],
  } as never);
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
    apiClientMock.mockReset();
    apiClientMock.mockResolvedValue({ success: true } as never);
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
    apiClientMock.mockReset();
    apiClientMock.mockResolvedValue({ success: true } as never);
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

// ==========================================
// TESTS: CandidateDash membaca getAppData lewat apiClient (§26)
//
// Cacat yang dipaku di sini sama persis dengan yang sudah diperbaiki di
// TabKelola: `getAppData` ADA di CACHEABLE_READS, dan fetch mentah MELEWATI
// cache baca 30 s itu — jadi payload kandidat yang sama ditarik ulang setiap
// mount. Invariannya dua, dan keduanya harus bisa GAGAL:
//   1. pembacaan lewat apiClient, dengan opsi yang mempertahankan perilaku lama;
//   2. tidak ada fetch() mentah untuk endpoint itu.
// ==========================================
describe('CandidateDash — getAppData lewat cache apiClient (§26)', () => {
  beforeEach(() => {
    localStorage.clear();
    authStore.set({ ...KANDIDAT });
    fetchMock.mockReset();
    apiClientMock.mockReset();
    apiClientMock.mockResolvedValue({ success: true } as never);
    vi.mocked(showToast).mockReset();
    vi.stubGlobal('fetch', fetchMock);
    stubLocation();
  });
  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: realLocation });
    vi.unstubAllGlobals();
  });

  it('membaca lewat apiClient dengan opsi yang mempertahankan semantik sesi lama', async () => {
    await renderDash();
    // Opsi ketiga ditegaskan, bukan sekadar "apiClient dipanggil". `requireAuth:
    // true` akan menolak kandidat yang tidak ada di authStore — itu mengubah
    // SIAPA yang boleh memuat dashboard. Dan default 'logout' akan menambah
    // logout + redirect global pada sesi mati, padahal perilaku lama hanya
    // menghasilkan `success:false` dan dashboard kosong. Dua-duanya perubahan
    // SESI, dan konversi ini soal cache.
    expect(apiClientMock).toHaveBeenCalledWith('getAppData', ['kandidat'], {
      requireAuth: false,
      onSessionInvalid: 'throw',
      silent: true,
    });
  });

  it('tidak memakai fetch() mentah (regresi: pembacaan melewati cache 30 s)', async () => {
    await renderDash();
    expect(apiClientMock).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ==========================================
// TESTS: unggah dokumen revisi lewat apiClient
//
// Tulisan ini dulu `fetch` mentah + `res.json()` tanpa memeriksa `res.ok` dan
// tanpa batas waktu. Kontrak yang dipaku di sini adalah yang paling mudah
// rusak tanpa terlihat: URUTAN tuple payload (server membaca payload[0] = wa,
// payload[1] = {url,name}) dan opsi klien.
// ==========================================
describe('CandidateDash — unggah revisi lewat apiClient', () => {
  beforeEach(() => {
    localStorage.clear();
    authStore.set({ ...KANDIDAT });
    fetchMock.mockReset();
    apiClientMock.mockReset();
    vi.mocked(showToast).mockReset();
    vi.stubGlobal('fetch', fetchMock);
    stubLocation();
  });
  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'location', { configurable: true, writable: true, value: realLocation });
    vi.unstubAllGlobals();
  });

  /** Dashboard dengan needRevision + router jawaban untuk action lain. */
  async function renderRevise(api: Record<string, unknown> = {}) {
    apiClientMock.mockImplementation((async (action: string) => {
      if (action in api) {
        const v = api[action];
        if (v instanceof Error) throw v;
        return v as never;
      }
      return {
        success: true,
        candidates: [row()],
        kandidatData: {
          needRevision: true,
          revisionNote: 'Foto kurang jelas',
          cvMiniProgress: 0,
          cvMasterProgress: 0,
        },
        kandidatRiwayat: [],
        mySchedules: [],
      } as never;
    }) as never);
    render(<CandidateDash />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'button.upload_revise' })).toBeTruthy(),
    );
  }

  /** Komponen membuat <input type=file> secara imperatif lalu .click() — jadi
   *  input itu harus ditangkap saat `click()` dipanggil untuk bisa diberi
   *  berkas. Menyadap `click` (bukan `createElement`) membuat helper ini
   *  bersih sendiri dan tidak bocor antar tes. */
  async function pickReviseFile(name = 'revisi.pdf') {
    let clicked: HTMLInputElement | null = null;
    const clickSpy = vi
      .spyOn(HTMLElement.prototype, 'click')
      .mockImplementation(function (this: HTMLElement) {
        clicked = this as HTMLInputElement;
      });

    await fireEvent.click(screen.getByRole('button', { name: 'button.upload_revise' }));
    clickSpy.mockRestore();
    expect(clicked, 'handler harus membuat <input type=file>').toBeTruthy();
    const input = clicked as unknown as HTMLInputElement;
    expect(input.tagName).toBe('INPUT');
    expect(input.type).toBe('file');
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], name, { type: 'application/pdf' })],
      configurable: true,
    });
    input.dispatchEvent(new Event('change'));
    return input;
  }

  /** Panggilan `simpanRevisiKandidat`; melempar bila belum terjadi — jadi
   *  `waitFor` bisa menunggunya dan tidak ada non-null assertion di tes. */
  const reviseCall = () => {
    const call = apiClientMock.mock.calls.find((c) => c[0] === 'simpanRevisiKandidat');
    if (!call) throw new Error('simpanRevisiKandidat tidak dipanggil');
    return call as unknown as [string, unknown[], Record<string, unknown>];
  };

  it('kirim tuple [wa, {url,name}] + opsi klien, lalu muat ulang dashboard', async () => {
    await renderRevise();
    await pickReviseFile();

    await waitFor(() => expect(reviseCall()).toBeTruthy());
    const call = reviseCall();
    // URUTAN penting: server membaca payload[0] sebagai WA dan memakainya
    // untuk penjaga IDOR terhadap WA sesi.
    expect(call[1]).toEqual(['081234567890', { url: 'https://cdn.test/revisi.pdf', name: 'revisi.pdf' }]);
    // `requireAuth: false` — sama dengan pembacaan di berkas ini: token tetap
    // dikirim, tetapi gerbang role + IDOR ada di server, dan pesannya lebih
    // menjelaskan daripada "No valid session".
    // `onSessionInvalid: 'throw'` — perilaku lama pada sesi mati: toast, bukan
    // logout + redirect.
    // `silent: true` — catch di bawah sudah menampilkan pesannya.
    expect(call[2]).toEqual({ requireAuth: false, onSessionInvalid: 'throw', silent: true });
    expect(fetchMock).not.toHaveBeenCalled();

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('toast.upload_revise_success', 'success'));
    // loadDashboard() dipanggil lagi → getAppData kedua.
    await waitFor(() =>
      expect(apiClientMock.mock.calls.filter((c) => c[0] === 'getAppData').length).toBe(2),
    );
  });

  it('server MENOLAK (200 + success:false) → toast pesan server, tanpa muat ulang', async () => {
    await renderRevise({ simpanRevisiKandidat: { success: false, error: 'Data tidak lengkap.' } });
    await pickReviseFile();

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Data tidak lengkap.', 'error'),
    );
    expect(apiClientMock.mock.calls.filter((c) => c[0] === 'getAppData').length).toBe(1);
  });

  it('non-2xx (klien melempar) → toast "Error upload: <pesan server>", bukan toast sukses', async () => {
    const err = new Error('Akses ditolak: nomor WA tidak sesuai sesi.') as Error & { status?: number };
    err.status = 403;
    await renderRevise({ simpanRevisiKandidat: err });
    await pickReviseFile();

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        'Error upload: Akses ditolak: nomor WA tidak sesuai sesi.',
        'error',
      ),
    );
    expect(showToast).not.toHaveBeenCalledWith('toast.upload_revise_success', 'success');
  });
});

/**
 * Wiring test untuk LevelCard.
 *
 * Kenapa terpisah dari LevelCard.test.tsx: di sana yang diuji adalah LOGIKA
 * tingkat. Di sini yang diuji adalah apakah kartu itu benar-benar SAMPAI ke DOM
 * dan membawa tingkat yang benar. Tanpa tes ini, LevelCard bisa lulus semua
 * tesnya sendiri sementara dashboard tidak pernah merendernya — kelas cacat
 * "komponen benar, kabelnya putus" yang tidak terlihat oleh unit test mana pun.
 */
describe('CandidateDash — LevelCard benar-benar terpasang', () => {
  beforeEach(() => {
    localStorage.clear();
    authStore.set({ ...KANDIDAT });
    fetchMock.mockReset();
    apiClientMock.mockReset();
    apiClientMock.mockResolvedValue({ success: true } as never);
    vi.mocked(showToast).mockReset();
    vi.stubGlobal('fetch', fetchMock);
    stubLocation();
  });

  // WAJIB, dan kesalahannya sempat terjadi: setiap describe lain di berkas ini
  // memasangkan beforeEach dengan afterEach(cleanup). Tanpa itu, DOM tes
  // sebelumnya tetap terpasang, sehingga `renderDash` menemukan DUA tombol
  // `ui.ai_cv_assistant` dan gagal dengan "Found multiple elements" — pesan yang
  // menunjuk ke tombol, padahal penyebabnya DOM yang tidak dibersihkan.
  afterEach(() => {
    cleanup();
  });

  it('merender kartu level dan menandai tingkat sesuai kelengkapan', async () => {
    // mini 0 + master 0 => overall 0 => tingkat "empty" (bukan bronze).
    await renderDash({ cvMiniProgress: 0, cvMasterProgress: 0 });
    const card = document.querySelector('[data-level]');
    expect(card, 'LevelCard tidak dirender sama sekali').not.toBeNull();
    expect(card?.getAttribute('data-level')).toBe('empty');
  });

  it('naik tingkat ketika kelengkapan naik (100/100 => gold)', async () => {
    await renderDash({ cvMiniProgress: 100, cvMasterProgress: 100 });
    const card = document.querySelector('[data-level]');
    expect(card?.getAttribute('data-level')).toBe('gold');
  });

  it('50/100 => overall 75 => silver, dan meter-nya mengaku nilai yang sama', async () => {
    // computeOverallProgress = round((mini + master) / 2) = 75.
    await renderDash({ cvMiniProgress: 50, cvMasterProgress: 100 });
    const card = document.querySelector('[data-level]');
    expect(card?.getAttribute('data-level')).toBe('silver');
    const bar = document.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('75');
  });
});

describe('CandidateDash — StepGuide benar-benar terpasang', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    apiClientMock.mockReset();
    apiClientMock.mockResolvedValue({ success: true } as never);
    vi.mocked(showToast).mockReset();
    vi.stubGlobal('fetch', fetchMock);
    stubLocation();
  });

  // Sama seperti describe di atas: tanpa cleanup, DOM tes sebelumnya tetap
  // terpasang dan renderDash gagal dengan "Found multiple elements".
  afterEach(() => {
    cleanup();
  });

  it('merender pemandu langkah dengan ikon bagian yang ditunjuk', async () => {
    await renderDash({ cvMiniProgress: 0, cvMasterProgress: 0 });
    const guide = document.querySelector('[data-step-guide]');
    expect(guide, 'StepGuide tidak dirender sama sekali').not.toBeNull();
    // Ikon harus benar-benar ada — nama yang tidak ada di `sprite-map.ts`
    // dirender sebagai KOSONG tanpa error, jadi kehadiran `<svg class="asj-icon">`
    // inilah yang membuktikannya. Dulu di sini ada maskot Aa-chan (<picture>);
    // owner memutuskan maskot dihapus dari situs (2026-09-24).
    expect(
      guide?.querySelector('svg.asj-icon'),
      'ikon tidak terpasang di dalam pemandu',
    ).not.toBeNull();
  });

  it('menunjuk bagian yang belum lengkap, bukan sekadar merender', async () => {
    // Mini dan master kosong, jadi langkahnya harus salah satu dari keduanya —
    // BUKAN 'done'. Ini yang membedakan "komponen terpasang" dari "komponen
    // membaca datanya".
    await renderDash({ cvMiniProgress: 0, cvMasterProgress: 0 });
    const key = document.querySelector('[data-step-guide]')?.getAttribute('data-step-guide');
    expect(['mini', 'master', 'berkas']).toContain(key);
    expect(key).not.toBe('done');
  });

  it('profil lengkap => pemandu berhenti meminta, dan ikonnya ikon selesai', async () => {
    await renderDash({ cvMiniProgress: 100, cvMasterProgress: 100 });
    const guide = document.querySelector('[data-step-guide]');
    // Dengan mini & master 100, satu-satunya alasan tersisa untuk belum 'done'
    // adalah berkas yang belum lengkap — dan itu datanya nyata, bukan tebakan.
    const key = guide?.getAttribute('data-step-guide');
    expect(['done', 'berkas']).toContain(key);
    if (key === 'done') {
      // Ikon 'circle-check' hanya dipakai untuk 'done' (lihat `iconFor`).
      expect(guide?.innerHTML).toContain('circle-check');
    }
  });

  it('perubahan data menggeser langkahnya — bukan nilai yang dipaku', async () => {
    // ── KENAPA TES INI MEMBANDINGKAN DUA BENTUK `berkas`, BUKAN ANGKA ───────
    //
    // Percobaan pertama membandingkan mini 0 -> 100 dan GAGAL dua kali dengan
    // pesan yang sama: "expected 'berkas' not to be 'berkas'". Kegagalannya
    // benar; asersinya yang keliru, dan keliru DUA KALI:
    //
    //   1. Dengan mini 0 -> 100, langkahnya memang tetap 'berkas', karena
    //      `berkas` SENGAJA didahulukan (StepGuide.nextStep). Menyentuh mini
    //      saja tidak bisa menggeser apa pun selama berkas belum lengkap.
    //   2. Versi kedua hanya menegaskan "nilainya bergerak" tanpa mengubah
    //      input yang relevan — jadi asersinya tetap mustahil dipenuhi.
    //
    // Probe terukur (fixture CandidateDash, dibuang setelah dipakai) menemukan
    // tuas yang SEBENARNYA; ketiganya lewat renderDash yang sama:
    //
    //   berkas ABSEN            -> step 'berkas', LevelCard ADA
    //   berkas string JSON-uri  -> step 'berkas', LevelCard ADA
    //   berkas OBJEK BIASA      -> step 'mini',   LevelCard ADA
    //
    // Baris ketiga itulah buktinya: `berkasTotal` 18 entri (dari ALL_BERKAS)
    // tetapi NOL yang punya URL, jadi berkas TIDAK lengkap... kecuali `berkasMap`
    // membacanya sebagai objek. `encodeURIComponent(JSON.stringify(...))` adalah
    // STRING, sehingga `berkasMap['kk']` undefined (indeks karakter, bukan key)
    // dan setiap dokumen tampil belum diunggah.
    //
    // Jadi tuas yang diuji di sini adalah BENTUK data, persis seperti yang
    // dibaca loadDashboard (`row.berkas`). Komponen yang memaku satu nilai akan
    // menghasilkan langkah identik untuk kedua bentuk ini.
    const semuaBerkasTerisi: Record<string, string> = {};
    // `String.fromCharCode(47)` is a `/`, written this way to dodge a paired
    // lint trap rather than to be clever: a template literal is fine here, but
    // the SAME shape inside the mutation battery's search/replace strings is
    // not, and `noTemplateCurlyInString` vs `useTemplate` fail in opposite
    // directions depending on which form is used. One spelling, used in both
    // places, keeps the two files consistent.
    const slash = String.fromCharCode(47);
    for (const def of ALL_BERKAS) semuaBerkasTerisi[def.key] = `${slash}dok${slash}${def.key}.pdf`;

    // Bentuk 1 — string JSON yang di-uri-encode (dibaca sebagai string => kosong).
    await renderDash({
      cvMiniProgress: 0, cvMasterProgress: 0,
      berkas: encodeURIComponent(JSON.stringify(semuaBerkasTerisi)),
    });
    const sebagaiString = document.querySelector('[data-step-guide]')?.getAttribute('data-step-guide');
    expect(sebagaiString, 'StepGuide tidak dirender').not.toBeNull();

    // Bentuk 2 — objek biasa, key-nya terbaca => semua berkas lengkap.
    cleanup();
    await renderDash({ cvMiniProgress: 0, cvMasterProgress: 0, berkas: semuaBerkasTerisi });
    const sebagaiObjek = document.querySelector('[data-step-guide]')?.getAttribute('data-step-guide');

    // Arah perubahan yang tepat sudah diuji di StepGuide.test.ts; di sini cukup
    // membuktikan nilainya BERGERAK mengikuti data, bukan dipaku.
    expect(sebagaiString).not.toBe(sebagaiObjek);
    // Dan bergeraknya ke arah yang benar: berkas beres => mini berikutnya.
    expect(sebagaiObjek).toBe('mini');
    expect(sebagaiString).toBe('berkas');
  });
});
