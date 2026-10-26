/**
 * rirekisho-firma.ts — form CV "FIRMA ELGA PRATAMA" sebagai .xlsx, diisi dari database.
 *
 * ASAL BERKAS
 * -----------
 * Pemilik mengirim satu CV yang sudah terisi (2026-10-26) dan memintanya jadi
 * template pilihan di `CvTemplateSelector`. Berkas itu 1,86 MB karena 98%-nya
 * foto kandidat (image3.png, 1535x2046). Foto itu DIBUANG saat template
 * dikosongkan — bukan hanya soal ukuran, tapi karena itu foto orang lain:
 * template tidak boleh membawa wajah siapa pun. Yang tersisa 57,8 KB berisi
 * label Jepang/Indonesia, 94 merge, lebar 26 kolom, tinggi 996 baris, dan
 * seluruh style aslinya (lihat `templates/rirekisho-firma.b64.ts`).
 *
 * BEDA DENGAN FORM ASJ (`rirekisho-xlsx.ts`)
 * ------------------------------------------
 * Layout-nya lain, jadi peta selnya lain — tapi mesin penulisan XML-nya sama
 * (`xlsx-form.ts`). Dua hal yang khas form ini:
 *   • pas foto ada di anchor col13/row1 (sel N2:P6), part `image3.png`, rel
 *     `rId3`. Drawing-nya punya TIGA gambar (dua ikon kecil), jadi anchor harus
 *     ditambal lewat `relId` — tanpa itu yang tertambal ikon pertama.
 *   • riwayat kerja memakai BLOK DUA BARIS: baris 16-17 = satu pekerjaan
 *     (masuk di 16, keluar di 17), baris 18-19 = pekerjaan kedua.
 *
 * SEL YANG SENGAJA TIDAK DIISI
 * ----------------------------
 * Form ini punya kolom yang tidak ada padanannya di database, dan mengarang
 * nilainya lebih buruk daripada membiarkannya kosong:
 *   H9/J9 (visi kiri/kanan), M9/N9 (alkohol), O9/P9 (merokok),
 *   G25 (jenis sertifikat), K25/L25 (lama & periode belajar),
 *   D26/G26/L26 (buku, bab, negara lain), G27/K27 (catatan lain).
 * Semuanya diisi tangan saat pendampingan — sama seperti form kertasnya.
 */
import type { CvTemplate, CandidateData, RenderContext, RenderResult } from '../types';
import { RIREKISHO_FIRMA_BASE64 } from '../templates/rirekisho-firma.b64';
import { isGood } from '../../helpers_cv';
import {
  buildXlsxForm,
  birthDate,
  currency,
  cvFileName,
  s,
  yearMonth,
  type PhotoBox,
} from './xlsx-form';

const SHEET_PATH = 'xl/worksheets/sheet1.xml';
const DRAWING_PATH = 'xl/drawings/drawing1.xml';
/** Foto contoh ada di part ini; renderer menimpanya dengan foto kandidat. */
const PHOTO_PART = 'xl/media/image3.png';
/** `r:embed` milik foto di drawing1.xml (dua gambar lain: rId1, rId2 = ikon). */
const PHOTO_REL_ID = 'rId3';
/** Kotak pas foto dari workbook asli: col13/row1, 1466850 x 1943100 EMU. */
const PHOTO_BOX: PhotoBox = { cx: 1466850, cy: 1943100 };

/** Baris pertama tiap bagian, persis seperti form cetaknya. */
const EDU_START = 11;
const EDU_ROWS = 4;
const JOB_START = 16;
/** Satu pekerjaan = dua baris (masuk di baris atas, keluar di baris bawah). */
const JOB_BLOCKS = 2;
const FAM_START = 22;
const FAM_ROWS = 3;

const AGAMA_JP: Record<string, string> = {
  ISLAM: 'イスラム教', KRISTEN: 'キリスト教', KATOLIK: 'カトリック',
  HINDU: 'ヒンドゥー教', BUDHA: '仏教', BUDDHA: '仏教', KONGHUCU: '儒教',
};

/** "無 Tidak" untuk yang kosong/negatif — kosakata yang dipakai form ini. */
function tidakAda(raw: unknown, kosong = '無 Tidak'): string {
  const t = s(raw).trim();
  if (!isGood(t) || /^(tidak|no|none|-|無)$/i.test(t)) return kosong;
  return t;
}

/**
 * Nilai yang di database ditulis `-` (artinya "belum ada") tidak boleh tercetak
 * sebagai tanda minus di formulir — selnya lebih baik kosong.
 */
function bersih(v: unknown): string {
  const t = s(v);
  return isGood(t) ? t : '';
}

function genderJp(raw: unknown): string {
  const t = s(raw).toUpperCase();
  if (t.includes('PEREMPUAN') || t.includes('WANITA')) return '女';
  if (t.includes('LAKI') || t.includes('PRIA')) return '男';
  return s(raw);
}

function maritalJp(raw: unknown): string {
  const t = s(raw).toUpperCase();
  if (!isGood(t)) return '';
  if (t.includes('BELUM') || t.includes('SINGLE')) return '未婚 Single';
  if (t.includes('MENIKAH') || t.includes('KAWIN')) return '既婚 Menikah';
  return s(raw);
}

function agamaJp(raw: unknown): string {
  const t = s(raw).toUpperCase().trim();
  if (!isGood(t)) return '';
  const jp = AGAMA_JP[t];
  return jp ? `${jp} ${s(raw)}` : s(raw);
}

/** Golongan darah ditulis `O型`, bukan `O`. */
function darahJp(raw: unknown): string {
  const t = s(raw).trim().toUpperCase().replace(/型$/, '');
  if (!isGood(t)) return '';
  return /^(A|B|O|AB)$/.test(t) ? `${t}型` : s(raw);
}

function tanganJp(raw: unknown): string {
  const t = s(raw).toUpperCase();
  if (t.includes('KANAN') || t.includes('RIGHT')) return '右 Kanan';
  if (t.includes('KIRI') || t.includes('LEFT')) return '左 Kiri';
  return s(raw);
}

function kacamataJp(raw: unknown): string {
  const t = s(raw).toUpperCase();
  if (!isGood(t) || /^(tidak|no|none|-)$/i.test(t)) return 'かけない';
  return t.includes('TIDAK') ? 'かけない' : s(raw);
}

/** Tingkat sekolah → label 分類 yang dipakai form (`小学生 SD`, …). */
function levelJp(raw: unknown): string {
  const t = s(raw).toUpperCase();
  if (!isGood(t)) return '';
  if (/^SD|SEKOLAH DASAR/.test(t)) return '小学生 SD';
  if (/^SMP|SEKOLAH MENENGAH PERTAMA/.test(t)) return '中学生 SMP';
  if (/^SMA|SEKOLAH MENENGAH ATAS/.test(t)) return '高校生 SMA';
  if (/^SMK|KEJURUAN/.test(t)) return '職業高校 SMK';
  if (/UNIVERSITAS|^S1|SARJANA/.test(t)) return '大学生 Universitas';
  return s(raw);
}

/** 続柄: hubungan keluarga dalam huruf Jepang + Indonesia. */
function hubunganJp(raw: unknown): string {
  const t = s(raw).toUpperCase();
  if (!isGood(t)) return '';
  if (t.includes('AYAH') || t.includes('BAPAK')) return '父 Ayah';
  if (t.includes('IBU') || t.includes('MAMA')) return '母 Ibu';
  if (t.includes('KAKAK') && t.includes('PEREMPUAN')) return '姉 Kakak (Pr)';
  if (t.includes('KAKAK')) return '兄 Kakak (Lk)';
  if (t.includes('ADIK') && t.includes('PEREMPUAN')) return '妹 Adik (Pr)';
  if (t.includes('ADIK')) return '弟 Adik (Lk)';
  if (t.includes('ISTRI')) return '妻 Istri';
  if (t.includes('SUAMI')) return '夫 Suami';
  if (t.includes('ANAK')) return '子 Anak';
  return s(raw);
}

/** 居住: `同居` (serumah) atau `別居` (terpisah). */
function tinggalJp(raw: unknown): string {
  const t = s(raw).toUpperCase();
  if (!isGood(t)) return '';
  if (t.includes('TIDAK') || t.includes('BEDA') || t.includes('LUAR')) return '別居';
  return '同居';
}

/**
 * Pasangan (label, jumlah) untuk kolom kebiasaan — alkohol dan rokok. Form
 * mencetak `無 Tidak` + `0` untuk yang tidak, `有 Ya` + angka untuk yang ya.
 */
function kebiasaan(v: unknown): { label: string; jumlah: string } {
  const t = s(v).trim();
  if (!isGood(t) || /^(tidak|no|none|-|無|0)$/i.test(t)) return { label: '無 Tidak', jumlah: '0' };
  const n = t.replace(/[^\d]/g, '');
  return { label: '有 Ya', jumlah: n };
}

/**
 * Peta sel → nilai. Sel yang tidak ada di sini dibiarkan seperti template,
 * termasuk label dan seluruh garis.
 */
export function buildValues(data: CandidateData): Record<string, string> {
  const id = data.identitas;
  const raw = data.raw as Record<string, unknown>;
  const minum = kebiasaan(data.medis.alkohol);
  const rokok = kebiasaan(data.medis.rokok);
  const cells: Record<string, string> = {
    /* ── identitas ──────────────────────────────────────────────────────── */
    D2: s(id.katakana),
    D3: s(id.nama_lengkap),
    D4: s(id.alamat),
    D5: birthDate(id.tgl_lahir),
    I5: s(id.umur),
    L5: genderJp(id.gender),
    D6: s(id.hp),
    I6: agamaJp(id.agama),
    L6: s(data.fisik.tb),
    D7: darahJp(id.golongan_darah),
    G7: maritalJp(id.status_nikah),
    J7: tidakAda(id.anak),
    L7: s(data.fisik.bb),
    P7: tidakAda(id.paspor),
    D8: tidakAda(data.medis.riwayat_medis),
    J8: kacamataJp(data.medis.kacamata),
    H9: s(data.medis.mata_kiri),
    J9: s(data.medis.mata_kanan),
    K9: tanganJp(data.fisik.tangan_dominan),
    D9: bersih(raw.gaji_diharapkan ?? raw.gaji_diinginkan),
    M9: minum.label,
    N9: minum.jumlah,
    O9: rokok.label,
    P9: rokok.jumlah,
  };

  /* ── pendidikan: 4 baris tetap (11-14) ─────────────────────────────────── */
  for (let i = 0; i < EDU_ROWS; i++) {
    const row = EDU_START + i;
    const p = (data.pendidikan[i] || {}) as Record<string, unknown>;
    const masuk = yearMonth(p.masuk ?? p.tahun_masuk);
    const lulus = yearMonth(p.lulus ?? p.tahun_lulus);
    cells[`D${row}`] = masuk.y;
    cells[`E${row}`] = masuk.m;
    cells[`G${row}`] = lulus.y;
    cells[`H${row}`] = lulus.m;
    cells[`I${row}`] = levelJp(p.tingkat);
    cells[`J${row}`] = s(p.sekolah ?? p.nama_sekolah ?? p.sekolah_id);
    cells[`O${row}`] = s(p.jurusan ?? p.jurusan_id);
  }

  /* ── pengalaman kerja: 2 blok x 2 baris (16-17, 18-19) ─────────────────── */
  for (let i = 0; i < JOB_BLOCKS; i++) {
    const top = JOB_START + i * 2;
    const bottom = top + 1;
    const p = (data.pekerjaan[i] || {}) as Record<string, unknown>;
    const masuk = yearMonth(p.masuk ?? p.tahun_masuk);
    const keluar = yearMonth(p.keluar ?? p.tahun_keluar);
    cells[`D${top}`] = masuk.y;
    cells[`E${top}`] = masuk.m;
    cells[`D${bottom}`] = keluar.y;
    cells[`E${bottom}`] = keluar.m;
    cells[`F${top}`] = s(p.perusahaan ?? p.nama_perusahaan ?? p.perusahaan_id);
    cells[`J${top}`] = currency(p.gaji ?? p.penghasilan);
    cells[`L${top}`] = s(p.jabatan ?? p.jabatan_id);
    cells[`O${top}`] = s(p.jenis ?? p.status_kerja ?? p.jenis_pekerjaan);
  }

  /* ── keluarga: 3 baris (22-24) ─────────────────────────────────────────── */
  for (let i = 0; i < FAM_ROWS; i++) {
    const row = FAM_START + i;
    const p = (data.keluarga[i] || {}) as Record<string, unknown>;
    cells[`A${row}`] = hubunganJp(p.hubungan);
    cells[`C${row}`] = s(p.nama);
    cells[`G${row}`] = s(p.usia ?? p.umur).replace(/\D/g, '');
    cells[`I${row}`] = s(p.pekerjaan);
    cells[`L${row}`] = s(p.gaji ?? p.penghasilan).replace(/[^\d]/g, '')
      ? `${s(p.gaji ?? p.penghasilan).replace(/[^\d]/g, '')}円`
      : '';
    cells[`N${row}`] = tinggalJp(p.tinggal ?? p.status_tinggal);
    cells[`O${row}`] = s(p.hp ?? p.telepon ?? p.no_hp);
  }

  /* ── sertifikat & kenalan di Jepang ────────────────────────────────────── */
  // Kolom JFT di database memakai '-' sebagai "tidak ada"; di form cetak tanda
  // itu terbaca sebagai nilai, jadi dibuang di sini.
  cells.D25 = bersih(data.sertifikasi.jft ?? id.jft ?? raw.jft);
  const ken = data.kenalan_jepang;
  const kenalan = s(ken.nama_jp) || s(ken.nama_id);
  cells.D27 = kenalan || '無 Tidak Ada';

  return cells;
}

/** Bangun workbook. Diekspor supaya geometrinya bisa diuji. */
export async function buildFirmaWorkbook(data: CandidateData): Promise<Blob> {
  return buildXlsxForm({
    base64: RIREKISHO_FIRMA_BASE64,
    sheetPath: SHEET_PATH,
    drawingPath: DRAWING_PATH,
    photoPart: PHOTO_PART,
    photoRelId: PHOTO_REL_ID,
    photoBox: PHOTO_BOX,
    values: buildValues(data),
    photoUrl: s(data.uploads.photo),
    // Tab Excel memakai nama kandidat, bukan "FIRMA ELGA PRATAMA" dari berkas
    // contoh — kalau tidak, semua CV kandidat punya nama tab yang sama.
    sheetName: s(data.identitas.nama_lengkap),
  });
}

const template: CvTemplate = {
  id: 'rirekisho-firma',
  name: 'Rirekisho Excel (Firma Elga Pratama)',
  type: 'xlsx',
  description:
    'Form 履歴書 versi Firma Elga Pratama sebagai Excel — layout, merge, dan pas foto persis berkas aslinya; isinya diambil dari database.',
  category: 'form',
  icon: 'file-excel',
  async render(data: CandidateData, _context: RenderContext): Promise<RenderResult> {
    try {
      const blob = await buildFirmaWorkbook(data);
      return { success: true, mimeType: blob.type, fileName: cvFileName('CV_Firma', data), blob };
    } catch (e: unknown) {
      return { success: false, mimeType: '', fileName: '', error: e instanceof Error ? e.message : 'Excel render error' };
    }
  },
};

export default template;
