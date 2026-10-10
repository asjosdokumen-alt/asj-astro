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
 */
import { describe, it, expect } from 'vitest';
import {
  detectRiwayatBlock,
  applyRiwayatBlock,
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

async function sheetFrom(rows: unknown[][]) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CV');
  return wb;
}

async function readBack(blob: Blob) {
  const XLSX = await import('xlsx');
  return XLSX.read(new Uint8Array(await blob.arrayBuffer()), { type: 'array' });
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
const SHEET_TAIL = [
  ...SHEET,
  ['', '', ''],
  ['CATATAN', 'JANGAN HILANG', ''],
];

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
    const out = await readBack(await applyRiwayatBlock(wb, block, B));
    const ws = out.Sheets[out.SheetNames[0]];
    expect(ws.A3?.v).toBe('SD');
    expect(ws.B3?.v).toBe('SDN 2 BALONG');
    expect(ws.C3?.v).toBe('2011');
    expect(ws.B4?.v).toBe('SMPN 1 PONOROGO');
    expect(ws.B5?.v).toBe('SMAN 2 PONOROGO');
  });

  it('entri lebih sedikit ⇒ baris sisa DIKOSONGKAN, tidak ditinggali data kandidat sebelumnya', async () => {
    const wb = await sheetFrom(SHEET);
    const block = need(await detectRiwayatBlock(wb, A, 'tingkat'));
    const out = await readBack(await applyRiwayatBlock(wb, block, B.slice(0, 2)));
    const ws = out.Sheets[out.SheetNames[0]];
    expect(ws.B4?.v).toBe('SMPN 1 PONOROGO');
    expect(ws.B5?.v).toBe('');
    expect(ws.C5?.v).toBe('');
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
    const out = await readBack(await applyRiwayatBlock(wb, block, LONG));
    const ws = out.Sheets[out.SheetNames[0]];
    // 5 entri mulai baris 3 ⇒ baris 3..7. Entri ke-4 dan ke-5 jatuh di 6 dan 7.
    expect(ws.A6?.v).toBe('S1');
    expect(ws.B6?.v).toBe('UNIV BRAWIJAYA');
    expect(ws.A7?.v).toBe('S2');
    expect(ws.B7?.v).toBe('UNIV INDONESIA');
  });

  it('baris di BAWAH tabel ikut turun, tidak tertimpa', async () => {
    const wb = await sheetFrom(SHEET_TAIL);
    const block = need(await detectRiwayatBlock(wb, A, 'tingkat'));
    const out = await readBack(await applyRiwayatBlock(wb, block, LONG));
    const ws = out.Sheets[out.SheetNames[0]];
    // Baris 7 (`CATATAN`) semula, digeser 2 baris ke bawah.
    expect(ws.A9?.v).toBe('CATATAN');
    expect(ws.B9?.v).toBe('JANGAN HILANG');
    // dan baris 6/7 sekarang milik kandidat ini, bukan sisa contoh
    expect(ws.A6?.v).toBe('S1');
    expect(ws.A7?.v).toBe('S2');
  });

  it('sel gabungan di bawah tabel ikut turun', async () => {
    const wb = await sheetFrom(SHEET_TAIL);
    const ws0 = wb.Sheets[wb.SheetNames[0]];
    ws0['!merges'] = [{ s: { c: 0, r: 6 }, e: { c: 2, r: 6 } }];
    const block = need(await detectRiwayatBlock(wb, A, 'tingkat'));
    const out = await readBack(await applyRiwayatBlock(wb, block, LONG));
    const ws = out.Sheets[out.SheetNames[0]];
    const merges = (ws['!merges'] || []) as Array<{ s: { r: number }; e: { r: number } }>;
    expect(merges.some((m) => m.s.r === 8 && m.e.r === 8)).toBe(true);
  });
});
