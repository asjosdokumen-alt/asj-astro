/**
 * TESTS: label → sel nilai, sadar-merge.
 *
 * KENAPA TES INI ADA
 * ------------------
 * Template nyata menulis labelnya di merge `A37:C37` dan AREA NILAINYA di merge
 * `D37:I37`. Dua akibatnya:
 *
 *  1. teks label ikut tersalin ke B37/C37, jadi "kanan satu kolom" menunjuk ke
 *     SALINAN LABEL — menulis ke situ berarti menimpa labelnya;
 *  2. area nilai boleh KOSONG di template. Sel kosong mustahil dipelajari lewat
 *     pencocokan NILAI, dan aturan lama mensyaratkan tetangganya BERISI.
 *
 * Akibatnya `帰国後の目標 / SETELAH PULANG`, `長所 / KELEBIHAN`,
 * `短所 / KEKURANGAN`, `趣味 / HOBI` TIDAK PERNAH terisi untuk kandidat mana pun
 * (dilaporkan pemilik 2026-10-10 dari CV AGUS KHOCI).
 *
 * BUG YANG DIKUNCI KHUSUS DI SINI
 * ------------------------------
 * Versi pertama perbaikan ini mengutamakan tetangga yang BERISI, dan hasilnya
 * SALAH: `趣味 / HOBI` (baris 40) dipetakan ke `A41` — sel label
 * `面鏡・資格 SERTIFIKAT YANG DIMILIKI`, yang kebetulan tidak dikenal pola mana
 * pun sehingga lolos sebagai "nilai". Baris 38 aman hanya karena baris 39
 * kebetulan punya pola. Karena itu label yang di-merge HORIZONTAL tidak boleh
 * melihat ke bawah sama sekali.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { Workbook as ExcelWorkbook } from 'exceljs';
import {
  analyzeExcelTemplate,
  analyzeFromExample,
  applyFieldMap,
  readWorkbook,
  workbookToXlsxBlob,
} from '../src/lib/cv-template-factory/loaders/tEMPLATE-loader';
import type { CandidateData } from '../src/lib/cv-template-factory/types';

const WIDE = 9;
const pad = (first: string): string[] => [first, ...Array<string>(WIDE - 1).fill('')];

async function sheetFrom(rows: string[][], merges: string[]): Promise<ExcelWorkbook> {
  const wb = new ExcelWorkbook();
  const ws = wb.addWorksheet('CV');
  ws.addRows(rows as never[]);
  for (const m of merges) ws.mergeCells(m);
  return wb;
}

function cand(over: Record<string, Record<string, unknown>>): CandidateData {
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
    ...over,
  } as unknown as CandidateData;
}

describe('label di-merge → nilai ada di KANAN, walau selnya kosong', () => {
  it('memetakan sel kiri-atas area nilai (A37:C37 → D37)', async () => {
    const wb = await sheetFrom([pad('帰国後の目標　\nSETELAH PULANG DARI JEPANG')], ['A1:C1', 'D1:I1']);
    const map = await analyzeExcelTemplate(wb);
    expect(map.D1).toBe('wawancara.rencana_pulang');
  });

  it('label satu sel tetap memakai tetangga yang berisi', async () => {
    const wb = await sheetFrom([['Golongan Darah', 'O']], []);
    const map = await analyzeExcelTemplate(wb);
    expect(map.B1).toBe('identitas.golongan_darah');
  });
});

describe('label tetangga TIDAK boleh ditimpa (bug 趣味/HOBI → A41)', () => {
  it('label di-merge tidak melihat ke baris bawah — walau baris itu tak dikenal polanya', async () => {
    const wb = await sheetFrom(
      [pad('長所　KELEBIHAN'), pad('面鏡・資格　SERTIFIKAT YANG DIMILIKI')],
      ['A1:C1', 'D1:I1', 'A2:I2'],
    );
    const map = await analyzeExcelTemplate(wb);
    expect(map.D1).toBe('wawancara.kelebihan');
    // Kalau ini gagal dengan `wawancara.kelebihan`, berarti label baris 2 sudah
    // ditimpa nilai kandidat.
    expect(map.A2).toBeUndefined();
  });
});

describe('sel nilai KOSONG tetap bisa dipelajari (inti perbaikan)', () => {
  const C = cand({ wawancara: { kelebihan: 'Disiplin waktu', kekurangan: 'Introvert', hobi: 'Voli' } });

  it('analyzeFromExample mengisi field yang selnya kosong di template', async () => {
    const wb = await sheetFrom(
      [pad('長所　KELEBIHAN'), pad('短所　KEKURANGAN'), pad('趣味　HOBI')],
      ['A1:C1', 'D1:I1', 'A2:C2', 'D2:I2', 'A3:C3', 'D3:I3'],
    );
    const { fieldMap, unmatched } = await analyzeFromExample(wb, C);
    expect(fieldMap.D1).toBe('wawancara.kelebihan');
    expect(fieldMap.D2).toBe('wawancara.kekurangan');
    expect(fieldMap.D3).toBe('wawancara.hobi');
    // Sudah tertampung ⇒ tidak lagi dilaporkan sebagai "belum tertampung".
    expect(unmatched).not.toContain('wawancara.kelebihan');
    expect(unmatched).not.toContain('wawancara.hobi');
  });

  it('nilai kandidat benar-benar tertulis ke sel itu', async () => {
    const wb = await sheetFrom([pad('趣味　HOBI')], ['A1:C1', 'D1:I1']);
    const { fieldMap } = await analyzeFromExample(wb, C);
    await applyFieldMap(wb, fieldMap, C);
    const out = await readWorkbook(new Uint8Array(await (await workbookToXlsxBlob(wb)).arrayBuffer()));
    expect(out.worksheets[0].getCell('D1').value).toBe('Voli');
  });

  it('bukti NILAI menang atas label untuk sel yang sama', async () => {
    // B1 nilainya cocok dengan nama kandidat; label 'Alamat' menunjuk ke B2.
    const wb = await sheetFrom([['Nama Lengkap', 'AGUS KHOCI'], ['Alamat', '']], []);
    const { fieldMap } = await analyzeFromExample(wb, cand({ identitas: { nama_lengkap: 'AGUS KHOCI' } }));
    expect(fieldMap.B1).toBe('identitas.nama_lengkap');
    expect(fieldMap.B2).toBe('identitas.alamat');
  });
});

describe('formulir dua kolom: nilai DI-MERGE, label sel tunggal', () => {
  /**
   * BUG YANG DIKUNCI
   * ----------------
   * Di template rirekisho, `TEMPAT LAHIR` (E11, sel tunggal) nilainya ada di
   * `D12:E12` (merge, DI BAWAH) — sedangkan sel di KANANNYA adalah label
   * `訪日経験 PERNAH KE JEPANG`. Aturan "kanan dulu" menulis tempat lahir
   * kandidat MENIMPA label itu: `F11` berubah dari "訪日経験" jadi "PONOROGO".
   * Sel nilai di formulir ini adalah yang DI-MERGE, jadi kandidat merge
   * diutamakan.
   */
  const ROWS = [
    ['', '', '', '出身地', 'TEMPAT LAHIR', '訪日経験', 'PERNAH KE JEPANG', 'TIDAK　（無）', 'TIDAK　（無）'],
    ['', '', '', 'LAMPUNG', 'LAMPUNG', '', '', '', ''],
  ];

  it('memilih sel nilai yang di-merge, bukan label di kanannya', async () => {
    const wb = await sheetFrom(ROWS, ['H1:I1', 'D2:E2']);
    const map = await analyzeExcelTemplate(wb);
    expect(map.D2).toBe('identitas.tempat_lahir');
    // Kalau ini gagal dengan `identitas.tempat_lahir`, label 訪日経験 sudah
    // ditimpa nilai kandidat.
    expect(map.F1).toBeUndefined();
  });

  it('menulis nilai kandidat ke sel merge itu, dan labelnya tetap utuh', async () => {
    const wb = await sheetFrom(ROWS, ['H1:I1', 'D2:E2']);
    const { fieldMap } = await analyzeFromExample(wb, cand({ identitas: { tempat_lahir: 'PONOROGO' } }));
    await applyFieldMap(wb, fieldMap, cand({ identitas: { tempat_lahir: 'PONOROGO' } }));
    const out = await readWorkbook(new Uint8Array(await (await workbookToXlsxBlob(wb)).arrayBuffer()));
    const ws = out.worksheets[0];
    expect(ws.getCell('D2').value).toBe('PONOROGO');
    expect(ws.getCell('F1').value).toBe('訪日経験');
  });
});

describe('template rirekisho nyata', () => {
  it('lima baris wawancara kini terpetakan', async () => {
    const wb = await readWorkbook(
      new Uint8Array(fs.readFileSync('deliverables/gstack/_rirekisho-excel-sample-2026-10-01.xlsx')),
    );
    const map = await analyzeExcelTemplate(wb);
    expect(map.D36).toBe('wawancara.tujuan_ke_jepang');
    expect(map.D37).toBe('wawancara.rencana_pulang');
    expect(map.D38).toBe('wawancara.kelebihan');
    expect(map.D39).toBe('wawancara.kekurangan');
    expect(map.D40).toBe('wawancara.hobi');
    // Pemetaan lama yang sudah benar tidak boleh hilang.
    expect(map.H4).toBe('identitas.gender');
    expect(map.H8).toBe('identitas.golongan_darah');
    expect(map.H5).toBe('identitas.umur');
    expect(map.H10).toBe('identitas.agama');
    // Baris JLPT (r42) — label di `A42:B42`, jawabannya di C42.
    expect(map.C42).toBe('sertifikasi.jft');
    // Dan tidak boleh ada yang nyasar ke sel label sertifikat (baris 41).
    expect(map.A41).toBeUndefined();
  });

  it('tempat lahir ke sel NILAI, bukan menimpa label 訪日経験 di F11', async () => {
    const wb = await readWorkbook(
      new Uint8Array(fs.readFileSync('deliverables/gstack/_rirekisho-excel-sample-2026-10-01.xlsx')),
    );
    const map = await analyzeExcelTemplate(wb);
    expect(map.D12).toBe('identitas.tempat_lahir');
    expect(map.F11).toBeUndefined();
  });
});
