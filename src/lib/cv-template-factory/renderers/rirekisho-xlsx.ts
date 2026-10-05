/**
 * rirekisho-xlsx.ts — the rirekisho form as an .xlsx, filled from candidate data.
 *
 * WHAT THIS IS FOR
 * ----------------
 * The "Excel" option in `CvTemplateSelector` used to render `renderers/excel.ts`,
 * which writes a two-column `Field | Value` dump — nothing like the form the
 * branch actually uses. This renders the REAL rirekisho (履歴書) sheet, matching
 * the supplied workbook 1:1 in layout, with every value coming from the database.
 *
 * WHY IT PATCHES XML INSTEAD OF REBUILDING THE SHEET
 * --------------------------------------------------
 * SheetJS cannot WRITE cell styles — that is SheetJS Pro. Rebuilding the sheet from
 * a layout description would drop every border, fill, font and number format, and
 * the drawing layer with it, so the pas foto would vanish. Instead the template is
 * unzipped, `xl/worksheets/sheet1.xml` gets the values written into it, and the
 * parts are rezipped. Everything else — 26 column widths, 1000 row heights, all 83
 * merges, every cell's style index, the drawing — passes through untouched.
 *
 * WHY THE VALUES GO IN AS inlineStr
 * ---------------------------------
 * An inline string needs no `sharedStrings.xml` edit, so the patch stays confined
 * to one part. `xml:space="preserve"` keeps the form's significant leading and
 * trailing spaces (the labels themselves are full of them).
 *
 * EMPTY CELLS ARE NEVER REMOVED
 * -----------------------------
 * A cell with no data keeps its `<c r=".." s=".."/>` — the style, and therefore the
 * border and fill of that part of the form, survives with the cell. That is the
 * "leave every cell even when it is empty" requirement: the sheet is never trimmed,
 * so the form cannot come out shorter than the original.
 */
import type { CvTemplate, CandidateData, RenderContext, RenderResult } from '../types';
import { RIREKISHO_XLSX_BASE64 } from '../templates/rirekisho-xlsx.b64';
import { fmtMonthYearJp, isGood } from '../../helpers_cv';

const SHEET_PATH = 'xl/worksheets/sheet1.xml';
const DRAWING_PATH = 'xl/drawings/drawing1.xml';
const PHOTO_PART = 'xl/media/image1.png';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** The pas-foto anchor, copied from the source workbook: col 0, row 3, 3.00in x 3.86in. */
const PHOTO_BOX = { cx: 2743200, cy: 3533775 };

/** How many rows each list section of the form provides. */
const EDU_ROWS = 3;
const JOB_ROWS = 2;
const FAM_ROWS = 6;

function s(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

/** XML text escape. The form is full of `&` and the values are free text. */
function xmlEscape(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Write one value into one cell, keeping that cell's style index.
 *
 * Handles both shapes the template can hold — `<c r="D6" s="12"/>` (what every
 * emptied value cell looks like) and `<c r="D6" s="12" t="s"><v>3</v></c>` — and
 * strips any stale `t=` so an inline string never inherits a shared-string type.
 */
export function setCell(xml: string, addr: string, value: string): string {
  const re = new RegExp(`<c r="${addr}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  const m = re.exec(xml);
  if (!m) return xml;
  const attrs = m[1].replace(/\s+t="[^"]*"/g, '');
  const cell = value === ''
    ? `<c r="${addr}"${attrs}/>`
    : `<c r="${addr}"${attrs} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
  return xml.slice(0, m.index) + cell + xml.slice(m.index + m[0].length);
}

/* ── value formatting, mirroring the vocabulary the printed form uses ───────── */

/** The form writes "TIDAK　（無）" for a negative/absent yes-no field. */
function yesNo(raw: unknown, yesLabel?: string): string {
  const t = s(raw).trim();
  if (!isGood(t) || /^(tidak|no|none|-|無)$/i.test(t)) return 'TIDAK\u3000（無）';
  return yesLabel ? yesLabel : t;
}

function genderLabel(raw: unknown): string {
  const t = s(raw).toUpperCase();
  if (t.includes('PEREMPUAN') || t.includes('WANITA')) return 'PEREMPUAN (女)';
  if (t.includes('LAKI') || t.includes('PRIA')) return 'LAKI-LAKI (男)';
  return s(raw);
}

function maritalLabel(raw: unknown): string {
  const t = s(raw).toUpperCase();
  if (!isGood(t)) return '';
  if (t.includes('BELUM') || t.includes('SINGLE')) return 'BELUM MENIKAH\u3000（未婚）';
  if (t.includes('MENIKAH') || t.includes('KAWIN')) return 'MENIKAH\u3000（既婚）';
  return s(raw);
}

const AGAMA_JP: Record<string, string> = {
  ISLAM: 'イスラム', KRISTEN: 'キリスト教', KATOLIK: 'カトリック',
  HINDU: 'ヒンドゥー教', BUDHA: '仏教', BUDDHA: '仏教', KONGHUCU: '儒教',
};

function agamaLabel(raw: unknown): string {
  const t = s(raw).toUpperCase().trim();
  if (!isGood(t)) return '';
  const jp = AGAMA_JP[t];
  return jp ? `${s(raw)}\u3000（${jp}）` : s(raw);
}

function handLabel(raw: unknown): string {
  const t = s(raw).toUpperCase();
  if (t.includes('KANAN') || t.includes('RIGHT')) return 'KANAN  (右)';
  if (t.includes('KIRI') || t.includes('LEFT')) return 'KIRI  (左)';
  return s(raw);
}

/** Month-year for the education/work period columns, as the printed form shows it. */
function period(v: unknown): string {
  return isGood(v) ? fmtMonthYearJp(s(v)) : '';
}

/**
 * The 生年月日 cell (`D10`) is styled `yyyy"年"m"月"d"日"` in the source workbook, so
 * the DAY is part of what the form shows. `fmtMonthYearJp` stops at the month —
 * correct for the 期間 columns, one field short here. Values go in as text, so the
 * cell's own number format never gets a chance to supply the day.
 */
function birthDate(v: unknown): string {
  const raw = s(v).trim();
  if (!isGood(raw)) return '';
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(raw);
  if (m) return `${m[1]}年${parseInt(m[2], 10)}月${parseInt(m[3], 10)}日`;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`;
}

function currency(v: unknown): string {
  const t = s(v).replace(/[^\d]/g, '');
  return t === '' ? '' : `¥   ${t}`;
}

/**
 * Build the `cell -> value` map. Cells absent from this map are simply left as the
 * template has them, which is why nothing needs deleting to "blank" the form.
 */
export function buildValues(data: CandidateData): Record<string, string> {
  const id = data.identitas;
  const raw = data.raw as Record<string, unknown>;
  const cells: Record<string, string> = {
    /* ── identity block ─────────────────────────────────────────────────── */
    E4: s(raw.idKandidat ?? raw.id_kandidat ?? raw.nomorPeserta),
    H4: genderLabel(id.gender),
    H5: s(id.umur),
    D6: s(id.nama_lengkap),
    D7: s(id.katakana),
    H6: s(data.fisik.tb),
    H7: s(data.fisik.bb),
    E8: s(id.panggilan),
    H8: s(id.golongan_darah),
    H9: maritalLabel(id.status_nikah),
    D10: birthDate(id.tgl_lahir),
    H10: agamaLabel(id.agama),
    D12: s(id.tempat_lahir),
    H11: yesNo(id.status_eks_jepang, s(id.status_eks_jepang)),
    H12: yesNo(id.paspor, s(id.paspor)),
    D13: 'インドネシア',
    H13: handLabel(data.fisik.tangan_dominan),
    E14: s(id.hp),
    H14: yesNo(data.medis.riwayat_medis, s(data.medis.riwayat_medis)),
    /* ── address ────────────────────────────────────────────────────────── */
    A16: s(id.alamat),
    A17: s(id.alamat_jp),
  };

  /* ── education (fixed row count — the rest stay empty, never trimmed) ───── */
  for (let i = 0; i < EDU_ROWS; i++) {
    const row = 20 + i;
    const p = (data.pendidikan[i] || {}) as Record<string, unknown>;
    const masuk = p.masuk ?? p.tahun_masuk;
    const lulus = p.lulus ?? p.tahun_lulus;
    const sekolah = p.sekolah ?? p.nama_sekolah ?? p.sekolah_id;
    const jurusan = p.jurusan ?? p.jurusan_id;
    cells[`A${row}`] = period(masuk);
    cells[`B${row}`] = isGood(masuk) || isGood(lulus) ? '-' : '';
    cells[`C${row}`] = period(lulus);
    cells[`D${row}`] = s(sekolah);
    cells[`F${row}`] = s(jurusan);
  }

  /* ── work ───────────────────────────────────────────────────────────── */
  for (let i = 0; i < JOB_ROWS; i++) {
    const row = 25 + i;
    const p = (data.pekerjaan[i] || {}) as Record<string, unknown>;
    const masuk = p.masuk ?? p.tahun_masuk;
    const keluar = p.keluar ?? p.tahun_keluar;
    const now = /SEKARANG|IMA/i.test(s(keluar));
    cells[`A${row}`] = period(masuk);
    cells[`B${row}`] = isGood(masuk) || isGood(keluar) ? '-' : '';
    cells[`C${row}`] = now ? '現在に至る' : period(keluar);
    cells[`D${row}`] = s(p.perusahaan ?? p.nama_perusahaan ?? p.perusahaan_id);
    cells[`F${row}`] = s(p.jabatan ?? p.jabatan_id);
    cells[`I${row}`] = currency(p.gaji ?? p.penghasilan);
  }

  /* ── family ─────────────────────────────────────────────────────────── */
  for (let i = 0; i < FAM_ROWS; i++) {
    const row = 29 + i;
    const p = (data.keluarga[i] || {}) as Record<string, unknown>;
    const usia = s(p.usia ?? p.umur).replace(/\D/g, '');
    cells[`A${row}`] = s(p.hubungan);
    cells[`D${row}`] = s(p.nama);
    cells[`F${row}`] = usia ? `${usia}歳` : '歳';
    cells[`G${row}`] = s(p.pekerjaan);
    cells[`I${row}`] = currency(p.gaji ?? p.penghasilan);
  }

  /* ── personal statement ─────────────────────────────────────────────── */
  cells.D36 = s(data.wawancara.tujuan_ke_jepang_jp) || s(data.wawancara.tujuan_ke_jepang);
  cells.D37 = s(data.wawancara.rencana_pulang_jp) || s(data.wawancara.rencana_pulang);
  cells.D38 = s(data.wawancara.kelebihan_jp) || s(data.wawancara.kelebihan);
  cells.D39 = s(data.wawancara.kekurangan_jp) || s(data.wawancara.kekurangan);
  cells.D40 = s(data.wawancara.hobi_jp) || s(data.wawancara.hobi);

  /* ── certificates ───────────────────────────────────────────────────── */
  cells.C42 = yesNo(data.sertifikasi.jft, s(data.sertifikasi.jft));
  cells.F42 = yesNo(data.sertifikasi.sim ?? data.identitas.sim, s(data.sertifikasi.sim ?? data.identitas.sim));

  /* ── relatives in Japan ─────────────────────────────────────────────── */
  const ken = data.kenalan_jepang;
  const hasKin = isGood(ken.nama_id) || isGood(ken.nama_jp);
  cells.A45 = hasKin ? (s(ken.nama_jp) || s(ken.nama_id)) : '無し';

  return cells;
}

/**
 * Fit the photo inside the template's anchor box WITHOUT changing its aspect
 * ratio, and centre it there. The supplied CV's photo is 288x371 px, which at
 * 96 DPI is exactly the anchor size — so a same-shape photo reproduces the
 * original placement, and any other shape letterboxes instead of stretching.
 */
export function fitPhoto(naturalW: number, naturalH: number) {
  if (!naturalW || !naturalH) return { ...PHOTO_BOX, colOff: 0, rowOff: 0 };
  const scale = Math.min(PHOTO_BOX.cx / naturalW, PHOTO_BOX.cy / naturalH);
  const cx = Math.round(naturalW * scale);
  const cy = Math.round(naturalH * scale);
  return {
    cx,
    cy,
    colOff: Math.round((PHOTO_BOX.cx - cx) / 2),
    rowOff: Math.round((PHOTO_BOX.cy - cy) / 2),
  };
}

/** Normalise any fetched image to PNG at the fitted pixel size. */
async function photoToPngBytes(url: string, fit: { cx: number; cy: number }): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const src = await res.blob();
    const bmp = await createImageBitmap(src);
    // EMU -> CSS px at 96 DPI (914400 EMU = 1in = 96px)
    const w = Math.max(1, Math.round((fit.cx / 914400) * 96));
    const h = Math.max(1, Math.round((fit.cy / 914400) * 96));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!out) return null;
    return new Uint8Array(await out.arrayBuffer());
  } catch {
    return null; // CORS, offline, or an unsupported format — leave the cell empty
  }
}

/** Patch the drawing so the picture keeps the fitted size and stays centred. */
export function patchAnchor(xml: string, fit: { cx: number; cy: number; colOff: number; rowOff: number }): string {
  return xml
    .replace(/<xdr:ext cx="\d+" cy="\d+"\/>/, `<xdr:ext cx="${fit.cx}" cy="${fit.cy}"/>`)
    .replace(/(<xdr:from><xdr:col>\d+<\/xdr:col><xdr:colOff>)\d+(<\/xdr:colOff>)/, `$1${fit.colOff}$2`)
    .replace(/(<xdr:row>\d+<\/xdr:row><xdr:rowOff>)\d+(<\/xdr:rowOff>)/, `$1${fit.rowOff}$2`);
}

/** Build the workbook. Exported so the geometry can be asserted in a test. */
export async function buildRirekishoWorkbook(data: CandidateData): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(base64ToBytes(RIREKISHO_XLSX_BASE64));

  const sheetFile = zip.file(SHEET_PATH);
  if (!sheetFile) throw new Error(`Template tidak valid: ${SHEET_PATH} tidak ada`);
  let sheet = await sheetFile.async('string');
  for (const [addr, value] of Object.entries(buildValues(data))) {
    sheet = setCell(sheet, addr, value);
  }
  zip.file(SHEET_PATH, sheet);

  const photoUrl = s(data.uploads.photo);
  if (isGood(photoUrl)) {
    const probe = await photoToPngBytes(photoUrl, PHOTO_BOX).catch(() => null);
    if (probe) {
      // Re-derive the fit from the real pixel size of the normalised PNG.
      const bmp = await createImageBitmap(new Blob([probe], { type: 'image/png' })).catch(() => null);
      if (bmp) {
        const fit = fitPhoto(bmp.width, bmp.height);
        const bytes = await photoToPngBytes(photoUrl, fit);
        if (bytes) {
          zip.file(PHOTO_PART, bytes);
          const drawFile = zip.file(DRAWING_PATH);
          if (drawFile) zip.file(DRAWING_PATH, patchAnchor(await drawFile.async('string'), fit));
        }
      }
    }
  }

  return zip.generateAsync({ type: 'blob', mimeType: XLSX_MIME, compression: 'DEFLATE' });
}

const template: CvTemplate = {
  id: 'rirekisho-xlsx',
  name: 'Rirekisho Excel (Form Asli)',
  type: 'xlsx',
  description:
    'Form rirekisho 履歴書 asli sebagai Excel — ukuran kolom, tinggi baris, merge, dan sel pas foto persis template; data diisi dari database.',
  category: 'form',
  icon: 'file-excel',
  async render(data: CandidateData, _context: RenderContext): Promise<RenderResult> {
    try {
      const blob = await buildRirekishoWorkbook(data);
      const nama = s(data.identitas.nama_lengkap).replace(/[^a-zA-Z0-9]/g, '_') || 'kandidat';
      return { success: true, mimeType: blob.type, fileName: `CV_Rirekisho_${nama}.xlsx`, blob };
    } catch (e: unknown) {
      return { success: false, mimeType: '', fileName: '', error: e instanceof Error ? e.message : 'Excel render error' };
    }
  },
};

export default template;
