import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
/* 🔴 Impor dari ENTRI publik (`./index`), BUKAN `./templates`.
 *
 * Bedanya bukan kosmetik: `./index` harus mendaftarkan kelima renderer sebagai
 * side effect. Kalau impor registrasi itu hilang dari entri (seperti pada
 * `aca84be`, 2026-11-12), `cvFactory.list()` kosong di aplikasi — dan seluruh
 * tes di berkas ini akan merah karena tidak ada satu pun template terdaftar.
 * Dengan mengimpor `./templates` langsung, tes ini tetap hijau meski aplikasi
 * menampilkan nol pilihan; itu yang membuat regresi tersebut lolos. */
import { cvFactory } from './index';
import { buildValues, buildNumbers } from './renderers/kinki';
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
  it('factory has 9 registered templates', () => {
    // 8 -> 9 (2026-11-04): `rirekisho-detail`, form kelima dari
    // `F:/template/*_CV.xlsx` — layout berbeda (pas foto I2:J9, blok personalia
    // lengkap), jadi template tersendiri, bukan pengganti form ASJ.
    const list = cvFactory.list();
    expect(list.length).toBe(9);
  });

  it('only the real Excel forms are offered in the picker', () => {
    // Pemilik 2026-10-26: "lebih sederhanakan saja". Empat template lama tetap
    // TERDAFTAR (dan tetap diuji di bawah supaya tidak diam-diam rusak), tapi
    // tidak lagi ditawarkan: hasilnya bukan CV yang dicetak. Form KINKI
    // menyusul di hari yang sama sebagai form ketiga.
    //
    // 2026-11-04: `rirekisho-detail` menyusul sebagai form kelima. Daftar ini
    // sengaja ditulis LENGKAP dan berurutan: urutannya yang dilihat admin di
    // `CvTemplateSelector`, dan template yang lupa didaftarkan di sini tetap
    // muncul di sana tanpa ada yang memeriksa apakah ia layak ditawarkan.
    const listed = cvFactory.list().filter((t) => t.listed !== false).map((t) => t.id);
    expect(listed).toEqual(['rirekisho-xlsx', 'rirekisho-firma', 'kinki', 'jipa', 'rirekisho-detail']);
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
 * Form KINKI — template final pemilik (2026-11-12).
 *
 * Peta selnya BERGESER dari versi lama (identitas 6-17 → 7-18, 学歴 19-23 →
 * 19-25, 職歴 26-31 → 27-34, keluarga 37-41 → 37-44, MBTI 47-52 → 51-53).
 * Tes ini mengunci sel-sel yang paling mudah tertukar: kalau ada yang
 * mengembalikan peta lama, `F7`/`E20`/`B27`/`B38` langsung kosong.
 */
describe('form KINKI — peta sel template final 2026-11-12', () => {
  const data: CandidateData = {
    ...mockData,
    identitas: {
      ...mockData.identitas,
      nama_lengkap: 'ARBI ALVIANSYAH',
      katakana: 'アラビ アラビアンシャ',
      panggilan: 'Arbi',
      tgl_lahir: '2006-03-04',
      hp: '6285850351428',
      alamat_jp: '東ジャワ州ポノロゴ県',
      sim: 'A1234567890',
      golongan_darah: 'B',
      status_nikah: 'BELUM MENIKAH',
      kontak_darurat_hubungan: 'Ayah',
      hp_darurat: '628123456789',
    },
    fisik: { ...mockData.fisik, tb: '167', bb: '55', tangan_dominan: 'KANAN', olahraga: 'バレーボール' },
    medis: { ...mockData.medis, mata_kanan: '1.0', mata_kiri: '1.0' },
    pendidikan: [
      { tingkat: 'SMK', sekolah: 'ジェナンガン第1国立職業高校', jurusan: '機械加工', tahun_masuk: '2021-07', tahun_lulus: '2024-06' },
      { tingkat: 'LPK', sekolah: 'ASJ日本語学校', tahun_masuk: '2026-04' },
    ],
    pekerjaan: [
      { perusahaan: 'CV SUMBER', jabatan: '機械オペレーター', jenis: 'KONTRAK', bidang: '製造', tahun_masuk: '2024-08', tahun_keluar: '2025-01', gaji: '2000000' },
    ],
    keluarga: [{ hubungan: 'Ayah', usia: '50', pekerjaan: '農家', gaji: '2000000', tinggal: 'SERUMAH' }],
    sertifikasi: {
      ...mockData.sertifikasi,
      jft: 'JFT N4',
      level_bahasa_jepang: 'N4レベル',
      bab_belajar_jp: '25',
      lama_belajar_jp: '6',
      status_belajar_jp: 'N4勉強中',
    },
  };

  it('identitas pindah ke blok 7-18 (sel lama E6/E7 kosong)', () => {
    const v = buildValues(data);
    expect(v.F7).toBe('ARBI ALVIANSYAH');
    expect(v.F8).toBe('アラビ・アラビアンシャ');
    expect(v.T7).toBe('Arbi');
    expect(v.T8).toBe('男');
    expect(v.F12).toBe('未婚');
    expect(v.M12).toBe('167');
    expect(v.M14).toBe('B');
    expect(v.J4).toBe('N4レベル');
    expect(v.N4).toBe('あり');
    expect(v.J5).toBe('第25課中');
    expect(v.E6).toBeUndefined();
    expect(v.E7).toBeUndefined();
  });

  it('tanggal lahir dikirim sebagai ANGKA di F9, bukan E8', () => {
    const n = buildNumbers(data);
    expect(Object.keys(n)).toEqual(['F9']);
    // 2006-03-04 = serial 38780 (rentang longgar supaya tidak peka zona waktu)
    expect(n.F9).toBeGreaterThanOrEqual(38779);
    expect(n.F9).toBeLessThanOrEqual(38781);
  });

  it('pendidikan memakai baris 20/22 dan 専攻 di X20', () => {
    const v = buildValues(data);
    // 学歴 KINKI berhari, hari selalu 1 (commit 693133b) — kandidat hanya hafal
    // tahun+bulan, dan pemilik mengisi manualnya dengan tanggal 1 semua.
    expect(v.E20).toBe('2021年7月1日');
    expect(v.F21).toBe('2024年6月1日');
    expect(v.I20).toBe('3年');
    expect(v.P20).toContain('職業高校');
    expect(v.X20).toBe('機械加工');
    expect(v.E22).toBe('2026年4月1日');
    expect(v.F23).toBe('今まで');
    expect(v.X22).toBe('日本語専攻');
    expect(v.F24).toContain('機械加工');
  });

  it('pekerjaan memakai blok 27/29/31 dan 月収 satu sel', () => {
    const v = buildValues(data);
    // 雇用形態 memakai kosakata dropdown template (commit aef01f2): KONTRAK
    // masuk sebagai 非正社員 — `契約社員` tidak ada di daftar template.
    expect(v.B27).toBe('非正社員');
    expect(v.E27).toBe('2024年8月');
    expect(v.F28).toBe('2025年1月');
    expect(v.R27).toBe('機械オペレーター');
    // 月収: X = ANGKA saja, `万円` teks tetap di Z (9/9 CV manual pemilik).
    // Rp 2.000.000 → 2 (÷1.000.000, `manYenRp`), bukan 2000 dan bukan "2万円".
    expect(v.X27).toBe('2');
    expect(v.B29).toBe('');
  });

  it('地域 K20/K27 diisi kota (migrasi 056); tanpa kota jatuh ke wilayah_sekolah', () => {
    const kota: CandidateData = {
      ...data,
      identitas: { ...data.identitas, wilayah_sekolah: 'Jawa Timur' },
      pendidikan: [{ ...data.pendidikan[0], kota: 'ポノロゴ' }, ...data.pendidikan.slice(1)],
      pekerjaan: [{ ...data.pekerjaan[0], kota: 'スラバヤ' }],
    };
    const v = buildValues(kota);
    expect(v.K20).toBe('ポノロゴ');
    expect(v.K27).toBe('スラバヤ');
    /* 🔴 K20 ditulis SATU kali. Draf pertama menulis kota LALU wilayah_sekolah,
       jadi yang terakhir menang dan kandidat yang hanya punya provinsi
       kehilangan 地域-nya (`e2e/kinki.test.ts` menangkapnya: `''` vs
       `'Jawa Timur'`). Kota menang hanya kalau benar-benar terisi. */
    const tanpaKota: CandidateData = {
      ...kota,
      pendidikan: [{ ...data.pendidikan[0], kota: '' }, ...data.pendidikan.slice(1)],
    };
    expect(buildValues(tanpaKota).K20).toBe('Jawa Timur');
  });


  it('集団生活年数 dibaca sebagai BULAN, bukan tahun', () => {
    // Owner 2026-11-12: "hitungan tinggal di asrama bersama itu bulan bukan tahun".
    const enam = buildValues({ ...data, fisik: { ...data.fisik, tinggal_kursus_tahun: '6' } });
    expect(enam.Y42).toBe('6ヶ月');
    const delapanBelas = buildValues({ ...data, fisik: { ...data.fisik, tinggal_kursus_tahun: '18' } });
    expect(delapanBelas.Y42).toBe('1年6ヶ月');
    const kosong = buildValues({ ...data, fisik: { ...data.fisik, tinggal_kursus_tahun: '' } });
    expect(kosong.Y42).toBe('');
  });

  it('istilah Indonesia diterjemahkan ke Jepang, kolom *_jp menang', () => {
    const idn: CandidateData = {
      ...data,
      pendidikan: [
        { ...data.pendidikan[0], jurusan: 'MULTIMEDIA', jurusan_jp: '' },
        { ...data.pendidikan[1] },
      ],
      pekerjaan: [
        { ...data.pekerjaan[0], jabatan: 'PETANI', bidang: 'PETERNAKAN', jabatan_jp: '', bidang_jp: '' },
      ],
      keluarga: [{ ...data.keluarga[0], pekerjaan: 'IBU RUMAH TANGGA', pekerjaan_jp: '' }],
    };
    const v = buildValues(idn);
    // 専攻 / 職業 tidak boleh lagi tercetak bahasa Indonesia.
    expect(v.X20).toBe('マルチメディア');
    expect(v.R27).toBe('農家');
    expect(v.F38).toBe('主婦');
    // N (業種) = NAMA PERUSAHAAN, bukan industri — bukti 9 CV manual pemilik
    // (commit cb3ac6e). Industrinya turun ke AA (備考) apa adanya; AA TIDAK
    // diterjemahkan, dan `e2e/kinki.test.ts` mengunci perilaku itu.
    expect(v.N27).toBe('CV SUMBER');
    expect(v.AA27).toBe('PETERNAKAN');
    // kolom Jepang dari database selalu menang atas tabel terjemahan
    const jp: CandidateData = {
      ...data,
      pekerjaan: [{ ...data.pekerjaan[0], jabatan: 'PETANI', jabatan_jp: '酪農作業' }],
    };
    expect(buildValues(jp).R27).toBe('酪農作業');
  });

  it('keluarga pindah ke baris 38 dan MBTI hanya nama tipe + 5 axis', () => {
    const v = buildValues(data);
    expect(v.B38).toBe('父');
    expect(v.D38).toBe('50');
    expect(v.N38).toBe('■');
    expect(v.P38).toBe('□');
    expect(v.Y38).toBe('父');
    expect(v.R48).toMatch(/型（[A-Z]{4}）/);
    expect(v.V49).toMatch(/【[A-Z]】/);
    expect(v.V53).toMatch(/【[A-Z]】/);
    // 補足説明 dihitung rumus INDEX di template, bukan ditulis renderer.
    expect(v.F51).toBeUndefined();
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
