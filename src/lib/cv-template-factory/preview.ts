/**
 * preview.ts — workbook .xlsx hasil render → HTML untuk pratinjau di layar.
 *
 * KENAPA ADA
 * ----------
 * Pemilik 2026-10-26: "pilihan template ada preview hasil data nya, jgn langsung
 * download". Sebelum ini klik satu template langsung mengunduh berkas, jadi
 * kesalahan pengisian (nama tertukar, kolom kosong) baru ketahuan setelah
 * berkasnya dibuka di Excel.
 *
 * APA YANG DITAMPILKAN, DAN APA YANG TIDAK
 * ----------------------------------------
 * `sheet_to_html` SheetJS mempertahankan merge (`rowspan`/`colspan`) dan teks
 * setiap sel, jadi bentuk formnya masih terbaca. Yang TIDAK ikut: border, fill,
 * dan font asli template — SheetJS gratis hanya mengekspor sebagian style, dan
 * meniru 94 merge dengan CSS sendiri berarti memelihara salinan layout kedua
 * yang akan menyimpang dari berkas aslinya. Pratinjau ini untuk memeriksa DATA,
 * bukan untuk menilai hasil cetak: yang dicetak tetap berkas .xlsx-nya.
 *
 * Rentangnya dipangkas: berkas template menyimpan 996 baris kosong ber-style,
 * dan mengekspor semuanya menghasilkan HTML 1,2 MB untuk form yang isinya 27
 * baris.
 */
import type { WorkBook } from 'xlsx';

export interface PreviewOptions {
  /** Baris maksimum yang diekspor (default 60). */
  maxRows?: number;
  /** Kolom maksimum yang diekspor (default 26 = A..Z). */
  maxCols?: number;
}

/** HTML `<table>` siap tempel, atau '' kalau berkasnya tidak terbaca. */
export async function xlsxPreviewHtml(blob: Blob, opts: PreviewOptions = {}): Promise<string> {
  const XLSX = await import('xlsx');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Hanya .xlsx (ZIP, magic "PK"). Tanpa penjagaan ini SheetJS memperlakukan
  // teks apa pun sebagai CSV dan pratinjau menampilkan tabel palsu — lebih buruk
  // daripada "tidak bisa dipratinjau", karena terlihat seperti CV yang benar.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return '';
  // `cellStyles` supaya teks tebal/ukuran font dari template ikut terbaca.
  const wb: WorkBook = XLSX.read(bytes, { type: 'array', cellStyles: true });
  const sheetName = wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!ws) return '';

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  range.e.r = Math.min(range.e.r, (opts.maxRows ?? 60) - 1);
  range.e.c = Math.min(range.e.c, (opts.maxCols ?? 26) - 1);
  ws['!ref'] = XLSX.utils.encode_range(range);

  const html = XLSX.utils.sheet_to_html(ws, { id: 'cv-preview-table' });
  const table = /<table[\s\S]*?<\/table>/.exec(html);
  return table ? table[0] : '';
}
