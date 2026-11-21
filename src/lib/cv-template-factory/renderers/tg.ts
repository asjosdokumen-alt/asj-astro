/**
 * tg.ts — "CV TG" (template ke-7): satu baris data kandidat di sheet induk.
 *
 * ASAL BENTUK
 * -----------
 * `D:/TG 2026.07.02.xlsx` (kosong) dan dua CV yang diisi pemilik secara MANUAL
 * (`D:/6. DEVIANA AMANDA PUTRI_CV.xlsx`, `D:/7. RATIH KUSUMA DEWI_CV.xlsx`).
 * Ketiganya berbagi geometri yang sama — terukur: sheet `Daftar` 13 kolom /
 * 116 baris / 0 merge / 591 sel; sheet `List Isian` 60 kolom / 47 baris /
 * 0 merge / 3.195 sel. Karena itu keduanya satu template: satu blanko, dua
 * contoh isian.
 *
 * BENTUKNYA BUKAN FORM PORTRAIT
 * -----------------------------
 * Enam template sebelumnya adalah formulir yang dicetak. Yang ini adalah
 * **sheet data induk**: baris 3 = 68 judul kolom (A–BP), baris 4–48 = satu baris
 * per kandidat, dan pas foto di-anchor di kolom BP. Pemilik mengisi SATU baris
 * per kandidat, jadi keluaran template ini pun satu baris — bukan halaman CV.
 * Jangan "memperbaikinya" jadi form portrait: yang diminta adalah bentuk ini.
 *
 * ATURAN PENGISIAN (dari dua berkas manual, bukan tebakan)
 * -------------------------------------------------------
 *   1. **Dropdown ditulis apa adanya sebagai pasangan `JP ID`.** Pemilik memilih
 *      dari daftar di sheet `Daftar` lalu menghapus furigana-nya: `女 Wanita`,
 *      `未婚 Single`, `右利き Kanan`, `農家 Petani`, `父 Ayah`, `高等学校 SMA`.
 *      Karena itu nilainya dirakit dari kosakata sheet `Daftar` (lihat peta di
 *      bawah), bukan dari nilai mentah database yang berbahasa Indonesia saja.
 *   2. **Esai memakai bahasa Jepang dan mempertahankan barisnya.** `BO` 自己アピール
 *      di berkas manual tiga baris (`はじめまして…` / `私の長所は…` /
 *      `よろしくお願いいたします。`), `BN` keahlian khusus satu kalimat. Nilai
 *      diambil dari kolom `_jp` (hasil AI CV); kalau kosong, teks Indonesia
 *      dipakai apa adanya — menerjemahkan di dalam renderer berarti mengarang.
 *   3. **Umur tidak ditulis.** `H4` adalah rumus `DATEDIF(G4,TODAY(),"Y")` milik
 *      form; menulis teks ke sana mematikan rumusnya. Yang diisi `G4` sebagai
 *      nomor seri Excel, dan Excel menghitung umurnya sendiri.
 *
 * SEL YANG SENGAJA TIDAK DIISI
 * ----------------------------
 *   `P4` ukuran celana — tidak ada kolomnya di database (`fisik` hanya punya
 *   topi/baju/sepatu). Berkas manual menulis `M`; menebaknya dari ukuran baju
 *   adalah mengarang ukuran badan.
 */
import type { CvTemplate, CandidateData, RenderContext, RenderResult } from '../types';
import { TG_BASE64 } from '../templates/tg.b64';
import {
  buildXlsxForm,
  cvFileName,
  excelSerial,
  kanaJp,
  negatif,
  s,
} from './xlsx-form';
import { getTingkatVal, isGood } from '../../helpers_cv';
import { labelJp } from '../../opsi-form';

const SHEET_PATH = 'xl/worksheets/sheet2.xml';
const DRAWING_PATH = 'xl/drawings/drawing1.xml';
const PHOTO_PART = 'xl/media/image1.png';
const PHOTO_REL_ID = 'rId1';
/** Kotak pas foto, persis anchor berkas contoh: BP4:BP7. */
const PHOTO_RANGE = 'BP4:BP7';

/* ── kosakata dropdown ─────────────────────────────────────────────────────── */

/** `A` → `A 型`; bentuk `＋` mengikuti sheet `Daftar`, bukan `+` ASCII. */
const GOL_DARAH: Record<string, string> = {
  A: 'A 型', 'A+': 'A＋ 型', 'A-': 'A− 型',
  B: 'B 型', 'B+': 'B＋ 型', 'B-': 'B− 型',
  AB: 'AB 型', 'AB+': 'AB＋ 型', 'AB-': 'AB− 型',
  O: 'O 型', 'O+': 'O＋ 型', 'O-': 'O− 型',
};

const GENDER: Record<string, string> = {
  'LAKI-LAKI': '男 Pria', PRIA: '男 Pria',
  PEREMPUAN: '女 Wanita', WANITA: '女 Wanita',
};

const STATUS_NIKAH: Record<string, string> = {
  'BELUM MENIKAH': '未婚 Single',
  SINGLE: '未婚 Single',
  MENIKAH: '既婚 Menikah',
  KAWIN: '既婚 Menikah',
  CERAI: '離婚 Cerai',
  'CERAI MENINGGAL': '死別離婚 Cerai mati',
  'CERAI MATI': '死別離婚 Cerai mati',
};

const TANGAN: Record<string, string> = {
  KANAN: '右利き Kanan', KIRI: '左利き Kidal',
};

/** Jenjang → baris sheet `Daftar` kolom B. Urut dari yang paling spesifik. */
const SEKOLAH: Array<[RegExp, string]> = [
  [/^(SMK|SEKOLAH MENENGAH KEJURUAN)/, '高等専門学校 SMK'],
  [/^(SMA|SMU|SEKOLAH MENENGAH ATAS|MA)\b/, '高等学校 SMA'],
  [/^(SMP|MTS|SEKOLAH MENENGAH PERTAMA)/, '中学校 SMP'],
  [/^(SD|MI|SEKOLAH DASAR)/, '小学校 SD'],
  [/^(S2|MAGISTER|PASCASARJANA)/, '大学院 S2'],
  [/^(S1|SARJANA|UNIVERSITAS)/, '大学 S1'],
  [/^(D[1-4]|DIPLOMA|AKADEMI)/, '短大 Diploma'],
];

/** 続柄 — kunci `HUBUNGAN_*` di `opsi-form.ts` → kosakata sheet `Daftar` kolom L. */
const HUBUNGAN: Record<string, string> = {
  AYAH: '父 Ayah', IBU: '母 Ibu', SUAMI: '夫 Suami', ISTRI: '妻 Istri',
  'ANAK LAKI-LAKI': '息子 Anak (Pria)', 'ANAK PEREMPUAN': '娘 Anak (Wanita)',
  'KAKAK LAKI-LAKI': '兄 Abang', 'KAKAK PEREMPUAN': '姉 Mba',
  'ADIK LAKI-LAKI': '弟 Adek(Pria)', 'ADIK PEREMPUAN': '妹 Adek(Wanita)',
  KAKAK: '兄 Abang', ADIK: '弟 Adek(Pria)', ANAK: '息子 Anak (Pria)',
  KAKEK: 'お祖父 Kakek', NENEK: 'お祖母 Nenek',
  PAMAN: '叔父 Paman', BIBI: '叔母 Bibi',
  SAUDARA: '親戚 Saudara', KERABAT: '親戚 Saudara', SEPUPU: '親戚 Saudara',
};

/** Pekerjaan → kolom N sheet `Daftar`. Ejaan Indonesia mengikuti berkas manual. */
const PEKERJAAN: Record<string, string> = {
  PETANI: '農家 Petani',
  'BURUH TANI': '日雇い労働者 Buruh harian',
  PETERNAK: '農家 Petani',
  'KARYAWAN SWASTA': '会社員 Karyawan swasta',
  'KARYAWAN BANK': '銀行員 Karyawan bank',
  PNS: '公民 PNS',
  GURU: '教師 Guru/Dosen',
  DOSEN: '教師 Guru/Dosen',
  'IBU RUMAH TANGGA': '主婦　Ibu rumah tangga',
  'RUMAH TANGGA': '主婦　Ibu rumah tangga',
  'TIDAK BEKERJA': '無職 Tidak kerja',
  'BELUM BEKERJA': '無職 Tidak kerja',
  PELAJAR: '学生 Pelajar/mahasiswa',
  MAHASISWA: '学生 Pelajar/mahasiswa',
  PEDAGANG: '商人 Pedagang',
  WIRASWASTA: '自営業 Usaha sendiri',
  NELAYAN: '漁師 Nelayan',
  BURUH: '日雇い労働者 Buruh harian',
};

/** Visa → kolom S sheet `Daftar`. */
const VISA: Array<[RegExp, string]> = [
  [/TOKUTEI|特定技能|SSW/i, '特定技能 TG'],
  [/MAGANG|実習|JISSHU/i, '実習生 Magang'],
  [/TOUR|TURIS|WISATA|旅行/i, '旅行 Turis'],
  [/SHORT|短期/i, '短期滞在 Visit temporary'],
  [/STUD|BELAJAR|留学|RYUGAKU/i, '留学 Student'],
];

/** Cari padanan kosakata; kalau tidak ada, pakai nilai apa adanya. */
function cari(peta: Record<string, string>, nilai: unknown): string {
  const kunci = s(nilai).trim().toUpperCase();
  if (!kunci) return '';
  return peta[kunci] ?? '';
}

/** `KARYAWAN SWASTA` → `Karyawan swasta` untuk nilai yang tidak ada di peta. */
function titleCase(nilai: string): string {
  const t = nilai.trim().toLowerCase();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Pekerjaan: peta di atas dulu, lalu rakit `JP ID` dari daftar `PEKERJAAN`
 * (`PETANI (農家)` → `農家 Petani`). Nilai bebas dikembalikan apa adanya.
 */
function pekerjaanPair(nilai: unknown): string {
  const langsung = cari(PEKERJAAN, nilai);
  if (langsung) return langsung;
  const mentah = s(nilai).trim();
  if (!isGood(mentah)) return '';
  const jp = labelJp(mentah);
  if (jp && jp !== mentah) return `${jp} ${titleCase(mentah)}`;
  return mentah;
}

function hubunganPair(nilai: unknown): string {
  return cari(HUBUNGAN, nilai) || s(nilai).trim();
}

function sekolahPair(tingkat: unknown): string {
  const t = s(tingkat).trim().toUpperCase();
  if (!t) return '';
  for (const [re, label] of SEKOLAH) if (re.test(t)) return label;
  return s(tingkat).trim();
}

function golonganPair(nilai: unknown): string {
  const t = s(nilai).trim().toUpperCase().replace(/＋/g, '+').replace(/−/g, '-');
  if (!t) return '';
  if (/^(TIDAK|TAU|UNKNOWN|不明)/.test(t)) return '不明 \nTidak tau';
  return GOL_DARAH[t] ?? s(nilai).trim();
}

/** `有 Ada` / `無 Tidak`; `pernah` memakai pasangan `有 Pernah` / `無 Belum`. */
function yaTidak(nilai: unknown, pernah = false): string {
  const tidak = negatif(nilai);
  if (pernah) return tidak ? '無 Belum' : '有 Pernah';
  return tidak ? '無 Tidak' : '有 Ada';
}

function visaPair(nilai: unknown): string {
  const t = s(nilai).trim();
  if (!isGood(t)) return '';
  for (const [re, label] of VISA) if (re.test(t)) return label;
  return t;
}

/** Pendidikan terakhir = jenjang tertinggi yang tercatat (bukan baris terakhir). */
function pendidikanTerakhir(data: CandidateData): string {
  let best = '';
  let bestRank = 99;
  for (const p of data.pendidikan) {
    const rank = getTingkatVal(p.tingkat);
    if (rank < bestRank) {
      bestRank = rank;
      best = s(p.tingkat);
    }
  }
  return sekolahPair(best);
}

/**
 * Masa kerja: `2021年4月` → `2023年3月` menjadi `1年11ヶ月`.
 *
 * Kolomnya bernama "Masa/lama waktu", bukan "periode", jadi yang dicetak
 * durasinya. Tanggal yang belum lengkap tidak dipaksakan: kalau hanya ada tahun
 * masuk, hasilnya kosong daripada mencetak durasi karangan.
 */
function masaKerja(masuk: unknown, keluar: unknown): string {
  const m = /^(\d{4})(?:[-/](\d{1,2}))?/.exec(s(masuk).trim());
  if (!m) return '';
  const k = /^(\d{4})(?:[-/](\d{1,2}))?/.exec(s(keluar).trim());
  if (!k) return '';
  const bulanAwal = (Number(m[1]) * 12) + (m[2] ? Number(m[2]) - 1 : 0);
  const bulanAkhir = (Number(k[1]) * 12) + (k[2] ? Number(k[2]) - 1 : 0);
  const total = bulanAkhir - bulanAwal;
  if (!Number.isFinite(total) || total <= 0) return '';
  const tahun = Math.floor(total / 12);
  const bulan = total % 12;
  if (!tahun && !bulan) return '1ヶ月未満';
  return `${tahun ? `${tahun}年` : ''}${bulan ? `${bulan}ヶ月` : ''}`;
}

/** Daerah asal: tempat lahir, lalu kota/kabupaten yang tertulis di alamat. */
function daerahAsal(data: CandidateData): string {
  const lahir = s(data.identitas.tempat_lahir).trim();
  if (isGood(lahir)) return lahir.toUpperCase();
  const alamat = s(data.identitas.alamat);
  const m = /(?:KAB\.?|KABUPATEN|KOTA)\s+([A-Za-z ]+?)(?:,|\d|$)/i.exec(alamat);
  return m?.[1] ? m[1].trim().toUpperCase() : '';
}

/** `150 cm` — angka tanpa satuan ditambahi satuan, yang sudah punya dibiarkan. */
function bersatuan(nilai: unknown, satuan: string): string {
  const t = s(nilai).trim();
  if (!isGood(t)) return '';
  return /[a-zA-Z]/.test(t) ? t : `${t} ${satuan}`;
}

/** Sel → nilai. Diekspor supaya bisa diuji tanpa membangun zip. */
export function buildValues(data: CandidateData): Record<string, string> {
  const id = data.identitas;
  const fisik = data.fisik;
  const medis = data.medis;
  const wwn = data.wawancara;
  const kj = data.kenalan_jepang;
  const cells: Record<string, string> = {};

  /* Kolom A = nomor urut baris di sheet induk. Tidak ada kolomnya di database,
     dan kedua berkas manual pemilik menulis `001` — jadi nilainya tetap, bukan
     ditebak dari `id_kandidat` (yang formatnya lain). */
  cells.A4 = '001';
  cells.B4 = s(id.nama_lengkap).trim();
  cells.C4 = kanaJp(id.katakana);
  cells.D4 = s(id.alamat).trim();
  cells.E4 = s(id.hp).trim();
  cells.F4 = cari(GENDER, id.gender) || s(id.gender).trim();
  cells.I4 = pendidikanTerakhir(data);
  cells.J4 = cari(STATUS_NIKAH, id.status_nikah) || s(id.status_nikah).trim();
  cells.K4 = bersatuan(fisik.tb, 'cm');
  cells.L4 = bersatuan(fisik.bb, 'kg');
  cells.M4 = s(medis.mata_kanan).trim();
  cells.N4 = s(medis.mata_kiri).trim();
  cells.O4 = cari(TANGAN, fisik.tangan_dominan) || s(fisik.tangan_dominan).trim();
  /* P4 ukuran celana sengaja kosong — tidak ada kolomnya di database. */
  cells.Q4 = s(fisik.baju).trim();
  cells.R4 = bersatuan(fisik.sepatu, 'cm');
  cells.S4 = golonganPair(id.golongan_darah);
  cells.T4 = daerahAsal(data);

  /* ── keluarga: 9 blok × (続柄, 年齢, 職業) = U..AU ─────────────────────── */
  const KELUARGA_KOLOM = ['U', 'X', 'AA', 'AD', 'AG', 'AJ', 'AM', 'AP', 'AS'];
  data.keluarga.slice(0, 9).forEach((p, i) => {
    const kolom = KELUARGA_KOLOM[i];
    const col = (n: number) => String.fromCharCode(kolom.charCodeAt(0) + n);
    cells[`${kolom}4`] = hubunganPair(p.hubungan);
    const usia = s(p.usia ?? p.umur).replace(/[^\d]/g, '');
    cells[`${col(1)}4`] = usia ? `${usia}歳` : '';
    cells[`${col(2)}4`] = pekerjaanPair(p.pekerjaan);
  });

  /* ── riwayat kerja: 4 blok × (nama, masa) = AV..BC ────────────────────── */
  const KERJA_KOLOM = ['AV', 'AX', 'AZ', 'BB'];
  data.pekerjaan.slice(0, 4).forEach((p, i) => {
    const kolom = KERJA_KOLOM[i];
    const next = `${String.fromCharCode(kolom.charCodeAt(0) + 1)}4`;
    cells[`${kolom}4`] = s(p.perusahaan).trim();
    cells[next] = masaKerja(p.masuk, p.keluar);
  });

  cells.BD4 = s(wwn.penghasilan).trim();
  cells.BE4 = yaTidak(id.paspor);
  cells.BF4 = yaTidak(id.status_eks_jepang, true);
  cells.BG4 = visaPair(id.visa_jepang);
  cells.BH4 = yaTidak(kj.nama_id || kj.nama_jp);
  cells.BI4 = s(kj.alamat_id).trim();
  cells.BJ4 = visaPair(kj.status_tinggal);
  cells.BK4 = yaTidak(medis.alkohol);
  cells.BL4 = yaTidak(medis.rokok);
  cells.BM4 = yaTidak(medis.tato);
  cells.BO4 = s(wwn.promosi_jp).trim() || s(wwn.promosi).trim();
  cells.BN4 = s(wwn.keahlian_khusus_jp).trim() || s(wwn.keahlian_khusus).trim();

  /* Nilai kosong dibuang supaya sel yang tidak punya data tetap memakai style
     template apa adanya (dan tidak ditulis sebagai string kosong). */
  for (const [k, v] of Object.entries(cells)) if (!v) delete cells[k];
  return cells;
}

/** Bangun workbook. Diekspor supaya geometrinya bisa diuji. */
export async function buildTgWorkbook(data: CandidateData): Promise<Blob> {
  const tanggalLahir = excelSerial(data.identitas.tgl_lahir);
  return buildXlsxForm({
    base64: TG_BASE64,
    sheetPath: SHEET_PATH,
    drawingPath: DRAWING_PATH,
    photoPart: PHOTO_PART,
    photoRelId: PHOTO_REL_ID,
    photoRange: PHOTO_RANGE,
    values: buildValues(data),
    numbers: tanggalLahir === null ? {} : { G4: tanggalLahir },
    photoUrl: s(data.uploads.photo),
  });
}

const template: CvTemplate = {
  id: 'tg-database',
  name: 'CV TG (Form ke-7)',
  type: 'xlsx',
  description:
    'Sheet data induk seperti berkas TG 2026.07.02: 68 kolom (A–BP), satu baris per kandidat, pas foto di BP. Dropdown ditulis sebagai pasangan Jepang–Indonesia persis seperti pengisian manual, esai 自己アピール memakai teks Jepang dan barisnya dipertahankan, umur dihitung rumus form.',
  category: 'form',
  icon: 'file-excel',
  async render(data: CandidateData, _context: RenderContext): Promise<RenderResult> {
    try {
      const blob = await buildTgWorkbook(data);
      return { success: true, mimeType: blob.type, fileName: cvFileName(data), blob };
    } catch (e: unknown) {
      return {
        success: false,
        mimeType: '',
        fileName: '',
        error: e instanceof Error ? e.message : 'Excel render error',
      };
    }
  },
};

export default template;
