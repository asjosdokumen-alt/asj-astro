// ==========================================
// TESTS: document text extraction (2026-09-18)
//
// WHY THIS EXISTS
// The ingestion function is the only place in this repo that READS a
// spreadsheet, and it was the only xlsx call site with no test at all. That
// mattered on 2026-09-18, when xlsx had to be re-pinned to the vendor's own
// patched build: the npm package stopped at 0.18.5, which carries two
// high-severity advisories (docs/CICD.md records the swap and its footgun).
//
// `candidateExport.xlsx.test.ts` proves the WRITE side with a round-trip, and the
// cv-template-factory suite proves the deep read/write path, but neither reaches
// `Utils.sheet_to_csv`, which is what this branch uses. So this suite pins the
// read path directly: a real workbook goes in, CSV text with sheet markers comes
// out. If a future xlsx swap changes how sheets are read or serialised, this
// fails instead of silently degrading the text the AI is handed.
//
// Runs without env: `extractText` touches no network and no database.
//
// Measured while writing it, so the empty-sheet case is not a guess: a sheet of
// `[[null]]` serialises to "" and is skipped, while a row of empty STRINGS
// serialises to "," and is NOT skipped. Only the first is asserted.
// ==========================================
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { extractText } from './service';

function workbookBuffer(sheets: Array<{ name: string; rows: unknown[][] }>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.rows), s.name);
  }
  return Buffer.from(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
}

describe('extractText', () => {
  describe('xlsx', () => {
    it('reads every sheet and marks where each one starts', async () => {
      const buf = workbookBuffer([
        { name: 'Data', rows: [['Nama', 'Umur'], ['Siti', 30]] },
        { name: 'Catatan', rows: [['Catatan'], ['OK']] },
      ]);

      const text = await extractText(buf, 'xlsx');

      expect(text).toContain('--- Sheet: Data ---');
      expect(text).toContain('--- Sheet: Catatan ---');
      expect(text).toMatch(/Nama\s*,\s*Umur/);
      expect(text).toMatch(/Siti\s*,\s*30/);
    });

    it('accepts .xls, and normalises case and a leading dot', async () => {
      const buf = workbookBuffer([{ name: 'S1', rows: [['terisi']] }]);

      expect(await extractText(buf, '.xls')).toContain('terisi');
      expect(await extractText(buf, 'XLSX')).toContain('terisi');
    });

    it('skips a sheet that serialises to nothing', async () => {
      const buf = workbookBuffer([
        { name: 'Kosong', rows: [[null]] },
        { name: 'Isi', rows: [['terisi']] },
      ]);

      const text = await extractText(buf, 'xlsx');

      expect(text).not.toContain('--- Sheet: Kosong ---');
      expect(text).toContain('--- Sheet: Isi ---');
    });
  });

  describe('plain text', () => {
    it('passes csv and txt through, collapsing runs of blank lines', async () => {
      expect(await extractText(Buffer.from('a,b\r\n\r\n\r\nc'), 'csv')).toBe('a,b\n\nc');
      expect(await extractText(Buffer.from('x\ty'), 'txt')).toBe('x y');
    });
  });

  describe('refusals', () => {
    it('names the offending format and the supported ones', async () => {
      await expect(extractText(Buffer.from(''), 'rtf')).rejects.toThrow(
        /Format file tidak didukung: \.rtf/
      );
    });

    it('flags images for manual OCR instead of guessing at them', async () => {
      expect(await extractText(Buffer.from(''), 'png')).toBe('__NEEDS_MANUAL_OCR__');
    });
  });
});
