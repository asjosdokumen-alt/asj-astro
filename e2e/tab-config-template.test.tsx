/**
 * TESTS: TabConfig — bagian "Template CV" (alur template tersimpan).
 *
 * BUG YANG DIKUNCI
 * ----------------
 * `handleAnalisaTemplate` memakai syarat TERBALIK:
 *
 *     if (!m?.error) throw new Error(... 'Data master kandidat contoh tidak ditemukan.')
 *
 * Artinya tombol **Analisa SELALU gagal** justru ketika data master berhasil
 * diambil — dan pesannya menyesatkan, sehingga pemilik mengira kandidatnya belum
 * punya data master padahal barisnya ADA (dilaporkan 2026-10-10 dari layar
 * Config: "Koneksi error: Data master kandidat contoh tidak ditemukan").
 *
 * `tsc` dan `lint` tidak bisa menangkap ini — keduanya melihat tipe yang sah.
 * Hanya MENJALANKAN alurnya yang bisa.
 *
 * KENAPA DI `e2e/`: `indexer` menghitung SELURUH berkas di bawah `src/**`, jadi
 * `.test.tsx` baru di sana memindahkan counter beku. `.tsx` di `e2e/` tidak
 * dihitung (yang dihitung cuma mjs/cjs/js).
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TabConfig from '../src/components/admin/TabConfig';
import { showToast } from '../src/components/Toast';
import { uploadBerkasToStorage } from '../src/lib/uploadBerkas';

const { mockSecure, mockReadWorkbook, mockAnalyze, mockDetect } = vi.hoisted(() => ({
  mockSecure: vi.fn(),
  mockReadWorkbook: vi.fn(),
  mockAnalyze: vi.fn(),
  mockDetect: vi.fn(),
}));

vi.mock('../src/components/Toast', () => ({ showToast: vi.fn() }));
vi.mock('../src/lib/apiClient', () => ({
  default: { secure: (...a: unknown[]) => mockSecure(...a) },
}));
vi.mock('../src/lib/uploadBerkas', () => ({ uploadBerkasToStorage: vi.fn() }));
vi.mock('../src/lib/cv-template-factory/data', () => ({
  normalizeMasterData: (m: Record<string, unknown> | null) => ({
    identitas: { nama_lengkap: m?.nama_lengkap ?? '' },
    pendidikan: [],
    pekerjaan: [],
    keluarga: [],
  }),
}));
vi.mock('../src/lib/cv-template-factory/templates', () => ({
  encodeTemplateRecord: (r: unknown) => JSON.stringify(r),
  decodeTemplateRecord: () => null,
}));
vi.mock('../src/lib/cv-template-factory/loaders/tEMPLATE-loader', () => ({
  readWorkbook: (...a: unknown[]) => mockReadWorkbook(...a),
  analyzeFromExample: (...a: unknown[]) => mockAnalyze(...a),
  detectRiwayatBlock: (...a: unknown[]) => mockDetect(...a),
}));

/** Balasan `getDrafCvMaster` — SUKSES, tanpa `.error`. */
const MASTER_OK = { nama_lengkap: 'AGUS KHOCI', no_wa: '6282130442661' };

function berkas(nama: string): File {
  return new File([new Uint8Array([1, 2, 3])], nama, { type: 'application/octet-stream' });
}

async function isiForm(namaBerkas: string): Promise<void> {
  // `load()` di efek mount masih berjalan saat render pertama (skeleton), jadi
  // formnya harus DITUNGGU — bukan langsung di-query.
  const nama = await screen.findByPlaceholderText('Nama template (mis. Rirekisho Baku)');
  fireEvent.input(nama, { target: { value: 'tes' } });
  fireEvent.input(screen.getByPlaceholderText('WA kandidat contoh (628…)'), { target: { value: '085790618025' } });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [berkas(namaBerkas)] } });
}

function klikAnalisa(): void {
  fireEvent.click(screen.getByRole('button', { name: /analisa/i }));
}

function klikSimpan(): void {
  fireEvent.click(screen.getByRole('button', { name: /simpan template/i }));
}

function gantiBerkas(nama: string): void {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [berkas(nama)] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSecure.mockImplementation(async (action: string) => {
    if (action === 'getTemplateCvList') return { success: true, templates: [] };
    if (action === 'getDrafCvMaster') return MASTER_OK;
    return { success: false };
  });
  mockReadWorkbook.mockResolvedValue({ worksheets: [] });
  mockAnalyze.mockResolvedValue({ fieldMap: { B1: 'identitas.nama_lengkap' }, ambiguous: {}, unmatched: [] });
  mockDetect.mockResolvedValue(null);
});

afterEach(cleanup);

describe('TabConfig — Template CV: data master BERHASIL', () => {
  it('Analisa jalan dan menampilkan ringkasan (dulu selalu gagal)', async () => {
    render(<TabConfig />);
    await isiForm('template.xlsx');
    klikAnalisa();

    await waitFor(() => expect(screen.getByText(/1 sel terpetakan/)).toBeTruthy());
    // Kalau syaratnya terbalik lagi, baris di atas tidak akan pernah muncul dan
    // yang tampil justru toast "Data master … tidak ditemukan".
    expect(vi.mocked(showToast)).not.toHaveBeenCalled();
    expect(mockAnalyze).toHaveBeenCalledTimes(1);
  });
});

describe('TabConfig — Template CV: balasan yang memang gagal', () => {
  it('balasan ber-`error` tetap dianggap gagal (tidak ikut lolos)', async () => {
    mockSecure.mockImplementation(async (action: string) => {
      if (action === 'getTemplateCvList') return { success: true, templates: [] };
      if (action === 'getDrafCvMaster') return { error: 'Data Master belum ada untuk X.' };
      return { success: false };
    });
    render(<TabConfig />);
    await isiForm('template.xlsx');
    klikAnalisa();

    await waitFor(() => expect(vi.mocked(showToast)).toHaveBeenCalled());
    expect(screen.queryByText(/sel terpetakan/)).toBeNull();
    expect(mockAnalyze).not.toHaveBeenCalled();
  });
});

describe('TabConfig — Template CV: berkas bukan .xlsx', () => {
  it('.docx ditolak dengan pesan sendiri, tidak sampai ke exceljs', async () => {
    render(<TabConfig />);
    await isiForm('2. AHMAD TAUFIK ADI SAPUTRO_CV.docx');
    klikAnalisa();

    await waitFor(() => expect(vi.mocked(showToast)).toHaveBeenCalled());
    // Yang penting: pembaca .xlsx tidak pernah dipanggil dengan berkas .docx —
    // dulu itu menghasilkan galat exceljs yang tidak menjelaskan apa pun.
    expect(mockReadWorkbook).not.toHaveBeenCalled();
    expect(mockAnalyze).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Template tanpa peta sel = berkas yang keluar SAMA PERSIS dengan contoh yang
// dipakai admin waktu meng-upload — yaitu CV kandidat LAIN. Itu kegagalan yang
// menyamar sebagai hasil normal ("kok gak muncul apa apa"), jadi ditolak di
// depan, bukan dibiarkan tersimpan.
// ---------------------------------------------------------------------------
describe('TabConfig — Template CV: simpan tanpa peta sel', () => {
  it('Simpan tanpa Analisa ditolak — tidak ada unggahan, tidak ada record', async () => {
    render(<TabConfig />);
    await isiForm('template.xlsx');
    klikSimpan();

    await waitFor(() => expect(vi.mocked(showToast)).toHaveBeenCalled());
    expect(uploadBerkasToStorage).not.toHaveBeenCalled();
    expect(mockSecure).not.toHaveBeenCalledWith('simpanTemplateCv', expect.anything());
  });

  it('ganti berkas membatalkan hasil Analisa — peta berkas lama tidak ikut tersimpan', async () => {
    render(<TabConfig />);
    await isiForm('template.xlsx');
    klikAnalisa();
    await waitFor(() => expect(screen.getByText(/1 sel terpetakan/)).toBeTruthy());

    gantiBerkas('template-lain.xlsx');
    // Ringkasan hilang: peta milik berkas sebelumnya tidak boleh tertinggal.
    expect(screen.queryByText(/sel terpetakan/)).toBeNull();

    klikSimpan();
    await waitFor(() => expect(vi.mocked(showToast)).toHaveBeenCalled());
    expect(uploadBerkasToStorage).not.toHaveBeenCalled();
    expect(mockSecure).not.toHaveBeenCalledWith('simpanTemplateCv', expect.anything());
  });
});
