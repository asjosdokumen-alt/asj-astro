/**
 * TESTS: blok riwayat multi-baris — pendidikan/pekerjaan/keluarga.
 *
 * KENAPA DI `e2e/`: `indexer` menghitung SELURUH berkas di bawah `src/**`, jadi
 * `.test.ts` baru di sana memindahkan counter beku.
 *
 * BUG YANG DIKUNCI
 * ----------------
 * `applyFieldMap` menulis SATU nilai per sel. Tabel riwayat butuh N baris (satu
 * per sekolah/perusahaan/anggota keluarga), jadi tanpa applier ini CV hasil
 * regenerasi kehilangan bagian terpentingnya — dan baris milik kandidat
 * SEBELUMNYA bisa tertinggal di baris kandidat berikutnya.
 *
 * Ditambah 2026-10-10: applier hanya mengisi sampai jumlah baris CONTOH, jadi
 * kandidat dengan riwayat lebih panjang kehilangan entri terakhirnya.
 */
import { describe, it, expect } from 'vitest';
import { Workbook as ExcelWorkbook } from 'exceljs';
import {
  detectRiwayatBlock,
  applyRiwayatBlock,
  workbookToXlsxBlob,
  readWorkbook,
  type RiwayatBlock,
} from '../src/lib/cv-template-factory/loaders/tEMPLATE-loader';

const A = [
  { tingkat: 'SD', sekolah: 'SDN 1 CARANGREJO', masuk: '2013' },
  { tingkat: 'SMP', sekolah: 'MTS AL-AZHAR', masuk: '2019' },
  { tingkat: 'SMA', sekolah: 'MAN 1 PONOROGO', masuk: '2022' },
];
const B = [
  { tingkat: 'SD', sekolah: 'SDN 2 BALONG', masuk: '2011' },
  { tingkat: 'SMP', sekolah: 'SMPN 1 PONOROGO', masuk: '2017' },
  { tingkat: 'SMA', sekolah: 'SMAN 2 PONOROGO', masuk: '2020' },
];

async function sheetFrom(rows: unknown[][]): Promise<ExcelWorkbook> {
  const wb = new ExcelWorkbook();
  const ws = wb.addWorksheet('CV');
  ws.addRows(rows as never[]);
  return wb;
}

async function readBack(blob: Blob): Promise<ExcelWorkbook> {
  return readWorkbook(new Uint8Array(await blob.arrayBuffer()));
}

/** Blok yang gagal terdeteksi harus MEMERAHKAN tes, bukan dilewati diam-diam. */
function need(block: RiwayatBlock | null): RiwayatBlock {
  if (block === null) throw new Error('blok riwayat tidak terdeteksi');
  return block;
}

const SHEET = [
  ['RIWAYAT PENDIDIKAN', '', ''],
  ['Tingkat', 'Nama Sekolah', 'Tahun Masuk'],
  ['SD', 'SDN 1 CARANGREJO', '2013'],
  ['SMP', 'MTS AL-AZHAR', '2019'],
  ['SMA', 'MAN 1 PONOROGO', '2022'],
];

/** Sama seperti SHEET, tapi ada isi di BAWAH tabel — untuk membuktikan
 *  penggeseran baris, bukan penimpaan. */
const SHEET_TAIL = [...SHEET, ['', '', ''], ['CATATAN', 'JANGAN HILANG', '']];

describe('detectRiwayatBlock — mengenali tabel dari contoh terisi', () => {
  it('menemukan kolom kunci, baris awal, dan kolom-kolom lain', async () => {
    const block = need(await detectRiwayatBlock(await sheetFrom(SHEET), A, 'tingkat'));
    expect(block.keyColumn).toBe('A');
    expect(block.startRow).toBe(3);
    expect(block.rows).toBe(3);
    expect(block.columns.A).toBe('tingkat');
    expect(block.columns.B).toBe('sekolah');
    expect(block.columns.C).toBe('masuk');
  });

  it('menolak kolom yang tidak memuat SEMUA entri (bukan blok riwayat)', async () => {
    const wb = await sheetFrom([['Tingkat', 'X'], ['SD', 'a'], ['', 'b'], ['', 'c']]);
    expect(await detectRiwayatBlock(wb, A, 'tingkat')).toBeNull();
  });

  it('butuh minimal 2 entri untuk bisa disebut blok', async () => {
    expect(await detectRiwayatBlock(await sheetFrom(SHEET), [A[0]], 'tingkat')).toBeNull();
  });
});

describe('applyRiwayatBlock — isi ulang tabel dengan kandidat lain', () => {
  it('menulis 3 baris kandidat B ke baris yang sama', async () => {
    const wb = await sheetFrom(SHEET);
    const block = need(await detectRiwayatBlock(wb, A, 'tingkat'));
    await applyRiwayatBlock(wb, block, B);
    const out = await readBack(await workbookToXlsxBlob(wb));
    const ws = out.worksheets[0];
    expect(ws.getCell('A3').value).toBe('SD');
    expect(ws.getCell('B3').value).toBe('SDN 2 BALONG');
    expect(ws.getCell('C3').value).toBe('2011');
    expect(ws.getCell('B4').value).toBe('SMPN 1 PONOROGO');
    expect(ws.getCell('B5').value).toBe('SMAN 2 PONOROGO');
  });

  it('entri lebih sedikit ⇒ baris sisa DIKOSONGKAN, tidak ditinggali data kandidat sebelumnya', async () => {
    const wb = await sheetFrom(SHEET);
    const block = need(await detectRiwayatBlock(wb, A, 'tingkat'));
    await applyRiwayatBlock(wb, block, B.slice(0, 2));
    const out = await readBack(await workbookToXlsxBlob(wb));
    const ws = out.worksheets[0];
    expect(ws.getCell('B4').value).toBe('SMPN 1 PONOROGO');
    expect(ws.getCell('B5').value).toBeNull();
    expect(ws.getCell('C5').value).toBeNull();
  });
});

/**
 * BUG YANG DIKUNCI
 * ----------------
 * Applier pertama hanya mengisi sampai `block.rows` (jumlah baris di CONTOH).
 * Kandidat dengan riwayat lebih panjang kehilangan entri terakhirnya tanpa
 * jejak: sekolah/pekerjaan terakhir tidak muncul, dan berkasnya tetap terlihat
 * wajar. Barisnya harus DITAMBAH.
 */
describe('applyRiwayatBlock — riwayat LEBIH PANJANG daripada contoh', () => {
  const LONG = [
    ...B,
    { tingkat: 'S1', sekolah: 'UNIV BRAWIJAYA', masuk: '2025' },
    { tingkat: 'S2', sekolah: 'UNIV INDONESIA', masuk: '2029' },
  ];

  it('menambah baris sampai entri terakhir tertulis', async () => {
    const wb = await sheetFrom(SHEET);
    const block = need(await detectRiwayatBlock(wb, A, 'tingkat'));
    expect(block.rows).toBe(3); // contoh cuma 3 baris
    await applyRiwayatBlock(wb, block, LONG);
    const out = await readBack(await workbookToXlsxBlob(wb));
    const ws = out.worksheets[0];
    // 5 entri mulai baris 3 ⇒ baris 3..7. Entri ke-4 dan ke-5 jatuh di 6 dan 7.
    expect(ws.getCell('A6').value).toBe('S1');
    expect(ws.getCell('B6').value).toBe('UNIV BRAWIJAYA');
    expect(ws.getCell('A7').value).toBe('S2');
    expect(ws.getCell('B7').value).toBe('UNIV INDONESIA');
  });

  it('baris di BAWAH tabel ikut turun, tidak tertimpa', async () => {
    const wb = await sheetFrom(SHEET_TAIL);
    const block = need(await detectRiwayatBlock(wb, A, 'tingkat'));
    await applyRiwayatBlock(wb, block, LONG);
    const out = await readBack(await workbookToXlsxBlob(wb));
    const ws = out.worksheets[0];
    // Baris 7 (`CATATAN`) semula, digeser 2 baris ke bawah.
    expect(ws.getCell('A9').value).toBe('CATATAN');
    expect(ws.getCell('B9').value).toBe('JANGAN HILANG');
    // dan baris 6/7 sekarang milik kandidat ini, bukan sisa contoh
    expect(ws.getCell('A6').value).toBe('S1');
    expect(ws.getCell('A7').value).toBe('S2');
  });

  /**
   * `spliceRows` exceljs SUDAH menggeser sel gabungan sendiri — jadi tes ini
   * bukan membuktikan "kita menggesernya", melainkan menjaga agar tidak
   * digeser DUA KALI. Jebakannya nyata: `ws.model.merges` mengembalikan nilai
   * BASI tepat sesudah `spliceRows` (masih `A7:C7` padahal hasil tulisannya
   * `A9:C9`), jadi menggeser hasil bacaan itu menabrak pergeseran bawaan
   * library dan menghasilkan `A11:C11`. Assertion di bawah menangkap itu.
   */
  it('sel gabungan di bawah tabel ikut turun — tepat sekali, tidak dua kali', async () => {
    const wb = await sheetFrom(SHEET_TAIL);
    const ws0 = wb.worksheets[0];
    ws0.mergeCells('A7:C7');
    const block = need(await detectRiwayatBlock(wb, A, 'tingkat'));
    await applyRiwayatBlock(wb, block, LONG);
    const out = await readBack(await workbookToXlsxBlob(wb));
    const ws = out.worksheets[0];
    expect(ws.model.merges).toContain('A9:C9');
    expect(ws.model.merges).not.toContain('A7:C7');
    expect(ws.model.merges).not.toContain('A11:C11');
  });
});
