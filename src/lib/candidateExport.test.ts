/**
 * candidateExport.test.ts — ekspor kandidat harus parity legacy (11 kolom),
 * dan CSV serta Excel tidak boleh menyimpang satu sama lain.
 *
 * Kenapa ini ada: `TabPelamar.exportCsv()` dulu menulis kolomnya sendiri di dalam
 * komponen (7 kolom), sementara legacy mengirim 11. Karena definisi kolom tidak
 * diuji, selisihnya tidak terlihat — sampai seseorang membandingkan berkasnya.
 * Tes ini mengunci daftar kolom, urutannya, pemetaan gender, dan BOM.
 *
 * Nilai di bawah adalah bentuk nyata baris `getCandidatesPage` (mapCandidate).
 */
import { describe, expect, it } from 'vitest';
import {
  EXPORT_HEADERS,
  csvCell,
  exportFilename,
  genderCode,
  registeredDate,
  toCsvText,
  toExportMatrix,
} from './candidateExport';

/** Baris nyata bentuk mapCandidate (`_lib/db/candidates.ts`). */
const ROW = {
  id: 'K-001',
  nama: 'MUHAMAD SATORI',
  wa: '628123456789',
  email: 'satori@example.com',
  gender: 'LAKI-LAKI',
  usia: '24',
  idLoker: 'TG1',
  tahapan: 'LOLOS USER',
  status: '',
  catatanExt: 'Catatan penting',
  catatan: 'catatan admin lama',
  tanggalDaftar: '2026-08-01',
  createdAt: '2026-07-30T10:00:00Z',
};

describe('genderCode — parity legacy (P / L / kosong)', () => {
  it('PEREMPUAN → P', () => {
    expect(genderCode('PEREMPUAN')).toBe('P');
  });

  it('LAKI-LAKI → L', () => {
    expect(genderCode('LAKI-LAKI')).toBe('L');
  });

  it('nilai ber-emoji dari sheet tetap terbaca (👨 Pria👩 Wanita)', () => {
    // Nilai produksi nyata: mengandung keduanya; PEREMPUAN diuji lebih dulu.
    expect(genderCode('👨 Pria👩 Wanita')).toBe('P');
  });

  it('tidak diketahui → string kosong, bukan "-"', () => {
    expect(genderCode('')).toBe('');
    expect(genderCode(undefined)).toBe('');
    expect(genderCode('XYZ')).toBe('');
  });
});

describe('registeredDate — tanggalDaftar, fallback createdAt', () => {
  it('pakai tanggalDaftar bila ada', () => {
    expect(registeredDate(ROW)).toBe('2026-08-01');
  });

  it('fallback ke createdAt bila tanggalDaftar kosong', () => {
    expect(registeredDate({ createdAt: '2026-07-30T10:00:00Z' })).toBe('2026-07-30T10:00:00Z');
  });

  it('kosong bila keduanya tidak ada', () => {
    expect(registeredDate({})).toBe('');
  });
});

describe('EXPORT_HEADERS — 11 kolom legacy, urutan tetap', () => {
  it('persis 11 kolom seperti legacy exportKandidatCsv', () => {
    expect(EXPORT_HEADERS).toHaveLength(11);
  });

  it('urutan kolom sama dengan legacy', () => {
    expect(EXPORT_HEADERS).toEqual([
      'ID Kandidat',
      'Nama',
      'No WA',
      'Email',
      'Gender',
      'Usia',
      'Job ID',
      'Tahapan',
      'Status',
      'Catatan Admin',
      'Tanggal Daftar',
    ]);
  });

  it('tidak ada header duplikat', () => {
    expect(new Set(EXPORT_HEADERS).size).toBe(EXPORT_HEADERS.length);
  });
});

describe('toExportMatrix — CSV dan Excel membaca definisi kolom yang sama', () => {
  it('baris pertama selalu header', () => {
    const m = toExportMatrix([]);
    expect(m).toHaveLength(1);
    expect(m[0]).toEqual(EXPORT_HEADERS);
  });

  it('jumlah sel tiap baris sama dengan jumlah header', () => {
    const m = toExportMatrix([ROW, { id: 'K-002' }]);
    for (const r of m) expect(r).toHaveLength(EXPORT_HEADERS.length);
  });

  it('memetakan nilai nyata dengan benar', () => {
    const [, row] = toExportMatrix([ROW]);
    expect(row).toEqual([
      'K-001',
      'MUHAMAD SATORI',
      '628123456789',
      'satori@example.com',
      'L',
      '24',
      'TG1',
      'LOLOS USER',
      '',
      'Catatan penting', // catatanExt menang atas catatan
      '2026-08-01',
    ]);
  });

  it('catatanExt kosong → jatuh ke catatan (catatan_admin)', () => {
    const [, row] = toExportMatrix([{ catatan: 'catatan admin' }]);
    expect(row[9]).toBe('catatan admin');
  });

  it('baris kosong tidak menghasilkan "undefined" literal', () => {
    const [, row] = toExportMatrix([{}]);
    expect(row.every((v) => v === '')).toBe(true);
    expect(row.join('')).not.toContain('undefined');
  });
});

describe('csvCell — quoting RFC 4180', () => {
  it('kutip hanya bila perlu', () => {
    expect(csvCell('biasa')).toBe('biasa');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell('a\rb')).toBe('"a\rb"');
  });

  it('null/undefined → string kosong', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });
});

describe('toCsvText — BOM wajib untuk Excel Windows', () => {
  it('dimulai dengan BOM U+FEFF', () => {
    expect(toCsvText([ROW]).startsWith('\uFEFF')).toBe(true);
  });

  it('memakai CRLF, bukan LF telanjang', () => {
    const t = toCsvText([ROW, ROW]);
    expect(t).toContain('\r\n');
    // Tidak boleh ada LF yang tidak didahului CR.
    expect(/[^\r]\n/.test(t)).toBe(false);
  });

  it('jumlah baris = header + jumlah kandidat', () => {
    const t = toCsvText([ROW, ROW, ROW]);
    expect(t.replace('\uFEFF', '').split('\r\n')).toHaveLength(4);
  });

  it('nama ber-koma tetap utuh setelah diparse ulang (round-trip)', () => {
    const t = toCsvText([{ nama: 'SITORI, MUHAMAD' }]).replace('\uFEFF', '');
    const first = t.split('\r\n')[1]!;
    // Kolom ke-2 harus terbaca sebagai satu nilai utuh, bukan terpecah dua.
    expect(first).toContain('"SITORI, MUHAMAD"');
  });
});

describe('exportFilename', () => {
  it('bertanggal dan berekstensi sesuai format', () => {
    const d = new Date('2026-09-13T05:00:00Z');
    expect(exportFilename('csv', d)).toBe('asj-kandidat-2026-09-13.csv');
    expect(exportFilename('xlsx', d)).toBe('asj-kandidat-2026-09-13.xlsx');
  });
});
