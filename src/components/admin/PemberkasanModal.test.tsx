import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import PemberkasanModal from './PemberkasanModal';
import { showToast } from '../Toast';
import { uploadBerkasToStorage } from '../../lib/uploadBerkas';
import { apiClient } from '../../lib/apiClient';

vi.mock('../../store/authReactive', () => ({
  authStore: { get: () => ({ sessionToken: 'test-token', role: 'kandidat' }) },
}));

// Aksi kini dijawab KLIEN; `fetch` tinggal jebakan (lihat beforeEach).
vi.mock('../../lib/apiClient', () => ({ apiClient: vi.fn() }));

vi.mock('../Toast', () => ({
  showToast: vi.fn(),
}));

// i18n identity untuk sebagian besar key (assertions pakai key), tetapi salinan
// PRODUKSI untuk key yang isinya diperiksa — supaya substitusi {n}/{nama} ikut
// terbukti, bukan hanya namanya.
const DICT: Record<string, string> = {
  'ui.toast_failed_prefix': 'Gagal: ',
  'ui.toast_network_error_prefix': 'Error jaringan: ',
  'ui.toast_uploaded_n': '{n} dokumen terunggah',
  'ui.toast_docs_exclaim': '!',
};
vi.mock('../../store/i18n', () => ({ t: (k: string) => DICT[k] ?? k }));

vi.mock('../../lib/uploadBerkas', () => ({
  uploadBerkasToStorage: vi.fn(),
}));

const fetchMock = vi.fn();

/** Router `apiClient` per action. Nilai `Error` DILEMPAR (jalur kegagalan). */
function routeApi(map: Record<string, unknown>) {
  vi.mocked(apiClient).mockImplementation(async (action: string) => {
    const v = action in map ? map[action] : { success: true };
    if (v instanceof Error) throw v;
    return v as never;
  });
}

function callFor(action: string) {
  const call = vi.mocked(apiClient).mock.calls.find((c) => c[0] === action);
  if (!call) throw new Error(`${action} tidak dipanggil`);
  return { args: call[1] as unknown[], options: call[2] as Record<string, unknown> };
}

/** `ApiError` seperti yang dilempar klien: pesan server + status HTTP. */
function apiErr(message: string, status: number) {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  return e;
}

const base = {
  isOpen: true,
  onClose: vi.fn(),
  waTarget: '6281111111111',
  namaTarget: 'BUDI',
};

beforeEach(() => {
  fetchMock.mockReset();
  // Menolak, bukan sukses: fetch mentah yang tak sengaja kembali akan gagal
  // keras alih-alih menyamar sebagai jawaban server.
  fetchMock.mockRejectedValue(new Error('fetch mentah tidak boleh dipakai di sini'));
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(apiClient).mockReset();
  routeApi({});
  vi.mocked(showToast).mockReset();
  vi.mocked(uploadBerkasToStorage).mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PemberkasanModal — A05 parity', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<PemberkasanModal {...base} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('locks panels for a candidate whose tahapan does not allow upload yet', async () => {
    render(
      <PemberkasanModal
        {...base}
        isAdmin={false}
        candidate={{ tahapan: 'BARU', berkas: {}, bio: {} }}
      />,
    );
    // Setelah effect: panel T1/T2/bio TIDAK muncul, ganti notice terkunci.
    await waitFor(() => expect(screen.getByText('ui.upload_locked')).toBeTruthy());
    expect(screen.queryByText('ui.stage1_short')).toBeNull();
    expect(screen.queryByText('candidate.biodata_title')).toBeNull();
  });

  it('shows all panels for admin and marks saved docs as done (tombol preview inline) vs belum', async () => {
    render(
      <PemberkasanModal
        {...base}
        isAdmin={true}
        candidate={{
          tahapan: 'LIST',
          berkas: { kk: 'https://cdn.example/kk.pdf', foto2: '-' },
          bio: {},
        }}
      />,
    );
    await waitFor(() => expect(screen.getByText('ui.stage1_short')).toBeTruthy());
    // KK sudah → tombol "ui.uploaded_view" (B03: preview INLINE via modal,
    // parity setStatusBerkas → bukaPreviewDokumen — bukan <a target=_blank>).
    expect(screen.getByText('ui.uploaded_view')).toBeTruthy();
    const notYet = screen.getAllByText('ui.not_yet');
    expect(notYet.length).toBeGreaterThan(0);
    expect(document.querySelector('a[href="https://cdn.example/kk.pdf"]')).toBeNull();
    expect(screen.queryByText('ui.upload_locked')).toBeNull();

    // Klik tombol → DocumentPreviewModal terbuka (PDF → Google Docs Viewer)
    fireEvent.click(screen.getByText('ui.uploaded_view'));
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    expect(frame).toBeTruthy();
    expect(frame.src).toContain('docs.google.com/gview?url=');
    expect(frame.src).toContain(encodeURIComponent('https://cdn.example/kk.pdf'));
  });

  it('prefills biodata from candidate.bio (short keys → long payload keys)', async () => {
    render(
      <PemberkasanModal
        {...base}
        isAdmin={true}
        candidate={{
          tahapan: 'LIST',
          berkas: {},
          bio: {
            email: 'budi@mail.com',
            tmplahir: 'Ponorogo',
            tgllahir: '01/05/2000', // format legacy → ISO utk input date
            ayah: 'PAK BUDI',
            pt: 'PT SAKURA',
          },
        }}
      />,
    );
    await waitFor(() => expect(screen.getByDisplayValue('budi@mail.com')).toBeTruthy());
    expect((screen.getByDisplayValue('Ponorogo') as HTMLInputElement).value).toBe('Ponorogo');
    expect((screen.getByDisplayValue('2000-05-01') as HTMLInputElement).value).toBe('2000-05-01');
    expect((screen.getByDisplayValue('PAK BUDI') as HTMLInputElement).value).toBe('PAK BUDI');
    expect((screen.getByDisplayValue('PT SAKURA') as HTMLInputElement).value).toBe('PT SAKURA');
  });
});

// ==========================================
// Jalur simpan (konversi ke apiClient, sesi ini)
//
// `postAction` dulu memanggil `fetch` sendiri tanpa memeriksa `res.ok` dan
// tanpa batas waktu. Tes di bawah memaku apa yang sekarang dijanjikan:
// payload & opsi yang dikirim ke klien, dan pembedaan "server menolak"
// (ada status) dari "jaringan gagal" (tidak ada status) pada label toast.
// ==========================================
describe('PemberkasanModal — jalur simpan lewat apiClient', () => {
  const adminProps = {
    ...base,
    isAdmin: true,
    candidate: { tahapan: 'LIST', berkas: {}, bio: {} },
  };

  const renderAdmin = () => render(<PemberkasanModal {...adminProps} />);

  const pickFile = async (key: string, name: string) => {
    const input = document.getElementById(`berkas-${key}`) as HTMLInputElement;
    expect(input, `input #berkas-${key} harus ada`).toBeTruthy();
    const file = new File(['x'], name, { type: 'application/pdf' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await fireEvent.change(input);
  };

  // Panel biodata admin sudah TERBUKA sejak efek mount (bioOpen = canBio &&
  // !locked) — klik judul justru menutupnya. Jadi klik hanya bila perlu.
  const openBio = async () => {
    await waitFor(() => expect(screen.getByText('candidate.biodata_title')).toBeTruthy());
    if (!screen.queryByText('ui.save_biodata')) {
      await fireEvent.click(screen.getByText('candidate.biodata_title'));
    }
    await waitFor(() => expect(screen.getByText('ui.save_biodata')).toBeTruthy());
  };

  it('upload tahap 1 → apiClient simpanBerkasTahapan dengan payload snake + opsi klien', async () => {
    vi.mocked(uploadBerkasToStorage).mockResolvedValue('https://cdn.test/kk.pdf');
    routeApi({});
    renderAdmin();
    await waitFor(() => expect(screen.getByText('ui.stage1_short')).toBeTruthy());

    await pickFile('kk', 'kk.pdf');
    await fireEvent.click(screen.getByText('ui.upload_berkas_tahap_1'));

    await waitFor(() => expect(callFor('simpanBerkasTahapan')).toBeTruthy());
    const { args, options } = callFor('simpanBerkasTahapan');
    expect(args).toEqual([
      {
        wa: '6281111111111',
        nama: 'BUDI',
        jenisBerkas: 'KK',
        fileUrl: 'https://cdn.test/kk.pdf',
      },
    ]);
    // `onSessionInvalid: 'throw'` — panel ini menangani sesi mati sendiri;
    // default 'logout' akan me-redirect admin keluar di tengah unggahan.
    // `silent: true` — pemanggil sudah punya toast sendiri.
    expect(options).toEqual({ onSessionInvalid: 'throw', silent: true });
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('1 dokumen terunggah!', 'success'),
    );
  });

  it('upload gagal dari server (non-2xx) → toast error berisi pesan server, tanpa menyentuh fetch', async () => {
    vi.mocked(uploadBerkasToStorage).mockResolvedValue('https://cdn.test/kk.pdf');
    routeApi({ simpanBerkasTahapan: apiErr('Berkas ditolak storage.', 400) });
    renderAdmin();
    await waitFor(() => expect(screen.getByText('ui.stage1_short')).toBeTruthy());

    await pickFile('kk', 'kk.pdf');
    await fireEvent.click(screen.getByText('ui.upload_berkas_tahap_1'));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('KK: Berkas ditolak storage.'),
        'error',
      ),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('simpan biodata → apiClient simpanBiodataLengkap (payload {wa,nama}) + opsi klien', async () => {
    routeApi({});
    renderAdmin();
    await openBio();

    await fireEvent.click(screen.getByText('ui.save_biodata'));

    await waitFor(() => expect(callFor('simpanBiodataLengkap')).toBeTruthy());
    const { args, options } = callFor('simpanBiodataLengkap');
    expect(args).toEqual([{ wa: '6281111111111', nama: 'BUDI' }]);
    expect(options).toEqual({ onSessionInvalid: 'throw', silent: true });
  });

  it('simpan biodata DITOLAK server (ada status) → label "failed", BUKAN network_error', async () => {
    routeApi({ simpanBiodataLengkap: apiErr('Nama wajib diisi.', 400) });
    renderAdmin();
    await openBio();

    await fireEvent.click(screen.getByText('ui.save_biodata'));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Gagal: Nama wajib diisi.', 'error'),
    );
  });

  it('simpan biodata gagal TRANSPORT (tanpa status) → label network_error', async () => {
    routeApi({ simpanBiodataLengkap: new Error('net down') });
    renderAdmin();
    await openBio();

    await fireEvent.click(screen.getByText('ui.save_biodata'));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Error jaringan: net down', 'error'),
    );
  });

  it('sumbernya tidak memanggil fetch() mentah sama sekali', () => {
    const src = readFileSync('src/components/admin/PemberkasanModal.tsx', 'utf8');
    const offenders = src
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /\bfetch\s*\(/.test(line) && !/^(\/\/|\*|\/\*)/.test(line));
    expect(offenders).toEqual([]);
  });
});

// ==========================================
// Label/control wiring (2026-09-16)
//
// Every berkas label and every biodata label sat above its control without
// ever naming it. The berkas id was already load-bearing — the upload handler
// does getElementById(`berkas-${key}`) — so the association was real and just
// unstated. The biodata control is chosen at render time between <input> and
// <textarea>, so both branches carry the id.
// ==========================================
describe('PemberkasanModal — label/control wiring', () => {
  const renderAdmin = () =>
    render(
      <PemberkasanModal {...base} isAdmin={true} candidate={{ tahapan: 'LIST', berkas: {}, bio: {} }} />,
    );

  const labelFor = (key: string) => {
    const el = [...document.querySelectorAll('label')].find(
      (l) => (l.textContent || '').trim() === key,
    );
    expect(el, `no <label> whose text is ${key}`).toBeTruthy();
    return el?.getAttribute('for');
  };

  it('every berkas label names a file input, and the upload handler agrees', async () => {
    renderAdmin();
    await waitFor(() => expect(screen.getByText('ui.stage1_short')).toBeTruthy());

    const fors = [...document.querySelectorAll('label')]
      .map((l) => l.getAttribute('for'))
      .filter((f): f is string => !!f && f.startsWith('berkas-'));
    expect(fors.length).toBeGreaterThan(0);

    for (const f of fors) {
      const el = document.getElementById(f) as HTMLInputElement | null;
      expect(el, `${f} must resolve to a real element`).toBeTruthy();
      expect(el?.tagName).toBe('INPUT');
      expect(el?.type).toBe('file');
    }
    // A single static for= would satisfy the loop above while pointing every
    // label at one input, so require one distinct target per berkas label.
    expect(new Set(fors).size).toBe(fors.length);

    // The label for the KK document points at exactly the element the upload
    // handler looks up by id — the two mechanisms must not drift apart.
    expect(labelFor('candidate.form_kk')).toBe('berkas-kk');
    expect((document.getElementById('berkas-kk') as HTMLInputElement).type).toBe('file');
    // And a second document, so a label hard-wired to one id cannot pass.
    expect(labelFor('candidate.form_akte')).toBe('berkas-akte');
  });

  it('every biodata label names the control that renders for its field', async () => {
    renderAdmin();
    await waitFor(() => expect(screen.getByText('ui.stage1_short')).toBeTruthy());

    // <input> branch.
    expect(labelFor('candidate.bio_email')).toBe('bio-email');
    const email = document.getElementById('bio-email') as HTMLInputElement | null;
    expect(email?.tagName).toBe('INPUT');
    expect(email?.type).toBe('email');

    // <textarea> branch — same field mechanism, different element.
    expect(labelFor('candidate.bio_address')).toBe('bio-alamat_lengkap');
    const addr = document.getElementById('bio-alamat_lengkap') as HTMLTextAreaElement | null;
    expect(addr?.tagName).toBe('TEXTAREA');
  });

  it('no <label> in the modal is left without a control', async () => {
    renderAdmin();
    await waitFor(() => expect(screen.getByText('ui.stage1_short')).toBeTruthy());
    const bare = [...document.querySelectorAll('label')].filter(
      (l) => !l.getAttribute('for') && !l.querySelector('input,select,textarea'),
    );
    expect(bare.map((l) => (l.textContent || '').trim())).toEqual([]);
  });
});
