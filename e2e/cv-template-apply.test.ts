/**
 * TESTS: `applyFieldMap` — satu nilai per sel, termasuk saat nilainya KOSONG.
 *
 * KENAPA DI `e2e/`: `indexer` menghitung SELURUH berkas di bawah `src/**`, jadi
 * `.test.ts` baru di sana memindahkan counter beku.
 *
 * BUG YANG DIKUNCI (ditemukan 2026-10-10)
 * ---------------------------------------
 * Versi lama hanya menulis kalau nilainya TIDAK kosong:
 *
 *     const value = getValueFromPath(data, fieldPath);
 *     if (value) writeCellValue(cell, value);      // ← nilai kosong dilewati
 *
 * Template yang tersimpan berisi data kandidat CONTOH (itu cara petanya
 * dipelajari). Jadi kandidat yang belum mengisi sebuah field mewarisi nilai
 * milik orang lain — diukur pada template rirekisho nyata: tanpa agama/golongan
 * darah/umur, hasilnya keluar "ISLAM（イスラム） / O / 19" milik kandidat contoh.
 * Berkasnya terlihat wajar, jadi tidak ada yang menyadarinya.
 *
 * Kesalahan yang sama sudah diperbaiki untuk tabel riwayat (baris sisa); ini
 * kasus satu sel.
 */
import { describe, it, expect } from 'vitest';
import { Workbook as ExcelWorkbook } from 'exceljs';
import { applyFieldMap } from '../src/lib/cv-template-factory/loaders/tEMPLATE-loader';
import type { CandidateData } from '../src/lib/cv-template-factory/types';

/** Kandidat contoh: yang datanya terisi di template waktu admin meng-upload. */
function sheetWith(values: Record<string, string>): ExcelWorkbook {
  const wb = new ExcelWorkbook();
  const ws = wb.addWorksheet('CV');
  for (const [addr, v] of Object.entries(values)) ws.getCell(addr).value = v;
  return wb;
}

function textOf(wb: ExcelWorkbook, addr: string): string {
  const v: unknown = wb.worksheets[0].getCell(addr).value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v !== null && 'richText' in (v as Record<string, unknown>)) {
    return ((v as { richText: Array<{ text?: string }> }).richText).map((t) => t.text ?? '').join('');
  }
  return String(v);
}

const KANDIDAT = {
  identitas: { nama_lengkap: 'KANDIDAT BARU', agama: '', golongan_darah: '' },
} as unknown as CandidateData;

describe('applyFieldMap — nilai kosong harus MENGOSONGKAN sel', () => {
  it('nilai terisi ditulis seperti biasa', async () => {
    const wb = sheetWith({ B4: 'NAMA CONTOH' });
    await applyFieldMap(wb, { B4: 'identitas.nama_lengkap' }, KANDIDAT);
    expect(textOf(wb, 'B4')).toBe('KANDIDAT BARU');
  });

  it('nilai KOSONG mengosongkan sel — tidak mewarisi data kandidat contoh', async () => {
    const wb = sheetWith({ H8: 'O', H10: 'ISLAM　（イスラム）' });
    await applyFieldMap(
      wb,
      { H8: 'identitas.golongan_darah', H10: 'identitas.agama' },
      KANDIDAT,
    );
    expect(textOf(wb, 'H8')).toBe('');
    expect(textOf(wb, 'H10')).toBe('');
  });

  it('field yang tidak ada di data juga mengosongkan sel', async () => {
    const wb = sheetWith({ C9: 'MOJOKERTO' });
    await applyFieldMap(wb, { C9: 'identitas.tempat_lahir' }, KANDIDAT);
    expect(textOf(wb, 'C9')).toBe('');
  });

  it('sel yang berisi LABEL YANG DIKENAL tidak dihapus walau nilainya kosong', async () => {
    // Peta bisa salah di template yang tata letaknya belum kita kenal, dan
    // menghapus LABEL template lebih merusak daripada membiarkannya. Penjaganya
    // adalah `looksLikeLabel()` — jadi hanya label yang PUNYA pola di
    // `FIELD_LABELS` yang terlindungi. Label yang polanya belum ada (mis.
    // `訪日経験 PERNAH KE JEPANG`, yang juga belum punya field tujuan) tidak
    // terlindungi: menambah polanya tanpa field akan membuat selnya selalu
    // ditulis kosong — yaitu menghapus label itu juga.
    const wb = sheetWith({ H10: 'AGAMA', H8: 'GOLONGAN DARAH' });
    await applyFieldMap(
      wb,
      { H10: 'identitas.agama', H8: 'identitas.golongan_darah' },
      KANDIDAT,
    );
    expect(textOf(wb, 'H10')).toBe('AGAMA');
    expect(textOf(wb, 'H8')).toBe('GOLONGAN DARAH');
  });

  it('sel lain di sheet tidak tersentuh', async () => {
    const wb = sheetWith({ B4: 'NAMA CONTOH', D7: 'TEKS STATIS TEMPLATE' });
    await applyFieldMap(wb, { B4: 'identitas.nama_lengkap' }, KANDIDAT);
    expect(textOf(wb, 'D7')).toBe('TEKS STATIS TEMPLATE');
  });
});
