/**
 * preview.ts — workbook .xlsx hasil render → HTML yang menyerupai form aslinya.
 *
 * KENAPA ADA
 * ----------
 * Pemilik 2026-10-26: "pilihan template ada preview hasil data nya, jgn langsung
 * download" — lalu, setelah melihat versi pertama: "kok keluarnya jelek bener ga
 * nampak sesuai aslinya?".
 *
 * Versi pertama memakai `XLSX.utils.sheet_to_html`, yang hanya mengeluarkan teks
 * + merge: tanpa warna header, tanpa garis, tanpa lebar kolom — form biru-putih
 * ini keluar sebagai tabel putih polos. Sekarang tabelnya dibangun sendiri:
 *
 *   • `!merges` → `rowspan`/`colspan` (bentuk form);
 *   • `cell.s.fgColor` → warna latar header (SheetJS CE membaca fill, bukan
 *     border/font — jadi tebal huruf diturunkan dari ada/tidaknya fill);
 *   • `!cols` → `<colgroup>` lebar kolom asli;
 *   • `!rows` → tinggi baris kalau template menyimpannya;
 *   • garis 1px seragam, karena border asli tidak ikut diekspor.
 *
 * Yang TIDAK bisa ditiru: font asli (nama/ukuran), border tebal/tipis, dan
 * gambar (pas foto). Pratinjau ini untuk memeriksa DATA dan SUSUNAN, bukan
 * pengganti hasil cetak — yang dicetak tetap berkas .xlsx-nya.
 */
import type { WorkBook, WorkSheet } from 'xlsx';

export interface PreviewOptions {
  /** Baris maksimum yang diekspor (default 60). */
  maxRows?: number;
  /** Kolom maksimum yang diekspor (default 26 = A..Z). */
  maxCols?: number;
}

function esc(v: unknown): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Baris baru di dalam sel (mis. "無\nTidak") harus jadi baris baru di layar.
    .replace(/\r?\n/g, '<br>');
}

interface Fill {
  patternType?: string;
  fgColor?: { rgb?: string };
}

function fillOf(ws: WorkSheet, addr: string): string {
  const cell = (ws as Record<string, { s?: Fill }>)[addr];
  const s = cell?.s;
  if (s?.patternType !== 'solid') return '';
  const rgb = s.fgColor?.rgb;
  if (!rgb) return '';
  // rgb bisa "FF8DB3E1" (ARGB) — ambil 6 digit terakhir.
  return rgb.slice(-6);
}

/** HTML `<table>` siap tempel, atau '' kalau berkasnya bukan .xlsx. */
export async function xlsxPreviewHtml(blob: Blob, opts: PreviewOptions = {}): Promise<string> {
  const XLSX = await import('xlsx');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Hanya .xlsx (ZIP, magic "PK"). Tanpa penjagaan ini SheetJS memperlakukan
  // teks apa pun sebagai CSV dan pratinjau menampilkan tabel palsu — lebih buruk
  // daripada "tidak bisa dipratinjau", karena terlihat seperti CV yang benar.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return '';

  // `cellStyles` supaya fill header ikut terbaca.
  const wb: WorkBook = XLSX.read(bytes, { type: 'array', cellStyles: true });
  const sheetName = wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : undefined;
  if (!ws) return '';

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  // Pangkas ke BARIS TERAKHIR YANG BERISI, bukan ke angka tetap: template ini
  // menyimpan baris kosong ber-style, dan batas tetap menyisakan baris kosong
  // di bawah form. `maxRows` tetap ada sebagai pagar.
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

  /* ── merge → rowspan/colspan ────────────────────────────────────────────── */
  const spans = new Map<string, { rs: number; cs: number }>();
  const covered = new Set<string>();
  for (const m of ws['!merges'] ?? []) {
    const tl = XLSX.utils.encode_cell({ r: m.s.r, c: m.s.c });
    spans.set(tl, { rs: m.e.r - m.s.r + 1, cs: m.e.c - m.s.c + 1 });
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r === m.s.r && c === m.s.c) continue;
        covered.add(XLSX.utils.encode_cell({ r, c }));
      }
    }
  }

  /* ── <colgroup> dari lebar kolom template ───────────────────────────────── */
  const cols = (ws['!cols'] ?? []).slice(0, range.e.c + 1);
  const colgroup = cols.length
    ? '<colgroup>' +
      cols.map((c) => {
        const w = c?.wpx ?? (c?.wch ? Math.round(c.wch * 7) : 0);
        return w ? `<col style="width:${w}px">` : '<col>';
      }).join('') +
      '</colgroup>'
    : '';

  /* ── baris & sel ────────────────────────────────────────────────────────── */
  const out: string[] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const rowInfo = (ws['!rows'] ?? [])[r];
    const h = rowInfo?.hpx ? ` style="height:${Math.round(rowInfo.hpx)}px"` : '';
    const cells: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (covered.has(addr)) continue;
      const cell = (ws as Record<string, { v?: unknown; w?: string }>)[addr];
      const span = spans.get(addr);
      const fill = fillOf(ws, addr);
      const attrs = [
        span && span.rs > 1 ? `rowspan="${span.rs}"` : '',
        span && span.cs > 1 ? `colspan="${span.cs}"` : '',
        `style="border:1px solid #7f7f7f;padding:1px 3px;vertical-align:middle;` +
          `font-size:9px;line-height:1.15;white-space:pre-wrap;` +
          (fill ? `background:#${fill};font-weight:700;text-align:center;` : '') +
          `"`,
      ].filter(Boolean).join(' ');
      const text = cell ? (cell.w ?? cell.v ?? '') : '';
      cells.push(`<td ${attrs}>${esc(text)}</td>`);
    }
    out.push(`<tr${h}>${cells.join('')}</tr>`);
  }

  return `<table id="cv-preview-table" style="border-collapse:collapse;table-layout:fixed">${colgroup}${out.join('')}</table>`;
}
