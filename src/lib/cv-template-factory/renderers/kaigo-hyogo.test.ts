/**
 * kaigo-hyogo.test.ts — form "Kaigo Hyogo 履歴書 (特定技能 2026)" (.xlsx).
 *
 * APA YANG DIJAGA, DAN KENAPA
 *   1. GEOMETRI. 88 merge, A1:N44, 14 kolom. Template ini disalin dari berkas
 *      klien; kalau merge atau batas kolomnya bergeser, form cetaknya berubah
 *      bentuk tanpa satu pun error.
 *   2. PRIVASI. Berkas sumbernya CV orang sungguhan. Template kosong yang masih
 *      memuat nama/alamat/HP/keluarga kandidat akan mengirim data pribadi ke
 *      setiap kandidat yang mengunduh CV. Diuji dengan MEMBUKA zip-nya.
 *   3. PETA SEL. Satu alamat salah = satu kolom CV salah isi.
 *   4. TIDAK MENGARANG. Kolom tanpa data harus tetap kosong — `無し` untuk
 *      riwayat ke Jepang dan `無` untuk merokok adalah pernyataan tentang
 *      kandidat, bukan nilai bawaan.
 */
import { describe, it, expect } from 'vitest';
import { KAIGO_HYOGO_BASE64 } from '../templates/kaigo-hyogo.b64';
import { buildValues, tanggalHariIni } from './kaigo-hyogo';
import type { CandidateData } from '../types';

function kosong(): CandidateData {
  return {
    identitas: {},
    fisik: {},
    medis: {},
    pendidikan: [],
    pekerjaan: [],
    keluarga: [],
    sertifikasi: {},
    wawancara: {},
    kenalan_jepang: {},
    uploads: {},
    raw: {},
  } as CandidateData;
}

function kandidat(over: Partial<Record<keyof CandidateData, unknown>>): CandidateData {
  return { ...kosong(), ...over } as CandidateData;
}

async function bukaTemplate(): Promise<Record<string, string>> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(Buffer.from(KAIGO_HYOGO_BASE64, 'base64'));
  const out: Record<string, string> = {};
  for (const nama of Object.keys(zip.files)) {
    const berkas = zip.file(nama);
    if (!berkas || zip.files[nama].dir) continue;
    out[nama] = await berkas.async('string');
  }
  return out;
}

describe('kaigo-hyogo · geometri template', () => {
  it('punya 88 merge dan area A1:N44 — sama dengan berkas klien', async () => {
    const parts = await bukaTemplate();
    const sheet = parts['xl/worksheets/sheet1.xml'];
    expect((sheet.match(/<mergeCell /g) || []).length).toBe(88);
    expect(sheet.match(/<dimension[^>]*>/)?.[0]).toBe('<dimension ref="A1:N44"/>');
  });

  it('tidak menyimpan sel di luar kolom N', async () => {
    /* Sumbernya membawa 528 sel kosong bergaya sampai kolom Z dan 952 baris
       kosong. Kalau itu kembali, area cetak CV melebar jadi beberapa halaman. */
    const parts = await bukaTemplate();
    const kolom = [...parts['xl/worksheets/sheet1.xml'].matchAll(/<c r="([A-Z]+)\d+"/g)].map((m) => m[1]);
    const diLuar = kolom.filter((k) => k.length > 1 || k > 'N');
    expect([...new Set(diLuar)]).toEqual([]);
    expect((parts['xl/worksheets/sheet1.xml'].match(/<row /g) || []).length).toBe(44);
  });

  it('tab-nya bernama 履歴書, bukan nama orang', async () => {
    const parts = await bukaTemplate();
    expect(parts['xl/workbook.xml']).toContain('name="履歴書"');
  });

  it('setiap sel yang ditulis adalah sel ANCHOR dari merge-nya', async () => {
    /* Excel hanya membaca nilai di sel KIRI-ATAS sebuah merge. Menulis ke sel
       lain di dalam merge yang sama menghasilkan sel yang tampak kosong saat
       berkasnya dibuka — dan tidak ada satu pun error. Bug ini benar-benar
       terjadi pada 既婚・未婚 (`C8` di dalam merge `B8:C8`) dan hanya terlihat
       lewat perbandingan sel-per-sel dengan berkas klien. */
    const parts = await bukaTemplate();
    const sheet = parts['xl/worksheets/sheet1.xml'];
    const merges = [...sheet.matchAll(/<mergeCell ref="([^"]*)"/g)].map((m) => m[1]);
    const num = (s: string) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    const pecah = (addr: string): [string, number] => {
      const m = /^([A-Z]+)(\d+)$/.exec(addr);
      return m ? [m[1], Number(m[2])] : ['', 0];
    };
    const rangeOf = (addr: string) => {
      const [c, r] = pecah(addr);
      return merges.find((m) => {
        const [a, b] = m.split(':');
        const [ac, ar] = pecah(a);
        const [bc, br] = pecah(b);
        return num(c) >= num(ac) && num(c) <= num(bc) && r >= ar && r <= br;
      });
    };
    const offenders = Object.keys(buildValues(kosong())).filter((addr) => {
      const m = rangeOf(addr);
      return m !== undefined && m.split(':')[0] !== addr;
    });
    expect(offenders).toEqual([]);
  });
});

describe('kaigo-hyogo · data pribadi sumber TIDAK ikut terbawa', () => {
  it('sharedStrings tidak memuat nama, alamat, HP, NIK, atau keluarga kandidat', async () => {
    const parts = await bukaTemplate();
    const ss = parts['xl/sharedStrings.xml'].toUpperCase();
    for (const kata of [
      'HERLINA', 'REYGITA', 'KARYONO', 'TUKINI', 'ILHAM', 'NGUJUNG',
      'GANDUKEPUH', '6283135594507', '350215605060001',
    ]) {
      expect(ss, `template masih memuat "${kata}"`).not.toContain(kata);
    }
  });

  it('foto contoh sudah diganti PNG 1x1 dan deskripsinya netral', async () => {
    const parts = await bukaTemplate();
    expect(parts['xl/media/image1.png'].length).toBeLessThan(200);
    expect(parts['xl/drawings/drawing1.xml']).toContain('descr="Pas Foto"');
    expect(parts['xl/drawings/drawing1.xml']).not.toContain('HERLINA');
  });
});

describe('kaigo-hyogo · identitas (baris 3-11)', () => {
  it('menulis nama, furigana, tanggal lahir, dan alamat ke sel yang benar', () => {
    const v = buildValues(
      kandidat({
        identitas: {
          nama_lengkap: 'BUDI SANTOSO',
          katakana: 'ブディ・サントソ',
          tgl_lahir: '2005-10-28',
          alamat: 'JL. MAWAR 3, MAGETAN',
        },
      }),
    );
    expect(v.B3).toBe('ブディ・サントソ');
    expect(v.B4).toBe('BUDI SANTOSO');
    expect(v.B5).toBe('2005年10月28日');
    expect(v.B9).toBe('JL. MAWAR 3, MAGETAN');
  });

  it('menerjemahkan jenis kelamin, status, dan tangan dominan', () => {
    const v = buildValues(
      kandidat({
        identitas: { gender: 'PEREMPUAN', status_nikah: 'BELUM MENIKAH', golongan_darah: 'O' },
        fisik: { tangan_dominan: 'KANAN' },
      }),
    );
    expect(v.H5).toBe('女性');
    expect(v.B8).toBe('未婚');
    expect(v.K5).toBe('右');
    expect(v.K8).toBe('O');
  });

  it('tinggi/berat/visi ditulis ANGKA saja — satuannya label di sel sebelah', () => {
    const v = buildValues(
      kandidat({
        fisik: { tb: '157 cm', bb: '54kg' },
        medis: { mata_kanan: '1.0', mata_kiri: '0.8' },
      }),
    );
    expect(v.H6).toBe('157');
    expect(v.K6).toBe('54');
    expect(v.F6).toBe('1.0');
    expect(v.F7).toBe('0.8');
  });

  it('merokok/alkohol: kosong tetap KOSONG, bukan 無', () => {
    /* `無` berarti "kandidat tidak merokok". Menulisnya untuk data yang belum
       diisi berarti mengarang jawaban atas nama kandidat. */
    const kosongV = buildValues(kosong());
    expect(kosongV.E8).toBe('');
    expect(kosongV.H8).toBe('');
    const ada = buildValues(kandidat({ medis: { rokok: 'TIDAK ADA', alkohol: 'YA' } }));
    expect(ada.E8).toBe('無');
    expect(ada.H8).toBe('有');
  });

  it('umur DIHITUNG dari tanggal lahir, bukan disalin dari kolom umur', () => {
    const v = buildValues(kandidat({ identitas: { tgl_lahir: '2000-01-01', umur: '20' } }));
    const tahun = new Date().getFullYear() - 2000;
    expect(v.E5).toBe(`${tahun}歳`);
    expect(v.E5).not.toBe('20歳');
  });

  it('tanpa tanggal lahir dan tanpa umur: sel umur kosong', () => {
    expect(buildValues(kosong()).E5).toBe('');
  });

  it('hobi memakai versi Jepang kalau ada', () => {
    const v = buildValues(
      kandidat({ wawancara: { hobi_jp: '趣味は小説を読むことです。', hobi: 'Membaca novel' } }),
    );
    expect(v.B11).toBe('趣味は小説を読むことです。');
  });

  it('riwayat ke Jepang: kosong dibiarkan kosong, bukan 無し', () => {
    expect(buildValues(kosong()).B13).toBe('');
    expect(buildValues(kandidat({ identitas: { status_eks_jepang: 'BELUM PERNAH' } })).B13).toBe('');
    expect(buildValues(kandidat({ identitas: { status_eks_jepang: '2023-05' } })).B13).toBe('2023-05');
  });

  it('作成日 memakai bentuk `YYYY年 M月 D日`', () => {
    expect(tanggalHariIni(new Date(2026, 10, 13))).toBe('2026年 11月 13日');
  });
});

describe('kaigo-hyogo · pendidikan (baris 17-20)', () => {
  it('menulis periode `YYYY年 M月`, nama sekolah, dan jenis sekolah', () => {
    const v = buildValues(
      kandidat({
        pendidikan: [
          { tingkat: 'SD', sekolah: 'SDN 2 GANDUKEPUH', masuk: '2013-07', lulus: '2019-06' },
        ],
      }),
    );
    expect(v.A17).toBe('2013年 7月');
    expect(v.B17).toBe('2019年 6月');
    expect(v.C17).toBe('SDN 2 GANDUKEPUH');
    expect(v.K17).toBe('小学校');
  });

  it('SMK ditulis 職業学校 dengan jurusannya — sesuai instruksi form', () => {
    /* Placeholder template: 「高校 / 専門高校 (Jurusan) *Jika SMK Tuliskan
       jurusannya」. Berkas contoh menulis 職業学校 tanpa jurusan; instruksi
       form yang diikuti. */
    const v = buildValues(
      kandidat({
        pendidikan: [{ tingkat: 'SMK', sekolah: 'SMKN 1 PONOROGO', jurusan: 'Administrasi Perkantoran' }],
      }),
    );
    expect(v.K17).toBe('職業学校（ADMINISTRASI PERKANTORAN）');
  });

  it('LPK TIDAK masuk 学歴, dan barisnya tetap kosong', () => {
    const v = buildValues(
      kandidat({
        pendidikan: [
          { tingkat: 'SD', sekolah: 'SDN 1', masuk: '2006-07', lulus: '2012-06' },
          { tingkat: 'LPK', sekolah: 'LPK AMANAH SAKURA', masuk: '2026-08' },
        ],
      }),
    );
    expect(v.C17).toBe('SDN 1');
    expect(v.C18).toBe('');
    expect(v.K18).toBe('');
  });

  it('baris keempat dipakai kalau ada empat jenjang', () => {
    const v = buildValues(
      kandidat({
        pendidikan: [
          { tingkat: 'SD', sekolah: 'SDN 1', masuk: '2006-07', lulus: '2012-06' },
          { tingkat: 'SMP', sekolah: 'SMPN 1', masuk: '2012-07', lulus: '2015-06' },
          { tingkat: 'SMA', sekolah: 'SMAN 1', masuk: '2015-07', lulus: '2018-06' },
          { tingkat: 'S1', sekolah: 'UNIVERSITAS BRAWIJAYA', masuk: '2018-08', lulus: '2022-07' },
        ],
      }),
    );
    expect(v.C20).toBe('UNIVERSITAS BRAWIJAYA');
    expect(v.K20).toBe('大学');
  });
});

describe('kaigo-hyogo · pekerjaan (baris 23-26)', () => {
  it('menulis periode, nama perusahaan, jenis, dan uraian kerja', () => {
    const v = buildValues(
      kandidat({
        pekerjaan: [
          {
            perusahaan: 'PONDOK LANSIA',
            jabatan: 'PERAWAT LANSIA',
            masuk: '2025-12',
            catatan_jp: '食事、入浴などの介助',
          },
        ],
      }),
    );
    expect(v.A23).toBe('2025年 12月');
    expect(v.C23).toBe('PONDOK LANSIA');
    expect(v.J23).toBe('PERAWAT LANSIA');
    expect(v.K23).toBe('食事、入浴などの介助');
  });

  it('tanggal keluar kosong = 在職中, bukan sel kosong', () => {
    const v = buildValues(
      kandidat({ pekerjaan: [{ perusahaan: 'A', masuk: '2025-12' }] }),
    );
    expect(v.B23).toBe('在職中');
  });

  it('baris tanpa tanggal masuk tidak diberi 在職中', () => {
    expect(buildValues(kosong()).B23).toBe('');
  });
});

describe('kaigo-hyogo · sertifikat (baris 29-31)', () => {
  const teks =
    'JFT-BASIC A2（国際交流基金日本語基礎テスト） — lulus 2026-02 (nilai A2)\n' +
    '介護技能評価試験 — lulus 2026-06 (nilai 合格)\n' +
    '介護日本語評価試験 — lulus 2026-07 (nilai 合格)';

  it('memecah sertifikat_lain jadi tiga baris dengan tanggal dan nilai', () => {
    const v = buildValues(kandidat({ sertifikasi: { sertifikat_lain: teks, jft: 'A2' } }));
    expect(v.A29).toBe('2026年 2月');
    expect(v.C29).toBe('JFT-Basic 国際交流基金日本語基礎テスト');
    expect(v.J29).toBe('A2');
    expect(v.C30).toBe('介護技能評価試験');
    expect(v.J30).toBe('合格');
    expect(v.C31).toBe('介護日本語評価試験');
  });

  it('jatuh ke kolom JFT kalau teks bebasnya kosong', () => {
    const v = buildValues(kandidat({ sertifikasi: { jft: 'A2' } }));
    expect(v.C29).toBe('JFT-Basic 国際交流基金日本語基礎テスト');
    expect(v.J29).toBe('A2');
    expect(v.C30).toBe('');
  });

  it('baris yang tidak cocok pola tetap dicetak namanya', () => {
    const v = buildValues(kandidat({ sertifikasi: { sertifikat_lain: 'SIM A — 2021' } }));
    expect(v.C29).toBe('SIM A — 2021');
    expect(v.A29).toBe('');
  });
});

describe('kaigo-hyogo · keluarga (baris 34-40)', () => {
  it('menomori, menerjemahkan 続柄, dan menghitung usia', () => {
    const v = buildValues(
      kandidat({
        keluarga: [
          { nama: 'KARYONO', hubungan: 'AYAH', usia: '50', pekerjaan: 'WIRAUSAHA / PEMILIK USAHA' },
          { nama: 'TUKINI', hubungan: 'IBU', usia: '46', pekerjaan: 'IBU RUMAH TANGGA' },
        ],
      }),
    );
    expect(v.A34).toBe('1');
    expect(v.B34).toBe('父');
    expect(v.C34).toBe('KARYONO');
    expect(v.G34).toBe('50歳');
    expect(v.H34).toBe('自営業');
    expect(v.A35).toBe('2');
    expect(v.B35).toBe('母');
    expect(v.H35).toBe('家事');
  });

  it('pekerjaan yang tidak ada di daftar referensi dibiarkan apa adanya', () => {
    const v = buildValues(
      kandidat({ keluarga: [{ nama: 'X', hubungan: 'ADIK', pekerjaan: 'PEMAIN BOLA' }] }),
    );
    expect(v.H34).toBe('PEMAIN BOLA');
  });

  it('baris hampa tidak diberi nomor', () => {
    const v = buildValues(kandidat({ keluarga: [{ nama: 'A', hubungan: 'AYAH' }] }));
    expect(v.A34).toBe('1');
    expect(v.A35).toBe('');
    expect(v.B35).toBe('');
  });
});

describe('kaigo-hyogo · tujuan ke Jepang (baris 42)', () => {
  it('memakai esai Jepang kalau ada', () => {
    const v = buildValues(
      kandidat({ wawancara: { tujuan_ke_jepang_jp: '日本の介護を学びたいです。', tujuan_ke_jepang: 'Belajar' } }),
    );
    expect(v.A42).toBe('日本の介護を学びたいです。');
  });

  it('sel 追加情報 (pertanyaan template) tidak pernah ditimpa', () => {
    const v = buildValues(kosong());
    expect(v.B44).toBeUndefined();
    expect(v.A43).toBeUndefined();
  });
});
