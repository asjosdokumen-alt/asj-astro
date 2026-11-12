/**
 * tEMPLATE-loader.ts — baca/tulis template CV (.xlsx) untuk fitur "Template CV".
 *
 * KENAPA exceljs, BUKAN `xlsx` (SheetJS) — keputusan pemilik 2026-10-10
 * ---------------------------------------------------------------------
 * Build KOMUNITAS SheetJS tidak bisa MENULIS gaya: `XLSX.write` tidak pernah
 * mengeluarkan atribut `s`, dan ia juga tidak meng-*baca* data validation sama
 * sekali. Diukur pada template rirekisho nyata:
 *
 *   | | SheetJS (read+write) | exceljs (read+write) |
 *   |---|---|---|
 *   | sel bergaya (font/warna/border/perataan) | 62 -> 0        | 154 -> 154 |
 *   | dropdown (`dataValidation`)               |  8 -> 0        | 17 -> 17   |
 *   | gambar tertanam                           | ada -> hilang  | 1 -> 1     |
 *   | pengaturan cetak (`pageSetup`)            | ada -> hilang  | ada -> ada |
 *   | sel gabungan                              | 83 -> 83       | 83 -> 83   |
 *
 * Konsekuensi desainnya penting: **gaya tidak perlu "disalin"** — selama kita
 * hanya mengubah `cell.value`, exceljs mempertahankan `cell.style` yang sudah
 * ada. Jadi mengisi CV tidak lagi menghapus tampilan template.
 *
 * CAKUPAN BERKAS INI (dipangkas 2026-11-12)
 * -----------------------------------------
 * Hanya jalur "isi berkas yang diunggah pengguna" yang tersisa: nilai ditulis
 * ke sel yang memuat penanda `{{path}}`. Jalur "unggah contoh terisi lalu
 * pelajari peta sel" (`analyzeFromExample`, `applyFieldMap`, `applyRiwayatBlock`)
 * DIHAPUS — pemilik menghentikannya karena hasil parse tidak bisa dipercaya dan
 * biayanya mahal. Template CV sekarang dibuat manual di kode: lima renderer di
 * `../renderers/`, masing-masing dengan peta sel yang bisa diuji.
 */
import type { Cell, Workbook, Worksheet } from 'exceljs';
import type { CandidateData } from '../types';

export type ExcelTemplateOptions = {
  sheetName?: string;
  arrayFields?: string[];
};

const PLACEHOLDER_RE = /\{\{([^}]+)\}\}/g;
type WorkbookCtor = new () => Workbook;

async function workbookCtor(): Promise<WorkbookCtor> {
  const mod = (await import('exceljs')) as unknown as {
    Workbook?: unknown;
    default?: { Workbook?: unknown };
  };
  const ctor = mod.Workbook ?? mod.default?.Workbook;
  if (typeof ctor !== 'function') {
    throw new Error('exceljs tidak bisa dimuat (Workbook tidak ditemukan).');
  }
  return ctor as WorkbookCtor;
}

/** Baca workbook dari buffer. */
export async function readWorkbook(buffer: ArrayBuffer | Uint8Array): Promise<Workbook> {
  const Ctor = await workbookCtor();
  const wb = new Ctor();
  await wb.xlsx.load(buffer as never);
  return wb;
}

/** Ambil sheet pertama (atau yang namanya disebut). */
function pickSheet(wb: Workbook, name?: string): Worksheet {
  const ws = name ? wb.getWorksheet(name) : wb.worksheets[0];
  if (!ws) throw new Error(`Sheet "${name || '(pertama)'}" tidak ada di template.`);
  return ws;
}

/** Teks satu sel, apa pun bentuk nilainya (string, rich text, rumus, tanggal). */
function cellText(cell: Cell | undefined): string {
  if (!cell) return '';
  const v: unknown = cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: unknown }>).map((t) => String(t.text ?? '')).join('');
    }
    if ('result' in o) return o.result === null || o.result === undefined ? '' : String(o.result);
    if ('text' in o) return String(o.text ?? '');
    return '';
  }
  return String(v);
}

/** Workbook → blob .xlsx, untuk diunduh pengguna. */
async function workbookToXlsxBlob(workbook: Workbook): Promise<Blob> {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Tulis nilai ke sel TANPA menyentuh gayanya.
 *
 * `cell.value = x` mempertahankan `cell.style` — itulah sebabnya mengisi CV
 * tidak lagi menghapus tampilan template. Tipe nilainya dijaga: kalau sel itu
 * sebelumnya berisi ANGKA dan nilai barunya numerik, tulis sebagai angka lagi
 * (kalau ditulis sebagai teks, format angka & perataannya berubah).
 */
function writeCellValue(cell: Cell, value: string): void {
  if (value === '') {
    // `null`, bukan `''`: mengosongkan baris sisa harus benar-benar kosong,
    // tapi gaya/border sel tetap dipertahankan.
    cell.value = null;
    return;
  }
  const prev: unknown = cell.value;
  if (typeof prev === 'number' && Number.isFinite(Number(value))) {
    cell.value = Number(value);
    return;
  }
  cell.value = value;
}
export function flattenDataForPlaceholders(data: CandidateData): Record<string, string> {
  const flat: Record<string, string> = {};

  function recurse(obj: Record<string, unknown>, prefix = ''): void {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        recurse(value as Record<string, unknown>, path);
      } else if (Array.isArray(value)) {
        if (value.length > 0 && typeof value[0] === 'object') {
          flat[path] = JSON.stringify(value);
        } else {
          flat[path] = value.join(', ');
        }
      } else if (value !== null && value !== undefined) {
        flat[path] = String(value);
      }
    }
  }

  for (const [section, sectionData] of Object.entries(data)) {
    if (section === 'raw') continue;
    recurse(sectionData as Record<string, unknown>, section);
  }

  return flat;
}

function replacePlaceholders(text: string, flatData: Record<string, string>): string {
  return text.replace(PLACEHOLDER_RE, (match, key) => {
    const trimmed = String(key).trim();
    if (flatData[trimmed] !== undefined) return flatData[trimmed];
    return match;
  });
}

/** Semua sel berisi di sheet, sebagai daftar `{address, text}`. */
function eachCell(ws: Worksheet, fn: (address: string, text: string) => void): void {
  const maxRow = ws.rowCount;
  const maxCol = ws.columnCount;
  for (let r = 1; r <= maxRow; r++) {
    for (let c = 1; c <= maxCol; c++) {
      const cell = ws.getCell(r, c);
      const text = cellText(cell);
      if (text === '') continue;
      fn(cell.address, text);
    }
  }
}
export async function loadExcelTemplate(
  file: File,
  data: CandidateData,
  options: ExcelTemplateOptions = {},
): Promise<Blob> {
  const workbook = await readWorkbook(new Uint8Array(await file.arrayBuffer()));
  const flatData = flattenDataForPlaceholders(data);
  const ws = pickSheet(workbook, options.sheetName);

  const placeholderCells: Array<{ address: string; text: string }> = [];
  eachCell(ws, (address, text) => {
    if (PLACEHOLDER_RE.test(text)) placeholderCells.push({ address, text });
    PLACEHOLDER_RE.lastIndex = 0;
  });

  if (placeholderCells.length) {
    const arrayFields = options.arrayFields || ['pendidikan', 'pekerjaan', 'keluarga'];
    const arrayLengths: Record<string, number> = {};
    for (const field of arrayFields) {
      arrayLengths[field] = (data[field as keyof CandidateData] as unknown[] | undefined)?.length || 1;
    }
    const maxArrayLength = Math.max(1, ...Object.values(arrayLengths));

    for (let i = 0; i < maxArrayLength; i++) {
      const itemFlat: Record<string, string> = {};
      for (const [field, length] of Object.entries(arrayLengths)) {
        if (i >= length) continue;
        const item = (data[field as keyof CandidateData] as Record<string, unknown>[] | undefined)?.[i];
        if (!item) continue;
        for (const [k, v] of Object.entries(item)) {
          if (v !== null && v !== undefined) itemFlat[`${field}.${k}`] = String(v);
        }
      }
      for (const { address, text } of placeholderCells) {
        let replaced = replacePlaceholders(text, itemFlat);
        replaced = replacePlaceholders(replaced, flatData);
        // Baris ke-i ditulis ke baris asal + i supaya blok placeholder bertambah
        // ke bawah, bukan menimpa baris yang sama berulang kali.
        const src = ws.getCell(address);
        writeCellValue(ws.getCell(src.row + i, src.col), replaced);
      }
    }
    return workbookToXlsxBlob(workbook);
  }

  /* Tidak ada `{{placeholder}}` di berkas. Dulu di sini ada jalur "pelajari
     peta sel dari contoh" (`analyzeExcelTemplate` + `applyFieldMap`); jalur itu
     DIHENTIKAN pemilik 2026-11-12 — hasilnya tidak bisa dipercaya dan biayanya
     mahal. Berkas tanpa penanda tidak bisa diisi dengan aman, jadi ditolak
     dengan pesan yang menyebut apa yang kurang. */
  throw new Error(
    'Berkas tidak memuat penanda {{…}}. Tulis penanda seperti {{identitas.nama_lengkap}} ' +
      'pada sel yang ingin diisi, lalu unggah ulang.',
  );
}

export async function loadDocxTemplate(file: File, data: CandidateData): Promise<{ html: string; text: string }> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const flatData = flattenDataForPlaceholders(data);

  const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
  let html = htmlResult.value || '';

  html = replacePlaceholders(html, flatData);

  const textResult = await mammoth.extractRawText({ arrayBuffer });
  const text = replacePlaceholders(textResult.value || '', flatData);

  return { html, text };
}

interface PdfParser {
  load: () => Promise<void>;
  getText: () => Promise<{ text?: string }>;
  destroy: () => void;
}

export async function loadPdfTemplate(file: File, data: CandidateData): Promise<string> {
  const pdfModule = (await import('pdf-parse')) as unknown as { PDFParse?: unknown; default?: unknown };
  const PDFClass = (pdfModule.PDFParse ?? pdfModule.default) as new (b: Uint8Array) => PdfParser;
  const arrayBuffer = await file.arrayBuffer();
  const flatData = flattenDataForPlaceholders(data);
  const fresh = new Uint8Array(arrayBuffer as ArrayBuffer);
  const parser = new PDFClass(fresh);
  await parser.load();
  const result = await parser.getText();
  parser.destroy();
  const text = result?.text || '';

  return replacePlaceholders(text, flatData);
}
