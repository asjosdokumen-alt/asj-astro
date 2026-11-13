/**
 * kaigo-hyogo.ts — form CV "Kaigo Hyogo 履歴書 (特定技能 2026)" sebagai .xlsx.
 *
 * ASAL BERKAS
 * -----------
 * `F:/template/HERLINA MEY REYGITA CAHYANI_CV.xlsx` (2026-11-13) — CV contoh yang
 * sudah diisi untuk kandidat ASJ00191. Layoutnya identik dengan berkas kosong
 * `CV KAIGO HYOGO履歴書 - 特定技能 2026年.xlsx` (88 merge, A1:Z996, 14 kolom),
 * jadi keduanya satu template: satu contoh isian, satu blanko.
 *
 * Yang dipakai hanya LAYOUT-nya. Aset `templates/kaigo-hyogo.b64.ts` dibuat
 * `deliverables/kosongkan-kaigo.mjs`: seluruh sel data dikosongkan, foto diganti
 * PNG 1x1, dan `sharedStrings` dibangun ulang supaya nama/alamat/HP/keluarga
 * kandidat tidak tertinggal di berkas yang diunduh orang lain.
 *
 * BEDA DENGAN KELIMA FORM LAIN
 * ----------------------------
 * Ini satu-satunya form **dwibahasa**: setiap label berpasangan Indonesia–Jepang
 * (`氏名 ( Nama )`), kolomnya 14 (A–N), dan pas fotonya di `M3:N10`. Isinya
 * dicetak ke klien Jepang, jadi nilai yang punya padanan Jepang diterjemahkan
 * (jenis sekolah, 続柄, 有/無, status, jenis pekerjaan keluarga) sedangkan teks
 * bebas (nama, alamat, uraian kerja) dibiarkan apa adanya.
 *
 * TATA LETAK (jangan diubah tanpa menyesuaikan peta sel)
 *   1-11   identitas + pas foto (M3:N10)   21-26  pekerjaan (4 baris)
 *   12-14  riwayat ke Jepang               27-31  sertifikat (3 baris)
 *   15-20  pendidikan (4 baris)            32-40  keluarga (7 baris)
 *   41-43  tujuan ke Jepang                44     keterangan tambahan
 *
 * SEL YANG SENGAJA TIDAK DIISI
 * ----------------------------
 *   1. `C14` 特定技能残日数 — tidak ada kolomnya di database, dan berkas contoh
 *      juga kosong. Menebak sisa masa kerja = mengarang status visa.
 *   2. `I13` 渡航目的 — tidak ada kolomnya. Berkas contoh juga kosong.
 *   3. `B44:N44` 追加情報 — sel ini berisi PERTANYAAN template
 *      (「Apakah sedang dalam perawatan medis …」), bukan jawaban. Tidak ditulis
 *      supaya pertanyaannya tidak tertimpa; jawabannya belum punya sel.
 *   4. `A43` — baris komentar yang memang disediakan untuk agensi
 *      (「候補者は書かない」).
 *
 * NILAI YANG DITURUNKAN, BUKAN DISALIN
 * ------------------------------------
 *   • `E5` 年齢 dihitung dari tanggal lahir (berkas contoh menulis `20歳` dan
 *     itu kebetulan benar untuk kelahiran 2006-05-24, tetapi umur yang disimpan
 *     sebagai teks tidak pernah menua sendiri).
 *   • `M2` 作成日 = tanggal CV dibuat.
 *   • `B23` 在職中 bila tanggal keluar kosong — kalau tidak, pekerjaan yang
 *     masih berjalan tercetak seperti orang yang berhenti kerja.
 */
import type { CvTemplate, CandidateData, RenderContext, RenderResult } from '../types';
import { KAIGO_HYOGO_BASE64 } from '../templates/kaigo-hyogo.b64';
import { batasiRiwayatSekolah, isGood, isLpkTingkat, kanjiHubunganDari } from '../../helpers_cv';
import {
  buildXlsxForm,
  birthDate,
  cvFileName,
  kanaJp,
  negatif,
  s,
  safeSheetName,
} from './xlsx-form';

const SHEET_PATH = 'xl/worksheets/sheet1.xml';
const DRAWING_PATH = 'xl/drawings/drawing1.xml';
const PHOTO_PART = 'xl/media/image1.png';
/** Satu-satunya gambar di drawing template ini (bracket dekoratif ada di sheet2). */
const PHOTO_REL_ID = 'rId1';
/**
 * Kotak pas foto, PERSIS seperti berkas contoh: anchor `oneCellAnchor` di
 * `M3:N10` dengan `ext` 4362450 x 6600825 EMU (458 x 693 px) dan offset 0.
 * `photoRange` sengaja TIDAK dipakai: bingkai selnya 502 x 720 px, jadi
 * memakai geometri sel akan memperbesar foto 10% dari contoh.
 */
const PHOTO_BOX = { cx: 4362450, cy: 6600825 };

const EDU_START = 17;
const EDU_ROWS = 4;
const JOB_START = 23;
const JOB_ROWS = 4;
const CERT_START = 29;
const CERT_ROWS = 3;
const FAM_START = 34;
const FAM_ROWS = 7;

/** Buang placeholder database (`-`, `—`, kosong) supaya tidak masuk ke sel. */
function bersih(v: unknown): string {
  const t = s(v).trim();
  return isGood(t) ? t : '';
}

/** Teks Indonesia pada form ini ditulis huruf besar (nama, sekolah, perusahaan). */
function kapital(v: unknown): string {
  return bersih(v).toUpperCase();
}

/**
 * `2013-07` → `2013年 7月` — bentuk yang dipakai berkas contoh (ada spasi
 * sebelum bulan, karena sel-nya diisi tangan dari pola `年 月 日`).
 */
function tahunBulanJp(v: unknown): string {
  const t = bersih(v);
  if (!t) return '';
  const m = /^(\d{4})[-/](\d{1,2})/.exec(t);
  if (m) return `${m[1]}年 ${parseInt(m[2], 10)}月`;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}年 ${d.getMonth() + 1}月`;
}

/** Kolom 退職年月: kosong = masih bekerja → `在職中`. */
function tahunBulanAkhir(v: unknown): string {
  const t = bersih(v);
  if (!t) return '';
  if (/SEKARANG|NOW|SAAT INI|MASIH|在職/i.test(t)) return '在職中';
  return tahunBulanJp(t);
}

/**
 * 学歴 (Jenis Sekolah). Berkas contoh menulis **職業学校** untuk SMK — bukan
 * 高等学校 (rirekisho-detail) dan bukan 専門学校 (helpers_cv). Karena itu
 * pemetaannya ditulis di sini, mengikuti contohnya.
 *
 * Placeholder template sendiri berbunyi 「高校 / 専門高校 (Jurusan)
 * *Jika SMK Tuliskan jurusannya」 — jadi jurusan SMK ikut dicetak dalam kurung.
 * Berkas contoh melewatkannya; instruksi form yang dipakai.
 */
function jenisSekolahJp(tingkat: unknown, jurusan: unknown): string {
  const t = bersih(tingkat).toUpperCase();
  if (!t) return '';
  const jur = kapital(jurusan);
  const dengan = (nama: string) => (jur && /^SMK|KEJURUAN|^SMA/.test(t) ? `${nama}（${jur}）` : nama);
  if (/小学校/.test(t) || /^SD|DASAR/.test(t)) return '小学校';
  if (/中学校/.test(t) || /^SMP|PERTAMA|^MTS/.test(t)) return '中学校';
  if (/職業学校|専門学校/.test(t)) return dengan('職業学校');
  if (/^SMK|KEJURUAN/.test(t)) return dengan('職業学校');
  if (/^SMA|ATAS|^MA\b|ALIYAH/.test(t)) return dengan('高校');
  if (/UNIVERSITAS|SARJANA|^S[12]\b|DIPLOMA|^D[234]/.test(t)) return dengan('大学');
  return '';
}

/** 性別: form menulis 女性 / 男性. */
function genderJp(v: unknown): string {
  const t = bersih(v).toUpperCase();
  if (!t) return '';
  if (/PEREMPUAN|WANITA|FEMALE/.test(t)) return '女性';
  if (/LAKI|PRIA|MALE/.test(t)) return '男性';
  return '';
}

/** 既婚・未婚. */
function maritalJp(v: unknown): string {
  const t = bersih(v).toUpperCase();
  if (!t) return '';
  if (/BELUM|SINGLE|LAJANG/.test(t)) return '未婚';
  if (/CERAI|DIVORCE/.test(t)) return '離婚';
  if (/MENIKAH|KAWIN|MARRIED/.test(t)) return '既婚';
  return '';
}

/** 利き手: 右 / 左. */
function tanganJp(v: unknown): string {
  const t = bersih(v).toUpperCase();
  if (!t) return '';
  if (/KANAN|RIGHT/.test(t)) return '右';
  if (/KIRI|LEFT/.test(t)) return '左';
  return '';
}

/** 有 / 無. Kosong tetap kosong — "tidak ada data" bukan "tidak". */
function adaTidak(v: unknown): string {
  const t = bersih(v);
  if (!t) return '';
  return negatif(t) ? '無' : '有';
}

/** 血液型: form memakai sel angka + label `型` di sebelahnya. */
function golDarah(v: unknown): string {
  const t = bersih(v).toUpperCase().replace(/\s+/g, '');
  if (!t) return '';
  return t.replace(/型$/, '');
}

/** `157` / `157 cm` → `157` (satuannya label `cm` di sel sebelah). */
function angkaSaja(v: unknown): string {
  return bersih(v).replace(/[^\d.,]/g, '');
}

/** Umur dari tanggal lahir; kolom `umur` hanya jaring kalau tanggalnya rusak. */
function umurDari(tglLahir: unknown, umurTersimpan: unknown): string {
  const raw = s(tglLahir).trim();
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      const kini = new Date();
      let n = kini.getFullYear() - d.getFullYear();
      const belum = kini.getMonth() < d.getMonth() || (kini.getMonth() === d.getMonth() && kini.getDate() < d.getDate());
      if (belum) n--;
      if (n >= 0 && n < 120) return `${n}歳`;
    }
  }
  const t = bersih(umurTersimpan).replace(/[^\d]/g, '');
  return t ? `${t}歳` : '';
}

/** 続柄: kanji dari kolom Jepang kalau ada, kalau tidak dari kamus Indonesia. */
function hubunganJp(p: Record<string, unknown>): string {
  const kanji = /[\u4e00-\u9fff]/;
  const jp = bersih(p.hubungan_jp);
  if (jp && kanji.test(jp)) return jp;
  const id = bersih(p.hubungan);
  if (id && kanji.test(id)) return id;
  return kanjiHubunganDari(id, jp);
}

/**
 * Jenis pekerjaan keluarga dalam bahasa Jepang.
 *
 * Daftar pilihannya diambil dari sheet `Referensi` template ini sendiri
 * (`F27:F53`): アルバイト, 農民, 家事手伝い, …, 自営業, 学生, 警備員, …
 * Berkas contoh memakai 自営業 / 学生. Nilai yang tidak ada di daftar
 * dikembalikan apa adanya — menerjemahkan teks bebas dengan kamus karangan
 * lebih buruk daripada mencetak bahasa Indonesia-nya.
 */
const KERJA_JP: Record<string, string> = {
  'WIRAUSAHA / PEMILIK USAHA': '自営業',
  'WIRASWASTA': '自営業',
  'PENGUSAHA': '自営業',
  'IBU RUMAH TANGGA': '家事',
  'MENGURUS RUMAH TANGGA': '家事',
  'PELAJAR / SISWA': '学生',
  'PELAJAR': '学生',
  'SISWA': '学生',
  'MAHASISWA': '学生',
  'BELUM / TIDAK BEKERJA': '未就労',
  'TIDAK BEKERJA': '未就労',
  'PENSIUNAN': '定年',
  'PEGAWAI NEGERI SIPIL': '公務員',
  'PNS': '公務員',
  'TNI': '軍人',
  'PETANI / PEKEBUN': '農家',
  'PETANI': '農家',
  'PETERNAK': '畜産',
  'KARYAWAN SWASTA': '会社員',
  'GURU': '教師',
  'SOPIR': '運転手',
  'DRIVER': '運転手',
};

function kerjaJp(v: unknown): string {
  const t = kapital(v);
  if (!t) return '';
  return KERJA_JP[t] ?? bersih(v);
}

/**
 * Baris 資格・免許 dari data sertifikasi.
 *
 * Bentuk yang dipakai: `sertifikasi.sertifikat_lain` — teks bebas yang diisi CV
 * AI, satu sertifikat per baris, pola
 * `NAMA — lulus YYYY-MM (nilai X)`. Baris yang tidak cocok pola tetap dicetak
 * (nama saja), karena kehilangan satu sertifikat lebih buruk daripada
 * kehilangan tanggalnya.
 *
 * Nama JFT dinormalkan ke ejaan daftar `Referensi` template
 * (`JFT-Basic 国際交流基金日本語基礎テスト`), bukan teks bebas AI.
 */
const NAMA_JFT = 'JFT-Basic 国際交流基金日本語基礎テスト';

function barisSertifikat(data: CandidateData): { tanggal: string; nama: string; nilai: string }[] {
  const sert = data.sertifikasi;
  const teks = bersih(sert.sertifikat_lain);
  const out: { tanggal: string; nama: string; nilai: string }[] = [];

  for (const line of teks.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const m = /^(.*?)\s*[—–-]\s*lulus\s+(\d{4})-(\d{1,2})(?:\s*\(nilai\s+([^)]+)\))?/i.exec(t);
    const nama0 = (m ? m[1] : t).trim();
    const tanggal = m ? `${m[2]}年 ${parseInt(m[3], 10)}月` : '';
    const nilai = m?.[4]?.trim() ?? '';
    const isJft = /JFT/i.test(nama0);
    out.push({
      tanggal,
      nama: isJft ? NAMA_JFT : nama0,
      /* JFT: kolom kanan menampilkan LEVEL (A2), bukan kata "lulus". */
      nilai: isJft ? bersih(sert.jft) || nilai : nilai,
    });
  }

  /* Tidak ada teks bebas, tetapi kolom terstruktur terisi: tetap cetak satu
     baris supaya sertifikatnya tidak hilang. */
  if (!out.length) {
    const jft = bersih(sert.jft);
    if (jft) out.push({ tanggal: '', nama: NAMA_JFT, nilai: jft });
    const sim = bersih(data.identitas.sim);
    if (sim) out.push({ tanggal: '', nama: `SIM（運転免許）${sim}`, nilai: '' });
  }
  return out;
}

/** Seluruh isi form, sebagai peta alamat → teks. Diekspor supaya bisa diuji. */
export function buildValues(data: CandidateData): Record<string, string> {
  const id = data.identitas;
  const fisik = data.fisik;
  const medis = data.medis;
  const wwn = data.wawancara;
  const cells: Record<string, string> = {};

  /* ── kepala (1-2) ─────────────────────────────────────────────────────── */
  /* `NO` = nomor kandidat agensi. Berkas contoh membiarkannya kosong; nomor
     ASJ adalah satu-satunya nomor yang kita punya, dan CV tanpa nomor tidak
     bisa ditelusuri kembali ke baris database-nya. */
  cells.M1 = bersih(data.raw?.id_kandidat);
  cells.M2 = tanggalHariIni();

  /* ── identitas (3-11) ─────────────────────────────────────────────────── */
  cells.B3 = kanaJp(id.katakana);
  cells.B4 = kapital(id.nama_lengkap);
  cells.B5 = birthDate(id.tgl_lahir);
  cells.E5 = umurDari(id.tgl_lahir, id.umur);
  cells.H5 = genderJp(id.gender);
  cells.K5 = tanganJp(fisik.tangan_dominan);
  cells.B6 = kapital(id.tempat_lahir);
  cells.F6 = angkaSaja(medis.mata_kanan);
  cells.F7 = angkaSaja(medis.mata_kiri);
  cells.H6 = angkaSaja(fisik.tb);
  cells.K6 = angkaSaja(fisik.bb);
  /* 🔴 `B8`, BUKAN `C8`. Merge-nya `B8:C8` dan Excel hanya membaca nilai di sel
     ANCHOR; menulis ke `C8` membuat sel 既婚・未婚 tampak kosong walau nilainya
     ada di XML. Terukur lewat perbandingan sel-per-sel 2026-11-13. */
  cells.B8 = maritalJp(id.status_nikah);
  cells.E8 = adaTidak(medis.rokok);
  cells.H8 = adaTidak(medis.alkohol);
  cells.K8 = golDarah(id.golongan_darah);
  cells.B9 = kapital(id.alamat);
  cells.B11 = bersih(wwn.hobi_jp) || kapital(wwn.hobi);

  /* ── riwayat ke Jepang (12-14) ────────────────────────────────────────── */
  /* 渡航時期: kolom yang ada hanya `status_eks_jepang` (pernah/tidak). Kalau
     kosong, sel DIBIARKAN kosong — menulis `無し` berarti menyatakan kandidat
     belum pernah ke Jepang, dan itu bukan yang datanya katakan. */
  {
    const eks = bersih(id.status_eks_jepang);
    cells.B13 = eks && !negatif(eks) ? eks : '';
  }

  /* ── pendidikan (17-20): 4 baris ──────────────────────────────────────── */
  /* LPK TIDAK masuk 学歴 — berkas contohnya hanya SD/SMP/SMK, dan aturan yang
     sama sudah dipakai rirekisho-detail (pemilik, 2026-11-04: "lpk gak perlu
     di masukkan"). Penyaringan dilakukan SEBELUM `batasiRiwayatSekolah`, yang
     justru melindungi LPK. */
  const edu = batasiRiwayatSekolah(
    (data.pendidikan || []).filter((p) => !isLpkTingkat(p.tingkat)),
    EDU_ROWS,
  );
  for (let i = 0; i < EDU_ROWS; i++) {
    const row = EDU_START + i;
    const p = edu[i] || {};
    cells[`A${row}`] = tahunBulanJp(p.masuk ?? p.tahun_masuk);
    cells[`B${row}`] = tahunBulanJp(p.lulus ?? p.tahun_lulus);
    cells[`C${row}`] = kapital(p.sekolah ?? p.nama_sekolah ?? p.sekolah_id);
    cells[`K${row}`] = jenisSekolahJp(p.tingkat, p.jurusan ?? p.jurusan_id);
  }

  /* ── pekerjaan (23-26): 4 baris ───────────────────────────────────────── */
  for (let i = 0; i < JOB_ROWS; i++) {
    const row = JOB_START + i;
    const p = (data.pekerjaan[i] || {}) as Record<string, unknown>;
    const masuk = tahunBulanJp(p.masuk ?? p.tahun_masuk);
    cells[`A${row}`] = masuk;
    cells[`B${row}`] = masuk ? tahunBulanAkhir(p.keluar ?? p.tahun_keluar) || '在職中' : '';
    cells[`C${row}`] = kapital(p.perusahaan ?? p.nama_perusahaan ?? p.perusahaan_id);
    /* 仕事 = jenis pekerjaannya. Kolom `jabatan_jp` kosong di data, jadi yang
       dicetak adalah jabatan apa adanya (Indonesia) — bukan terjemahan karangan. */
    cells[`J${row}`] = bersih(p.jabatan_jp) || kapital(p.jabatan ?? p.jenis ?? p.jabatan_id);
    /* 仕事内容 = uraian singkat. `catatan_jp` yang sudah berbahasa Jepang lebih
       dulu; kalau kosong, `catatan`/`bidang` Indonesia. */
    cells[`K${row}`] = bersih(p.catatan_jp) || kapital(p.catatan) || kapital(p.bidang);
  }

  /* ── sertifikat (29-31): 3 baris ──────────────────────────────────────── */
  const sert = barisSertifikat(data);
  for (let i = 0; i < CERT_ROWS; i++) {
    const row = CERT_START + i;
    const c = sert[i];
    cells[`A${row}`] = c?.tanggal ?? '';
    cells[`C${row}`] = c?.nama ?? '';
    cells[`J${row}`] = c?.nilai ?? '';
  }

  /* ── keluarga (34-40): 7 baris ────────────────────────────────────────── */
  for (let i = 0; i < FAM_ROWS; i++) {
    const row = FAM_START + i;
    const p = (data.keluarga[i] || {}) as Record<string, unknown>;
    const nama = bersih(p.nama);
    /* Baris tanpa nama DAN tanpa hubungan dibiarkan kosong seluruhnya — nomor
       urut untuk baris hampa terbaca seperti anggota keluarga yang datanya
       hilang. */
    const ada = nama || hubunganJp(p);
    cells[`A${row}`] = ada ? String(i + 1) : '';
    cells[`B${row}`] = hubunganJp(p);
    /* 氏名 keluarga berbahasa Jepang kalau ada katakana-nya. */
    const kt = bersih(p.katakana);
    cells[`C${row}`] = /[ぁ-ヿ一-龯]/.test(kt) ? kt : kapital(nama);
    const usia = bersih(p.usia ?? p.umur).replace(/[^\d]/g, '');
    cells[`G${row}`] = usia ? `${usia}歳` : '';
    cells[`H${row}`] = bersih(p.pekerjaan_jp) || kerjaJp(p.pekerjaan);
  }

  /* ── tujuan ke Jepang (42) ────────────────────────────────────────────── */
  cells.A42 = bersih(wwn.tujuan_ke_jepang_jp) || bersih(wwn.tujuan_ke_jepang);

  return cells;
}

/** `作成日`: `2026年 11月 13日`. Diekspor terpisah supaya bisa diuji jamnya. */
export function tanggalHariIni(kini: Date = new Date()): string {
  return `${kini.getFullYear()}年 ${kini.getMonth() + 1}月 ${kini.getDate()}日`;
}

/** Bangun workbook. Diekspor supaya geometrinya bisa diuji. */
export async function buildKaigoWorkbook(data: CandidateData): Promise<Blob> {
  return buildXlsxForm({
    base64: KAIGO_HYOGO_BASE64,
    sheetPath: SHEET_PATH,
    drawingPath: DRAWING_PATH,
    photoPart: PHOTO_PART,
    photoRelId: PHOTO_REL_ID,
    photoBox: PHOTO_BOX,
    values: buildValues(data),
    photoUrl: s(data.uploads.photo),
    sheetName: safeSheetName(s(data.identitas.nama_lengkap)),
  });
}

const template: CvTemplate = {
  id: 'kaigo-hyogo',
  name: 'Kaigo Hyogo (履歴書 特定技能)',
  type: 'xlsx',
  description:
    'Form 履歴書 dwibahasa Indonesia–Jepang untuk 特定技能 (kaigo): kolom A–N, pas foto M3:N10, blok 資格・免許, 家族構成 tujuh baris, dan esai 日本での目標 — layout, merge, dan tinggi baris persis berkas klien; isinya dari database.',
  category: 'form',
  icon: 'file-excel',
  async render(data: CandidateData, _context: RenderContext): Promise<RenderResult> {
    try {
      const blob = await buildKaigoWorkbook(data);
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
