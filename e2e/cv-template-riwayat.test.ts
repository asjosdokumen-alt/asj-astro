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
