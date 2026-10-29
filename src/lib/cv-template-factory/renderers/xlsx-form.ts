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

/**
 * Penanda "tidak punya / belum pernah" di database.
 *
 * Nilainya TIDAK seragam, dan daftar pendek `^(tidak|no|none|-|無)$` yang dulu
 * dipakai keempat renderer membaca kebalikannya:
 *
 *   `TIDAK ADA`    → tidak cocok → dianggap ADA  (9 baris riwayat penyakit,
 *                                                2 baris SIM)
 *   `BELUM PERNAH` → tidak cocok → dianggap ADA  (21 baris 訪日経験, yaitu
 *                                                kandidat yang BELUM ke Jepang
 *                                                tercetak "あり(ADA)")
 *   `TIDAK PUNYA`  → tidak cocok → dianggap ADA
 *
 * Karena itu penilaiannya dipusatkan di sini, bukan diulang di tiap renderer.
 */
const NEGATIF_RE = /^(tidak(\s+(ada|punya|pernah|memiliki))?|belum(\s+pernah)?|no|none|nihil|-|無|0)$/i;

/** `true` = tidak ada / belum pernah / kosong. */
export function negatif(v: unknown): boolean {
  const t = s(v).trim();
  return !isGood(t) || NEGATIF_RE.test(t);
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

/**
 * Tulis ANGKA ke satu sel, pertahankan indeks style sel itu.
 *
 * Dipakai untuk sel yang dihitung rumus lain di sebelahnya (form KINKI: `E8`
 * tanggal lahir → `S8` = `DATEDIF`). Menulisnya sebagai teks membuat rumusnya
 * `#VALUE!`, jadi nilainya harus `<v>` biasa tanpa `t=`.
 */
export function setCellNumber(xml: string, addr: string, value: number): string {
  const re = new RegExp(`<c r="${addr}"([^>]*?)(?:/>|>[\\s\\S]*?</c>)`);
  const m = re.exec(xml);
  if (!m) return xml;
  const attrs = m[1].replace(/\s+t="[^"]*"/g, '');
  const cell = `<c r="${addr}"${attrs}><v>${value}</v></c>`;
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

/** `2021-08` → `2021年8月`, bentuk yang dicetak form. */
export function period(v: unknown): string {
  return isGood(v) ? fmtMonthYearJp(s(v)) : '';
}

/**
 * Durasi teks bebas Indonesia → bentuk Jepang (`6 bulan` → `6ヶ月`).
 *
 * Kolom 学習期間 / 在日期間 diisi kandidat sebagai teks bebas, lalu dicetak
 * APA ADANYA ke formulir Jepang. Terukur pada data produksi (ASJ00041):
 * `6 bulan` muncul di 日本語学習期間 (Firma `L31` & KINKI `T37`) dan `10 tahun`
 * di 在日期間 (JIPA `E55`) — dua kolom Jepang berisi bahasa Indonesia.
 *
 * Konversinya DETERMINISTIK, bukan terjemahan mesin: hanya satuan yang dikenal
 * yang diubah, dan teks lain dikembalikan apa adanya supaya tidak dirusak.
 */
export function durasiJp(v: unknown): string {
  const t = s(v).trim();
  if (!isGood(t)) return '';
  // Sudah berhuruf Jepang (mis. `6ヶ月`, `10年`) — jangan disentuh.
  if (/[年月週日]/.test(t)) return t;
  const ambil = (satuan: string): number => {
    const m = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:${satuan})`, 'i').exec(t);
    return m?.[1] ? Number(m[1].replace(',', '.')) : 0;
  };
  const tahun = ambil('tahun|thn|tahunnya');
  const bulan = ambil('bulan|bln');
  const minggu = ambil('minggu|pekan|week');
  const hari = ambil('hari|day');
  if (!tahun && !bulan && !minggu && !hari) return t;
  return (
    (tahun ? `${tahun}年` : '') +
    (bulan ? `${bulan}ヶ月` : '') +
    (minggu ? `${minggu}週間` : '') +
    (hari ? `${hari}日` : '')
  );
}

/**
 * カナ氏名: pemisah `・`, hiragana → katakana, dan kanji yang bentuknya
 * katakana diluruskan (`厶`→`ム`, `二`→`ニ`, `口`→`ロ`, `力`→`カ`, `工`→`エ`,
 * `夕`→`タ`). Database menyimpan campuran — mis. `ヨン　アリック　ラマダに`
 * (ASJ00104) dan `厶ハッマド•二ザル•ヌル` (ASJ00132). Kanji lain dibiarkan
 * supaya tidak menebak. Dipakai form KINKI dan JIPA.
 */
const KANA_FIX: Record<string, string> = {
  '厶': 'ム', '二': 'ニ', '口': 'ロ', '力': 'カ', '工': 'エ', '夕': 'タ',
};

export function kanaJp(v: unknown): string {
  return s(v)
    .replace(/[•·･]/g, '・')
    .replace(/[\s\u3000]+/g, '・')
    .replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .replace(/[厶二口力工夕]/g, (ch) => KANA_FIX[ch] ?? ch);
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

/**
 * Tanggal → nomor seri Excel (1899-12-30 = 0), BUKAN teks.
 *
 * Form KINKI menghitung umur dengan `DATEDIF(E8,TODAY(),"Y")` di sel sebelah.
 * Kalau `E8` ditulis sebagai teks, rumus itu menghasilkan `#VALUE!` dan CV
 * mencetak error di kolom 年齢 — jadi sel tanggal harus tetap bertipe angka
 * dan membiarkan number format template yang memformatnya.
 */
export function excelSerial(v: unknown): number | null {
  const raw = s(v).trim();
  if (!isGood(raw)) return null;
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(raw);
  const dt = m
    ? new Date(Date.UTC(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)))
    : new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  return Math.round((dt.getTime() - Date.UTC(1899, 11, 30)) / 86400000);
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
 * Lebar kolom Excel (atribut `width`) → piksel.
 *
 * Rumus Excel untuk Calibri 11 (maximum digit width 7 px):
 *   px = trunc(((256*w + trunc(128/7)) / 256) * 7)
 *
 * Diverifikasi terhadap berkas pemilik 2026-10-26: kotak pas foto form KINKI
 * (`W6:AD17`) terukur 176 x 240 px, dan foto di dalamnya 167 x 225 px — 95 %
 * kotak, persis seperti berkas aslinya. Model yang salah (w*7+5) memberi 216 px
 * dan membuat foto itu hanya 77 % kotaknya, jadi rumus ini yang dipakai.
 */
export function colPx(width: number): number {
  return Math.trunc(((256 * width + 18) / 256) * 7);
}

/** `B6` / `AA62` → nomor kolom 1-based. */
function colNumber(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function attrOf(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
}

/**
 * Ukuran satu rentang sel (mis. `B6:E13`) dalam EMU, dihitung dari geometri
 * sheet — `<col width>` dan `<row ht>`.
 *
 * KENAPA ADA
 * ----------
 * Kotak pas foto HARUS berasal dari sel yang disediakan form, bukan dari
 * ukuran berkas gambar. Template JIPA membawa `ext` warisan 1024x1536 px
 * (10,67 x 16 inci) karena berkas sumbernya menyimpan foto pada ukuran
 * naturalnya; memakai angka itu membuat foto menutupi seluruh halaman dan
 * tidak masuk bingkai sel (pemilik, 2026-10-26: "gak pass bingkai cellnya
 * terlalu gede").
 *
 * `inset` (EMU) menyusutkan kotak dari keempat sisi supaya garis bingkai sel
 * tetap terlihat; geseran anchor-nya diurus `photoOffset`.
 */
export function cellRangeEmu(xml: string, range: string, inset = 0): PhotoBox | null {
  const m = /^([A-Z]{1,3})(\d+):([A-Z]{1,3})(\d+)$/.exec(range.trim().toUpperCase());
  if (!m) return null;
  const c1 = colNumber(m[1]);
  const r1 = Number(m[2]);
  const c2 = colNumber(m[3]);
  const r2 = Number(m[4]);
  if (!c1 || !c2 || !r1 || !r2 || c2 < c1 || r2 < r1) return null;

  const widths = new Map<number, number>();
  for (const tag of xml.match(/<col\b[^>]*>/g) ?? []) {
    const min = Number(attrOf(tag, 'min'));
    const max = Number(attrOf(tag, 'max'));
    const w = Number(attrOf(tag, 'width'));
    if (!min || !max || !Number.isFinite(w)) continue;
    for (let i = min; i <= max; i++) widths.set(i, w);
  }
  const heights = new Map<number, number>();
  for (const tag of xml.match(/<row\b[^>]*>/g) ?? []) {
    const r = Number(attrOf(tag, 'r'));
    if (!r) continue;
    const ht = Number(attrOf(tag, 'ht'));
    heights.set(r, Number.isFinite(ht) && ht > 0 ? ht : 0);
  }

  const fmt = /<sheetFormatPr\b[^>]*>/.exec(xml)?.[0] ?? '';
  const defW = Number(attrOf(fmt, 'defaultColWidth') ?? attrOf(fmt, 'baseColWidth') ?? 8.43);
  const defH = Number(attrOf(fmt, 'defaultRowHeight') ?? 15);

  let wPx = 0;
  for (let i = c1; i <= c2; i++) wPx += colPx(widths.get(i) ?? defW);
  let hPx = 0;
  for (let i = r1; i <= r2; i++) {
    const ht = heights.get(i) || defH;
    hPx += Math.round((ht * 96) / 72);
  }

  const pad = Math.round(inset / 9525);
  return {
    cx: Math.max(1, wPx - pad * 2) * 9525,
    cy: Math.max(1, hPx - pad * 2) * 9525,
  };
}

/**
 * Sumber crop untuk MENGISI kotak tanpa mengubah rasio (cover), dipusatkan.
 *
 * Sebelum ini foto digambar dengan `drawImage(bmp, 0, 0, w, h)` — yaitu
 * diregangkan ke rasio kotak. Untuk bingkai yang rasionya mirip foto, bedanya
 * tak terlihat; untuk JIPA (foto 2:3, bingkai 1,08) wajahnya jadi gepeng.
 * `fitPhoto` di bawah sudah menghitung letterbox, tetapi hasilnya dibatalkan
 * oleh peregangan itu — jadi crop-nya dilakukan di sini, dan `fitPhoto` tetap
 * dipakai untuk menempatkan anchor.
 */
export function coverCrop(
  naturalW: number,
  naturalH: number,
  boxW: number,
  boxH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (!naturalW || !naturalH || !boxW || !boxH) {
    return { sx: 0, sy: 0, sw: naturalW, sh: naturalH };
  }
  const scale = Math.max(boxW / naturalW, boxH / naturalH);
  const sw = Math.min(naturalW, boxW / scale);
  const sh = Math.min(naturalH, boxH / scale);
  return { sx: (naturalW - sw) / 2, sy: (naturalH - sh) / 2, sw, sh };
}

/**
 * Muat foto ke dalam kotak anchor TANPA mengubah rasio, lalu letakkan di
 * tengah. Foto yang bentuknya sama dengan aslinya mengisi penuh; bentuk lain
 * di-letterbox, bukan diregangkan.
 *
 * ⚠️ Cabang letterbox-nya TIDAK lagi tercapai dari `buildXlsxForm`: gambar
 * probe sudah dinormalisasi ke bentuk kotak (`photoToPngBytes` → `coverCrop`),
 * jadi masukannya selalu sebanding dan hasilnya = kotak itu sendiri. Fungsi ini
 * kini dipakai untuk MENEMPATKAN anchor; pemotongan rasio terjadi saat gambar
 * digambar. Tes letterbox di `rirekisho-xlsx.test.ts` masih menjaga matematika
 * anchor-nya, bukan perilaku render — jangan dibaca sebagai jaminan bahwa foto
 * tidak akan pernah dipotong.
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

/**
 * Tambal satu blok anchor: ukuran + offset.
 *
 * Prefix `xdr:` dibuat OPSIONAL. Template rirekisho/FIRMA memakai
 * `<xdr:oneCellAnchor>`, sedangkan template JIPA menyimpan drawing dengan
 * namespace default sehingga elemennya TANPA prefix (`<oneCellAnchor><from>`).
 * Versi pertama fungsi ini hanya mengenal bentuk ber-prefix, jadi untuk JIPA
 * tidak ada satu pun pola yang cocok, XML dikembalikan apa adanya, dan anchor
 * tidak pernah ditambal — foto tetap 1024x1536 px (10,67 x 16 inci) berapa pun
 * kotak yang diminta. Terukur 2026-10-26 di `e2e/jipa.test.ts`.
 *
 * Prefix aslinya DIPERTAHANKAN saat menulis: menyisipkan `xdr:` ke dokumen
 * yang tidak mendeklarasikannya menghasilkan XML tidak sah.
 */
const P = '(?:xdr:)?';

function patchOneAnchor(block: string, fit: PhotoFit): string {
  return block
    .replace(new RegExp(`<(${P})ext cx="\\d+" cy="\\d+"\\s*/>`), (_m, p: string) => `<${p}ext cx="${fit.cx}" cy="${fit.cy}"/>`)
    .replace(
      new RegExp(`(<${P}from><${P}col>\\d+</${P}col><${P}colOff>)\\d+(</${P}colOff>)`),
      `$1${fit.colOff}$2`,
    )
    .replace(
      new RegExp(`(<${P}row>\\d+</${P}row><${P}rowOff>)\\d+(</${P}rowOff>)`),
      `$1${fit.rowOff}$2`,
    );
}

/** Tag anchor yang mungkin dipakai template, dengan atau tanpa prefix. */
const ANCHOR_TAGS = ['oneCellAnchor', 'twoCellAnchor'] as const;

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
  let open = -1;
  for (const tag of ANCHOR_TAGS) {
    open = Math.max(open, xml.lastIndexOf(`<xdr:${tag}`, at), xml.lastIndexOf(`<${tag}`, at));
  }
  if (open < 0) return xml;
  let close = -1;
  for (const tag of ANCHOR_TAGS) {
    for (const c of [xml.indexOf(`</xdr:${tag}>`, at), xml.indexOf(`</${tag}>`, at)]) {
      if (c > 0 && (close < 0 || c < close)) close = c;
    }
  }
  if (close < 0 || close < open) return xml;
  return xml.slice(0, open) + patchOneAnchor(xml.slice(open, close), fit) + xml.slice(close);
}

/** Normalisasi gambar apa pun menjadi PNG pada ukuran piksel hasil fit. */
export async function photoToPngBytes(
  url: string,
  fit: PhotoBox,
): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    // A poster URL is a third-party host: unreadable cross-origin, so this is a
    // HANG risk, not SSRF. Unbounded it stalled the whole export behind a CDN
    // that never answered — `try/catch` never runs while `fetch` is pending.
    const res = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(20_000) });
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
    // Cover: isi kotak, buang lebihnya — JANGAN diregangkan ke rasio kotak.
    const crop = coverCrop(bmp.width, bmp.height, w, h);
    ctx.drawImage(bmp, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
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
  /**
   * Rentang sel yang menjadi bingkai pas foto (mis. `B6:E13`).
   *
   * Kalau diisi, kotaknya DIHITUNG dari geometri sheet dan `photoBox`
   * diabaikan. Ini bentuk yang benar untuk template yang `ext`-nya warisan
   * ukuran gambar (JIPA): bingkainya sel, bukan berkas foto.
   */
  photoRange?: string;
  /** Susutkan bingkai `photoRange` sekian EMU dari tiap sisi (garis sel tetap terlihat). */
  photoInset?: number;
  /**
   * Geseran tetap untuk pas foto, di luar pemusatan `fitPhoto`.
   *
   * Form KINKI menaruh fotonya 76200/38100 EMU dari sudut sel, bukan tepat di
   * sudut. Tanpa ini `fitPhoto` memusatkan foto ke (0,0) dan hasilnya menempel
   * garis kiri — beda ~2 mm dari berkas pemilik.
   */
  photoOffset?: { colOff: number; rowOff: number };
  /** sel → nilai. Sel yang tidak ada di sini dibiarkan seperti template. */
  values: Record<string, string>;
  /** sel → ANGKA (bukan teks). Untuk sel yang dihitung rumus lain. */
  numbers?: Record<string, number>;
  /** URL foto kandidat; kosong = lubang foto dibiarkan kosong. */
  photoUrl?: string;
  /**
   * Nama tab sheet di Excel. Tanpa ini tab memakai nama dari berkas contoh —
   * yaitu nama AGENSI, sama untuk semua kandidat. Pemilik 2026-10-26:
   * "rename data downloadtan dengan data cv yg gunakan".
   */
  sheetName?: string;
}

/** Nama tab Excel: buang karakter terlarang dan batasi 31 karakter. */
export function safeSheetName(nama: string): string {
  const bersih = s(nama)
    .replace(/[[\]:*?/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31);
  return bersih || 'CV';
}

/**
 * Nama berkas unduhan: `<NAMA KANDIDAT>_CV.xlsx`.
 *
 * Pemilik 2026-10-26: "untuk penamaan nya namakandidat_CV, jgn digabung dengan
 * template — murni hasil generated nya NAMA KANDIDAT_CV". Jadi TIDAK ada
 * prefix jenis template; yang membedakan dua template adalah isi berkasnya.
 *
 * Nama kosong jatuh ke `KANDIDAT` supaya tidak ada berkas bernama `_CV.xlsx`
 * (dulu semua unduhan tanpa nama menjadi nama yang sama).
 */
export function cvFileName(data: { identitas: Record<string, unknown> }): string {
  const nama = s(data.identitas.nama_lengkap)
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase() || 'KANDIDAT';
  return `${nama}_CV.xlsx`;
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
  for (const [addr, value] of Object.entries(spec.numbers ?? {})) {
    sheet = setCellNumber(sheet, addr, value);
  }
  zip.file(spec.sheetPath, sheet);

  // Nama tab: satu atribut di `workbook.xml`. Dibiarkan kalau tidak diminta,
  // supaya template yang belum punya nama kandidat tidak berubah perilakunya.
  if (spec.sheetName) {
    const wbFile = zip.file('xl/workbook.xml');
    if (wbFile) {
      const wbXml = await wbFile.async('string');
      zip.file(
        'xl/workbook.xml',
        wbXml.replace(/(<sheet\b[^>]*?\bname=")[^"]*(")/, `$1${xmlEscape(safeSheetName(spec.sheetName))}$2`),
      );
    }
  }

  const { drawingPath, photoPart, photoRelId, photoRange, photoInset, photoOffset, photoUrl } = spec;
  // Bingkai dari sel menang atas `photoBox`: geometri sheet adalah kebenaran,
  // ukuran gambar bukan. `sheet` di sini sudah ditambal nilainya, tetapi
  // `<cols>`/`<row>` tidak pernah ikut berubah.
  const photoBox = spec.photoBox ?? (photoRange ? cellRangeEmu(sheet, photoRange, photoInset ?? 0) ?? undefined : undefined);
  if (isGood(photoUrl) && photoPart && photoBox) {
    const probe = await photoToPngBytes(s(photoUrl), photoBox).catch(() => null);
    if (probe) {
      // Fit diturunkan dari ukuran piksel PNG hasil normalisasi.
      const bmp = await createImageBitmap(new Blob([probe], { type: 'image/png' })).catch(() => null);
      if (bmp) {
        const fit = fitPhoto(bmp.width, bmp.height, photoBox);
        if (photoOffset) {
          fit.colOff += photoOffset.colOff;
          fit.rowOff += photoOffset.rowOff;
        }
        const bytes = await photoToPngBytes(s(photoUrl), fit);
        if (bytes) {
          zip.file(photoPart, bytes);
          // Anchor hanya ditambal kalau template memang punya `<xdr:ext>` milik
          // foto. Form Firma memakai `twoCellAnchor` (kotak ditentukan dua sel),
          // jadi tidak ada yang perlu ditambal — gambarnya saja yang diganti.
          if (drawingPath) {
            const drawFile = zip.file(drawingPath);
            if (drawFile) {
              zip.file(drawingPath, patchAnchor(await drawFile.async('string'), fit, photoRelId));
            }
          }
        }
      }
    }
  }

  return zip.generateAsync({ type: 'blob', mimeType: XLSX_MIME, compression: 'DEFLATE' });
}
