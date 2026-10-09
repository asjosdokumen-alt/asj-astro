import { cvFactory } from './factory';
import type { CvTemplate, CandidateData, RenderContext, RenderResult } from './types';
import type { TemplateFieldMap, RiwayatBlock } from './loaders/tEMPLATE-loader';
import excelTemplate from './renderers/excel';
import docxTemplate from './renderers/docx';
import pdfTemplate from './renderers/pdf';
import rirekishoXlsxTemplate from './renderers/rirekisho-xlsx';

const rirekishoA4Template: CvTemplate = {
  id: 'rirekisho-a4',
  name: 'Rirekisho A4 (Template Asli)',
  type: 'rirekisho',
  description: 'Template CV rirekisho A4 asli yang sudah ada — format tabel Jepang standar',
  category: 'resume',
  icon: 'file-alt',
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
  if (!isObj(parsed.fieldMap)) return null;

  const fieldMap: TemplateFieldMap = {};
  for (const [cell, path] of Object.entries(parsed.fieldMap)) {
    if (typeof path === 'string' && path.trim()) fieldMap[cell] = path.trim();
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
      riwayat[tipe] = {
        sheet: String(blk.sheet ?? ''),
        startRow: Number(blk.startRow) || 0,
        rows: Number(blk.rows) || 0,
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
