/**
 * TESTS: analyzeFromExample — belajar peta sel->field dari template yang SUDAH
 * terisi data satu kandidat (keputusan pemilik 2026-10-09, opsi C).
 *
 * KENAPA DI `e2e/`
 * ---------------
 * Sama seperti `e2e/biodata-export.test.ts` dan `e2e/riwayat-key.test.ts`:
 * `indexer` menghitung SELURUH berkas di bawah `src/**`, jadi `.test.ts` baru di
 * sana memindahkan counter beku. `.ts` di `e2e/` tidak dihitung.
 *
 * ALUR YANG DIKUNCI
 * -----------------
 * admin isi template dengan data kandidat A -> upload -> peta sel->field ->
 * template yang SAMA dipakai untuk kandidat B. Tes terakhir membuktikan bagian
 * "tinggal copy doank": sel yang sama berisi nilai kandidat B.
 */
import { describe, it, expect } from 'vitest';
import { Workbook as ExcelWorkbook } from 'exceljs';
import type { CandidateData } from '../src/lib/cv-template-factory/types';
import {
  analyzeFromExample,
  applyFieldMap,
  workbookToXlsxBlob,
  readWorkbook,
} from '../src/lib/cv-template-factory/loaders/tEMPLATE-loader';

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

const A = cand({
  identitas: {
    nama_lengkap: 'AGUS KHOCI',
    tgl_lahir: '1989-10-05',
    alamat: 'NGUJUNGLOR RT3 RW3 GANDUKEPUH',
    // Sengaja kembar dengan `sertifikasi.bahasa` di bawah: nilai yang cocok
    // dengan >1 field tidak boleh ditebak.
    agama: 'ISLAM',
  },
  fisik: { tb: '165', bb: '57' },
  sertifikasi: { bahasa: 'ISLAM' },
});

const B = cand({
  identitas: { nama_lengkap: 'ARIA UJI', tgl_lahir: '2001-05-05', alamat: 'JL MELATI 1' },
  fisik: { tb: '170', bb: '60' },
});

async function sheetFrom(rows: unknown[][]): Promise<ExcelWorkbook> {
  const wb = new ExcelWorkbook();
  const ws = wb.addWorksheet('CV');
  ws.addRows(rows as never[]);
  return wb;
}

async function readBack(blob: Blob): Promise<ExcelWorkbook> {
  return readWorkbook(new Uint8Array(await blob.arrayBuffer()));
}

describe('analyzeFromExample — peta sel->field dari template terisi', () => {
  it('mencocokkan nilai sel ke field kandidat contoh', async () => {
    // "Template" yang sudah diisi admin dengan data kandidat A.
    const wb = await sheetFrom([
      ['Nama Lengkap', 'AGUS KHOCI'],
      ['Tgl Lahir', '1989-10-05'],
      ['Alamat', 'NGUJUNGLOR RT3 RW3 GANDUKEPUH'],
    ]);
    const { fieldMap } = await analyzeFromExample(wb, A);
    expect(fieldMap.B1).toBe('identitas.nama_lengkap');
    expect(fieldMap.B2).toBe('identitas.tgl_lahir');
    expect(fieldMap.B3).toBe('identitas.alamat');
  });

  it('nilai yang cocok dengan >1 field TIDAK ditebak — masuk `ambiguous`', async () => {
    const wb = await sheetFrom([['Agama', 'ISLAM']]);
    const { fieldMap, ambiguous } = await analyzeFromExample(wb, A);
    expect(fieldMap.B1).toBeUndefined();
    expect(ambiguous.B1?.sort()).toEqual(['identitas.agama', 'sertifikasi.bahasa']);
  });

  it('nilai terlalu pendek/umum tidak dijadikan bukti', async () => {
    // 'O' (golongan darah) dan '57' terlalu lemah untuk mencocokkan sel apa pun.
    const wb = await sheetFrom([['X', 'O'], ['Y', '57']]);
    const { fieldMap, ambiguous } = await analyzeFromExample(wb, A);
    expect(Object.keys(fieldMap)).toHaveLength(0);
    expect(Object.keys(ambiguous)).toHaveLength(0);
  });

  it('`{{path}}` selalu menang atas pencocokan nilai', async () => {
    const wb = await sheetFrom([['TB', '{{fisik.tb}}']]);
    const { fieldMap } = await analyzeFromExample(wb, A);
    expect(fieldMap.B1).toBe('fisik.tb');
  });

  it('melaporkan field yang belum tertampung di template', async () => {
    const wb = await sheetFrom([['Nama Lengkap', 'AGUS KHOCI']]);
    const { unmatched } = await analyzeFromExample(wb, A);
    expect(unmatched).toContain('fisik.tb');
    expect(unmatched).not.toContain('identitas.nama_lengkap');
  });
});

describe('analyzeFromExample + applyFieldMap — "tinggal copy" untuk kandidat lain', () => {
  it('template yang sama diisi data kandidat B', async () => {
    const wb = await sheetFrom([
      ['Nama Lengkap', 'AGUS KHOCI'],
      ['Tgl Lahir', '1989-10-05'],
      ['Alamat', 'NGUJUNGLOR RT3 RW3 GANDUKEPUH'],
      ['TB', '{{fisik.tb}}'],
    ]);
    const { fieldMap } = await analyzeFromExample(wb, A);

    await applyFieldMap(wb, fieldMap, B);
    const read = await readBack(await workbookToXlsxBlob(wb));
    const ws = read.worksheets[0];
    expect(ws.getCell('B1').value).toBe('ARIA UJI');
    expect(ws.getCell('B2').value).toBe('2001-05-05');
    expect(ws.getCell('B3').value).toBe('JL MELATI 1');
    expect(ws.getCell('B4').value).toBe('170');
  });
});
