import { cvFactory } from './factory';
import type { CvTemplate, CandidateData, RenderContext, RenderResult } from './types';
import type { TemplateFieldMap, RiwayatBlock } from './loaders/tEMPLATE-loader';
import excelTemplate from './renderers/excel';
import docxTemplate from './renderers/docx';
import pdfTemplate from './renderers/pdf';
import rirekishoXlsxTemplate from './renderers/rirekisho-xlsx';
import rirekishoFirmaTemplate from './renderers/rirekisho-firma';
import kinkiTemplate from './renderers/kinki';

const rirekishoA4Template: CvTemplate = {
  id: 'rirekisho-a4',
  name: 'Rirekisho A4 (Template Asli)',
  type: 'rirekisho',
  description: 'Template CV rirekisho A4 asli yang sudah ada — format tabel Jepang standar',
  category: 'resume',
  icon: 'file-alt',
  // Tidak ditawarkan lagi: pilihannya hanya membuka pratinjau rirekisho yang
  // sudah bisa dibuka dari tombol lain (`onOpenRirekisho`), jadi di modal ia
  // terbaca sebagai template padahal tidak menghasilkan berkas apa pun.
  listed: false,
  async render(_data: CandidateData, _context: RenderContext): Promise<RenderResult> {
    return {
      success: true,
      mimeType: 'text/html',
      fileName: 'CV_Rirekisho_A4.html',
      html: '',
    };
  },
};

cvFactory.register(rirekishoA4Template);
cvFactory.register(excelTemplate);
cvFactory.register(docxTemplate);
cvFactory.register(pdfTemplate);
// The real rirekisho form as an .xlsx (column widths, row heights, merges and the
// pas-foto anchor of the supplied workbook, kept 1:1). Registered last so the
// long-standing templates keep their order in `CvTemplateSelector`.
cvFactory.register(rirekishoXlsxTemplate);
// Form kedua, dari berkas yang dikirim pemilik 2026-10-26 ("FIRMA ELGA PRATAMA").
// Layout, merge, dan tinggi barisnya berbeda dari form ASJ, jadi ia template
// tersendiri — bukan pengganti. Mesin XML-nya sama (`renderers/xlsx-form.ts`).
cvFactory.register(rirekishoFirmaTemplate);
// Form ketiga, dari `F:/1. MASTER CV MAGANG KINKI.xlsx` (2026-10-26). Ini form
// klien KINKI: 学歴 dua baris, 職歴 tiga blok, 家族構成 lima baris, ditambah
// できる作業 dan 性格診断テスト (MBTI). Tipenya TIDAK dibaca dari database —
// tidak ada kolomnya — melainkan disimpulkan `mbti.ts` dari kalimat kandidat.
cvFactory.register(kinkiTemplate);

export { cvFactory };

// ---------------------------------------------------------------------------
// RECORD TEMPLATE — kontrak bersama admin, aksi backend, dan generator
// ---------------------------------------------------------------------------
// Keputusan pemilik 2026-10-10: template disimpan di `sys_config` (satu baris
// per template, `config_type = 'cv_template'`) + berkasnya di Supabase Storage.
// `config_value` adalah TEXT, jadi record ini yang menentukan bentuknya.
//
// Dipisah dari I/O dengan sengaja: aksi backend jadi tipis (baca baris → decode
// → pakai; encode → tulis baris), dan bentuk recordnya bisa diuji tanpa
// database. Sebelum ini tidak ada satu pun tempat yang mendefinisikan apa itu
// "satu template" — hanya renderer hardcoded di `cvFactory`.
export const CV_TEMPLATE_CONFIG_TYPE = 'cv_template';

export interface CvTemplateRecord {
  id: string;
  nama: string;
  tipe: 'xlsx';
  /** URL berkas template di Storage (`asj-files/cv-templates/…`). */
  fileUrl: string;
  /** sel → path data, dari `analyzeFromExample`. */
  fieldMap: TemplateFieldMap;
  /** Sel yang belum diputuskan admin. TIDAK dipakai saat generate — kalau
   *  dipakai, satu nilai bisa ditulis ke sel yang salah. */
  ambiguous?: Record<string, string[]>;
  /** Blok riwayat multi-baris, dari `detectRiwayatBlock`. */
  riwayat?: {
    pendidikan?: RiwayatBlock;
    pekerjaan?: RiwayatBlock;
    keluarga?: RiwayatBlock;
  };
  /** WA kandidat contoh yang dipakai saat meng-upload — jejak audit. */
  contohWa?: string;
  aktif: boolean;
  updatedAt: string;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function encodeTemplateRecord(rec: CvTemplateRecord): string {
  return JSON.stringify(rec);
}

/**
 * Nama template → id yang stabil.
 *
 * Dipakai sebagai kunci baris `sys_config` DAN sebagai nama berkas di Storage,
 * jadi dua nama berbeda harus menghasilkan dua id berbeda. Nama yang tidak
 * memuat huruf/angka ASCII sama sekali (mis. seluruhnya kanji/kana — sangat
 * mungkin di aplikasi ini) menghasilkan slug KOSONG, sehingga semuanya jatuh ke
 * id `tpl-`: template kedua lalu MENIMPA yang pertama, record-nya maupun
 * berkasnya, tanpa peringatan apa pun.
 *
 * Sidik jari dari namanya menjaga mereka tetap berbeda, dan tetap deterministik
 * — mengunggah ulang dengan nama yang sama berarti MEMPERBARUI template itu,
 * bukan membuat salinan kedua.
 */
export function templateIdFromName(nama: string): string {
  const trimmed = nama.trim();
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (slug) return `tpl-${slug}`;
  // FNV-1a 32-bit. Bukan untuk keamanan — hanya perlu tersebar dan stabil.
  let h = 0x811c9dc5;
  for (let i = 0; i < trimmed.length; i++) {
    h ^= trimmed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `tpl-${h.toString(36)}`;
}

/**
 * `null` untuk apa pun yang tidak bisa dipakai — record rusak, kolom wajib
 * kosong, atau `config_value` yang ternyata bukan JSON. Pemanggil memperlakukan
 * `null` sebagai "template ini tidak ada", bukan sebagai "template kosong":
 * template kosong akan menghasilkan CV berisi nama kandidat lain atau berkas
 * tanpa satu pun sel terisi.
 */
export function decodeTemplateRecord(raw: unknown): CvTemplateRecord | null {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isObj(parsed)) return null;

  const id = String(parsed.id ?? '').trim();
  const nama = String(parsed.nama ?? '').trim();
  const fileUrl = String(parsed.fileUrl ?? '').trim();
  if (!id || !nama || !fileUrl) return null;
  // Peta sel BOLEH kosong asal ada tabel riwayat: template yang seluruh isinya
  // berupa tabel (mis. hanya riwayat pendidikan) tetap sah, dan penjaga di tab
  // Config memakai syarat yang sama. Dulu di sini `fieldMap` WAJIB objek,
  // sehingga template seperti itu tersimpan lalu terbaca sebagai "record rusak".
  if (!isObj(parsed.fieldMap) && !isObj(parsed.riwayat)) return null;

  const fieldMap: TemplateFieldMap = {};
  if (isObj(parsed.fieldMap)) {
    for (const [cell, path] of Object.entries(parsed.fieldMap)) {
      if (typeof path === 'string' && path.trim()) fieldMap[cell] = path.trim();
    }
  }

  const rec: CvTemplateRecord = {
    id,
    nama,
    tipe: 'xlsx',
    fileUrl,
    fieldMap,
    aktif: parsed.aktif !== false,
    updatedAt: String(parsed.updatedAt ?? ''),
  };
  if (isObj(parsed.ambiguous)) {
    const amb: Record<string, string[]> = {};
    for (const [cell, paths] of Object.entries(parsed.ambiguous)) {
      if (Array.isArray(paths)) amb[cell] = paths.map((p) => String(p));
    }
    if (Object.keys(amb).length) rec.ambiguous = amb;
  }
  if (isObj(parsed.riwayat)) {
    const r = parsed.riwayat;
    const riwayat: NonNullable<CvTemplateRecord['riwayat']> = {};
    for (const tipe of ['pendidikan', 'pekerjaan', 'keluarga'] as const) {
      const blk = r[tipe];
      if (!isObj(blk) || !isObj(blk.columns)) continue;
      const columns: Record<string, string> = {};
      for (const [col, field] of Object.entries(blk.columns)) {
        if (typeof field === 'string' && field.trim()) columns[col] = field.trim();
      }
      if (!Object.keys(columns).length) continue;
      // Koordinat blok harus sah: `startRow`/`rows` < 1 membuat applier menulis
      // atau menyisipkan di baris 0, yang bukan baris Excel.
      const startRow = Number(blk.startRow);
      const rows = Number(blk.rows);
      if (!Number.isInteger(startRow) || startRow < 1) continue;
      if (!Number.isInteger(rows) || rows < 1) continue;
      riwayat[tipe] = {
        sheet: String(blk.sheet ?? ''),
        startRow,
        rows,
        keyColumn: String(blk.keyColumn ?? ''),
        columns,
      };
    }
    if (Object.keys(riwayat).length) rec.riwayat = riwayat;
  }
  if (parsed.contohWa) rec.contohWa = String(parsed.contohWa);
  return rec;
}

/**
 * Baris `sys_config` → record template. Baris dengan `config_type` lain
 * diabaikan (tabel itu dipakai bersama); record rusak dibuang, bukan
 * menghasilkan entri setengah jadi.
 */
export function decodeTemplateRows(
  rows: unknown,
  opts: { includeInactive?: boolean } = {},
): CvTemplateRecord[] {
  if (!Array.isArray(rows)) return [];
  const out: CvTemplateRecord[] = [];
  for (const row of rows) {
    if (!isObj(row)) continue;
    if (String(row.config_type ?? '') !== CV_TEMPLATE_CONFIG_TYPE) continue;
    const rec = decodeTemplateRecord(row.config_value);
    if (!rec) continue;
    if (!rec.aktif && !opts.includeInactive) continue;
    out.push(rec);
  }
  return out;
}
