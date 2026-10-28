import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cvFactory } from './templates';
import type { CandidateData, RenderContext } from './types';

const mockData: CandidateData = {
  identitas: {
    nama_lengkap: 'Yamada Tarou',
    katakana: 'ヤマダ タロウ',
    panggilan: 'Tarou',
    tempatahir: 'Jakarta',
    tglahir: '1995-08-14',
    umur: '28',
    gender: 'LAKI-LAKI',
    agama: 'Budha',
    golongan_darah: 'B',
    status_nikah: 'BELUM MENIKAH',
    anak: '',
    email: 'tarou@example.com',
    alamat: 'Jl. Merdeka 123',
    alamat_jp: 'メルデカドウ 123',
    hp: '628123456789',
    hp_darurat: '',
    ktp: '1234567890123456',
    paspor: 'M12345678',
    sim: 'A1234567890',
    status_eks_jepang: 'ADA',
    no_coe: '',
    kontak_daruratNama: '',
    kontak_darurat_hubungan: '',
  },
  fisik: { tb: '170', bb: '65', topi: '7.5', baju: 'L', sepatu: '27', tangan_dominan: 'KANAN', tahan_ac: 'YA' },
  medis: { mata_kiri: '-3', mata_kanan: '-2.5', kacamata: 'YA', buta_warna: 'TIDAK', tato: 'TIDAK', tindik: 'TIDAK', rokok: 'TIDAK', alkohol: 'TIDAK', alergi: '', riwayat_medis: '', riwayat_kecelakaan: '' },
  pendidikan: [
    { tingkat: 'SMA', sekolah: 'SMA Negeri 1 Jakarta', jurusan: 'IPA', tahun_masuk: '2010-04', tahun_lulus: '2013-03' },
  ],
  pekerjaan: [
    { perusahaan: 'PT. ABC', jabatan: 'Staff', tahun_masuk: '2014', tahun_keluar: '2020' },
  ],
  keluarga: [
    { hubungan: 'Suami', nama: 'Yamada Hanako', usia: '27', pekerjaan: 'Ibu rumah tangga' },
  ],
  sertifikasi: { bahasa: 'JFT', jft: 'JFT N2', ssw: 'Kaigo', lisensi: 'SSW', bidang: 'Perawatan' },
  wawancara: { motivasi_ke_jepang: 'Ingin belajar bahasa Jepang', motivasi_ke_jepang_jp: '日本語を勉強したい', tujuan_ke_jepang: 'Bekerja di Jepang' },
  kenalan_jepang: { nama_id: '', nama_jp: '', hubungan_id: '', hubungan_jp: '', pekerjaan_id: '', pekerjaan_jp: '', usia: '', alamat_id: '', alamat_jp: '' },
  uploads: { photo: 'https://cdn.example/photo.jpg', cv: '', jft: '', ssw: '', ktp: '', kk: '', ijazah_sd: '', ijazah_smp: '', ijazah_sma: '', univ: '', sim: '' },
  raw: {},
};

const mockContext: RenderContext = {
  waTarget: '628123456789',
  isAdmin: true,
  templateId: 'test',
};

describe('CV Template Factory', () => {
  it('factory has 8 registered templates', () => {
    const list = cvFactory.list();
    expect(list.length).toBe(8);
  });

  it('only the four real Excel forms are offered in the picker', () => {
    // Pemilik 2026-10-26: "lebih sederhanakan saja". Empat template lama tetap
    // TERDAFTAR (dan tetap diuji di bawah supaya tidak diam-diam rusak), tapi
    // tidak lagi ditawarkan: hasilnya bukan CV yang dicetak. Form KINKI
    // menyusul di hari yang sama sebagai form ketiga.
    const listed = cvFactory.list().filter((t) => t.listed !== false).map((t) => t.id);
    expect(listed).toEqual(['rirekisho-xlsx', 'rirekisho-firma', 'kinki', 'jipa']);
  });

  it('includes the KINKI form as the third real xlsx template', () => {
    const t = cvFactory.get('kinki');
    expect(t).toBeTruthy();
    expect(t?.type).toBe('xlsx');
    expect(t?.category).toBe('form');
  });

  it('includes the Firma form as the second real xlsx template', () => {
    const t = cvFactory.get('rirekisho-firma');
    expect(t).toBeTruthy();
    expect(t?.type).toBe('xlsx');
    expect(t?.category).toBe('form');
  });

  it('includes the real rirekisho form as an xlsx template', () => {
    const t = cvFactory.get('rirekisho-xlsx');
    expect(t).toBeTruthy();
    expect(t?.type).toBe('xlsx');
    expect(t?.category).toBe('form');
  });

  it('includes rirekisho-a4 as a registered template', () => {
    expect(cvFactory.get('rirekisho-a4')).toBeTruthy();
    expect(cvFactory.get('rirekisho-a4')?.type).toBe('rirekisho');
  });

  it('includes excel-basic, docx-basic, pdf-basic', () => {
    expect(cvFactory.get('excel-basic')?.type).toBe('xlsx');
    expect(cvFactory.get('docx-basic')?.type).toBe('docx');
    expect(cvFactory.get('pdf-basic')?.type).toBe('pdf');
  });

  it('render returns error for unknown template', async () => {
    const result = await cvFactory.render('nonexistent', mockData, mockContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('tidak ditemukan');
  });

  it('render for excel-basic returns a blob with correct mimeType', async () => {
    const result = await cvFactory.render('excel-basic', mockData, mockContext);
    expect(result.success).toBe(true);
    expect(result.blob).toBeTruthy();
    expect(result.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(result.fileName).toContain('Yamada_Tarou');
  });

  it('render for docx-basic returns a blob', async () => {
    const result = await cvFactory.render('docx-basic', mockData, mockContext);
    expect(result.success).toBe(true);
    expect(result.blob).toBeTruthy();
    expect(result.mimeType).toBe('application/vnd.ms-word');
  });

  it('render for pdf-basic returns html', async () => {
    const result = await cvFactory.render('pdf-basic', mockData, mockContext);
    expect(result.success).toBe(true);
    expect(result.html).toBeTruthy();
    expect(result.html).toContain('DAFTAR RIWAYAT HIDUP');
  });

  it('render for rirekisho-a4 returns html type', async () => {
    const result = await cvFactory.render('rirekisho-a4', mockData, mockContext);
    expect(result.success).toBe(true);
    expect(result.mimeType).toBe('text/html');
  });
});

/**
 * ANGGARAN BUNDLE — pustaka berat tidak boleh diimpor sebagai VALUE.
 *
 * `renderers/excel.ts` dulu `import * as XLSX from 'xlsx'` (488 KB minified /
 * 159 KB gzip) hanya supaya template yang `listed: false` bisa didaftarkan.
 * `templates.ts` diimpor `CandidateProfileModal` dan `TabConfig`, jadi setiap
 * sesi admin mengunduh + mem-parse SheetJS sebelum panelnya bisa tampil —
 * terukur di artefak build: `AdminPanel.*.js` memuat
 * `import{utils,write}from"./xlsx.*.js"` STATIS.
 *
 * Aturannya: `import type` boleh (hilang saat build), `await import(...)` boleh
 * (dimuat saat dipakai), `import ... from 'xlsx'` TIDAK.
 */
describe('pustaka berat hanya lewat import type / dynamic import', () => {
  const HEAVY = ['xlsx', 'exceljs', 'mammoth', 'pdf-parse', 'jszip'];
  const dir = join(process.cwd(), 'src/lib/cv-template-factory');

  function walk(d: string): string[] {
    return readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
    );
  }

  it('tidak ada impor VALUE statis ke pustaka berat', () => {
    const offenders: string[] = [];
    for (const file of walk(dir)) {
      if (!/\.(ts|tsx)$/.test(file) || file.includes('.test.')) continue;
      const src = readFileSync(file, 'utf8');
      for (const pkg of HEAVY) {
        // `import X from 'pkg'` / `import * as X from 'pkg'` tanpa `type`.
        const staticValue = new RegExp(`^\\s*import\\s+(?!type\\b)[^;]*from\\s+['"]${pkg}['"]`, 'm');
        if (staticValue.test(src)) offenders.push(`${file} → ${pkg}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});