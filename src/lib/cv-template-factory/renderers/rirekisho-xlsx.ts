/**
 * rirekisho-xlsx.ts — form rirekisho 履歴書 asli sebagai .xlsx, diisi dari data kandidat.
 *
 * WHAT THIS IS FOR
 * ----------------
 * The "Excel" option in `CvTemplateSelector` used to render `renderers/excel.ts`,
 * which writes a two-column `Field | Value` dump — nothing like the form the
 * branch actually uses. This renders the REAL rirekisho sheet, matching the
 * supplied workbook 1:1 in layout, with every value coming from the database.
 *
 * TRIK XML-NYA ADA DI `xlsx-form.ts` (dipakai bersama form Firma). Di berkas ini
 * tinggal dua hal yang memang milik form ini: peta sel (`buildValues`) dan
 * kosakata labelnya (gender, agama, status nikah, tangan dominan).
 */
import type { CvTemplate, CandidateData, RenderContext, RenderResult } from '../types';
import { RIREKISHO_XLSX_BASE64 } from '../templates/rirekisho-xlsx.b64';
import { isGood } from '../../helpers_cv';
import {
  buildXlsxForm,
  birthDate,
  currency,
  cvFileName,
  fitPhoto as fitPhotoIn,
  patchAnchor as patchAnchorIn,
  period,
  s,
  setCell,
  type PhotoBox,
  type PhotoFit,
} from './xlsx-form';

const SHEET_PATH = 'xl/worksheets/sheet1.xml';
const DRAWING_PATH = 'xl/drawings/drawing1.xml';
const PHOTO_PART = 'xl/media/image1.png';

/** The pas-foto anchor, copied from the source workbook: col 0, row 3, 3.00in x 3.86in. */
const PHOTO_BOX: PhotoBox = { cx: 2743200, cy: 3533775 };

/** How many rows each list section of the form provides. */
const EDU_ROWS = 3;
const JOB_ROWS = 2;
const FAM_ROWS = 6;

export { setCell };

/** `fitPhoto`/`patchAnchor` dengan kotak foto milik form ini. */
export function fitPhoto(naturalW: number, naturalH: number): PhotoFit {
  return fitPhotoIn(naturalW, naturalH, PHOTO_BOX);
}

export function patchAnchor(xml: string, fit: PhotoFit): string {
  return patchAnchorIn(xml, fit);
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

/** Build the workbook. Exported so the geometry can be asserted in a test. */
export async function buildRirekishoWorkbook(data: CandidateData): Promise<Blob> {
  return buildXlsxForm({
    base64: RIREKISHO_XLSX_BASE64,
    sheetPath: SHEET_PATH,
    drawingPath: DRAWING_PATH,
    photoPart: PHOTO_PART,
    photoBox: PHOTO_BOX,
    values: buildValues(data),
    photoUrl: s(data.uploads.photo),
    // Tab Excel memakai nama kandidat, bukan nama form dari berkas template.
    sheetName: s(data.identitas.nama_lengkap),
  });
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
      return { success: true, mimeType: blob.type, fileName: cvFileName('CV_Rirekisho', data), blob };
    } catch (e: unknown) {
      return { success: false, mimeType: '', fileName: '', error: e instanceof Error ? e.message : 'Excel render error' };
    }
  },
};

export default template;
