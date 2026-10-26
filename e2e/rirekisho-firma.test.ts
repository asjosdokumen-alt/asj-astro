/**
 * TESTS: `rirekisho-firma` — form CV "FIRMA ELGA PRATAMA" sebagai template.
 *
 * KENAPA ANGKA-ANGKANYA DIBEKUKAN
 * -------------------------------
 * Permintaan pemilik: "pake template ini" — artinya CV yang keluar harus form
 * yang SAMA dengan berkas yang ia kirim (94 merge, 996 baris, 26 kolom), bukan
 * tabel baru yang mirip. Sifat itu hanya bisa dijaga kalau diukur, jadi
 * geometri template di bawah ini diambil dari berkas aslinya dan di-assert.
 *
 * DUA HAL YANG MUDAH SALAH TANPA TES
 * ----------------------------------
 * 1. Alamat sel yang tidak ada di template membuat `setCell` diam-diam jadi
 *    no-op: CV terunduh tanpa nama, tanpa satu pun error. Setiap alamat di
 *    `buildValues` harus benar-benar mengubah XML.
 * 2. Drawing form ini punya TIGA gambar (dua ikon kecil + pas foto). Menambal
 *    anchor tanpa `relId` akan mengubah ukuran ikon pertama dan meninggalkan
 *    foto apa adanya.
 */
import { describe, it, expect } from 'vitest';
import { RIREKISHO_FIRMA_BASE64 } from '../src/lib/cv-template-factory/templates/rirekisho-firma.b64';
import { buildFirmaWorkbook, buildValues } from '../src/lib/cv-template-factory/renderers/rirekisho-firma';
import { patchAnchor, setCell } from '../src/lib/cv-template-factory/renderers/xlsx-form';
import type { CandidateData } from '../src/lib/cv-template-factory/types';

const SHEET = 'xl/worksheets/sheet1.xml';
const DRAWING = 'xl/drawings/drawing1.xml';
const PHOTO = 'xl/media/image3.png';

/** Geometri berkas asli, terukur 2026-10-26. */
const SOURCE = {
  colElements: 14,
  rowElements: 996,
  mergeCells: 94,
  cellElements: 25887,
  photoCx: 1466850,
  photoCy: 1943100,
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

/** Kandidat uji — bentuknya sama dengan yang dikirim `normalizeMasterData`. */
function kandidat(): CandidateData {
  return {
    identitas: {
      nama_lengkap: 'BUDI TRISNANTO',
      katakana: 'ブディ・トリスナント',
      alamat: 'DUSUN KRAJAN, RT 002 RW 003, PONOROGO',
      tgl_lahir: '2005-11-02',
      umur: '21',
      gender: 'LAKI-LAKI',
      agama: 'ISLAM',
      golongan_darah: 'O',
      status_nikah: 'BELUM MENIKAH',
      anak: 'TIDAK',
      hp: '628999170623',
      paspor: 'TIDAK',
    },
    fisik: { tb: '170', bb: '60', tangan_dominan: 'KANAN' },
    medis: { riwayat_medis: 'TIDAK', kacamata: 'TIDAK' },
    pendidikan: [
      { tingkat: 'SMP', masuk: '2018-07', lulus: '2021-06', sekolah: 'SMP NEGERI 1 BUNGKAL', jurusan: '' },
      { tingkat: 'SMK', masuk: '2021-07', lulus: '2024-06', sekolah: 'SMK NEGERI 1 SLAHUNG', jurusan: 'TEKNIK OTOMOTIF' },
    ],
    pekerjaan: [
      { masuk: '2024-06', keluar: '2025-06', perusahaan: 'RESTORAN SAKURA', jabatan: 'KITCHEN HELPER', gaji: '1500000' },
    ],
    keluarga: [
      { hubungan: 'AYAH', nama: 'HARIADI', usia: '55', pekerjaan: 'PETANI', tinggal: 'SERUMAH', hp: '0812' },
      { hubungan: 'IBU', nama: 'SURYATIN', usia: '48', pekerjaan: 'IBU RUMAH TANGGA', tinggal: 'SERUMAH' },
    ],
    sertifikasi: { jft: 'A2', sim: 'TIDAK' },
    wawancara: {},
    kenalan_jepang: { nama_id: '', nama_jp: '' },
    uploads: { photo: '' },
    raw: {},
  } as unknown as CandidateData;
}

describe('rirekisho-firma · geometri template', () => {
  it('mempertahankan lebar kolom, tinggi baris, dan merge berkas asli', async () => {
    const zip = await loadZip(b64ToBytes(RIREKISHO_FIRMA_BASE64));
    const sheet = await part(zip, SHEET);

    expect(countAll(sheet, /<col\s/g)).toBe(SOURCE.colElements);
    expect(countAll(sheet, /<row\s/g)).toBe(SOURCE.rowElements);
    expect(countAll(sheet, /<mergeCell\s/g)).toBe(SOURCE.mergeCells);
    expect(countAll(sheet, /<c\s[^>]*?r="[A-Z]+\d+"/g)).toBe(SOURCE.cellElements);
  });

  it('pas foto tetap di anchor aslinya (col13/row1) dengan ukuran asli', async () => {
    const zip = await loadZip(b64ToBytes(RIREKISHO_FIRMA_BASE64));
    const drawing = await part(zip, DRAWING);

    expect(drawing).toContain(`<xdr:ext cx="${SOURCE.photoCx}" cy="${SOURCE.photoCy}"/>`);
    expect(drawing).toContain('<xdr:from><xdr:col>13</xdr:col>');
    expect(drawing).toContain('<xdr:row>1</xdr:row>');
  });

  it('tidak membawa satu pun data orang di berkas contoh', async () => {
    const zip = await loadZip(b64ToBytes(RIREKISHO_FIRMA_BASE64));
    const sheet = await part(zip, SHEET);
    // Nama, nomor HP, dan nama orang tua dari CV contoh yang dikirim pemilik.
    for (const sisa of ['FIRMA ELGA', '085136175793', 'Hariadi', 'Suryatin', 'DUKUH KARANG']) {
      expect(sheet, `data contoh "${sisa}" masih ada di template`).not.toContain(sisa);
    }
  });

  it('foto contoh 1,8 MB sudah tidak ikut (part tinggal placeholder)', async () => {
    const zip = await loadZip(b64ToBytes(RIREKISHO_FIRMA_BASE64));
    const file = zip.file(PHOTO);
    if (!file) throw new Error(`template is missing ${PHOTO}`);
    expect((await file.async('uint8array')).length).toBeLessThan(200);
  });

  it('setiap alamat di buildValues benar-benar ditulis (bukan no-op)', async () => {
    const zip = await loadZip(b64ToBytes(RIREKISHO_FIRMA_BASE64));
    const sheet = await part(zip, SHEET);
    const tidakTertulis = Object.keys(buildValues(kandidat())).filter(
      (addr) => setCell(sheet, addr, 'X') === sheet,
    );
    expect(tidakTertulis).toEqual([]);
  });

  it('tidak ada alamat sel ganda di template', async () => {
    const zip = await loadZip(b64ToBytes(RIREKISHO_FIRMA_BASE64));
    const sheet = await part(zip, SHEET);
    const addrs = sheet.match(/<c\s[^>]*?r="([A-Z]+\d+)"/g) ?? [];
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const a of addrs) {
      const id = /r="([A-Z]+\d+)"/.exec(a)?.[1] ?? '';
      if (seen.has(id)) dupes.push(id);
      seen.add(id);
    }
    expect(dupes).toEqual([]);
  });
});

describe('rirekisho-firma · patchAnchor dengan relId', () => {
  it('hanya menambal anchor foto, ikon kecil dibiarkan', () => {
    const xml =
      '<xdr:oneCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>5</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>' +
      '<xdr:ext cx="85725" cy="76200"/><xdr:pic><a:blip r:embed="rId1"/></xdr:pic></xdr:oneCellAnchor>' +
      '<xdr:oneCellAnchor><xdr:from><xdr:col>13</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>' +
      '<xdr:ext cx="1466850" cy="1943100"/><xdr:pic><a:blip r:embed="rId3"/></xdr:pic></xdr:oneCellAnchor>';

    const out = patchAnchor(xml, { cx: 900000, cy: 1200000, colOff: 5, rowOff: 6 }, 'rId3');

    // Ikon (rId1) tidak tersentuh.
    expect(out).toContain('<xdr:ext cx="85725" cy="76200"/>');
    // Foto (rId3) memakai ukuran baru dan offset baru.
    expect(out).toContain('<xdr:ext cx="900000" cy="1200000"/>');
    expect(out).toContain('<xdr:colOff>5</xdr:colOff>');
    expect(out).toContain('<xdr:rowOff>6</xdr:rowOff>');
  });
});

describe('rirekisho-firma · render', () => {
  it('mengisi nilai kandidat ke sel form, bukan ke sel lain', async () => {
    const blob = await buildFirmaWorkbook(kandidat());
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // JSZip di Node tidak bisa membaca `Blob` langsung — konversi dulu.
    const zip = await loadZip(new Uint8Array(await blob.arrayBuffer()));
    const sheet = await part(zip, SHEET);
    expect(sheet).toContain('BUDI TRISNANTO');
    expect(sheet).toContain('2005年11月2日');
    expect(sheet).toContain('O型');
    expect(sheet).toContain('未婚 Single');
    expect(sheet).toContain('職業高校 SMK');
    expect(sheet).toContain('2021年');
    // 職歴 blok dua baris: masuk di baris 16, keluar di baris 17.
    expect(sheet).toMatch(/<c r="F16"[^>]*>(?:(?!<\/c>).)*RESTORAN SAKURA/s);
    expect(sheet).toMatch(/<c r="D17"[^>]*>(?:(?!<\/c>).)*2025年/s);
    // Keluarga: 続柄 Jepang, bukan teks mentah database.
    expect(sheet).toContain('父 Ayah');
    expect(sheet).toContain('母 Ibu');
  });
});
