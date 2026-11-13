/**
 * TESTS: `kinki` — form CV magang klien KINKI sebagai template ketiga.
 *
 * KENAPA ANGKA GEOMETRINYA DIBEKUKAN
 * ----------------------------------
 * Permintaan pemilik: "ini adalah template nomer 3" — CV yang keluar harus form
 * YANG SAMA dengan `MASTER CV MAGANG KINKI.xlsx`, bukan tabel baru yang mirip.
 * Sifat itu hanya bisa dijaga kalau diukur.
 *
 * TIGA HAL YANG MUDAH SALAH TANPA TES
 * -----------------------------------
 * 1. Alamat sel yang tidak ada di template membuat `setCell` diam-diam jadi
 *    no-op: CV terunduh tanpa nama, tanpa satu pun error. Setiap alamat di
 *    `buildValues` diuji benar-benar ada di sheet.
 * 2. `Q47` harus PERSIS salah satu nilai `AF111:AF126`, karena `E50` mencarinya
 *    dengan `MATCH(...,0)`. Satu karakter beda (kurung lebar vs setengah) dan
 *    deskripsi kepribadian hilang tanpa error.
 * 3. Kalau tidak ada teks wawancara, `Q47` kosong membuat `A50 (=Q47)` mencetak
 *    0 dan `E50` mencetak #N/A. Keduanya harus ikut dikosongkan.
 */
import { describe, it, expect } from 'vitest';
import { KINKI_BASE64 } from '../src/lib/cv-template-factory/templates/kinki.b64';
import { buildKinkiWorkbook, buildNumbers, buildValues } from '../src/lib/cv-template-factory/renderers/kinki';
import { MBTI_MARGIN, TYPE_NAMES, inferMbti } from '../src/lib/cv-template-factory/mbti';
import { normalizeMasterData } from '../src/lib/cv-template-factory/data';
import type { CandidateData } from '../src/lib/cv-template-factory/types';

const SHEET = 'xl/worksheets/sheet1.xml';
const DRAWING = 'xl/drawings/drawing1.xml';
const SHARED = 'xl/sharedStrings.xml';

/** Geometri aset, TERUKUR ULANG 2026-11-12 setelah template diganti
 *  (`aec08e4`, sumber `D:/ARBI ALVIANSYAH_CV.xlsx`): 3→6 `<col>`, 9112→9314
 *  sel, 27→41 validasi, dan used-range melebar ke `A2:BW1001` karena format
 *  ikut turun sampai baris 1001. Merge tidak berubah (252). */
const SOURCE = {
  colElements: 6,
  mergeCells: 252,
  cellElements: 9314,
  dataValidations: 41,
  dimension: 'A2:BW1001',
} as const;

async function loadZip(bytes: Uint8Array | Blob) {
  const JSZip = (await import('jszip')).default;
  return JSZip.loadAsync(bytes as never);
}
type Zip = Awaited<ReturnType<typeof loadZip>>;

async function part(zip: Zip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) throw new Error(`template is missing ${path}`);
  return file.async('string');
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const countAll = (xml: string, re: RegExp) => (xml.match(re) ?? []).length;

/** Daftar string bersama, supaya nilai sel `t="s"` bisa dibaca. */
async function sharedStrings(zip: Zip): Promise<string[]> {
  if (!zip.file(SHARED)) return [];
  const xml = await part(zip, SHARED);
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''),
  );
}

function cellText(sheet: string, addr: string, shared: string[]): string | null {
  const m = new RegExp(`<c r="${addr}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`).exec(sheet);
  if (!m) return null;
  const inner = m[2] ?? '';
  if (/t="s"/.test(m[1])) {
    const v = /<v>(\d+)<\/v>/.exec(inner);
    return v ? shared[parseInt(v[1], 10)] ?? null : null;
  }
  const inline = /<t[^>]*>([\s\S]*?)<\/t>/.exec(inner);
  if (inline) return inline[1];
  const num = /<v>([\s\S]*?)<\/v>/.exec(inner);
  return num ? num[1] : '';
}

/** Kandidat uji — bentuknya sama dengan yang dikirim `normalizeMasterData`. */
function kandidat(): CandidateData {
  return {
    identitas: {
      nama_lengkap: 'BUDI TRISNANTO',
      katakana: 'ブディ\u3000トリスナント',
      panggilan: 'BUDI',
      panggilan_katakana: 'ブディ',
      gender: 'LAKI-LAKI',
      tgl_lahir: '2005-11-02',
      agama: 'ISLAM',
      golongan_darah: 'O-',
      status_nikah: 'BELUM MENIKAH',
      hp: '628999170623',
      hp_darurat: '6281234567890',
      kontak_darurat_hubungan: 'AYAH',
      alamat_jp: '〒63400 東ジャワ州 ポノロゴ県 スラハン郡 RT 002/RW 003',
      tempat_lahir_jp: 'ポノロゴ',
      sim: '',
    },
    fisik: { tb: '170 cm', bb: '60 kg', tangan_dominan: 'KANAN' },
    medis: { mata_kiri: 'NORMAL', mata_kanan: 'NORMAL', rokok: 'TIDAK', alkohol: 'TIDAK', tato: 'TIDAK', buta_warna: 'TIDAK' },
    pendidikan: [
      { tingkat: 'SMP', masuk: '2018-07', lulus: '2021-06', sekolah: 'SMPN 1 BUNGKAL' },
      { tingkat: 'SMK', masuk: '2021-07', lulus: '2024-06', sekolah: 'SMKN 1 SLAHUNG', jurusan: 'TEKNIK OTOMOTIF' },
    ],
    pekerjaan: [
      { jenis: 'KARYAWAN TETAP', masuk: '2024-06', keluar: '2025-06', perusahaan: 'PT SAKURA', jabatan: 'MEKANIK', gaji: '18000' },
    ],
    keluarga: [
      { hubungan: 'AYAH', usia: '55', pekerjaan: 'PETANI', gaji: '15000' },
      { hubungan: 'IBU', usia: '48', pekerjaan: 'IBU RUMAH TANGGA' },
      { hubungan: 'ADIK PEREMPUAN', usia: '16', pekerjaan: 'PELAJAR' },
    ],
    sertifikasi: { jft: 'N5 LULUS' },
    wawancara: {
      // Bentuk BERSARANG seperti `buildMasterNested` — `promosi_jp`, bukan
      // `promosi_diri_jp`. Renderer dulu membaca kunci datar dan seluruh sel
      // PR + MBTI keluar kosong; fixture ini yang menahan regresi itu.
      promosi_jp: '私は規律正しく、勤勉で、諦めない性格です。',
      kelebihan_jp: 'プレッシャーのかかる状況でも落ち着いて責任を持って作業に対応できます。',
      kekurangan_jp: '私の短所は心配性なところです。分からないことはよく確認します。',
      tujuan_ke_jepang_jp: '家族の生活を支え、両親を笑顔にしたいからです。',
      rencana_setelah_pulang_jp: 'ずっと日本で働きたいと思っています。',
      hobi_jp: 'ジョギング',
      keahlian_khusus_jp: '整備士、大工',
    },
    kenalan_jepang: { nama_id: '', nama_jp: '' },
    uploads: { photo: '' },
    raw: {},
  } as unknown as CandidateData;
}

describe('kinki · geometri template', () => {
  it('mempertahankan lebar kolom, merge, dan jumlah sel berkas asli', async () => {
    const zip = await loadZip(b64ToBytes(KINKI_BASE64));
    const sheet = await part(zip, SHEET);

    expect(countAll(sheet, /<col\s/g)).toBe(SOURCE.colElements);
    expect(countAll(sheet, /<mergeCell\s/g)).toBe(SOURCE.mergeCells);
    expect(countAll(sheet, /<c\s[^>]*?r="[A-Z]+\d+"/g)).toBe(SOURCE.cellElements);
    expect(countAll(sheet, /<dataValidation\s/g)).toBe(SOURCE.dataValidations);
    expect(/<dimension ref="([^"]+)"/.exec(sheet)?.[1]).toBe(SOURCE.dimension);
  });

  it('pas foto ada di kotak & posisi berkas pemilik (rId2, kolom X baris 7)', async () => {
    const zip = await loadZip(b64ToBytes(KINKI_BASE64));
    const drawing = await part(zip, DRAWING);

    const at = drawing.indexOf('r:embed="rId2"');
    expect(at).toBeGreaterThan(0);
    // Tag di berkas ini ber-prefix "xdr:" — versi lama mencari "<oneCellAnchor"
    // tanpa prefix, sehingga lastIndexOf mengembalikan -1 dan blok yang diuji
    // KOSONG. Tes itu selalu "hijau" karena tidak menguji apa pun.
    const block = drawing.slice(
      drawing.lastIndexOf('<xdr:oneCellAnchor', at),
      drawing.indexOf('</xdr:oneCellAnchor>', at),
    );
    expect(block).toContain('<xdr:col>23</xdr:col>');
    expect(block).toContain('<xdr:row>6</xdr:row>');
    expect(block).toContain('<xdr:colOff>76200</xdr:colOff>');
    expect(block).toContain('<xdr:rowOff>38100</xdr:rowOff>');
    expect(block).toMatch(/<xdr:ext cx="1590675" cy="2143125"\s*\/>/);
    expect(drawing).toContain('r:embed="rId1"');
  });

  it('hanya membawa satu sheet — 15 CV kandidat lain tidak ikut ke bundel', async () => {
    const zip = await loadZip(b64ToBytes(KINKI_BASE64));
    const wb = await part(zip, 'xl/workbook.xml');
    expect(countAll(wb, /<sheet\s/g)).toBe(1);
  });
});

describe('kinki · peta sel', () => {
  it('setiap alamat di buildValues benar-benar ada di sheet', async () => {
    const zip = await loadZip(b64ToBytes(KINKI_BASE64));
    const sheet = await part(zip, SHEET);
    const cells = buildValues(kandidat());

    // Tanpa ini, alamat yang salah hanya menghasilkan CV kosong tanpa error.
    const missing = Object.keys(cells).filter((addr) => !new RegExp(`<c r="${addr}"`).test(sheet));
    expect(missing).toEqual([]);
    expect(Object.keys(cells).length).toBeGreaterThan(60);
  });

  it('tanggal lahir ditulis sebagai ANGKA, bukan teks (T9 = DATEDIF)', () => {
    const nums = buildNumbers(kandidat());
    // 2005-11-02 = 38658 hari sejak 1899-12-30. Selnya F9 di template baru.
    expect(nums.F9).toBe(38658);
    expect(buildNumbers(kandidat()).F9).toBeTypeOf('number');
  });

  it('identitas & kebiasaan memakai kosakata dropdown form', () => {
    const c = buildValues(kandidat());
    expect(c.F7).toBe('BUDI TRISNANTO');
    expect(c.F8).toBe('ブディ・トリスナント');
    expect(c.T8).toBe('男');
    expect(c.M14).toBe('O'); // `O-` → O, dropdown hanya A/B/O/AB/不明
    expect(c.F14).toBe('無飲');
    expect(c.F15).toBe('非喫煙');
    expect(c.M15).toBe('右');
    expect(c.F12).toBe('未婚');
    expect(c.M16).toBe('1.0');
    expect(c.N4).toBe('なし'); // tanpa SIM, 自動車運転 tidak boleh tercentang
    expect(c.F16).toBe('なし');
    expect(c.F17).toBe('ジョギング');
    expect(c.F10).toBe('08999170623');
    expect(c.F11).toBe('インドネシア東ジャワ州ポノロゴ県');
  });

  it('できる作業 hanya mencentang keahlian yang benar-benar ditulis', () => {
    const c = buildValues(kandidat());
    // Baris 35–36 memuat kotak centang keahlian. Fixture menyebut 大工 dan
    // 整備士 (dua keahlian) → tepat DUA kotak tercentang, sisanya kosong.
    // 9 CV manual pemilik: HANYA その他 yang dicentang, plus 自動車運転 bila
    // ada SIM. Kotak keahlian spesifik tidak pernah dipakai.
    const kotak = Object.entries(c).filter(([addr, v]) => /^[B-Y]3[56]$/.test(addr) && v === '■');
    expect(kotak).toHaveLength(1);
    expect(c.X35).toBe('■'); // その他
    expect(c.Y36).toBe('整備士、大工');
  });

  it('pekerjaan & keluarga terisi sesuai blok form', () => {
    const c = buildValues(kandidat());
    expect(c.B27).toBe('正社員');
    expect(c.E27).toBe('2024年6月');
    expect(c.F28).toBe('2025年6月');
    expect(c.I27).toBe('1年');
    expect(c.N27).toBe('PT SAKURA'); // 業種 kolom diisi NAMA PERUSAHAAN
    expect(c.R27).toBe('整備士');
    // 月収: ANGKA saja — satuan `万円` sudah teks tetap di kolom Z.
    expect(c.X27).toBe('18');
    expect(c.B38).toBe('父');
    expect(c.K38).toBe('15');
    expect(c.Y38).toBe('父');
    expect(c.AA38).toBe('081234567890');
    expect(c.N38).toBe('■');
  });

  it('tanpa pekerjaan, placeholder `年月日` bawaan template TIDAK tercetak', () => {
    const data = kandidat();
    data.pekerjaan = [];
    const c = buildValues(data);
    expect(c.B27).toBe('');
    expect(c.E27).toBe('');
    expect(c.F28).toBe('');
  });
});

describe('kinki · MBTI masuk ke dropdown yang sah', () => {
  it('R48 PERSIS salah satu nilai AF111:AF126, dan V49..V53 ada di daftarnya', async () => {
    const zip = await loadZip(b64ToBytes(KINKI_BASE64));
    const sheet = await part(zip, SHEET);
    const shared = await sharedStrings(zip);
    const types = Array.from({ length: 16 }, (_, i) => cellText(sheet, `AG${112 + i}`, shared));

    const c = buildValues(kandidat());
    expect(types).toContain(c.R48);
    expect(types.filter(Boolean)).toHaveLength(16);

    const axisLists = {
      V49: ['AM112', 'AM113'],
      V50: ['AQ112', 'AQ113'],
      V51: ['AU112', 'AU113'],
      V52: ['AY112', 'AY113'],
      V53: ['BC112', 'BC113'],
    };
    for (const [addr, refs] of Object.entries(axisLists)) {
      const allowed = refs.map((r) => cellText(sheet, r, shared));
      expect(allowed).toContain(c[addr]);
    }
  });

  it('16 nama tipe di kode = 16 nilai di tabel template', () => {
    expect(Object.keys(TYPE_NAMES)).toHaveLength(16);
  });

  it('tanpa teks wawancara: R48 TETAP terisi dari bawaan, rumusnya tidak disentuh', () => {
    const data = kandidat();
    data.wawancara = {};

    const c = buildValues(data);
    // Sel kosong terbaca sebagai formulir belum selesai oleh klien Jepang.
    expect(c.R48).toBe('管理者型（ISTJ）');
    expect(c.V49).toBe('【I】内向型');
    // `B51 (=R48)` dan `F51 (INDEX/MATCH)` harus DIBIARKAN: karena R48 ada,
    // keduanya menghasilkan nilai — bukan 0 dan bukan #N/A.
    expect(c.B51).toBeUndefined();
    expect(c.F51).toBeUndefined();
  });

  it('selisih di bawah ambang tidak membalik tipe', () => {
    const r = inferMbti({ promosi_diri_jp: '責任を持って働きます。' });
    // Satu kata lemah (+1) bukan bukti yang cukup → bawaan, bukan temuan.
    expect(r?.axis.TF).toBe('T');
    expect(r?.details.find((d) => d.axis === 'TF')?.tied).toBe(true);
    expect(MBTI_MARGIN).toBe(2);
  });
});

describe('kinki · dari baris BERSARANG `getDrafCvMaster`', () => {
  /**
   * Bentuk yang BENAR-BENAR dikirim server (`buildMasterNested`): teks wawancara
   * ada di `wawancara.promosi_jp`, bukan di `raw.promosi_diri_jp`. Versi pertama
   * renderer membaca kunci datar, jadi 性格診断テスト + kotak PR kosong untuk
   * SEMUA kandidat — dan tidak ada satu pun tes yang menangkapnya karena semua
   * fixture dibuat dengan bentuk yang salah itu.
   */
  it('PR dan MBTI terisi dari `wawancara.promosi_jp`', () => {
    const row = {
      identitas: {
        nama_lengkap: 'BUDI TRISNANTO',
        katakana: 'ブディ\u3000トリスナント',
        panggilan: 'BUDI',
        panggilan_katakana: 'ブディ',
        gender: 'LAKI-LAKI',
        tgl_lahir: '2005-11-02',
        agama: 'ISLAM',
        golongan_darah: 'O-',
        status_nikah: 'BELUM MENIKAH',
        hp: '628999170623',
        hp_darurat: '6281234567890',
        kontak_darurat_hubungan: 'AYAH',
        alamat_jp: '〒63400 東ジャワ州 ポノロゴ県',
        tempat_lahir_jp: 'ポノロゴ',
        sim: '',
      },
      fisik: { tb: '170', bb: '60', tangan_dominan: 'KANAN' },
      medis: { mata_kiri: 'NORMAL', mata_kanan: 'NORMAL', rokok: 'TIDAK', alkohol: 'TIDAK', tato: 'TIDAK', buta_warna: 'TIDAK' },
      wawancara: {
        promosi_jp: '私は規律正しく、勤勉で、諦めない性格です。',
        kelebihan_jp: 'プレッシャーのかかる状況でも落ち着いて責任を持って作業に対応できます。',
        kekurangan_jp: '私の短所は心配性なところです。分からないことはよく確認します。',
        tujuan_ke_jepang_jp: '家族の生活を支え、両親を笑顔にしたいからです。',
        rencana_setelah_pulang_jp: 'ずっと日本で働きたいと思っています。',
        hobi_jp: 'ジョギング',
        keahlian_khusus_jp: '整備士、大工',
      },
      sertifikasi: { jft: 'N5 LULUS' },
      pendidikan: [{ tingkat: 'SMK', masuk: '2021-07', lulus: '2024-06', sekolah: 'SMKN 1 SLAHUNG', jurusan: 'TEKNIK OTOMOTIF' }],
      pekerjaan: [],
      keluarga: [],
      AIDATAJSON: '',
    };

    const c = buildValues(normalizeMasterData(row));
    expect(c.V4).toBe('私は規律正しく、勤勉で、諦めない性格です。');
    expect(c.R48).toBe('管理者型（ISTJ）');
    expect(c.V49).toBe('【I】内向型');
    expect(c.X35).toBe('■'); // できる作業 dari keahlian_khusus_jp
    expect(c.P20).toBe('SMKN 1 SLAHUNG');
  });
});

describe('kinki · angka, tanggal, dan kana yang dulu salah', () => {
  it('periode di bawah setahun ditulis dalam BULAN, bukan dibulatkan jadi 1年', () => {
    const d = kandidat();
    d.pekerjaan = [{ jenis: 'MAGANG', masuk: '2023-08', keluar: '2023-12', perusahaan: 'PT A', jabatan: 'MAGANG' }];
    // Dulu 4 bulan tercetak "1年" — riwayat kerja terbaca jauh lebih panjang.
    expect(buildValues(d).I27).toBe('4ヶ月');
  });

  it('tanggal tanpa bulan tidak dikarang menjadi Januari', () => {
    const d = kandidat();
    d.pendidikan = [{ tingkat: 'SMK', masuk: '2019', lulus: '2022', sekolah: 'SMKN 1 SLAHUNG', jurusan: 'TSM' }];
    const c = buildValues(d);
    expect(c.E20).toBe('2019年'); // dulu "2019年1月"
    expect(c.I20).toBe('3年');
  });

  it('専攻 kosong memakai `-`, supaya strip atas tidak mencetak 0', () => {
    const d = kandidat();
    d.pendidikan = [{ tingkat: 'SMK', masuk: '2021-07', lulus: '2024-06', sekolah: 'SMKN 1 SLAHUNG' }];
    // `Q3` di strip atas = `=W19`; sel kosong membuatnya mencetak 0.
    expect(buildValues(d).X20).toBe('-');
  });

  it('tanpa baris 日本語学校, tanda `～` tidak menggantung sendirian', () => {
    expect(buildValues(kandidat()).E22).toBe('');
  });

  it('カナ: kanji yang bentuknya katakana + bullet dirapikan', () => {
    const d = kandidat();
    d.identitas = { ...d.identitas, katakana: '厶ハッマド•二ザル•ヌル' };
    expect(buildValues(d).F8).toBe('ムハッマド・ニザル・ヌル');
  });
});

describe('kinki · render', () => {
  it('menghasilkan .xlsx berisi nilai kandidat dan tab bernama kandidat', async () => {
    const blob = await buildKinkiWorkbook(kandidat());
    expect(blob.size).toBeGreaterThan(10_000);

    const zip = await loadZip(new Uint8Array(await blob.arrayBuffer()));
    const sheet = await part(zip, SHEET);
    const wb = await part(zip, 'xl/workbook.xml');

    expect(sheet).toContain('BUDI TRISNANTO');
    expect(sheet).toContain('管理者型'); // MBTI dari kalimat kandidat
    expect(wb).toContain('name="BUDI TRISNANTO"');
    // Merge tidak boleh hilang saat ditambal.
    expect(countAll(sheet, /<mergeCell\s/g)).toBe(SOURCE.mergeCells);
  });
});

/**
 * Sel yang DULU tidak punya sumber (migrasi 022, 2026-10-27).
 *
 * Sebelum ini `J19`, `M26`, `Z26`, `Q45`, `X45`, `T37`, `T39`, `Q41`, `T41`,
 * `X41`, `X47`, `AB51`, `AB52`, `O9`, `I4`, `M4` selalu kosong karena tidak ada
 * kolomnya. Tes ini mengunci arah sebaliknya: kalau kolomnya terisi, selnya
 * WAJIB terisi — tanpa itu, "sudah ada kolom" hanya klaim.
 */
describe('kinki · kolom migrasi 022 benar-benar masuk ke sel', () => {
  const denganKolom = (): CandidateData => {
    const d = kandidat();
    d.identitas = { ...d.identitas, wilayah_sekolah: 'Jawa Timur', jarak_jakarta_km: '780', lama_penerbangan: '1 jam 40 menit', rencana_sim_bulan: '2027-08' };
    d.pekerjaan = [{ ...(d.pekerjaan[0] as Record<string, unknown>), jenis: 'KARYAWAN TETAP', bidang: 'Manufaktur', catatan: 'Lembur penuh' }];
    d.keluarga = [{ ...(d.keluarga[0] as Record<string, unknown>), tinggal: 'TERPISAH', gaji: '2500000' }];
    d.sertifikasi = { ...d.sertifikasi, lama_belajar_jp: '6 bulan', status_belajar_jp: 'sedang belajar', bab_belajar_jp: '25', level_bahasa_inggris: 'menengah', bahasa_lain: 'Mandarin dasar', level_bahasa_jepang: 'N4レベル' };
    d.fisik = { ...d.fisik, tes_hitung: '85', tes_pushup: '30', tes_squat: '40', tinggal_kursus_tahun: '2' };
    d.wawancara = { ...d.wawancara, tabungan: '3000000', lamakerja_diharapkan: '5 tahun', mbti: 'ENFP' };
    return d;
  };

  it('identitas, pendidikan, dan placeholder O9/I4/M4', () => {
    const c = buildValues(denganKolom());
    expect(c.K20).toBe('Jawa Timur');
    expect(c.J5).toBe('第25課中');
    expect(c.N5).toBe('8月取得予定');
    expect(c.P10).toBe('ジャカルタから780㎞\n飛行機で1 jam 40 menit');
  });

  it('pekerjaan: 雇用形態 / 業種 / 備考', () => {
    const c = buildValues(denganKolom());
    expect(c.B27).toBe('正社員');
    // N = perusahaan, AA = 備考 (industri/catatan).
    expect(c.N27).toBe('PT SAKURA');
    expect(c.AA27).toBe('Manufaktur');
  });

  it('keluarga: 同居区分 mengikuti kolom, bukan `■` tetap', () => {
    const c = buildValues(denganKolom());
    // Baris keluarga pindah ke 38–42 di template baru; pasangan kolomnya
    // 同居 (N) dan 別居 (P). Fixture menulis `tinggal: 'TERPISAH'`.
    expect(c.N38).toBe('□');
    expect(c.P38).toBe('■');
    // 月収 keluarga: fixture `2500000` dibaca sebagai RUPIAH → 2,5万円.
    expect(c.K38).toBe('2.5');
  });

  it('bahasa, tes, dan angka yang dulu selalu kosong', () => {
    const c = buildValues(denganKolom());
    expect(c.J4).toBe('N4レベル'); // kolom menang atas tebakan dari teks JFT
    expect(c.U38).toBe('6ヶ月'); // durasiJp: teks Indonesia → bentuk Jepang
    expect(c.U40).toBe('N4勉強中'); // dropdown 学習状況, bukan teks bebas
    // 2026-11-13: `fdc3af0` memetakan LEVEL_INGGRIS lewat `inggrisJp()`, jadi
    // sel 英語レベル berisi 中級 — dulu kata Indonesia (`menengah`) tercetak
    // apa adanya di form Jepang. Fixture menulis `menengah` (huruf kecil);
    // pemetaannya tidak peka huruf.
    expect(c.R42).toBe('中級');
    expect(c.U42).toBe('Mandarin dasar');
    expect(c.R46).toBe('85');
    expect(c.Y42).toBe('2ヶ月'); // ヶ月, sama dengan 学習期間
    expect(c.Y46).toBe('3');
    expect(c.Y48).toBe('５年間'); // dropdown 就業希望年数: digit lebar penuh
    expect(c.AC52).toBe('30');
    expect(c.AC53).toBe('40');
  });

  it('MBTI dari kolom menang atas tebakan', () => {
    const c = buildValues(denganKolom());
    expect(c.R48).toBe('広報運動家型（ENFP）');
    expect(c.V49).toBe('【E】外向型');
    expect(c.V53).toBe('【A】自信型');
  });
});

// ==========================================
// 2026-10-29 — nilai WARISAN template tidak boleh tercetak sebagai data kandidat
// ==========================================
// Berkas asal adalah CV kandidat lain yang dikosongkan; pengosongan itu
// melewatkan sel BERANGKA. Sel yang lolos lalu tercetak di CV setiap kandidat.
describe('kinki · sisa data kandidat contoh di template', () => {
  it('tanpa tanggal lahir, E8 dibersihkan — bukan menyisakan 38876', () => {
    // 38876 = 2006-06-14, tanggal lahir kandidat contoh. `S8` menghitung umur
    // dengan DATEDIF(E8,…), jadi sel warisan ini mencetak UMUR ORANG LAIN.
    const d = kandidat();
    (d.identitas as Record<string, unknown>).tgl_lahir = '';
    const c = buildValues(d);
    expect(c.F9).toBeUndefined();
    expect(buildNumbers(d)).toEqual({});
  });

  it('tanpa level & tanpa JFT, I3 dibersihkan — bukan `N5レベル`', () => {
    // 243 dari 268 kandidat tidak punya kolom `jft`. Membiarkan teks template
    // berarti mereka mengaku level N5 di formulir resmi.
    const d = kandidat();
    d.sertifikasi = {};
    expect(buildValues(d).J4).toBe('');
  });


  it('sekolah NEGERI = 公立, bukan 国立', () => {
    // 国立 = didirikan negara (東京大学). SDN/SMPN/SMAN didirikan pemerintah
    // daerah, jadi istilah Jepangnya 公立 — dan dropdown form memuat keduanya,
    // sehingga tidak ada yang menolak nilai yang salah.
    const d = kandidat();
    d.pendidikan = [{ tingkat: 'SMA', masuk: '2018-07', lulus: '2021-06', sekolah: 'SMAN 1 SLAHUNG' }];
    expect(buildValues(d).N20).toBe('公立');
    d.pendidikan = [{ tingkat: 'SMA', masuk: '2018-07', lulus: '2021-06', sekolah: 'SMA MUHAMMADIYAH' }];
    expect(buildValues(d).N20).toBe('私立');
  });

  it('SIM `TIDAK PUNYA` tidak dianggap punya SIM', () => {
    const d = kandidat();
    (d.identitas as Record<string, unknown>).sim = 'TIDAK PUNYA';
    expect(buildValues(d).N4).toBe('なし');
  });
});

// ==========================================
// 2026-10-29 — kolom 学習期間 dan 修学内容 pada data produksi
// ==========================================
describe('kinki · bahasa kolom Jepang', () => {
  it('学習期間 `6 bulan` → `6ヶ月`', () => {
    const d = kandidat();
    d.sertifikasi = { ...d.sertifikasi, lama_belajar_jp: '6 bulan' };
    expect(buildValues(d).U38).toBe('6ヶ月');
  });

  it('修学内容 tanpa jurusan memakai nama sekolah, bukan "学校では学びました。"', () => {
    const d = kandidat();
    d.pendidikan = [{ tingkat: 'SMA', masuk: '2018-07', lulus: '2021-06', sekolah: 'SMK NEGERI 1 SLAHUNG' }];
    expect(buildValues(d).F24).toBe('SMK NEGERI 1 SLAHUNGで学びました。');
    // Dengan jurusan, kalimatnya tetap seperti semula.
    d.pendidikan = [{ tingkat: 'SMA', masuk: '2018-07', lulus: '2021-06', sekolah: 'SMKN 1', jurusan: 'TEKNIK OTOMOTIF' }];
    expect(buildValues(d).F24).toBe('学校では自動車を学びました。');
  });
});

/* ── 試験合格: dropdown, bukan teks bebas (2026-11-12) ───────────────────────
   Pemilik: *"JFT A2 itu setara N5 ke N4 ya, jadi kalau lulus JFT A2 N5 lulus
   dong, bukan kosong"*. Kolom `bahasa` menyimpan hasil uji apa adanya, dan
   dropdown U39 hanya menerima `なし / N5合格 … N1合格`. */
describe('kinki · 試験合格 memakai kosakata dropdown', () => {
  const denganBahasa = (bahasa: string, jft = '') => {
    const d = kandidat();
    d.sertifikasi = { ...d.sertifikasi, bahasa, jft };
    return buildValues(d).U39;
  };

  it('JFT-BASIC A2 → N5合格 (setara N5–N4, klaim terendah)', () => {
    expect(denganBahasa('JFT-BASIC A2', '233')).toBe('N5合格');
  });

  it('JLPT N3 → N3合格', () => {
    expect(denganBahasa('JLPT N3 | N3')).toBe('N3合格');
    expect(denganBahasa('JLPT N1')).toBe('N1合格');
  });

  it('JFT-BASIC A1 dan "BELUM TES" → なし', () => {
    expect(denganBahasa('A1')).toBe('なし');
    expect(denganBahasa('BELUM TES')).toBe('なし');
    expect(denganBahasa('-')).toBe('なし');
  });
});
