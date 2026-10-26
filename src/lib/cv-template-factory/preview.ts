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
  // Pangkas ke BARIS TERAKHIR YANG BERISI, bukan ke angka tetap: template ini
  // menyimpan 996 baris kosong ber-style, dan memotong di 60 menyisakan ~33
  // baris kosong di bawah form yang isinya 27 baris. Batas `maxRows` tetap ada
  // sebagai pagar untuk berkas yang benar-benar panjang.
  let lastRow = 0;
  let lastCol = 0;
  for (const addr of Object.keys(ws)) {
    if (addr.startsWith('!')) continue;
    const cell = (ws as Record<string, { v?: unknown }>)[addr];
    if (!cell || cell.v === undefined || cell.v === '') continue;
    const d = XLSX.utils.decode_cell(addr);
    if (d.r > lastRow) lastRow = d.r;
    if (d.c > lastCol) lastCol = d.c;
  }
  range.e.r = Math.min(range.e.r, Math.max(lastRow, 10), (opts.maxRows ?? 60) - 1);
  range.e.c = Math.min(range.e.c, Math.max(lastCol, 15), (opts.maxCols ?? 26) - 1);
  ws['!ref'] = XLSX.utils.encode_range(range);

  const html = XLSX.utils.sheet_to_html(ws, { id: 'cv-preview-table' });
  const table = /<table[\s\S]*?<\/table>/.exec(html);
  if (!table) return '';

  /**
   * Lebar kolom asli ikut dipasang.
   *
   * `sheet_to_html` TIDAK mengekspor `<col>` sama sekali, jadi tabelnya memakai
   * lebar otomatis: kolom foto menyusut dan alamat panjang tumpah ke kolom
   * sebelah — terbaca seperti "jumlah kolomnya berubah", padahal hanya lebarnya
   * yang tidak dibawa. Lebar diambil dari `!cols` (yang dibaca SheetJS dari
   * `<cols>` template).
   */
  const cols = (ws['!cols'] ?? []).slice(0, range.e.c + 1);
  const colgroup = cols.length
    ? '<colgroup>' +
      cols.map((c) => {
        const w = c?.wpx ?? (c?.wch ? Math.round(c.wch * 7) : 0);
        return w ? `<col style="width:${w}px">` : '<col>';
      }).join('') +
      '</colgroup>'
    : '';

  return table[0].replace(/<table([^>]*)>/, `<table$1>${colgroup}`);
}
