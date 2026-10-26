/**
 * jipa.ts — form CV 特定技能 "JIPA" sebagai .xlsx, diisi dari database.
 *
 * ASAL BERKAS
 * -----------
 * `F:/JIPA2026.xlsx` — form yang SUDAH TERISI untuk kandidat RIYAN SAPUTRA.
 * Berbeda dari dua form sebelumnya: ini form 特定技能 (bukan 実習生), jadi
 * bagiannya pun lain — 資格試験 (SSW/JLPT/JFT/SIM), 訪日経験, dan 在日の家族・
 * 友人. TIDAK ada できる作業 dan TIDAK ada 性格診断テスト.
 *
 * PETA SEL
 * --------
 *   5      nomor kandidat (H5)
 *   6-16   identitas: nama (F7-F9), lahir (F11), usia (J11), fisik & kebiasaan
 *          di kolom K/L, 喫煙/入れ墨/アレルギー/飲酒 di baris 16
 *   19-23  pendidikan, 5 baris: B/C tahun-bulan masuk, E/F keluar, G sekolah,
 *          K jurusan
 *   27-30  pekerjaan, 4 baris: B/C masuk, E/F keluar, G perusahaan, L 業種
 *   33-40  keluarga, 8 baris: B 続柄, E 同居区分, G nama, J usia, K pekerjaan
 *   43-45  keluarga/teman di Jepang, 3 baris
 *   47-51  資格試験, 5 baris: F nama ujian, I keterangan
 *   54-56  訪日経験
 *   58-61  kontak: HP, email, alamat, KTP
 *
 * SEL YANG TIDAK DIISI (tidak ada kolomnya)
 * -----------------------------------------
 * `B5` CODE LOWONGAN, `J5` 希望職種, `E54` ビザ種類, `E56` 在日期間,
 * `B46`-`E51` tanggal perolehan tiap sertifikat, `L60` tanggal pengisian.
 * Semua itu diisi agensi, bukan berasal dari data kandidat.
 */
import type { CvTemplate, CandidateData, RenderContext, RenderResult } from '../types';
import { JIPA_BASE64 } from '../templates/jipa.b64';
import { isGood } from '../../helpers_cv';
import { buildXlsxForm, cvFileName, kanaJp, s, type PhotoBox } from './xlsx-form';

const SHEET_PATH = 'xl/worksheets/sheet1.xml';
const DRAWING_PATH = 'xl/drawings/drawing1.xml';
const PHOTO_PART = 'xl/media/image1.png';
const PHOTO_REL_ID = 'rId1';
/** Kotak pas foto B6:E13, 1024x1536 px (2:3) seperti berkas aslinya. */
const PHOTO_BOX: PhotoBox = { cx: 1024 * 9525, cy: 1536 * 9525 };

const EDU_START = 19;
const EDU_ROWS = 5;
const JOB_START = 27;
const JOB_ROWS = 4;
const FAM_START = 33;
const FAM_ROWS = 8;
const KEN_START = 43;
const CERT_START = 47;
const CERT_ROWS = 5;

/* ── kosakata dropdown (harus PERSIS sama dengan daftar di template) ────────── */

const AGAMA: Record<string, string> = {
  ISLAM: 'イスラム教', KRISTEN: 'プロテスタント教', KATOLIK: 'カトリック教',
  HINDU: 'ヒンズー教', BUDHA: '仏教', BUDDHA: '仏教', KONGHUCU: '仏教',
};

/** `父(AYAH)`, `母(IBU)`, … — sama untuk B33 dan B34:B39 kecuali 祖父母. */
const HUBUNGAN: [RegExp, string][] = [
  [/AYAH|BAPAK/i, '父(AYAH)'],
  [/^IBU|MAMA|MOTHER/i, '母(IBU)'],
  [/ISTRI/i, '妻(ISTRI)'],
  [/SUAMI/i, '夫(SUAMI)'],
  [/KAKEK|祖父/i, '祖父(KAKEK)'],
  [/NENEK|祖母/i, '祖母(NENEK)'],
  [/KAKAK.*PEREMPUAN|KAKAK.*WANITA/i, '姉(KAKAK PEREMPUAN)'],
  [/KAKAK/i, '兄（KAKAK LAKI-LAKI)'],
  [/ADIK.*PEREMPUAN|ADIK.*WANITA/i, '妹(ADIK PEREMPUAN)'],
  [/ADIK/i, '弟(ADIK LAKI-LAKI)'],
  [/ANAK|CHILD/i, '子供(ANAK)'],
];

function bersih(v: unknown): string {
  const t = s(v).trim();
  return isGood(t) ? t : '';
}

function angka(v: unknown): string {
  return bersih(v).replace(/[^\d]/g, '');
}

/** `6281553851057` → `081553851057`. */
function hpLokal(v: unknown): string {
  const t = angka(v);
  if (!t) return '';
  return t.startsWith('62') ? `0${t.slice(2)}` : t;
}

/** `2021-08` / `2021` → tahun + bulan (tanpa sufiks; form punya kolom sendiri). */
function ym(v: unknown): { y: string; m: string } {
  const raw = bersih(v);
  if (!raw) return { y: '', m: '' };
  const full = /^(\d{4})[-/](\d{1,2})/.exec(raw);
  if (full) return { y: full[1], m: String(parseInt(full[2], 10)) };
  const tahun = /^(\d{4})/.exec(raw);
  return { y: tahun ? tahun[1] : '', m: '' };
}

/** `2005-10-28` → `2005年10月28日`. */
function tanggalJp(v: unknown): string {
  const raw = bersih(v);
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(raw);
  if (!m) return '';
  return `${m[1]}年${String(m[2]).padStart(2, '0')}月${String(m[3]).padStart(2, '0')}日`;
}

function nikahJp(v: unknown): string {
  const t = s(v).toUpperCase();
  if (!isGood(t)) return '';
  if (t.includes('CERAI') || t.includes('DUDA') || t.includes('JANDA')) return '独身(離婚)(cerai)';
  if (t.includes('BELUM') || t.includes('SINGLE')) return '独身(Single)';
  if (t.includes('MENIKAH') || t.includes('KAWIN')) return '既婚(Menikah)';
  return '';
}

function darahJp(v: unknown): string {
  const t = s(v).trim().toUpperCase().replace(/型|[+-]/g, '');
  return /^(A|B|O|AB)$/.test(t) ? `${t} 型` : '不明';
}

/** 視力: `裸眼: 1.0`, standar form kalau database kosong. */
function mataJp(v: unknown): string {
  const t = bersih(v).toUpperCase();
  if (!isGood(t) || t.includes('NORMAL')) return '裸眼: 1.0';
  const m = /(\d+([.,]\d+)?)/.exec(t);
  return `裸眼: ${m ? m[1].replace(',', '.') : '1.0'}`;
}

function rokokJp(v: unknown): string {
  const t = s(v).toUpperCase();
  return !isGood(t) || /^(TIDAK|NO|NONE|-|無|0)$/.test(t) ? 'しない(TIDAK)' : 'する(MEROKOK)';
}

function minumJp(v: unknown): string {
  const t = s(v).toUpperCase();
  return !isGood(t) || /^(TIDAK|NO|NONE|-|無|0)$/.test(t) ? '飲まない(TIDAK MINUM)' : '飲む(MINUM)';
}

/** ある(ADA) / 無い(TIDAK) — dipakai 入れ墨 dan アレルギー. */
function adaJp(v: unknown): string {
  const t = s(v).toUpperCase();
  return !isGood(t) || /^(TIDAK|NO|NONE|-|無)$/.test(t) ? '無い(TIDAK)' : 'ある(ADA)';
}

function butaWarnaJp(v: unknown): string {
  const t = s(v).toUpperCase();
  return !isGood(t) || /^(TIDAK|NO|NONE|-|無)$/.test(t) ? '正常（NORMAL)' : bersih(v);
}

/** 同居 / 別居 / 独立. */
function tinggalJp(v: unknown): string {
  const t = s(v).toUpperCase();
  if (!isGood(t)) return '同居(t.l bersama)';
  if (t.includes('MANDIRI') || t.includes('INDEPENDEN')) return '独立(t.mandiri)';
  if (t.includes('TIDAK') || t.includes('BEDA') || t.includes('LUAR') || t.includes('PISAH')) return '別居(t.l pisah)';
  return '同居(t.l bersama)';
}

/** Tingkat sekolah → akhiran yang dipakai form (`… 小学校`). */
function tingkatJp(v: unknown): string {
  const t = s(v).toUpperCase();
  if (/^SD|DASAR/.test(t)) return '小学校';
  if (/^SMP|PERTAMA|MTS/.test(t)) return '中学校';
  if (/^SMK|KEJURUAN/.test(t)) return '専門学校';
  if (/^SMA|ATAS|^MA\b|MADRASAH ALIYAH/.test(t)) return '高校';
  if (/UNIVERSITAS|^S1|SARJANA/.test(t)) return '大学';
  return '';
}

/** 国公私 — nama sekolah negeri → 国立, selain itu 私立 (sama seperti form KINKI). */
function kouritsu(sekolah: string): string {
  return /^(SDN|SMPN|SMAN|SMKN|MIN|MTSN|MAN|NEGERI|SEKOLAH\s*NEGERI)/i.test(sekolah.trim()) ? '国立' : '私立';
}

/**
 * Nilai sertifikat yang berarti "tidak ada" (`TIDAK`, `無`, `-`) JANGAN dicetak
 * sebagai keterangan lulus — kolom `ssw`/`jft` di database memang diisi `TIDAK`
 * untuk kandidat yang belum punya sertifikatnya.
 */
function sertifikatAda(v: unknown): string {
  const t = bersih(v);
  if (!t) return '';
  return /^(TIDAK|NO|NONE|-|無|BELUM)$/i.test(t) ? '' : t;
}

/**
 * 職業 keluarga. `主婦` hanya sah di baris ke-2 (dropdown K34 memuatnya, K35:K40
 * tidak), jadi pemetaannya bergantung indeks baris.
 */
function pekerjaanJp(v: unknown, i: number): string {
  const t = s(v).toUpperCase();
  if (!isGood(t)) return '';
  if (/IBU RUMAH|RUMAH TANGGA|主婦/.test(t)) return i === 1 ? '主婦' : 'その他(lain-lain)';
  if (/PETANI|TANI|農業/.test(t)) return '農業(petani)';
  if (/WIRASWASTA|USAHA|自営/.test(t)) return '自営業(wirausaha)';
  if (/KARYAWAN|PABRIK|MANUFAKTUR|BURUH/.test(t)) return '製造業(manufaktur)';
  if (/RESTORAN|KULINER|WARUNG/.test(t)) return '飲食業(restoran dsb)';
  if (/HOTEL|PENGINAPAN/.test(t)) return '宿泊(perhotelan)';
  if (/PELAJAR|MAHASISWA|SEKOLAH|学生/.test(t)) return 'その他(lain-lain)';
  return 'その他(lain-lain)';
}

export function buildValues(data: CandidateData): Record<string, string> {
  const id = data.identitas;
  const cells: Record<string, string> = {
    /* ── identitas ──────────────────────────────────────────────────────── */
    H5: bersih(id.id_kandidat ?? (data.raw as Record<string, unknown>).id_kandidat),
    F7: bersih(id.nama_lengkap),
    F8: kanaJp(id.katakana),
    F9: bersih(id.panggilan_katakana) || bersih(id.panggilan),
    F11: tanggalJp(id.tgl_lahir),
    J11: angka(id.umur),
    F13: bersih(id.tempat_lahir).toUpperCase(),
    L6: angka(data.fisik.tb) ? `${angka(data.fisik.tb)}cm` : '',
    L7: angka(data.fisik.bb) ? `${angka(data.fisik.bb)}kg` : '',
    L8: darahJp(id.golongan_darah),
    L9: nikahJp(id.status_nikah),
    L10: `子供Anak\u3000${angka(id.anak) || '無し'}`,
    L11: AGAMA[s(id.agama).toUpperCase().trim()] ?? '',
    K14: mataJp(data.medis.mata_kiri),
    L14: mataJp(data.medis.mata_kanan),
    L16: butaWarnaJp(data.medis.buta_warna),
    B16: rokokJp(data.medis.rokok),
    F16: adaJp(data.medis.tato),
    H16: adaJp(data.medis.alergi),
    I16: /^(TIDAK|NO|NONE|-|無)$/i.test(bersih(data.medis.alergi)) || !isGood(bersih(data.medis.alergi))
      ? '無い(TIDAK)'
      : bersih(data.medis.alergi_jp) || bersih(data.medis.alergi),
    J16: minumJp(data.medis.alkohol),
    /* ── kontak ─────────────────────────────────────────────────────────── */
    E58: hpLokal(id.hp),
    // Kolom `email` sebagian baris menyimpan tautan `mailto:` apa adanya.
    E59: bersih(id.email).replace(/^mailto:/i, ''),
    E60: bersih(id.alamat),
    E61: bersih(id.ktp),
    /* ── 訪日経験 ───────────────────────────────────────────────────────── */
    B54: /^(TIDAK|NO|NONE|-|無|BELUM)$/i.test(bersih(id.status_eks_jepang)) || !isGood(bersih(id.status_eks_jepang))
      ? '無し(TIDAK)'
      : 'あり(ADA)',
  };

  /* ── pendidikan: 5 baris ────────────────────────────────────────────────── */
  for (let i = 0; i < EDU_ROWS; i++) {
    const row = EDU_START + i;
    const p = (data.pendidikan[i] || {}) as Record<string, unknown>;
    const masuk = ym(p.masuk ?? p.tahun_masuk);
    const lulus = ym(p.lulus ?? p.tahun_lulus);
    const sekolah = bersih(p.sekolah ?? p.nama_sekolah ?? p.sekolah_id);
    cells[`B${row}`] = masuk.y ? `${masuk.y}年` : '';
    cells[`C${row}`] = masuk.m ? `${masuk.m.padStart(2, '0')}月` : '';
    cells[`D${row}`] = masuk.y || lulus.y ? '-' : '';
    cells[`E${row}`] = lulus.y ? `${lulus.y}年` : '';
    cells[`F${row}`] = lulus.m ? `${lulus.m.padStart(2, '0')}月` : '';
    cells[`G${row}`] = isGood(sekolah)
      ? [kouritsu(sekolah), sekolah, tingkatJp(p.tingkat)].filter(Boolean).join(' ')
      : '';
    cells[`K${row}`] = bersih(p.jurusan ?? p.jurusan_id);
  }

  /* ── pekerjaan: 4 baris ─────────────────────────────────────────────────── */
  for (let i = 0; i < JOB_ROWS; i++) {
    const row = JOB_START + i;
    const p = (data.pekerjaan[i] || {}) as Record<string, unknown>;
    const masuk = ym(p.masuk ?? p.tahun_masuk);
    const keluar = ym(p.keluar ?? p.tahun_keluar);
    cells[`B${row}`] = masuk.y;
    cells[`C${row}`] = masuk.m;
    cells[`D${row}`] = masuk.y || keluar.y ? '-' : '';
    cells[`E${row}`] = keluar.y;
    cells[`F${row}`] = keluar.m;
    cells[`G${row}`] = bersih(p.perusahaan ?? p.nama_perusahaan ?? p.perusahaan_id);
    cells[`L${row}`] = bersih(p.bidang ?? p.industri);
  }

  /* ── keluarga: 8 baris ──────────────────────────────────────────────────── */
  for (let i = 0; i < FAM_ROWS; i++) {
    const row = FAM_START + i;
    const p = (data.keluarga[i] || {}) as Record<string, unknown>;
    const hub = s(p.hubungan).toUpperCase();
    cells[`B${row}`] = isGood(hub) ? (HUBUNGAN.find(([re]) => re.test(hub))?.[1] ?? '') : '';
    cells[`E${row}`] = isGood(hub) ? tinggalJp(p.tinggal ?? p.status_tinggal) : '';
    cells[`G${row}`] = bersih(p.nama);
    cells[`J${row}`] = angka(p.usia ?? p.umur) ? `${angka(p.usia ?? p.umur)}歳` : '';
    cells[`K${row}`] = pekerjaanJp(p.pekerjaan, i);
  }

  /* ── keluarga/teman di Jepang: 3 baris ──────────────────────────────────── */
  const ken = data.kenalan_jepang;
  const namaKen = bersih(ken.nama_jp) || bersih(ken.nama_id);
  if (isGood(namaKen)) {
    cells[`B${KEN_START}`] = bersih(ken.hubungan_jp) || bersih(ken.hubungan_id);
    cells[`E${KEN_START}`] = namaKen;
    cells[`J${KEN_START}`] = bersih(ken.status_tinggal) || bersih(ken.pekerjaan_jp);
    cells[`L${KEN_START}`] = bersih(ken.alamat_jp) || bersih(ken.alamat_id);
  }

  /* ── 資格試験: nama ujian + keterangan, berurutan dari baris 47 ─────────── */
  const ssw = sertifikatAda(data.sertifikasi.ssw);
  const jft = sertifikatAda(data.sertifikasi.jft);
  const sim = sertifikatAda(id.sim);
  const sertifikat: { label: string; detail: string }[] = [];
  if (isGood(ssw)) sertifikat.push({ label: '特定技能(SSW)', detail: ssw });
  if (isGood(jft)) {
    // `jft` di database dipakai untuk dua ujian sekaligus; yang berhuruf N
    // adalah JLPT, sisanya JFT Basic (A2/B1/…).
    sertifikat.push({
      label: /N[1-5]/.test(jft.toUpperCase()) ? '日本語能力(JLPT)' : '日本語基礎力(JFT Basic)',
      detail: jft,
    });
  }
  if (isGood(sim)) sertifikat.push({ label: '自動車免許(SIM A)', detail: sim });
  for (let i = 0; i < CERT_ROWS; i++) {
    const row = CERT_START + i;
    const c = sertifikat[i];
    cells[`F${row}`] = c ? c.label : '';
    cells[`I${row}`] = c ? c.detail : '';
  }

  return cells;
}

/** Bangun workbook. Diekspor supaya geometrinya bisa diuji. */
export async function buildJipaWorkbook(data: CandidateData): Promise<Blob> {
  return buildXlsxForm({
    base64: JIPA_BASE64,
    sheetPath: SHEET_PATH,
    drawingPath: DRAWING_PATH,
    photoPart: PHOTO_PART,
    photoRelId: PHOTO_REL_ID,
    photoBox: PHOTO_BOX,
    values: buildValues(data),
    photoUrl: s(data.uploads.photo),
    sheetName: s(data.identitas.nama_lengkap),
  });
}

const template: CvTemplate = {
  id: 'jipa',
  name: 'CV 特定技能 (JIPA)',
  type: 'xlsx',
  description:
    'Form 特定技能 候補者履歴書 sebagai Excel — 学歴 5 baris, 職歴 4 baris, 家族構成 8 baris, 資格試験 (SSW/JLPT/JFT/SIM), dan 訪日経験; isinya diambil dari database.',
  category: 'form',
  icon: 'file-excel',
  async render(data: CandidateData, _context: RenderContext): Promise<RenderResult> {
    try {
      const blob = await buildJipaWorkbook(data);
      return { success: true, mimeType: blob.type, fileName: cvFileName(data), blob };
    } catch (e: unknown) {
      return { success: false, mimeType: '', fileName: '', error: e instanceof Error ? e.message : 'Excel render error' };
    }
  },
};

export default template;
