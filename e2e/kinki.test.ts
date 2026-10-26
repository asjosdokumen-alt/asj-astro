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

/** Geometri aset, terukur 2026-10-26 setelah 15 sheet kandidat lain dibuang. */
const SOURCE = {
  colElements: 3,
  mergeCells: 252,
  cellElements: 9112,
  dataValidations: 27,
  dimension: 'A1:BV126',
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

  it('pas foto ada di kotak & posisi berkas pemilik (rId2, kolom W baris 6)', async () => {
    const zip = await loadZip(b64ToBytes(KINKI_BASE64));
    const drawing = await part(zip, DRAWING);

    const at = drawing.indexOf('r:embed="rId2"');
    expect(at).toBeGreaterThan(0);
    const block = drawing.slice(drawing.lastIndexOf('<oneCellAnchor', at), drawing.indexOf('</oneCellAnchor>', at));
    expect(block).toContain('<col>22</col>');
    expect(block).toContain('<row>5</row>');
    expect(block).toContain('<colOff>76200</colOff>');
    expect(block).toContain('<rowOff>38100</rowOff>');
    expect(block).toMatch(/<ext cx="1590675" cy="2143125"\s*\/>/);
    // Gambar peta Indonesia di O10 harus tetap ada; ia bukan pas foto.
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

  it('tanggal lahir ditulis sebagai ANGKA, bukan teks (S8 = DATEDIF)', () => {
    const nums = buildNumbers(kandidat());
    // 2005-11-02 = 38658 hari sejak 1899-12-30.
    expect(nums.E8).toBe(38658);
    expect(buildNumbers(kandidat()).E8).toBeTypeOf('number');
  });

  it('identitas & kebiasaan memakai kosakata dropdown form', () => {
    const c = buildValues(kandidat());
    expect(c.E6).toBe('BUDI TRISNANTO');
    expect(c.E7).toBe('ブディ・トリスナント');
    expect(c.S7).toBe('男');
    expect(c.L13).toBe('O'); // `O-` → O, dropdown hanya A/B/O/AB/不明
    expect(c.E13).toBe('無飲');
    expect(c.E14).toBe('非喫煙');
    expect(c.L14).toBe('右');
    expect(c.E11).toBe('未婚');
    expect(c.L15).toBe('1.0');
    expect(c.M3).toBe('なし'); // tanpa SIM, 自動車運転 tidak boleh tercentang
    expect(c.E34).toBe('□');
    expect(c.E16).toBe('ジョギング');
    expect(c.E9).toBe('08999170623');
    expect(c.E10).toBe('インドネシア東ジャワ州ポノロゴ県');
  });

  it('できる作業 hanya mencentang keahlian yang benar-benar ditulis', () => {
    const c = buildValues(kandidat());
    expect(c.P35).toBe('■'); // 大工
    expect(c.W34).toBe('■'); // その他
    expect(c.X35).toBe('整備士、大工');
    expect(c.J34).toBe('□'); // 左官 tidak disebut
  });

  it('pekerjaan & keluarga terisi sesuai blok form (2 baris per pekerjaan)', () => {
    const c = buildValues(kandidat());
    expect(c.A26).toBe('正社員');
    expect(c.D26).toBe('2024年6月');
    expect(c.E27).toBe('2025年6月');
    expect(c.H26).toBe('1年');
    expect(c.Q26).toBe('MEKANIK');
    expect(c.W26).toBe('1.8');
    expect(c.A37).toBe('父');
    expect(c.J37).toBe('1.5');
    expect(c.X37).toBe('父');
    expect(c.Z37).toBe('081234567890');
    expect(c.M37).toBe('■');
  });

  it('tanpa pekerjaan, placeholder `年月日` bawaan template TIDAK tercetak', () => {
    const data = kandidat();
    data.pekerjaan = [];
    const c = buildValues(data);
    expect(c.D26).toBe('');
    expect(c.E27).toBe('');
    expect(c.D27).toBe('');
  });
});

describe('kinki · MBTI masuk ke dropdown yang sah', () => {
  it('Q47 PERSIS salah satu nilai AF111:AF126, dan U48..U52 ada di daftarnya', async () => {
    const zip = await loadZip(b64ToBytes(KINKI_BASE64));
    const sheet = await part(zip, SHEET);
    const shared = await sharedStrings(zip);
    const types = Array.from({ length: 16 }, (_, i) => cellText(sheet, `AF${111 + i}`, shared));

    const c = buildValues(kandidat());
    expect(types).toContain(c.Q47);
    expect(types.filter(Boolean)).toHaveLength(16);

    const axisLists = {
      U48: ['AL111', 'AL112'],
      U49: ['AP111', 'AP112'],
      U50: ['AT111', 'AT112'],
      U51: ['AX111', 'AX112'],
      U52: ['BB111', 'BB112'],
    };
    for (const [addr, refs] of Object.entries(axisLists)) {
      const allowed = refs.map((r) => cellText(sheet, r, shared));
      expect(allowed).toContain(c[addr]);
    }
  });

  it('16 nama tipe di kode = 16 nilai di tabel template', () => {
    expect(Object.keys(TYPE_NAMES)).toHaveLength(16);
  });

  it('tanpa teks wawancara: Q47 TETAP terisi dari bawaan, rumusnya tidak disentuh', () => {
    const data = kandidat();
    data.wawancara = {};

    const c = buildValues(data);
    // Sel kosong terbaca sebagai formulir belum selesai oleh klien Jepang.
    expect(c.Q47).toBe('管理者型（ISTJ）');
    expect(c.U48).toBe('【I】内向型');
    // `A50 (=Q47)` dan `E50 (INDEX/MATCH)` harus DIBIARKAN: karena Q47 ada,
    // keduanya menghasilkan nilai — bukan 0 dan bukan #N/A.
    expect(c.A50).toBeUndefined();
    expect(c.E50).toBeUndefined();
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
    expect(c.U3).toBe('私は規律正しく、勤勉で、諦めない性格です。');
    expect(c.Q47).toBe('管理者型（ISTJ）');
    expect(c.U48).toBe('【I】内向型');
    expect(c.W34).toBe('■'); // できる作業 dari keahlian_khusus_jp
    expect(c.O19).toBe('SMKN 1 SLAHUNG');
  });
});

describe('kinki · angka, tanggal, dan kana yang dulu salah', () => {
  it('periode di bawah setahun ditulis dalam BULAN, bukan dibulatkan jadi 1年', () => {
    const d = kandidat();
    d.pekerjaan = [{ jenis: 'MAGANG', masuk: '2023-08', keluar: '2023-12', perusahaan: 'PT A', jabatan: 'MAGANG' }];
    // Dulu 4 bulan tercetak "1年" — riwayat kerja terbaca jauh lebih panjang.
    expect(buildValues(d).H26).toBe('4ヶ月');
  });

  it('tanggal tanpa bulan tidak dikarang menjadi Januari', () => {
    const d = kandidat();
    d.pendidikan = [{ tingkat: 'SMK', masuk: '2019', lulus: '2022', sekolah: 'SMKN 1 SLAHUNG', jurusan: 'TSM' }];
    const c = buildValues(d);
    expect(c.D19).toBe('2019年'); // dulu "2019年1月"
    expect(c.H19).toBe('3年');
  });

  it('専攻 kosong memakai `-`, supaya strip atas tidak mencetak 0', () => {
    const d = kandidat();
    d.pendidikan = [{ tingkat: 'SMK', masuk: '2021-07', lulus: '2024-06', sekolah: 'SMKN 1 SLAHUNG' }];
    // `Q3` di strip atas = `=W19`; sel kosong membuatnya mencetak 0.
    expect(buildValues(d).W19).toBe('-');
  });

  it('tanpa baris 日本語学校, tanda `～` tidak menggantung sendirian', () => {
    expect(buildValues(kandidat()).D22).toBe('');
  });

  it('カナ: kanji yang bentuknya katakana + bullet dirapikan', () => {
    const d = kandidat();
    d.identitas = { ...d.identitas, katakana: '厶ハッマド•二ザル•ヌル' };
    expect(buildValues(d).E7).toBe('ムハッマド・ニザル・ヌル');
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
    expect(c.J19).toBe('Jawa Timur');
    expect(c.I4).toBe('第25課中');
    expect(c.M4).toBe('8月取得予定');
    expect(c.O9).toBe('ジャカルタから780㎞\n飛行機で1 jam 40 menit');
  });

  it('pekerjaan: 雇用形態 / 業種 / 備考', () => {
    const c = buildValues(denganKolom());
    expect(c.A26).toBe('正社員');
    expect(c.M26).toBe('Manufaktur');
    expect(c.Z26).toBe('Lembur penuh');
  });

  it('keluarga: 同居区分 mengikuti kolom, bukan `■` tetap', () => {
    const c = buildValues(denganKolom());
    expect(c.M37).toBe('□');
    expect(c.O37).toBe('■');
    expect(c.J37).toBe('250'); // 月収 2.500.000 円 → 250 (万円). SATUANNYA YEN, bukan rupiah.
  });

  it('bahasa, tes, dan angka yang dulu selalu kosong', () => {
    const c = buildValues(denganKolom());
    expect(c.I3).toBe('N4レベル'); // kolom menang atas tebakan dari teks JFT
    expect(c.T37).toBe('6 bulan');
    expect(c.T39).toBe('sedang belajar');
    expect(c.Q41).toBe('menengah');
    expect(c.T41).toBe('Mandarin dasar');
    expect(c.Q45).toBe('85');
    expect(c.X41).toBe('2');
    expect(c.X45).toBe('3000000');
    expect(c.X47).toBe('5 tahun');
    expect(c.AB51).toBe('30');
    expect(c.AB52).toBe('40');
  });

  it('MBTI dari kolom menang atas tebakan', () => {
    const c = buildValues(denganKolom());
    expect(c.Q47).toBe('広報運動家型（ENFP）');
    expect(c.U48).toBe('【E】外向型');
    expect(c.U52).toBe('【A】自信型');
  });
});
