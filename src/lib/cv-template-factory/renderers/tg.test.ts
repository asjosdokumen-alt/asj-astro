/**
 * tg.test.ts — "CV TG" (template ke-7), sheet data induk 68 kolom.
 *
 * APA YANG DIJAGA, DAN KENAPA
 *   1. GEOMETRI. Sheet `List Isian` 60 kolom / 47 baris / 0 merge / 3.195 sel
 *      dan sheet `Daftar` 13 kolom / 116 baris / 591 sel — angka yang diukur
 *      dari ketiga berkas pemilik (kosong + dua isian manual). Kalau bergeser,
 *      baris data tidak lagi sejajar dengan judul kolomnya, tanpa satu pun error.
 *   2. PRIVASI. Aset dibuat dari CV orang sungguhan. Nama, alamat, nomor HP,
 *      dan esai kandidat tidak boleh tertinggal di template yang diunduh
 *      kandidat lain. Diuji dengan MEMBUKA zip-nya, bukan dengan membaca nama
 *      berkasnya.
 *   3. ATURAN PENGISIAN. Dropdown = pasangan `JP ID` tanpa furigana, esai =
 *      bahasa Jepang dengan barisnya utuh, umur = rumus form (bukan teks).
 *      Ketiganya diambil dari berkas manual pemilik, jadi tes ini adalah
 *      catatan aturan itu — bukan selera penulis kode.
 *   4. PETA SEL. Satu alamat salah = satu kolom CV salah isi. Setiap alamat
 *      yang ditulis dibuktikan bisa dijangkau (`setCell` mengubah sheet), karena
 *      `setCell` mengembalikan XML apa adanya bila alamatnya tidak ada —
 *      kegagalan senyap.
 */
import { describe, it, expect } from 'vitest';
import { TG_BASE64 } from '../templates/tg.b64';
import { buildValues } from './tg';
import { setCell } from './xlsx-form';
import type { CandidateData } from '../types';

const SHEET = 'xl/worksheets/sheet2.xml';

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

async function parts(): Promise<Record<string, string>> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(Buffer.from(TG_BASE64, 'base64'));
  const out: Record<string, string> = {};
  for (const nama of Object.keys(zip.files)) {
    const berkas = zip.file(nama);
    if (!berkas || zip.files[nama].dir) continue;
    out[nama] = await berkas.async('string');
  }
  return out;
}

/** Data sepadan dengan CV manual "DEVIANA AMANDA PUTRI" — supaya hasilnya bisa
 *  dibandingkan langsung dengan berkas pemilik, bukan dengan tafsiran. */
function deviana(): CandidateData {
  return {
    ...kosong(),
    identitas: {
      nama_lengkap: 'DEVIANA AMANDA PUTRI',
      katakana: 'デヴィアナ・アマンダ・プトリ',
      alamat: 'DUKUH KRAJAN RT.002/RW.001, DESA BRAHU, KEC. SIMAN, KAB. PONOROGO, JAWA TIMUR',
      hp: '083845602023',
      gender: 'PEREMPUAN',
      tgl_lahir: '2006-05-24',
      status_nikah: 'BELUM MENIKAH',
      golongan_darah: 'Tidak tau',
      paspor: '',
      status_eks_jepang: 'BELUM PERNAH',
    },
    fisik: { tb: '150', bb: '45', baju: 'M', sepatu: '25', tangan_dominan: 'KANAN' },
    medis: { mata_kanan: '1.0', mata_kiri: '1.0', alkohol: 'TIDAK', rokok: 'TIDAK', tato: 'TIDAK' },
    pendidikan: [{ tingkat: 'SMK', sekolah: 'SMK NEGERI 1 PONOROGO' }],
    pekerjaan: [],
    keluarga: [
      { hubungan: 'AYAH', umur: '53', pekerjaan: 'PETANI' },
      { hubungan: 'KAKAK LAKI-LAKI', umur: '29', pekerjaan: 'KARYAWAN SWASTA' },
    ],
    kenalan_jepang: {},
    wawancara: {
      promosi_jp:
        'はじめまして。インドネシアのポノロゴから来ました、デヴィアナ・アマンダ・プトリです。20歳です。\n' +
        '私の長所は、真面目で時間を守ることです。実家が農家なので農業に関心があり、梱包などの細かい作業も得意です。\n' +
        '日本の農場で一生懸命頑張ります。よろしくお願いいたします。',
      keahlian_khusus_jp: 'インドネシア料理を作ることができます。',
    },
    raw: { NO: '001' },
  } as CandidateData;
}

describe('tg · geometri template', () => {
  it('sheet data induk tetap 60 kolom / 47 baris / 0 merge / 3.195 sel', async () => {
    const p = await parts();
    const s = p[SHEET];
    expect((s.match(/<col\s/g) || []).length).toBe(60);
    expect((s.match(/<row\s/g) || []).length).toBe(47);
    expect((s.match(/<mergeCell\s/g) || []).length).toBe(0);
    expect((s.match(/<c\s[^>]*?r="[A-Z]+\d+"/g) || []).length).toBe(3195);
  });

  it('sheet Daftar (sumber dropdown) tetap 13 kolom / 116 baris / 591 sel', async () => {
    const p = await parts();
    const s = p['xl/worksheets/sheet1.xml'];
    expect((s.match(/<col\s/g) || []).length).toBe(13);
    expect((s.match(/<row\s/g) || []).length).toBe(116);
    expect((s.match(/<c\s[^>]*?r="[A-Z]+\d+"/g) || []).length).toBe(591);
  });

  it('rumus umur H4 masih hidup dan foto masih punya anchor di BP', async () => {
    const p = await parts();
    expect(/<c r="H4"[^>]*>[\s\S]*?DATEDIF/.test(p[SHEET])).toBe(true);
    expect(/<drawing r:id="[^"]+"\/>/.test(p[SHEET])).toBe(true);
    const draw = p['xl/drawings/drawing1.xml'];
    expect(/<xdr:col>67<\/xdr:col>/.exec(draw)?.[0]).toBe('<xdr:col>67</xdr:col>');
  });
});

describe('tg · privasi aset', () => {
  it('tidak memuat nama, alamat, HP, atau esai kandidat', async () => {
    const p = await parts();
    const semua = Object.values(p).join('\n');
    for (const rahasia of [
      'DEVIANA',
      'デヴィアナ',
      'PONOROGO',
      '083845602023',
      'RATIH',
      'インドネシア料理を作ることができます',
    ]) {
      expect(semua.includes(rahasia), `bocor: ${rahasia}`).toBe(false);
    }
  });
});

describe('tg · aturan pengisian (dari berkas manual pemilik)', () => {
  it('dropdown ditulis sebagai pasangan JP ID tanpa furigana', () => {
    const v = buildValues(deviana());
    expect(v.F4).toBe('女 Wanita');
    expect(v.I4).toBe('高等専門学校 SMK');
    expect(v.J4).toBe('未婚 Single');
    expect(v.O4).toBe('右利き Kanan');
    expect(v.S4).toBe('不明 \nTidak tau');
    expect(v.U4).toBe('父 Ayah');
    expect(v.W4).toBe('農家 Petani');
    expect(v.X4).toBe('兄 Abang');
    expect(v.Z4).toBe('会社員 Karyawan swasta');
    expect(v.BE4).toBe('無 Tidak');
    expect(v.BF4).toBe('無 Belum');
    expect(v.BK4).toBe('無 Tidak');
  });

  it('esai memakai bahasa Jepang dan barisnya dipertahankan', () => {
    const v = buildValues(deviana());
    expect(v.BN4).toBe('インドネシア料理を作ることができます。');
    expect(v.BO4?.split('\n')).toHaveLength(3);
    expect(v.BO4?.startsWith('はじめまして。')).toBe(true);
  });

  it('umur TIDAK ditulis sebagai teks — H4 milik rumus template', () => {
    const v = buildValues(deviana());
    expect(v.H4).toBeUndefined();
    expect(v.G4).toBeUndefined(); // tanggal lahir masuk lewat `numbers`, bukan teks
  });

  it('kolom tanpa sumber dibiarkan kosong, bukan ditebak', () => {
    const v = buildValues(deviana());
    expect(v.P4).toBeUndefined(); // ukuran celana: tidak ada kolomnya di database
    expect(v.BD4).toBeUndefined(); // penghasilan: tidak diisi di berkas contoh
  });

  it('satuan ditambahkan hanya kalau belum ada', () => {
    const v = buildValues(deviana());
    expect(v.K4).toBe('150 cm');
    expect(v.L4).toBe('45 kg');
    expect(v.R4).toBe('25 cm');
    const sudah = buildValues({
      ...deviana(),
      fisik: { tb: '150 cm', bb: '45 kg', sepatu: '25 cm' },
    } as CandidateData);
    expect(sudah.K4).toBe('150 cm');
    expect(sudah.R4).toBe('25 cm');
  });

  it('sel lain sepadan dengan berkas manual (alamat, HP, mata, keluarga, daerah)', () => {
    const v = buildValues(deviana());
    expect(v.B4).toBe('DEVIANA AMANDA PUTRI');
    expect(v.C4).toBe('デヴィアナ・アマンダ・プトリ');
    expect(v.E4).toBe('083845602023');
    expect(v.M4).toBe('1.0');
    expect(v.N4).toBe('1.0');
    expect(v.Q4).toBe('M');
    /* `T4` = daerah asal. Berkas manual menulis `PONOROGO`; di sini nilainya
       DITURUNKAN dari alamat (`KAB. PONOROGO`), karena database tidak punya
       kolom daerah asal. */
    expect(v.T4).toBe('PONOROGO');
    expect(v.V4).toBe('53歳');
    expect(v.Y4).toBe('29歳');
  });
});

describe('tg · peta sel bisa dijangkau', () => {
  it('setiap alamat yang ditulis benar-benar mengubah sheet', async () => {
    const p = await parts();
    const sheet = p[SHEET];
    const v = buildValues(deviana());
    const gagal = Object.keys(v).filter((addr) => setCell(sheet, addr, 'X') === sheet);
    expect(gagal).toEqual([]);
  });

  it('menulis nilai tidak menambah atau menghilangkan sel', async () => {
    const p = await parts();
    let sheet = p[SHEET];
    for (const [addr, val] of Object.entries(buildValues(deviana()))) {
      sheet = setCell(sheet, addr, val);
    }
    expect((sheet.match(/<c\s[^>]*?r="[A-Z]+\d+"/g) || []).length).toBe(3195);
  });
});
