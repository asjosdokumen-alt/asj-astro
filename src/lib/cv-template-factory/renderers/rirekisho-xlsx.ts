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
import { isGood, kanjiHubunganDari, rapikanKanjiHubungan } from '../../helpers_cv';
import {
  buildXlsxForm,
  birthDate,
  currency,
  cvFileName,
  fitPhoto as fitPhotoIn,
  negatif,
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

/**
 * Bingkai pas foto = SEL GABUNGAN `A4:C14`, bukan angka warisan.
 *
 * Sampai 2026-10-29 kotaknya dipatok `3.00 x 3.86 in` (288 x 371 px) dari berkas
 * sumber, sedangkan bingkai selnya terukur **255 x 377 px** — jadi foto 33 px
 * LEBIH LEBAR dari bingkainya dan menutupi garis kanan kotak. Geometri sheet
 * adalah kebenaran (sama seperti form JIPA), jadi kotaknya diturunkan dari sel.
 *
 * `PHOTO_BOX` di bawah adalah angka hasil perhitungan itu (255x377 px dikurangi
 * inset 2 px tiap sisi) dan dipakai `fitPhoto()` — tes memakunya supaya
 * `photoRange` dan `fitPhoto` tidak bisa menyimpang.
 */
const PHOTO_RANGE = 'A4:C14';
/** 2 px tiap sisi supaya garis bingkai sel tetap terlihat di atas foto. */
const PHOTO_INSET = 2 * 9525;
const PHOTO_BOX: PhotoBox = { cx: 251 * 9525, cy: 373 * 9525 };

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

/**
 * Sel 有/無: HANYA dua nilai yang sah di dropdown form ini.
 *
 * Sebelumnya sel ini menyalin nilai mentah apa adanya, jadi `H12` (旅券の有無)
 * mencetak NOMOR PASPOR dan `H11` mencetak `BELUM PERNAH` — dua-duanya tidak
 * berarti "ada/tidak ada", dan tidak ada satu pun yang ada di daftar dropdown.
 */
function adaLabel(raw: unknown): string {
  return negatif(raw) ? 'TIDAK\u3000（無）' : 'ADA\u3000（有）';
}

function genderLabel(raw: unknown): string {
  const t = s(raw).toUpperCase();
  // Ejaan HARUS sama dengan daftar dropdown `J4:K4` di template: `LAKI LAKI`
  // (spasi), bukan `LAKI-LAKI`. Nilai berstrip tidak ada di daftar itu.
  if (t.includes('PEREMPUAN') || t.includes('WANITA')) return 'PEREMPUAN (女)';
  if (t.includes('LAKI') || t.includes('PRIA')) return 'LAKI LAKI (男)';
  return s(raw);
}

function maritalLabel(raw: unknown): string {
  const t = s(raw).toUpperCase();
  if (!isGood(t)) return '';
  if (t.includes('BELUM') || t.includes('SINGLE')) return 'BELUM MENIKAH\u3000（未婚）';
  if (t.includes('MENIKAH') || t.includes('KAWIN')) return 'MENIKAH\u3000（既婚）';
  return s(raw);
}

/**
 * Agama — ejaan Jepang mengikuti daftar `J10:N10` di template.
 *
 * `キリスト教`/`ヒンドゥー教` (bentuk yang dipakai dua renderer lain) TIDAK ada
 * di daftar ini; yang tercetak di form adalah `キリスト` dan `ヒンドゥー`.
 */
const AGAMA_JP: Record<string, string> = {
  ISLAM: 'イスラム', KRISTEN: 'キリスト', KATOLIK: 'カトリック',
  HINDU: 'ヒンドゥー', BUDHA: '仏教', BUDDHA: '仏教', KONGHUCU: '儒教',
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
 * 続柄 — bentuk yang dicetak form ini: `INDONESIA  KANJI` ("AYAH  父").
 *
 * Sampai 2026-10-29 sel ini diisi `p.hubungan` apa adanya, jadi kolom 続柄 —
 * satu-satunya kolom Jepang di blok keluarga — berisi huruf Latin, dan nilainya
 * tidak ada di daftar dropdown `K29:Z29` milik template. Kanji diambil dari
 * `hubungan_jp` kalau terisi, kalau tidak dari kamus bersama `helpers_cv`
 * (daftar yang sama dengan rirekisho HTML).
 */
function hubunganLabel(hubungan: unknown, hubunganJp: unknown): string {
  const teks = s(hubungan).replace(/\s+/g, ' ').trim();
  const jepangDiTeks = (teks.match(/[\u3040-\u30ff\u4e00-\u9fff]+/g) ?? []).join('');
  const indo = teks
    .replace(/[\u3040-\u30ff\u4e00-\u9fff]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  const kanji = kanjiHubunganDari(teks, hubunganJp) || rapikanKanjiHubungan(jepangDiTeks);
  if (!kanji) return indo;
  if (!indo) return kanji;
  return `${indo}  ${kanji}`;
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
    H11: adaLabel(id.status_eks_jepang),
    H12: adaLabel(id.paspor),
    D13: 'インドネシア',
    H13: handLabel(data.fisik.tangan_dominan),
    E14: s(id.hp),
    H14: adaLabel(data.medis.riwayat_medis),
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
    cells[`A${row}`] = hubunganLabel(p.hubungan, p.hubungan_jp);
    cells[`D${row}`] = s(p.nama);
    cells[`F${row}`] = usia ? `${usia}歳` : '';
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
  const jftTeks = s(data.sertifikasi.jft).trim();
  cells.C42 = negatif(jftTeks) ? 'TIDAK\u3000（無）' : jftTeks;
  cells.F42 = adaLabel(data.sertifikasi.sim ?? data.identitas.sim);
  /* 他 LAIN-LAIN (`H42:I42`) — dulu selalu kosong. Isinya sertifikat di luar
     JLPT & SIM: lisensi SSW, lalu sertifikat lain yang diketik bebas. */
  const lain = [s(data.sertifikasi.ssw), s(data.sertifikasi.sertifikat_lain)]
    .map((x) => x.trim())
    .filter((x) => isGood(x) && !/^(TIDAK|NO|NONE|-|無|BELUM)$/i.test(x));
  cells.H42 = lain.join(' / ');

  /* ── catatan tambahan (付記) ─────────────────────────────────────────── */
  cells.A46 = s(data.sertifikasi.catatan_cv);

  /* ── relatives in Japan ─────────────────────────────────────────────── */
  // Empat kolom setelah nama (関係/職業/年齢/住所) punya kolomnya di DB sejak
  // migrasi 019 dan terisi, tetapi renderer lama hanya menulis namanya.
  const ken = data.kenalan_jepang;
  const hasKin = isGood(ken.nama_id) || isGood(ken.nama_jp);
  cells.A45 = hasKin ? (s(ken.nama_jp) || s(ken.nama_id)) : '無し';
  cells.D45 = hasKin ? s(ken.hubungan_jp) || s(ken.hubungan_id) : '';
  cells.E45 = hasKin ? s(ken.pekerjaan_jp) || s(ken.pekerjaan_id) : '';
  cells.F45 = hasKin ? s(ken.usia) : '';
  cells.G45 = hasKin ? s(ken.alamat_jp) || s(ken.alamat_id) : '';

  return cells;
}

/** Build the workbook. Exported so the geometry can be asserted in a test. */
export async function buildRirekishoWorkbook(data: CandidateData): Promise<Blob> {
  return buildXlsxForm({
    base64: RIREKISHO_XLSX_BASE64,
    sheetPath: SHEET_PATH,
    drawingPath: DRAWING_PATH,
    photoPart: PHOTO_PART,
    photoRange: PHOTO_RANGE,
    photoInset: PHOTO_INSET,
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
      return { success: true, mimeType: blob.type, fileName: cvFileName(data), blob };
    } catch (e: unknown) {
      return { success: false, mimeType: '', fileName: '', error: e instanceof Error ? e.message : 'Excel render error' };
    }
  },
};

export default template;
