/**
 * preview.ts — workbook .xlsx hasil render → HTML yang menyerupai form aslinya.
 *
 * KENAPA ADA
 * ----------
 * Pemilik 2026-10-26: "pilihan template ada preview hasil data nya, jgn langsung
 * download" — lalu, setelah melihat versi pertama: "kok keluarnya jelek bener ga
 * nampak sesuai aslinya?".
 *
 * KENAPA DITULIS ULANG (2026-11-14)
 * ---------------------------------
 * Versi sebelumnya membaca berkasnya lewat SheetJS lalu menggambar SETIAP sel
 * dengan garis 1px abu-abu yang sama. SheetJS edisi gratis hanya membawa `fill`
 * dari `styles.xml` — border, font, dan alignment tidak ikut terbaca — jadi
 * hasilnya kertas grafik, bukan form. Pemilik: "preview nya model bukan hasil
 * jadi ... gak proporsional dan kelihatan messy".
 *
 * Tiga cacat terukur pada versi itu, semuanya diperbaiki di sini:
 *
 *   1. GARIS DI MANA-MANA. `border:1px solid #7f7f7f` dipasang di setiap <td>,
 *      termasuk sel kosong yang di form aslinya tidak bergaris. Sekarang border
 *      dibaca per sisi dari `styles.xml` (`<border><left style="thin">…`), jadi
 *      yang bergaris hanya kotak yang memang kotak.
 *   2. KOLOM DIPOTONG DI Z. `maxCols` default 26 memotong form yang lebih lebar
 *      dari 26 kolom tanpa pesan apa pun: `jipa` butuh AA dan `kinki` butuh 31
 *      kolom (kolom 32..93 memang `hidden="1"`, tapi 27..31 terlihat). Sekarang
 *      kolom hidden dihormati dan batasnya 40.
 *   3. TEKS DIPAKSA 9px BOLD CENTER. Form aslinya memakai 6–20pt dengan
 *      perataan sendiri. Sekarang font (ukuran/tebal/miring), warna, dan
 *      alignment diambil dari `cellXfs`.
 *
 * Yang tetap tidak bisa ditiru: gambar (pas foto di drawing layer) dan batas
 * halaman cetak. Pratinjau ini untuk memeriksa DATA dan SUSUNAN, bukan pengganti
 * hasil cetak — yang dicetak tetap berkas .xlsx-nya.
 *
 * `xlsx` (488 KB) tidak lagi dimuat untuk pratinjau; JSZip sudah dipakai
 * `renderers/xlsx-form.ts`, jadi tidak ada dependensi baru.
 */

export interface PreviewOptions {
  /** Baris maksimum yang diekspor (default 200). */
  maxRows?: number;
  /** Kolom maksimum yang diekspor (default 40). */
  maxCols?: number;
  /**
   * Lebar (px) yang ingin diisi form. Form yang lebih sempit dari ini diperbesar
   * supaya tidak mengambang kecil di tengah modal — pemilik menyebutnya "gak
   * proporsional". Form yang LEBIH LEBAR tidak pernah dikecilkan: mengecilkan
   * `kaigo-hyogo` (3.180 px) ke 1.080 px membuat huruf 6pt jadi 2px. Yang lebar
   * tetap lebar dan digeser mendatar, persis seperti Excel.
   */
  fitWidth?: number;
}

/* ── warna & border ─────────────────────────────────────────────────────────── */

/** Indeks `theme` OOXML → hex. Hanya 16 pertama yang dipakai template CV. */
const THEME: readonly string[] = [
  '#ffffff', '#000000', '#e7e6e6', '#44546a', '#4472c4', '#ed7d31', '#a5a5a5', '#ffc000',
  '#5b9bd5', '#70ad47', '#264478', '#9e480e', '#636363', '#997300', '#255e91', '#43682b',
];

/** Ketebalan garis OOXML dalam px. */
const BORDER_WIDTH: Record<string, number> = {
  hair: 1, thin: 1, dotted: 1, dashed: 1, dashDot: 1, dashDotDot: 1, slantDashDot: 1,
  medium: 2, mediumDashed: 2, mediumDashDot: 2, mediumDashDotDot: 2,
  thick: 3, double: 3,
};

/** Gaya garis CSS untuk `style` OOXML. */
const BORDER_STYLE: Record<string, string> = {
  dotted: 'dotted', dashed: 'dashed', dashDot: 'dashed', dashDotDot: 'dashed',
  mediumDashed: 'dashed', mediumDashDot: 'dashed', mediumDashDotDot: 'dashed',
  slantDashDot: 'dashed', double: 'double',
};

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
type Side = (typeof SIDES)[number];

interface BorderSide {
  w: number;
  css: string;
  color: string;
}

/* ── util XML ───────────────────────────────────────────────────────────────── */

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '<br>');
}

function decodeEntities(v: string): string {
  return v
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');
}

/** `name="nilai"` dari sekumpulan atribut. */
function attr(attrs: string | null | undefined, name: string): string | null {
  if (!attrs) return null;
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs);
  return m ? m[1] : null;
}

/** Isi `<name …>…</name>`; `inner` kosong kalau elemennya self-closing. */
function block(xml: string, name: string): { attrs: string; inner: string } | null {
  const m = new RegExp(`<${name}((?:\\s[^>]*?)?)(?:/>|>([\\s\\S]*?)</${name}>)`).exec(xml);
  if (!m) return null;
  return { attrs: m[1] ?? '', inner: m[2] ?? '' };
}

/** Semua elemen `<name>` — self-closing maupun berpasangan. */
function blocks(xml: string, name: string): { attrs: string; inner: string }[] {
  const re = new RegExp(`<${name}((?:\\s[^>]*?)?)(?:/>|>([\\s\\S]*?)</${name}>)`, 'g');
  const out: { attrs: string; inner: string }[] = [];
  for (const m of xml.matchAll(re)) out.push({ attrs: m[1] ?? '', inner: m[2] ?? '' });
  return out;
}

function section(xml: string, name: string): string {
  return block(xml, name)?.inner ?? '';
}

/** `<color rgb="FF000000"/>` → '#000000'. `theme` dipetakan lewat THEME. */
function colorOf(attrs: string | null | undefined): string | null {
  if (!attrs) return null;
  const rgb = /rgb="([0-9A-Fa-f]{6,8})"/.exec(attrs);
  if (rgb) return `#${rgb[1].slice(-6).toLowerCase()}`;
  const theme = /theme="(\d+)"/.exec(attrs);
  if (theme) return THEME[Number(theme[1])] ?? null;
  return null;
}

/* ── styles.xml ─────────────────────────────────────────────────────────────── */

interface Font {
  bold: boolean;
  italic: boolean;
  /** Ukuran dalam pt, apa adanya dari berkas. */
  size: number;
  color: string | null;
}

interface Xf {
  numFmtId: number;
  fontId: number;
  fillId: number;
  borderId: number;
  h: string | null;
  v: string | null;
  wrap: boolean;
}

interface Styles {
  fonts: Font[];
  fills: (string | null)[];
  borders: Record<Side, BorderSide | null>[];
  xfs: Xf[];
  /** `numFmtId` kustom → `formatCode`. */
  formats: Map<number, string>;
}

function parseStyles(xml: string): Styles {
  const fonts = blocks(section(xml, 'fonts'), 'font').map((f) => {
    const b = block(f.inner, 'b');
    const i = block(f.inner, 'i');
    const sz = block(f.inner, 'sz');
    const color = block(f.inner, 'color');
    return {
      bold: b ? attr(b.attrs, 'val') !== '0' : false,
      italic: i ? attr(i.attrs, 'val') !== '0' : false,
      size: Number(attr(sz?.attrs, 'val') ?? 11) || 11,
      color: colorOf(color?.attrs),
    };
  });

  const fills = blocks(section(xml, 'fills'), 'fill').map((f) => {
    const pf = block(f.inner, 'patternFill');
    if (!pf || attr(pf.attrs, 'patternType') !== 'solid') return null;
    return colorOf(block(pf.inner, 'fgColor')?.attrs);
  });

  const borders = blocks(section(xml, 'borders'), 'border').map((b) => {
    const out = {} as Record<Side, BorderSide | null>;
    for (const side of SIDES) {
      const el = block(b.inner, side);
      const style = attr(el?.attrs, 'style');
      if (!el || !style) {
        out[side] = null;
        continue;
      }
      out[side] = {
        w: BORDER_WIDTH[style] ?? 1,
        css: BORDER_STYLE[style] ?? 'solid',
        color: colorOf(block(el.inner, 'color')?.attrs) ?? '#000000',
      };
    }
    return out;
  });

  const xfs = blocks(section(xml, 'cellXfs'), 'xf').map((x) => {
    const align = block(x.inner, 'alignment');
    return {
      numFmtId: Number(attr(x.attrs, 'numFmtId') ?? 0) || 0,
      fontId: Number(attr(x.attrs, 'fontId') ?? 0) || 0,
      fillId: Number(attr(x.attrs, 'fillId') ?? 0) || 0,
      borderId: Number(attr(x.attrs, 'borderId') ?? 0) || 0,
      h: attr(align?.attrs, 'horizontal'),
      v: attr(align?.attrs, 'vertical'),
      wrap: attr(align?.attrs, 'wrapText') === '1',
    };
  });

  const formats = new Map<number, string>();
  for (const f of blocks(section(xml, 'numFmts'), 'numFmt')) {
    const id = Number(attr(f.attrs, 'numFmtId') ?? 0);
    const code = attr(f.attrs, 'formatCode');
    if (id && code) formats.set(id, decodeEntities(code));
  }

  return { fonts, fills, borders, xfs, formats };
}

/* ── format angka ───────────────────────────────────────────────────────────── */

/** `numFmtId` bawaan Excel yang berarti TANGGAL. */
const BUILTIN_DATE: Record<number, string> = {
  14: 'yyyy/m/d',
  15: 'd/mmm/yyyy',
  16: 'd/mmm/yyyy',
  17: 'mmm/yyyy',
  22: 'yyyy/m/d h:mm',
};

/** Serial Excel (1899-12-30 = 0) → string sesuai `formatCode`. */
function formatSerial(serial: number, code: string): string {
  const d = new Date(Math.round((serial - 25569) * 86400000));
  const Y = d.getUTCFullYear();
  const M = d.getUTCMonth() + 1;
  const D = d.getUTCDate();
  let out = '';
  for (let i = 0; i < code.length; ) {
    const ch = code[i];
    if (ch === '"') {
      const end = code.indexOf('"', i + 1);
      out += code.slice(i + 1, end < 0 ? code.length : end);
      i = end < 0 ? code.length : end + 1;
      continue;
    }
    if (ch === '\\') {
      out += code[i + 1] ?? '';
      i += 2;
      continue;
    }
    const token = /^(yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d)/i.exec(code.slice(i));
    if (token) {
      const t = token[1].toLowerCase();
      if (t === 'yyyy') out += String(Y);
      else if (t === 'yy') out += String(Y).slice(-2);
      else if (t === 'mm') out += String(M).padStart(2, '0');
      else if (t === 'm') out += String(M);
      else if (t === 'dd') out += String(D).padStart(2, '0');
      else if (t === 'd') out += String(D);
      else out += String(D);
      i += token[1].length;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Nilai numerik sel → teks, menghormati `numFmtId` sel itu. */
function formatNumeric(raw: string, numFmtId: number, styles: Styles): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;

  const code = styles.formats.get(numFmtId) ?? BUILTIN_DATE[numFmtId] ?? '';
  // Format tanggal dikenali dari `y`/`d` di luar literal berkutip — `0.00` dan
  // `#,##0` tidak mengandung keduanya.
  const bare = code.replace(/"[^"]*"/g, '');
  if (code && /[yd]/i.test(bare)) return formatSerial(n, code);

  if (/[#0],/.test(code)) {
    const decimals = /\.(0+)/.exec(code)?.[1].length ?? 0;
    return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(6)));
}

/* ── worksheet ──────────────────────────────────────────────────────────────── */

function colIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref);
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

interface Cell {
  col: number;
  text: string;
  xf: number;
}

interface Row {
  index: number;
  /** Tinggi dalam px, atau null kalau baris memakai tinggi bawaan. */
  height: number | null;
  hidden: boolean;
  cells: Cell[];
}

export async function xlsxPreviewHtml(blob: Blob, opts: PreviewOptions = {}): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Hanya .xlsx (ZIP, magic "PK"). Tanpa penjagaan ini pembaca apa pun
  // memperlakukan teks sebagai CSV dan pratinjau menampilkan tabel palsu — lebih
  // buruk daripada "tidak bisa dipratinjau", karena terlihat seperti CV benar.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return '';

  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytes);

  const [workbookXml, relsXml, stylesXml, sharedXml] = await Promise.all([
    zip.file('xl/workbook.xml')?.async('string') ?? Promise.resolve(''),
    zip.file('xl/_rels/workbook.xml.rels')?.async('string') ?? Promise.resolve(''),
    zip.file('xl/styles.xml')?.async('string') ?? Promise.resolve(''),
    zip.file('xl/sharedStrings.xml')?.async('string') ?? Promise.resolve(''),
  ]);

  // Lembar pertama lewat rels, bukan menebak 'sheet1.xml' — template kustom
  // (unggahan admin) boleh punya nama berkas lain.
  const firstSheet = block(section(workbookXml, 'sheets'), 'sheet');
  const relId = attr(firstSheet?.attrs, 'r:id');
  let sheetPath = 'xl/worksheets/sheet1.xml';
  if (relId) {
    const rel = blocks(section(relsXml, 'Relationships'), 'Relationship').find(
      (r) => attr(r.attrs, 'Id') === relId,
    );
    const target = attr(rel?.attrs, 'Target');
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  }
  const sheetXml = (await zip.file(sheetPath)?.async('string')) ?? '';
  if (!sheetXml) return '';

  const shared = blocks(section(sharedXml, 'sst'), 'si').map((si) =>
    decodeEntities(
      [...si.inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''),
    ),
  );

  const styles = parseStyles(stylesXml);

  /* ── kolom: lebar + hidden ──────────────────────────────────────────────── */
  const maxCols = opts.maxCols ?? 40;
  const colWidth: number[] = [];
  const colHidden: boolean[] = [];
  for (const c of blocks(section(sheetXml, 'cols'), 'col')) {
    const min = Number(attr(c.attrs, 'min') ?? 0);
    const max = Number(attr(c.attrs, 'max') ?? min);
    const w = Number(attr(c.attrs, 'width') ?? 0);
    const hidden = attr(c.attrs, 'hidden') === '1';
    // `width` dalam satuan karakter; rumus Excel untuk Calibri 11 ≈ w*7+5 px.
    const px = w > 0 ? Math.round(w * 7 + 5) : 0;
    for (let i = min; i <= max && i <= maxCols + 1; i++) {
      colWidth[i - 1] = px;
      colHidden[i - 1] = hidden;
    }
  }

  /* ── baris & sel ────────────────────────────────────────────────────────── */
  const maxRows = opts.maxRows ?? 200;
  const rows: Row[] = [];
  let lastRow = -1;
  let lastCol = -1;
  /** Baris terakhir yang berisi TEKS — batas bawah yang digambar. */
  let lastTextRow = -1;

  for (const r of blocks(sheetXml, 'row')) {
    const index = Number(attr(r.attrs, 'r') ?? rows.length + 1);
    if (index > maxRows) break;
    const ht = Number(attr(r.attrs, 'ht') ?? 0);
    const cells: Cell[] = [];
    for (const c of blocks(r.inner, 'c')) {
      const ref = attr(c.attrs, 'r') ?? '';
      const col = colIndex(ref);
      if (col < 0 || col >= maxCols) continue;
      const xf = Number(attr(c.attrs, 's') ?? 0) || 0;
      const type = attr(c.attrs, 't');

      let text = '';
      if (type === 'inlineStr') {
        text = decodeEntities(
          [...c.inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''),
        );
      } else {
        const v = block(c.inner, 'v');
        if (v) {
          if (type === 's') text = shared[Number(v.inner)] ?? '';
          else if (type === 'b') text = v.inner === '1' ? 'TRUE' : 'FALSE';
          else if (type === 'str' || type === 'e') text = decodeEntities(v.inner);
          // Tanggal di form ini disimpan sebagai serial Excel (36633), bukan
          // teks: tanpa `numFmtId` sel itu tercetak sebagai angka mentah.
          else text = formatNumeric(v.inner, styles.xfs[xf]?.numFmtId ?? 0, styles);
        }
      }
      // Sel KOSONG pun bagian dari bentuk kalau ia ber-fill atau bergaris:
      // pita judul berwarna dan kotak kosong di bawah form tidak boleh hilang
      // hanya karena tidak ada teks di dalamnya.
      if (!text) {
        const def = styles.xfs[xf];
        const fill = def ? styles.fills[def.fillId] : null;
        const border = def ? styles.borders[def.borderId] : undefined;
        const shaped = !!fill || (!!border && SIDES.some((s) => border[s]));
        if (!shaped) continue;
      }
      if (text) lastTextRow = index - 1;
      cells.push({ col, text, xf });
      if (col > lastCol) lastCol = col;
    }
    if (cells.length) lastRow = index - 1;
    rows.push({
      index,
      height: ht > 0 ? Math.round((ht * 96) / 72) : null,
      hidden: attr(r.attrs, 'hidden') === '1',
      cells,
    });
  }

  if (!rows.length) return '';

  /* ── rentang yang digambar ──────────────────────────────────────────────── */
  // Baris disimpan per NOMOR baris, bukan per posisi: `kinki` mulai dari r="2",
  // jadi `rows[0]` bukan baris 1.
  const byIndex = new Map<number, Row>();
  for (const row of rows) byIndex.set(row.index - 1, row);
  const firstRow = Math.min(...byIndex.keys());
  // Batas bawah = baris terakhir yang berisi TEKS, bukan baris terakhir yang
  // bergaris: template menyimpan ratusan sel bergaris jauh di bawah form, dan
  // memasukkannya menggambar satu kotak kosong raksasa di bawah CV.
  const lastVisibleRow = Math.min(Math.max(lastTextRow, firstRow), lastRow, maxRows - 1);
  const lastVisibleCol = Math.min(maxCols - 1, lastCol);

  const visibleCols: number[] = [];
  for (let c = 0; c <= lastVisibleCol; c++) if (!colHidden[c]) visibleCols.push(c);
  if (!visibleCols.length) return '';

  // Form sempit diperbesar supaya mengisi modal; form lebar TIDAK dikecilkan.
  const natural = visibleCols.reduce((sum, c) => sum + (colWidth[c] || 64), 0);
  const target = opts.fitWidth ?? 1080;
  const k = natural > 0 ? Math.min(1.6, Math.max(1, target / natural)) : 1;

  const cssCache = new Map<number, string>();
  const cellCss = (xfIndex: number): string => {
    const cached = cssCache.get(xfIndex);
    if (cached !== undefined) return cached;

    const xf = styles.xfs[xfIndex] ?? styles.xfs[0];
    const parts: string[] = ['padding:0 2px', 'vertical-align:middle', 'overflow:hidden'];

    const font = xf ? styles.fonts[xf.fontId] : undefined;
    if (font) {
      parts.push(`font-size:${Math.max(4, Math.round(font.size * 1.333 * k))}px`);
      if (font.bold) parts.push('font-weight:700');
      if (font.italic) parts.push('font-style:italic');
      parts.push(`color:${font.color ?? '#000000'}`);
    }
    if (xf?.wrap) parts.push('white-space:pre-wrap', 'word-break:break-word');
    else parts.push('white-space:pre');

    const fill = xf ? styles.fills[xf.fillId] : null;
    if (fill) parts.push(`background:${fill}`);

    const border = xf ? styles.borders[xf.borderId] : undefined;
    for (const side of SIDES) {
      const b = border?.[side];
      parts.push(
        b
          ? `border-${side}:${Math.max(1, Math.round(b.w * k))}px ${b.css} ${b.color}`
          : `border-${side}:none`,
      );
    }

    if (xf?.h) parts.push(`text-align:${xf.h === 'centerContinuous' ? 'center' : xf.h}`);
    if (xf?.v === 'top') parts.push('vertical-align:top');
    else if (xf?.v === 'bottom') parts.push('vertical-align:bottom');

    const css = parts.join(';');
    cssCache.set(xfIndex, css);
    return css;
  };

  /* ── merge → rowspan/colspan ────────────────────────────────────────────── */
  const spanAt = new Map<string, { rs: number; cs: number }>();
  const covered = new Set<string>();
  for (const m of blocks(section(sheetXml, 'mergeCells'), 'mergeCell')) {
    const ref = attr(m.attrs, 'ref') ?? '';
    const [start, end] = ref.split(':');
    const r1 = Number(/(\d+)/.exec(start ?? '')?.[1] ?? 1) - 1;
    const c1 = colIndex(start ?? '');
    const r2 = Number(/(\d+)/.exec(end ?? start ?? '')?.[1] ?? 1) - 1;
    const c2 = colIndex(end ?? start ?? '');
    if (c1 < 0 || c2 < 0) continue;
    spanAt.set(`${r1},${c1}`, { rs: r2 - r1 + 1, cs: c2 - c1 + 1 });
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (r === r1 && c === c1) continue;
        covered.add(`${r},${c}`);
      }
    }
  }

  /* ── HTML ───────────────────────────────────────────────────────────────── */
  const colgroup =
    '<colgroup>' +
    visibleCols.map((c) => `<col style="width:${Math.round((colWidth[c] || 64) * k)}px">`).join('') +
    '</colgroup>';

  const body: string[] = [];
  for (let r = firstRow; r <= lastVisibleRow; r++) {
    const row = byIndex.get(r);
    if (row?.hidden) continue;
    const h = row?.height ? ` style="height:${Math.round(row.height * k)}px"` : '';
    const tds: string[] = [];
    for (const c of visibleCols) {
      const key = `${r},${c}`;
      if (covered.has(key)) continue;
      const cell = row?.cells.find((x) => x.col === c);
      const span = spanAt.get(key);
      const attrs = [
        span && span.rs > 1 ? `rowspan="${span.rs}"` : '',
        span && span.cs > 1 ? `colspan="${span.cs}"` : '',
        `style="${cellCss(cell?.xf ?? 0)}"`,
      ].filter(Boolean).join(' ');
      tds.push(`<td ${attrs}>${cell ? esc(cell.text) : ''}</td>`);
    }
    if (!tds.length) continue;
    body.push(`<tr${h}>${tds.join('')}</tr>`);
  }

  const width = Math.round(natural * k);
  return (
    `<table id="cv-preview-table" style="border-collapse:collapse;table-layout:fixed;` +
    `background:#fff;width:${width}px">${colgroup}${body.join('')}</table>`
  );
}
