/**
 * xlsx-form.ts — mesin bersama untuk template CV berformat .xlsx asli.
 *
 * KENAPA MESIN, BUKAN DUA SALINAN
 * -------------------------------
 * Dua form (rirekisho ASJ dan form "FIRMA ELGA PRATAMA") memakai trik yang
 * sama: buka zip template, tulis nilai ke `xl/worksheets/sheet1.xml`, ganti
 * bagian foto, patch anchor gambar, lalu zip ulang. Yang berbeda hanya peta
 * selnya. Menyalin 300 baris untuk form kedua berarti dua tempat yang harus
 * diperbaiki setiap kali ada bug di penulisan XML — jadi bagian yang tidak
 * bergantung pada layout tinggal di sini.
 *
 * MENGAPA XML YANG DITAMBAL, BUKAN SHEET YANG DIBANGUN ULANG
 * ----------------------------------------------------------
 * SheetJS (edisi gratis) tidak bisa MENULIS style sel — itu SheetJS Pro.
 * Membangun ulang sheet dari deskripsi layout akan membuang seluruh border,
 * fill, font, number format, dan lapisan drawing (pas foto ikut hilang).
 * Menambal XML workbook asli mempertahankan 100%-nya.
 *
 * NILAI MASUK SEBAGAI `inlineStr`
 * -------------------------------
 * String inline tidak perlu menyentuh `sharedStrings.xml`, jadi tambalan tetap
 * di satu part. `xml:space="preserve"` menjaga spasi awal/akhir yang memang
 * bermakna di form ini (labelnya penuh spasi).
 *
 * SEL KOSONG TIDAK PERNAH DIHAPUS
 * -------------------------------
 * Sel tanpa data tetap `<c r=".." s=".."/>` — style-nya, jadi border dan fill
 * bagian form itu, ikut bertahan. Form tidak pernah "menyusut".
 */
import { fmtMonthYearJp, isGood } from '../../helpers_cv';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function s(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

/** XML text escape. Form ini penuh `&` dan nilainya teks bebas. */
export function xmlEscape(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Tulis satu nilai ke satu sel, pertahankan indeks style sel itu.
 *
 * Menangani dua bentuk yang mungkin ada di template — `<c r="D6" s="12"/>`
 * (bentuk setiap sel nilai yang sudah dikosongkan) dan
 * `<c r="D6" s="12" t="s"><v>3</v></c>` — dan mencopot `t=` lama supaya
 * inline string tidak mewarisi tipe shared-string.
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

/* ── format nilai yang dipakai bersama dua form ─────────────────────────────── */

/**
 * `生年月日` ditampilkan lengkap sampai HARI (`2005年11月2日`), sedangkan kolom
 * 期間 berhenti di bulan. Nilai ditulis sebagai teks, jadi number format sel
 * tidak pernah memasok harinya — karena itu harinya dirakit di sini.
 */
export function birthDate(v: unknown): string {
  const raw = s(v).trim();
  if (!isGood(raw)) return '';
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(raw);
  if (m) return `${m[1]}年${parseInt(m[2], 10)}月${parseInt(m[3], 10)}日`;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`;
}

/** Bulan-tahun untuk kolom periode, seperti yang dicetak form. */
export function period(v: unknown): string {
  return isGood(v) ? fmtMonthYearJp(s(v)) : '';
}

/** Pisahkan "2012-07" / "2012/7/1" menjadi bagian tahun dan bulan. */
export function yearMonth(v: unknown): { y: string; m: string } {
  const raw = s(v).trim();
  if (!isGood(raw)) return { y: '', m: '' };
  const m = /^(\d{4})[-/](\d{1,2})/.exec(raw);
  if (m) return { y: `${m[1]}年`, m: `${parseInt(m[2], 10)}月` };
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return { y: '', m: '' };
  return { y: `${dt.getFullYear()}年`, m: `${dt.getMonth() + 1}月` };
}

export function currency(v: unknown): string {
  const t = s(v).replace(/[^\d]/g, '');
  return t === '' ? '' : `¥   ${t}`;
}

/* ── pas foto ──────────────────────────────────────────────────────────────── */

export interface PhotoBox {
  cx: number;
  cy: number;
}

export interface PhotoFit extends PhotoBox {
  colOff: number;
  rowOff: number;
}

/**
 * Muat foto ke dalam kotak anchor TANPA mengubah rasio, lalu letakkan di
 * tengah. Foto yang bentuknya sama dengan aslinya mengisi penuh; bentuk lain
 * di-letterbox, bukan diregangkan.
 */
export function fitPhoto(naturalW: number, naturalH: number, box: PhotoBox): PhotoFit {
  if (!naturalW || !naturalH) return { ...box, colOff: 0, rowOff: 0 };
  const scale = Math.min(box.cx / naturalW, box.cy / naturalH);
  const cx = Math.round(naturalW * scale);
  const cy = Math.round(naturalH * scale);
  return {
    cx,
    cy,
    colOff: Math.round((box.cx - cx) / 2),
    rowOff: Math.round((box.cy - cy) / 2),
  };
}

/** Tambal satu blok anchor: ukuran + offset. */
function patchOneAnchor(block: string, fit: PhotoFit): string {
  return block
    .replace(/<xdr:ext cx="\d+" cy="\d+"\/>/, `<xdr:ext cx="${fit.cx}" cy="${fit.cy}"/>`)
    .replace(/(<xdr:from><xdr:col>\d+<\/xdr:col><xdr:colOff>)\d+(<\/xdr:colOff>)/, `$1${fit.colOff}$2`)
    .replace(/(<xdr:row>\d+<\/xdr:row><xdr:rowOff>)\d+(<\/xdr:rowOff>)/, `$1${fit.rowOff}$2`);
}

/**
 * Patch anchor gambar pas foto.
 *
 * `relId` WAJIB diberikan kalau drawing punya lebih dari satu gambar: template
 * rirekisho ASJ hanya punya satu anchor, sedangkan form Firma punya tiga
 * (dua ikon kecil + foto). Tanpa `relId` fungsi ini menambal anchor PERTAMA
 * yang ditemukan — benar untuk yang satu, salah untuk yang lain.
 */
export function patchAnchor(xml: string, fit: PhotoFit, relId?: string): string {
  if (!relId) return patchOneAnchor(xml, fit);
  const at = xml.indexOf(`r:embed="${relId}"`);
  if (at < 0) return xml;
  const open = Math.max(
    xml.lastIndexOf('<xdr:oneCellAnchor', at),
    xml.lastIndexOf('<xdr:twoCellAnchor', at),
  );
  const closes = [
    xml.indexOf('</xdr:oneCellAnchor>', at),
    xml.indexOf('</xdr:twoCellAnchor>', at),
  ].filter((n) => n > 0);
  if (open < 0 || !closes.length) return xml;
  const close = Math.min(...closes);
  return xml.slice(0, open) + patchOneAnchor(xml.slice(open, close), fit) + xml.slice(close);
}

/** Normalisasi gambar apa pun menjadi PNG pada ukuran piksel hasil fit. */
export async function photoToPngBytes(
  url: string,
  fit: PhotoBox,
): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const src = await res.blob();
    const bmp = await createImageBitmap(src);
    // EMU -> CSS px pada 96 DPI (914400 EMU = 1in = 96px)
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
    return null; // CORS, offline, atau format tak didukung — biarkan sel kosong
  }
}

/* ── perakitan workbook ───────────────────────────────────────────────────── */

export interface XlsxFormSpec {
  /** Template kosong, base64. */
  base64: string;
  /** Part sheet yang ditambal, mis. `xl/worksheets/sheet1.xml`. */
  sheetPath: string;
  /** Part drawing, kalau form punya pas foto. */
  drawingPath?: string;
  /** Part gambar yang diganti foto kandidat, mis. `xl/media/image1.png`. */
  photoPart?: string;
  /** `r:embed` milik gambar itu. Wajib kalau drawing punya >1 gambar. */
  photoRelId?: string;
  /** Kotak pas foto di template (EMU). */
  photoBox?: PhotoBox;
  /** sel → nilai. Sel yang tidak ada di sini dibiarkan seperti template. */
  values: Record<string, string>;
  /** URL foto kandidat; kosong = lubang foto dibiarkan kosong. */
  photoUrl?: string;
}

/** Isi template dengan `values`, ganti fotonya kalau ada, kembalikan .xlsx. */
export async function buildXlsxForm(spec: XlsxFormSpec): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(base64ToBytes(spec.base64));

  const sheetFile = zip.file(spec.sheetPath);
  if (!sheetFile) throw new Error(`Template tidak valid: ${spec.sheetPath} tidak ada`);
  let sheet = await sheetFile.async('string');
  for (const [addr, value] of Object.entries(spec.values)) {
    sheet = setCell(sheet, addr, value);
  }
  zip.file(spec.sheetPath, sheet);

  const { drawingPath, photoPart, photoRelId, photoBox, photoUrl } = spec;
  if (isGood(photoUrl) && drawingPath && photoPart && photoBox) {
    const probe = await photoToPngBytes(s(photoUrl), photoBox).catch(() => null);
    if (probe) {
      // Fit diturunkan dari ukuran piksel PNG hasil normalisasi.
      const bmp = await createImageBitmap(new Blob([probe], { type: 'image/png' })).catch(() => null);
      if (bmp) {
        const fit = fitPhoto(bmp.width, bmp.height, photoBox);
        const bytes = await photoToPngBytes(s(photoUrl), fit);
        if (bytes) {
          zip.file(photoPart, bytes);
          const drawFile = zip.file(drawingPath);
          if (drawFile) {
            zip.file(drawingPath, patchAnchor(await drawFile.async('string'), fit, photoRelId));
          }
        }
      }
    }
  }

  return zip.generateAsync({ type: 'blob', mimeType: XLSX_MIME, compression: 'DEFLATE' });
}
