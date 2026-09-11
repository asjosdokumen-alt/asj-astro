import { describe, it, expect } from 'vitest';
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
  it('factory has 4 registered templates', () => {
    const list = cvFactory.list();
    expect(list.length).toBe(4);
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