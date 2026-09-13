/**
 * candidateExport.xlsx.test.ts — bukti bahwa berkas Excel yang dihasilkan BENAR-BENAR
 * bisa dibaca, bukan sekadar "fungsinya tidak error".
 *
 * Kenapa tes terpisah: `buildExcelBuffer` mengimpor `xlsx` secara dinamis dan
 * mengembalikan ArrayBuffer biner. Tes yang hanya memeriksa "tidak throw" akan
 * lolos meski workbook-nya kosong atau kolomnya salah. Di sini hasilnya dibaca
 * ULANG lewat `XLSX.read` dan isinya dibandingkan dengan sumbernya — round-trip.
 */
import { describe, expect, it } from 'vitest';
import {
  EXPORT_HEADERS,
  EXPORT_SHEET_NAME,
  buildExcelBuffer,
  exportFilename,
  toExportMatrix,
} from './candidateExport';

const ROWS = [
  {
    id: 'K-001',
    nama: 'MUHAMAD SATORI',
    wa: '628123456789',
    email: 'satori@example.com',
    gender: 'LAKI-LAKI',
    usia: '24',
    idLoker: 'TG1',
    tahapan: 'LOLOS USER',
    status: 'AKTIF',
    catatanExt: 'Catatan penting',
    tanggalDaftar: '2026-08-01',
  },
  {
    id: 'K-002',
    nama: 'SITI RAHAYU',
    wa: '628987654321',
    email: 'siti@example.com',
    gender: 'PEREMPUAN',
    usia: '22',
    idLoker: 'TG2',
    tahapan: 'MENUNGGU',
    status: '',
    catatan: 'catatan admin',
    tanggalDaftar: '2026-08-02',
  },
];

describe('buildExcelBuffer — workbook nyata yang bisa dibaca ulang', () => {
  it('menghasilkan buffer tidak kosong', async () => {
    const buf = await buildExcelBuffer(ROWS);
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it('berkasnya dikenali sebagai xlsx (magic bytes PK zip)', async () => {
    const buf = await buildExcelBuffer(ROWS);
    const head = new Uint8Array(buf.slice(0, 2));
    // Semua .xlsx modern adalah arsip ZIP: 'P' 'K'.
    expect([head[0], head[1]]).toEqual([0x50, 0x4b]);
  });

  it('round-trip: header dan isi baris sama dengan sumbernya', async () => {
    const XLSX = await import('xlsx');
    const buf = await buildExcelBuffer(ROWS);
    const wb = XLSX.read(buf, { type: 'array' });

    expect(wb.SheetNames).toContain(EXPORT_SHEET_NAME);
    const sheet = wb.Sheets[EXPORT_SHEET_NAME]!;
    const back = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false });

    // Matriks yang dibaca ulang harus identik dengan yang kita tulis.
    expect(back).toEqual(toExportMatrix(ROWS));
  });

  it('jumlah baris = 1 header + N kandidat', async () => {
    const XLSX = await import('xlsx');
    const buf = await buildExcelBuffer(ROWS);
    const wb = XLSX.read(buf, { type: 'array' });
    const back = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[EXPORT_SHEET_NAME]!, { header: 1 });
    expect(back).toHaveLength(ROWS.length + 1);
  });

  it('kolom Excel persis sama dengan kolom CSV (11, urutan sama)', async () => {
    const XLSX = await import('xlsx');
    const buf = await buildExcelBuffer(ROWS);
    const wb = XLSX.read(buf, { type: 'array' });
    const [header] = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[EXPORT_SHEET_NAME]!, { header: 1 });
    expect(header).toEqual(EXPORT_HEADERS);
  });

  it('nilai yang mengandung koma TIDAK terpecah di Excel', async () => {
    const XLSX = await import('xlsx');
    const buf = await buildExcelBuffer([{ nama: 'SITORI, MUHAMAD', id: 'K-9' }]);
    const wb = XLSX.read(buf, { type: 'array' });
    const back = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[EXPORT_SHEET_NAME]!, { header: 1 });
    expect(back[1]![1]).toBe('SITORI, MUHAMAD');
  });

  it('daftar kosong tetap menghasilkan workbook valid berisi header saja', async () => {
    const XLSX = await import('xlsx');
    const buf = await buildExcelBuffer([]);
    const wb = XLSX.read(buf, { type: 'array' });
    const back = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[EXPORT_SHEET_NAME]!, { header: 1 });
    expect(back).toHaveLength(1);
    expect(back[0]).toEqual(EXPORT_HEADERS);
  });

  it('nama berkas berakhiran .xlsx', () => {
    expect(exportFilename('xlsx')).toMatch(/^asj-kandidat-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
