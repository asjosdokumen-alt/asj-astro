/**
 * rirekisho-firma.ts — form CV "FIRMA ELGA PRATAMA" sebagai .xlsx, diisi dari database.
 *
 * ASAL BERKAS
 * -----------
 * Pemilik mengirim versi kedua form ini (2026-10-26, `1. FIRMA ELGA PRATAMA_CV.xlsx`,
 * 2,75 MB) setelah versi pertama dipakai. Bedanya: bagian 家族構成 punya TUJUH
 * baris (bukan tiga), dan pemilik meminta 職歴 memuat TIGA pekerjaan — blok
 * ketiga disisipkan saat template dikosongkan (lihat
 * `templates/rirekisho-firma.b64.ts` dan `blank-firma2.py`).
 *
 * Foto contoh (2,7 MB, 98% berkas) DIBUANG: itu wajah orang lain, dan template
 * tidak boleh membawanya. Lubang pas foto tetap di tempatnya dan diisi foto
 * kandidat saat render.
 *
 * TATA LETAK (jangan diubah tanpa menyesuaikan peta sel)
 *   1-9    identitas          11-14  pendidikan
 *   16-21  tiga blok kerja    22-30  keluarga (7 baris)
 *   31-33  sertifikat & catatan
 *
 * NILAI BAWAAN YANG DISENGAJA
 * ---------------------------
 * Pemilik 2026-10-26: "standar gaji isi sama kayak template saja, mata normal
 * itu standart 1,0 sama kayak template kecuali minus dll". Jadi:
 *   • D9 (希望収入) = `15万円／月` kalau database tidak punya angkanya;
 *   • H9/J9 (visi) = `1,0` (koma desimal, seperti form) kalau kosong — nilai
 *     dari database tetap dipakai apa adanya (mis. `-0,5`);
 *   • M9/O9 = `無` + `Tidak` untuk yang tidak, `有` + `Ya` untuk yang ya,
 *     dengan N9/P9 = jumlah per hari (0 kalau tidak).
 *
 * SEL YANG DULU KOSONG — SEKARANG DIISI
 * --------------------------------------
 * Sampai 2026-10-26 baris 31-33 hanya terisi kolom pertamanya. Migrasi 022
 * memberi kolom untuk sisanya: `D32` 日本語能力 (`bahasa`/`level_bahasa_jepang`),
 * `L31` 日本語学習期間 (`lama_belajar_jp`), `L32` 渡航経験 negara lain
 * (`negara_lain`), `K33` その他事項 (`catatan_cv`). Yang tetap kosong hanya
 * sel sub-judul `G31`/`G32`/`G33` — di template aslinya pun tidak berteks.
 */
import type { CvTemplate, CandidateData, RenderContext, RenderResult } from '../types';
import { RIREKISHO_FIRMA_BASE64 } from '../templates/rirekisho-firma.b64';
import { isGood } from '../../helpers_cv';
import {
  buildXlsxForm,
  birthDate,
  cvFileName,
  currency,
  durasiJp,
  negatif,
  s,
  yearMonth,
  type PhotoBox,
} from './xlsx-form';

const SHEET_PATH = 'xl/worksheets/sheet1.xml';
/** Foto contoh ada di part ini; renderer menimpanya dengan foto kandidat. */
const PHOTO_PART = 'xl/media/image3.png';
/**
 * Kanvas foto 600x800 px (3:4, bentuk pas foto), EMU = px x 9525.
 *
 * Anchor di template ini `twoCellAnchor` (kotak N2:P6), jadi TIDAK ada
 * `<xdr:ext>` untuk ditambal — ukuran akhir ditentukan sel. Yang perlu
 * disiapkan hanya gambarnya, pada bentuk yang sama dengan kotaknya supaya
 * tidak gepeng.
 */
const PHOTO_BOX: PhotoBox = { cx: 600 * 9525, cy: 800 * 9525 };

/** Baris pertama tiap bagian, persis seperti form cetaknya. */
const EDU_START = 11;
const EDU_ROWS = 4;
const JOB_START = 16;
/** Satu pekerjaan = dua baris (masuk di baris atas, keluar di baris bawah). */
const JOB_BLOCKS = 3;
const FAM_START = 24;
const FAM_ROWS = 7;

const AGAMA_JP: Record<string, string> = {
  ISLAM: 'イスラム教', KRISTEN: 'キリスト教', KATOLIK: 'カトリック',
  HINDU: 'ヒンドゥー教', BUDHA: '仏教', BUDDHA: '仏教', KONGHUCU: '儒教',
};

/**
 * Nilai yang di database ditulis `-` (artinya "belum ada") tidak boleh tercetak
 * sebagai tanda minus di formulir — selnya lebih baik kosong.
 */
function bersih(v: unknown): string {
  const t = s(v);
  return isGood(t) ? t : '';
}

/** "無\nTidak" untuk yang kosong/negatif — dua baris, persis seperti form. */
function tidakAda(raw: unknown, kosong = '無\nTidak'): string {
  return negatif(raw) ? kosong : s(raw).trim();
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
  return negatif(raw) ? 'かけない' : s(raw);
}

/**
 * Visi: form memakai koma desimal (`1,0`). Nilai dari database dirapikan ke
 * bentuk itu, dan yang kosong memakai standar form.
 */
function mata(raw: unknown): string {
  const t = bersih(raw).replace('.', ',');
  return t || '1,0';
}

/** 希望収入: `15万円／月` — bawaan form kalau database tidak punya angkanya. */
function gajiDiharapkan(raw: unknown): string {
  const t = bersih(raw);
  if (!t) return '15万円／月';
  const n = Number(t.replace(/[^\d]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return t;
  return `${Math.round(n / 10000)}万円／月`;
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
 * Pasangan (label, jumlah) untuk kolom kebiasaan — alkohol dan rokok.
 * Form mencetak `無 Tidak` + `0` untuk yang tidak, `有 Ya` + angka untuk yang ya
 * (jumlah batang/gelas per hari).
 */
function kebiasaan(v: unknown): { label: string; jumlah: string } {
  if (negatif(v)) return { label: '無\nTidak', jumlah: '0' };
  const n = s(v).replace(/[^\d]/g, '');
  return { label: '有\nYa', jumlah: n };
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
    D2: bersih(id.katakana),
    D3: bersih(id.nama_lengkap),
    D4: bersih(id.alamat),
    D5: birthDate(id.tgl_lahir),
    I5: bersih(id.umur),
    L5: bersih(genderJp(id.gender)),
    D6: bersih(id.hp),
    I6: agamaJp(id.agama),
    L6: bersih(data.fisik.tb),
    D7: darahJp(id.golongan_darah),
    G7: maritalJp(id.status_nikah),
    J7: tidakAda(id.anak),
    L7: bersih(data.fisik.bb),
    P7: tidakAda(id.paspor),
    D8: tidakAda(data.medis.riwayat_medis),
    J8: kacamataJp(data.medis.kacamata),
    H9: mata(data.medis.mata_kiri),
    J9: mata(data.medis.mata_kanan),
    K9: bersih(tanganJp(data.fisik.tangan_dominan)),
    /* 希望収入. Dulu membaca `raw.gaji_diharapkan` / `raw.gaji_diinginkan` — dua
       kunci yang TIDAK PERNAH ada di respons `getDrafCvMaster`, sehingga sel ini
       selalu jatuh ke bawaan `15万円／月` walaupun `harapan_gaji_yen` terisi. */
    D9: gajiDiharapkan(data.wawancara.gaji_yen),
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

  /* ── pengalaman kerja: 3 blok x 2 baris (16-21) ────────────────────────── */
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

  /* ── keluarga: 7 baris (24-30) ─────────────────────────────────────────── */
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

  /* ── sertifikat & kenalan di Jepang (31 & 33) ──────────────────────────── */
  // `??` tidak pernah jatuh ke cadangan: `data.sertifikasi.jft` SELALU ada
  // (string kosong kalau tidak diisi), jadi rantainya harus `||` pada nilai
  // yang sudah dibersihkan.
  cells.D31 = bersih(data.sertifikasi.jft) || bersih(id.jft) || bersih(raw.jft);
  /* Baris 31-33: kolom kedua tiap baris (G/H, I/J, K) dulu dibiarkan kosong.
     Sekarang diisi dari kolom yang memang disediakan untuknya. */
  cells.D32 = bersih(data.sertifikasi.bahasa) || bersih(data.sertifikasi.level_bahasa_jepang);
  cells.L31 = durasiJp(data.sertifikasi.lama_belajar_jp);
  cells.L32 = bersih(data.identitas.negara_lain);
  cells.K33 = bersih(data.sertifikasi.catatan_cv);
  const ken = data.kenalan_jepang;
  // `-` adalah tanda "belum ada" di database, bukan nama orang.
  const kenalan = bersih(ken.nama_jp) || bersih(ken.nama_id);
  cells.D33 = kenalan || '無 Tidak Ada';

  return cells;
}

/** Bangun workbook. Diekspor supaya geometrinya bisa diuji. */
export async function buildFirmaWorkbook(data: CandidateData): Promise<Blob> {
  return buildXlsxForm({
    base64: RIREKISHO_FIRMA_BASE64,
    sheetPath: SHEET_PATH,
    photoPart: PHOTO_PART,
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
      return { success: true, mimeType: blob.type, fileName: cvFileName(data), blob };
    } catch (e: unknown) {
      return { success: false, mimeType: '', fileName: '', error: e instanceof Error ? e.message : 'Excel render error' };
    }
  },
};

export default template;
