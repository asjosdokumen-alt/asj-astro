/**
 * TESTS: `jipa` — form CV 特定技能 (JIPA) sebagai template keempat.
 *
 * KENAPA ANGKA GEOMETRINYA DIBEKUKAN
 * ----------------------------------
 * Berkas sumbernya (`F:/JIPA2026.xlsx`) adalah form yang SUDAH TERISI; yang
 * dipakai sebagai template adalah versi kosongnya. Yang harus terbukti: label,
 * merge, dan 16 dropdown-nya UTUH — kalau tidak, CV keluar sebagai tabel yang
 * mirip tapi bukan form klien.
 *
 * DUA HAL YANG MUDAH SALAH TANPA TES
 * ----------------------------------
 * 1. Alamat sel yang tidak ada membuat `setCell` diam-diam no-op.
 * 2. Nilai dropdown harus PERSIS sama dengan daftar di template (`父(AYAH)`,
 *    `同居(t.l bersama)`, …) — beda satu karakter dan selnya jadi tidak sah.
 */
import { describe, it, expect } from 'vitest';
import { JIPA_BASE64 } from '../src/lib/cv-template-factory/templates/jipa.b64';
import { buildJipaWorkbook, buildValues, PHOTO_RANGE } from '../src/lib/cv-template-factory/renderers/jipa';
import { cellRangeEmu, coverCrop, patchAnchor } from '../src/lib/cv-template-factory/renderers/xlsx-form';
import { normalizeMasterData } from '../src/lib/cv-template-factory/data';
import type { CandidateData } from '../src/lib/cv-template-factory/types';

const SHEET = 'xl/worksheets/sheet1.xml';
const DRAWING = 'xl/drawings/drawing1.xml';

/** Geometri aset, terukur 2026-10-26 setelah 179 sel nilai dikosongkan. */
const SOURCE = {
  colElements: 11,
  mergeCells: 115,
  cellElements: 1569,
  dataValidations: 16,
  dimension: 'A1:AA62',
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

function kandidat(): CandidateData {
  return {
    identitas: {
      nama_lengkap: 'RIYAN SAPUTRA',
      katakana: 'リヤンサプトラ',
      panggilan: 'RIYAN',
      panggilan_katakana: 'リヤン',
      tgl_lahir: '2002-09-09',
      umur: '24',
      tempat_lahir: 'MULYOSARI',
      agama: 'ISLAM',
      golongan_darah: 'O',
      status_nikah: 'BELUM MENIKAH',
      anak: 'TIDAK',
      alamat: 'Jl. Beringin 07 no. 70, RT. 006/RW.004, Kec. Kranji, Kota Bekasi',
      hp: '6285600846187',
      email: 'ryanputra090902@gmail.com',
      ktp: '1807190909020001',
      sim: '',
      status_eks_jepang: 'TIDAK',
      id_kandidat: 'ASJ00201',
    },
    fisik: { tb: '170', bb: '54' },
    medis: {
      mata_kiri: 'NORMAL',
      mata_kanan: 'NORMAL',
      buta_warna: 'TIDAK',
      tato: 'TIDAK',
      rokok: 'PERNAH',
      alkohol: 'TIDAK',
      alergi: 'TIDAK',
    },
    pendidikan: [
      { tingkat: 'SD', masuk: '2008-07', lulus: '2014-06', sekolah: 'MI MIFTAHUL ULUM MULYOSARI' },
      { tingkat: 'SMP', masuk: '2014-07', lulus: '2017-06', sekolah: 'MTS MAARIF 18 RU PASIR SAKTI' },
      { tingkat: 'SMK', masuk: '2018-07', lulus: '2021-06', sekolah: 'SMK BMW REJOMULYO', jurusan: 'マルチメディア学科' },
    ],
    pekerjaan: [
      { masuk: '2022-01', keluar: '2023-01', perusahaan: 'PT. SUMA ARTHA PERKASA' },
      { masuk: '2024-03', keluar: '2025-03', perusahaan: 'レストラン' },
    ],
    keluarga: [
      { hubungan: 'AYAH', tinggal: 'SERUMAH', nama: 'SAMSUL HUDA', usia: '53', pekerjaan: 'KARYAWAN' },
      { hubungan: 'IBU', tinggal: 'SERUMAH', nama: 'NUR HIDAYAH', usia: '49', pekerjaan: 'IBU RUMAH TANGGA' },
      { hubungan: 'KAKAK LAKI-LAKI', tinggal: 'MANDIRI', nama: 'DENI AFRIZAL', usia: '28', pekerjaan: 'WIRASWASTA' },
    ],
    sertifikasi: { ssw: '1号　飲食料品製造業　合格', jft: 'N3 合格' },
    wawancara: {},
    kenalan_jepang: { nama_id: '', nama_jp: '' },
    uploads: { photo: '' },
    raw: {},
  } as unknown as CandidateData;
}

describe('jipa · geometri template', () => {
  it('mempertahankan merge, lebar kolom, dan 16 dropdown berkas asli', async () => {
    const zip = await loadZip(b64ToBytes(JIPA_BASE64));
    const sheet = await part(zip, SHEET);

    expect(countAll(sheet, /<col\s/g)).toBe(SOURCE.colElements);
    expect(countAll(sheet, /<mergeCell\s/g)).toBe(SOURCE.mergeCells);
    expect(countAll(sheet, /<c\s[^>]*?r="[A-Z]+\d+"/g)).toBe(SOURCE.cellElements);
    expect(countAll(sheet, /<dataValidation\s/g)).toBe(SOURCE.dataValidations);
    expect(/<dimension ref="([^"]+)"/.exec(sheet)?.[1]).toBe(SOURCE.dimension);
  });

  it('pas foto di-anchor di B6 (rId1) — sel gabungan B6:E13', async () => {
    const zip = await loadZip(b64ToBytes(JIPA_BASE64));
    const drawing = await part(zip, DRAWING);

    const at = drawing.indexOf('r:embed="rId1"');
    expect(at).toBeGreaterThan(0);
    const block = drawing.slice(drawing.lastIndexOf('<oneCellAnchor', at), drawing.indexOf('</oneCellAnchor>', at));
    expect(block).toContain('<col>1</col>');
    expect(block).toContain('<row>5</row>');
    /* `ext` di ASET masih 9753600 x 14630400 EMU (1024x1536 px = 10,67 x 16
       inci) — itu ukuran GAMBAR warisan berkas sumber, bukan ukuran kotak.
       Renderer menimpanya dengan geometri sel; lihat tes di bawah. */
  });

  /**
   * Terukur 2026-10-26: `ext` aset 9753600x14630400 EMU = 10,67 x 16 inci,
   * sementara sel yang disediakan form hanya 192 x 208 px (2,00 x 2,17 in).
   * Foto lama karena itu menutupi hampir seluruh halaman dan tidak masuk
   * bingkai. Kotak yang benar = geometri `B6:E13`, bukan ukuran berkas gambar.
   */
  /**
   * TERUKUR 2026-10-26 — bug yang membuat foto "terlalu gede".
   *
   * Drawing template JIPA menyimpan elemen TANPA prefix `xdr:`
   * (`<oneCellAnchor><from><col>1</col>`), sedangkan `patchAnchor` dulu hanya
   * mencari `<xdr:ext …>` / `<xdr:oneCellAnchor`. Tidak ada satu pun yang
   * cocok, jadi fungsi itu mengembalikan XML apa adanya — anchor tidak pernah
   * ditambal dan foto tetap 1024x1536 px (10,67 x 16 inci), berapa pun
   * `photoBox` yang diminta. Tes ini menuntut tambalan BENAR-BENAR terjadi.
   */
  it('patchAnchor menambal drawing TANPA prefix xdr: (aset JIPA)', async () => {
    const zip = await loadZip(b64ToBytes(JIPA_BASE64));
    const drawing = await part(zip, DRAWING);
    const out = patchAnchor(
      drawing,
      { cx: 188 * 9525, cy: 204 * 9525, colOff: 2 * 9525, rowOff: 2 * 9525 },
      'rId1',
    );

    expect(out).not.toBe(drawing); // dulu no-op
    expect(out).toContain('<ext cx="1790700" cy="1943100"/>');
    expect(out).toContain('<colOff>19050</colOff>');
    expect(out).toContain('<rowOff>19050</rowOff>');
    expect(out).not.toContain('9753600');
    // Prefix yang tidak dideklarasikan akan merusak XML: jangan disisipkan.
    expect(out).not.toContain('xdr:');
  });

  it('bingkai pas foto = geometri sel B6:E13 (192x208 px), bukan ukuran gambar', async () => {
    const zip = await loadZip(b64ToBytes(JIPA_BASE64));
    const sheet = await part(zip, SHEET);

    expect(PHOTO_RANGE).toBe('B6:E13');
    expect(cellRangeEmu(sheet, PHOTO_RANGE)).toEqual({ cx: 192 * 9525, cy: 208 * 9525 });
    // Angka warisan aset TIDAK boleh jadi kotak render.
    expect(cellRangeEmu(sheet, PHOTO_RANGE)?.cx).not.toBe(9753600);
  });

  it('foto di-crop, bukan diregangkan, saat rasio foto != rasio bingkai', () => {
    // Foto 2:3 (1024x1536) ke bingkai 188x204: lebar dipakai penuh, tinggi
    // dipotong di tengah. Sumber crop HARUS sebanding dengan kotak — itulah
    // yang membuat `drawImage` tidak meregangkan gambar.
    const crop = coverCrop(1024, 1536, 188, 204);
    expect(crop.sx).toBe(0);
    expect(crop.sw).toBe(1024);
    expect(crop.sh).toBeCloseTo((204 / 188) * 1024, 5);
    expect(crop.sy).toBeCloseTo((1536 - crop.sh) / 2, 5);
    expect(crop.sw / crop.sh).toBeCloseTo(188 / 204, 5);
    // Kalau diregangkan, tinggi yang dipakai akan 1536 (seluruh foto).
    expect(crop.sh).toBeLessThan(1536);

    // Foto yang lebih lebar dari bingkai dipotong di KIRI-KANAN, bukan dipaksa muat.
    const wide = coverCrop(1600, 1200, 188, 204);
    expect(wide.sy).toBe(0);
    expect(wide.sh).toBe(1200);
    expect(wide.sw).toBeLessThan(1600);
    expect(wide.sx).toBeCloseTo((1600 - wide.sw) / 2, 5);
    expect(wide.sw / wide.sh).toBeCloseTo(188 / 204, 5);
  });

  it('nilai contoh (RIYAN SAPUTRA) tidak ikut jadi template', async () => {
    const zip = await loadZip(b64ToBytes(JIPA_BASE64));
    const sheet = await part(zip, SHEET);
    expect(sheet).not.toContain('RIYAN');
    expect(sheet).not.toContain('MULYOSARI');
  });

  it('tidak membawa hyperlink/email pribadi kandidat contoh', async () => {
    // Berkas sumber menempelkan `mailto:` pada E59; atribut `display`-nya memuat
    // alamat email pribadi kandidat, dan sel kosong pun tetap membawa tautannya.
    const zip = await loadZip(b64ToBytes(JIPA_BASE64));
    const sheet = await part(zip, SHEET);
    expect(sheet).not.toContain('<hyperlink');
    expect(sheet.toLowerCase()).not.toContain('mailto');
  });
});

describe('jipa · peta sel', () => {
  it('setiap alamat di buildValues benar-benar ada di sheet', async () => {
    const zip = await loadZip(b64ToBytes(JIPA_BASE64));
    const sheet = await part(zip, SHEET);
    const cells = buildValues(kandidat());
    const missing = Object.keys(cells).filter((addr) => !new RegExp(`<c r="${addr}"`).test(sheet));
    expect(missing).toEqual([]);
  });

  it('identitas memakai kosakata dropdown form', () => {
    const c = buildValues(kandidat());
    expect(c.F7).toBe('RIYAN SAPUTRA');
    expect(c.F8).toBe('リヤンサプトラ');
    expect(c.F11).toBe('2002年09月09日');
    expect(c.J11).toBe('24');
    expect(c.L6).toBe('170cm');
    expect(c.L8).toBe('O 型');
    expect(c.L9).toBe('独身(Single)');
    expect(c.L11).toBe('イスラム教');
    expect(c.L16).toBe('正常（NORMAL)');
    expect(c.B16).toBe('する(MEROKOK)');
    expect(c.F16).toBe('無い(TIDAK)');
    expect(c.J16).toBe('飲まない(TIDAK MINUM)');
    expect(c.E58).toBe('085600846187');
  });

  it('pendidikan 5 baris: tahun/bulan terpisah + nama sekolah berakhiran tingkat', () => {
    const c = buildValues(kandidat());
    expect(c.B19).toBe('2008年');
    expect(c.C19).toBe('07月');
    expect(c.E19).toBe('2014年');
    expect(c.F19).toBe('06月');
    expect(c.G19).toBe('私立 MI MIFTAHUL ULUM MULYOSARI 小学校');
    expect(c.G21).toBe('私立 SMK BMW REJOMULYO 専門学校');
    expect(c.K21).toBe('マルチメディア学科');
  });

  it('pekerjaan & keluarga terisi sesuai bloknya', () => {
    const c = buildValues(kandidat());
    expect(c.B27).toBe('2022');
    expect(c.C27).toBe('1');
    expect(c.E27).toBe('2023');
    expect(c.G27).toBe('PT. SUMA ARTHA PERKASA');
    expect(c.B33).toBe('父(AYAH)');
    expect(c.E33).toBe('同居(t.l bersama)');
    expect(c.J33).toBe('53歳');
    expect(c.E35).toBe('独立(t.mandiri)');
    expect(c.K34).toBe('主婦');
    expect(c.K33).toBe('製造業(manufaktur)');
  });

  it('資格試験: SSW lalu JLPT, berurutan dari baris 47', () => {
    const c = buildValues(kandidat());
    expect(c.F47).toBe('特定技能(SSW)');
    expect(c.I47).toBe('1号　飲食料品製造業　合格');
    expect(c.F48).toBe('日本語能力(JLPT)');
    expect(c.I48).toBe('N3 合格');
    expect(c.F49).toBe('');
  });

  it('訪日経験 mengikuti `status_eks_jepang`', () => {
    expect(buildValues(kandidat()).B54).toBe('無し(TIDAK)');
    const d = kandidat();
    d.identitas = { ...d.identitas, status_eks_jepang: 'ADA' };
    expect(buildValues(d).B54).toBe('あり(ADA)');
  });
});

describe('jipa · dari baris BERSARANG getDrafCvMaster', () => {
  it('terisi dari bentuk yang benar-benar dikirim server', () => {
    const row = {
      identitas: {
        nama_lengkap: 'RIYAN SAPUTRA', katakana: 'リヤンサプトラ', panggilan: 'RIYAN',
        panggilan_katakana: 'リヤン', tgl_lahir: '2002-09-09', umur: '24',
        tempat_lahir: 'MULYOSARI', agama: 'ISLAM', golongan_darah: 'O',
        status_nikah: 'BELUM MENIKAH', anak: 'TIDAK', hp: '6285600846187',
        email: 'ryanputra090902@gmail.com', ktp: '1807190909020001',
        status_eks_jepang: 'TIDAK', sim: '', alamat: 'Jl. Beringin 07',
      },
      fisik: { tb: '170', bb: '54' },
      medis: { mata_kiri: 'NORMAL', mata_kanan: 'NORMAL', buta_warna: 'TIDAK', tato: 'TIDAK', rokok: 'PERNAH', alkohol: 'TIDAK', alergi: 'TIDAK' },
      wawancara: {},
      // Bentuk `buildMasterNested`: `ssw` masuk ke `lisensi`, `jft` ke
      // `bahasa_jepang`/`nilai` — bukan `ssw`/`jft` apa adanya.
      sertifikasi: {
        bahasa: '', jft: 'N3 合格', ssw: '1号　飲食料品製造業　合格', bidang: '',
        bahasa_jepang: 'N3 合格', nilai: 'N3 合格', lisensi: '1号　飲食料品製造業　合格',
      },
      pendidikan: [{ tingkat: 'SMK', masuk: '2018-07', lulus: '2021-06', sekolah: 'SMK BMW REJOMULYO', jurusan: 'マルチメディア学科' }],
      pekerjaan: [{ masuk: '2022-01', keluar: '2023-01', perusahaan: 'PT. SUMA ARTHA PERKASA' }],
      keluarga: [{ hubungan: 'AYAH', tinggal: 'SERUMAH', nama: 'SAMSUL HUDA', usia: '53', pekerjaan: 'KARYAWAN' }],
      AIDATAJSON: '',
      id_kandidat: 'ASJ00201',
    };

    const c = buildValues(normalizeMasterData(row));
    expect(c.F7).toBe('RIYAN SAPUTRA');
    expect(c.G19).toBe('私立 SMK BMW REJOMULYO 専門学校');
    expect(c.G33).toBe('SAMSUL HUDA');
    expect(c.F47).toBe('特定技能(SSW)');
    expect(c.H5).toBe('ASJ00201');
  });
});

describe('jipa · render', () => {
  it('menghasilkan .xlsx berisi nilai kandidat dan tab bernama kandidat', async () => {
    const blob = await buildJipaWorkbook(kandidat());
    expect(blob.size).toBeGreaterThan(10_000);

    const zip = await loadZip(new Uint8Array(await blob.arrayBuffer()));
    const sheet = await part(zip, SHEET);
    const wb = await part(zip, 'xl/workbook.xml');

    expect(sheet).toContain('RIYAN SAPUTRA');
    expect(wb).toContain('name="RIYAN SAPUTRA"');
    expect(countAll(sheet, /<mergeCell\s/g)).toBe(SOURCE.mergeCells);
  });
});

/**
 * Kolom migrasi 022 → sel JIPA (2026-10-27).
 *
 * Sebelumnya `J5`, `E54`, `E55`, `L27..L30`, `E33..E40`, `J43` tidak punya
 * sumber, dan sertifikat di luar SSW/JLPT/SIM tidak punya tempat sama sekali.
 */
describe('jipa · kolom migrasi 022 benar-benar masuk ke sel', () => {
  const denganKolom = (): CandidateData => {
    const d = kandidat();
    d.identitas = { ...d.identitas, visa_jepang: '技能実習1号' };
    d.sertifikasi = { ...d.sertifikasi, bidang: 'FOOD & BEVERAGE', sertifikat_lain: '調理師 (2023)' };
    d.wawancara = { lama_di_jepang: '3 tahun' };
    d.pekerjaan = [{ ...(d.pekerjaan[0] as Record<string, unknown>), bidang: '飲食料品製造' }];
    d.keluarga = [{ ...(d.keluarga[0] as Record<string, unknown>), tinggal: 'MANDIRI' }];
    d.kenalan_jepang = { ...d.kenalan_jepang, nama_jp: 'タナカ', status_tinggal: '技能実習2号 (2024-2027)' };
    return d;
  };

  it('希望職種 / ビザ種類 / 在日期間', () => {
    const c = buildValues(denganKolom());
    expect(c.J5).toBe('FOOD & BEVERAGE');
    expect(c.E54).toBe('技能実習1号');
    expect(c.E55).toBe('3 tahun');
  });

  it('業種 per baris kerja dan 同居区分 per anggota keluarga', () => {
    const c = buildValues(denganKolom());
    expect(c.L27).toBe('飲食料品製造');
    expect(c.E33).toBe('独立(t.mandiri)');
  });

  it('在留資格 kenalan dan その他資格', () => {
    const c = buildValues(denganKolom());
    expect(c.J43).toBe('技能実習2号 (2024-2027)');
    // Fixture sudah punya SSW + JLPT ⇒ その他 jatuh di baris ke-3 (49).
    expect(c.F49).toBe('その他(資格)');
    expect(c.I49).toBe('調理師 (2023)');
  });
});
