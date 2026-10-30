/**
 * kinki.ts — form CV magang "KINKI" sebagai .xlsx, diisi dari database.
 *
 * ASAL BERKAS
 * -----------
 * `F:/1. MASTER CV MAGANG KINKI.xlsx` (33,9 MB, 16 sheet). Sheet yang dipakai
 * hanya `BLANK CV`; lima belas sheet lain berisi CV kandidat LAIN dan dibuang
 * saat aset dibuat (lihat `templates/kinki.b64.ts`). Form ini yang dipakai
 * untuk klien KINKI, dan berbeda dari dua form sebelumnya: 学歴 hanya DUA baris,
 * 職歴 tiga blok, 家族構成 lima baris, ditambah blok できる作業 dan
 * 性格診断テスト (MBTI).
 *
 * PETA SEL
 * --------
 *   6-17   identitas (nama, kana, lahir, hp, fisik, kebiasaan)
 *   19-23  pendidikan: baris 19 = SMA/SMK, baris 21 = 日本語学校
 *   26-31  tiga blok kerja (2 baris per pekerjaan)
 *   34-35  できる作業 — 13 kotak centang
 *   37-41  keluarga + kolom 緊急連絡先 di X37/Z37
 *   44-48  長所 / 短所 / 志望動機 / 将来の夢
 *   47-52  MBTI: Q47 nama tipe, U48..U52 lima dropdown
 *   3      kotak PR di kanan atas
 *
 * MBTI
 * ----
 * Tidak ada kolomnya di database, dan pemilik menerkanya dari kalimat kandidat
 * ("kelebihan kekurangan impian dll"). Karena itu tipenya disimpulkan
 * `inferMbti()` — deterministik dan bisa diuji — bukan dipanggil ke model
 * bahasa. SELALU terisi: pemilik 2026-10-26 memilih tipe yang mungkin meleset
 * ("seenggak walau gak 90% akurat") daripada sel kosong yang terbaca sebagai
 * formulir belum selesai. Teksnya dibaca dari `data.wawancara`, bukan
 * `data.raw` — lihat catatan di `buildValues`.
 *
 * SEL YANG DULU TIDAK PUNYA SUMBER — SEKARANG PUNYA KOLOM
 * -------------------------------------------------------
 * Sampai 2026-10-26 sel-sel ini dibiarkan kosong karena tidak ada kolomnya:
 * `J19` kota sekolah, `M26` 業種, `Z26` 備考, `Q45` 計算テスト, `X45` 目標貯金,
 * `T37/T39` 学習期間 & 学習状況, `Q41` 英語レベル, `X41` 集団生活年数,
 * `X47` 就業希望年数, `AB51/AB52` 体力試験, `O9` jarak & lama penerbangan,
 * `I4` 第…課中, `M4` …月取得予定. Migrasi 022 menambah kolomnya (lihat
 * `migrations/022_cv_field_gaps.sql`), jadi sekarang semuanya diisi — dan yang
 * kosong hanya berarti kandidatnya belum mengisi.
 *
 * `I3` 日本語力: kolom `level_bahasa_jepang` menang atas tebakan dari teks JFT,
 * karena teks `N2..N5` tidak mencakup pemegang JFT Basic (`A2`/`B1`) — dulu
 * mereka tercetak `N5レベル` hanya karena itu bawaan template.
 */
import type { CvTemplate, CandidateData, RenderContext, RenderResult } from '../types';
import { KINKI_BASE64 } from '../templates/kinki.b64';
import { isGood } from '../../helpers_cv';
import { inferMbti, mbtiFromCode } from '../mbti';
import { buildXlsxForm, cvFileName, durasiJp, excelSerial, kanaJp, negatif, s, yearMonth, type PhotoBox } from './xlsx-form';

const SHEET_PATH = 'xl/worksheets/sheet1.xml';
const DRAWING_PATH = 'xl/drawings/drawing1.xml';
/** Placeholder transparan yang dibuat saat aset dikosongkan. */
const PHOTO_PART = 'xl/media/image2.png';
const PHOTO_REL_ID = 'rId2';

/** Kotak pas foto, disalin dari berkas pemilik (kolom W baris 6). */
const PHOTO_BOX: PhotoBox = { cx: 1590675, cy: 2143125 };
/** Foto pemilik tidak menempel sudut sel: 76200/38100 EMU dari kiri/atas. */
const PHOTO_OFFSET = { colOff: 76200, rowOff: 38100 };

const JOB_START = 26;
const JOB_BLOCKS = 3;
const FAM_START = 37;
const FAM_ROWS = 5;

const AGAMA_JP: Record<string, string> = {
  ISLAM: 'イスラム教', KRISTEN: 'キリスト教', KATOLIK: 'カトリック',
  HINDU: 'ヒンドゥー教', BUDHA: '仏教', BUDDHA: '仏教', KONGHUCU: '儒教',
};

/** `-` di database berarti "belum ada", bukan tanda minus yang dicetak. */
function bersih(v: unknown): string {
  const t = s(v).trim();
  return isGood(t) ? t : '';
}

function angka(v: unknown): string {
  return bersih(v).replace(/[^\d]/g, '');
}

/** `6281553851057` → `081553851057` (bentuk yang dipakai form). */
function hpLokal(v: unknown): string {
  const t = angka(v);
  if (!t) return '';
  return t.startsWith('62') ? `0${t.slice(2)}` : t;
}

function genderJp(v: unknown): string {
  const t = s(v).toUpperCase();
  if (t.includes('PEREMPUAN') || t.includes('WANITA')) return '女';
  if (t.includes('LAKI') || t.includes('PRIA')) return '男';
  return '';
}

function nikahJp(v: unknown): string {
  const t = s(v).toUpperCase();
  if (!isGood(t)) return '';
  if (t.includes('BELUM') || t.includes('SINGLE')) return '未婚';
  if (t.includes('CERAI') || t.includes('DUDA') || t.includes('JANDA')) return '離婚';
  if (t.includes('MENIKAH') || t.includes('KAWIN')) return '既婚';
  return '';
}

/** `B-` → `B`; dropdown form hanya A/B/O/AB/不明. */
function darahJp(v: unknown): string {
  const t = s(v).trim().toUpperCase().replace(/型|[+-]/g, '');
  return /^(A|B|O|AB)$/.test(t) ? t : '不明';
}

/** 飲酒 — dropdown: 多飲/中飲/小飲/無飲. */
function minumJp(v: unknown): string {
  const t = s(v).toUpperCase();
  if (negatif(v)) return '無飲';
  if (t.includes('BANYAK') || t.includes('多')) return '多飲';
  if (t.includes('SEDANG') || t.includes('中')) return '中飲';
  return '小飲';
}

/** 煙草 — dropdown: 喫煙/非喫煙. */
function rokokJp(v: unknown): string {
  if (negatif(v)) return '非喫煙';
  return '喫煙';
}

function tanganJp(v: unknown): string {
  const t = s(v).toUpperCase();
  if (t.includes('KIRI') || t.includes('LEFT')) return '左';
  if (t.includes('DUA') || t.includes('KEDUA')) return '両手';
  return '右';
}

/** 刺青 / 色覚異常 — dropdown: あり/なし. */
function adaJp(v: unknown): string {
  if (negatif(v)) return 'なし';
  return 'あり';
}

/**
 * 視力. Form memakai `1.0` untuk mata normal, dan pemilik selalu mengisinya
 * begitu ("mata normal itu standart 1,0 sama kayak template kecuali minus dll").
 * Database yang kosong karena itu memakai `1.0`, bukan sel kosong.
 */
function mataJp(v: unknown): string {
  const t = bersih(v).toUpperCase();
  if (!isGood(t)) return '1.0';
  if (t.includes('NORMAL')) return '1.0';
  const m = /(\d+([.,]\d+)?)/.exec(t);
  return m ? m[1].replace(',', '.') : '1.0';
}

/** 日本語力 — dropdown: N5未習熟/N5レベル/N5合格/N4レベル/N4合格/N3合格/N2合格. */
function jepangLevel(v: unknown): string {
  const t = s(v).toUpperCase().replace(/\s/g, '');
  const m = /N([2-5])/.exec(t);
  if (!m) return '';
  const lulus = /合格|LULUS|PASS/.test(t);
  const level = `N${m[1]}`;
  if (level === 'N2' || level === 'N3') return lulus ? `${level}合格` : '';
  return lulus ? `${level}合格` : `${level}レベル`;
}

/**
 * 試験合格 — dropdown hanya berisi hasil LULUS (`なし/N5合格/…/N1合格`).
 * `N5レベル` TIDAK sah di sel ini; nilainya harus `なし`.
 */
function lulusJp(v: unknown): string {
  const level = jepangLevel(v);
  return level.endsWith('合格') ? level : 'なし';
}

/** 四輪免許 — dropdown: あり/なし. */
function simJp(v: unknown): string {
  if (negatif(v)) return 'なし';
  return 'あり';
}

/** `2021-08` → `2021年8月`, bentuk yang dicetak form. Tahun saja → `2019年`. */
function ym(v: unknown): string {
  const raw = s(v).trim();
  // `2019` (tanpa bulan) JANGAN dijadikan `2019年1月`: bulan Januari itu
  // karangan, dan `new Date('2019')` memang menghasilkan 1 Januari.
  const tahunSaja = /^(\d{4})$/.exec(raw);
  if (tahunSaja) return `${tahunSaja[1]}年`;
  const p = yearMonth(v);
  return p.y + p.m;
}

/**
 * 期間. Di bawah setahun ditulis dalam BULAN — dulu semuanya dibulatkan ke
 * `1年`, sehingga pekerjaan 3 bulan tercetak "1年" dan riwayat kerjanya
 * terbaca jauh lebih panjang daripada kenyataan.
 */
function durasi(masuk: unknown, lulus: unknown): string {
  const a = /^(\d{4})[-/](\d{1,2})/.exec(s(masuk));
  const b = /^(\d{4})[-/](\d{1,2})/.exec(s(lulus));
  if (a && b) {
    const bulan = (parseInt(b[1], 10) - parseInt(a[1], 10)) * 12 + (parseInt(b[2], 10) - parseInt(a[2], 10));
    if (bulan <= 0) return '';
    if (bulan < 12) return `${bulan}ヶ月`;
    return `${Math.round(bulan / 12)}年`;
  }
  // Sebagian baris hanya menyimpan TAHUN (`2019`). Tanpa cabang ini kolom 期間
  // kosong padahal tahunnya lengkap — cukup selisih tahunnya.
  const ay = /^(\d{4})/.exec(s(masuk));
  const by = /^(\d{4})/.exec(s(lulus));
  if (!ay || !by) return '';
  const tahun = parseInt(by[1], 10) - parseInt(ay[1], 10);
  return tahun > 0 ? `${tahun}年` : '';
}

/**
 * 国公私 — dropdown: 国立/公立/私立.
 *
 * Sekolah NEGERI = **公立**, bukan 国立: 国立 dipakai untuk lembaga yang
 * didirikan negara (mis. 東京大学), sedangkan SDN/SMPN/SMAN didirikan pemerintah
 * daerah. Sampai 2026-10-29 renderer ini menulis 国立 untuk semua sekolah
 * negeri — salah istilah, dan dropdown form memuat keduanya sehingga tidak ada
 * yang menolaknya.
 */
function kouritsu(sekolah: string): string {
  return /^(SDN|SMPN|SMAN|SMKN|MIN|MTSN|MAN|SMK\s*NEGERI|SMA\s*NEGERI|NEGERI|SEKOLAH\s*NEGERI)/i.test(sekolah.trim()) ? '公立' : '私立';
}

/**
 * 分類 学歴 untuk baris 19 — dropdown `A19/A21`: 高校/専門/大学/日本語学校.
 *
 * `''` untuk jenjang yang TIDAK ada di daftar (SD/SMP). Mencetak
 * "高校: SDN …" untuk lulusan SD adalah klaim yang salah, dan itulah yang
 * terjadi sebelum 2026-10-29 saat baris SMA tidak ditemukan.
 */
function jenjangKinki(tingkat: string): string {
  const t = tingkat.toUpperCase();
  if (/SMA|SMK|ATAS|KEJURUAN/.test(t)) return '高校';
  if (/UNIVERSITAS|^S[12]\b|SARJANA/.test(t)) return '大学';
  if (/^D[234]|DIPLOMA/.test(t)) return '専門';
  return '';
}

/**
 * 雇用形態 — dropdown: 正社員/契約社員/アルバイト/インターン/家業/自営業/公務員/無職.
 *
 * Urutan cabang = urutan KEKHUSUSAN, bukan urutan daftar di form. Dua entri
 * yang ditambahkan 2026-10-30 membuktikan kenapa: `KARYAWAN HARIAN` memuat kata
 * "KARYAWAN" dan dulu tercetak 正社員 (pegawai tetap) — kebalikan dari
 * kenyataannya; `WIRAUSAHA` memuat "USAHA" dan tercetak 家業 (usaha keluarga).
 * Karena itu yang spesifik diperiksa lebih dulu, dan pencocokan `KARYAWAN`
 * baru dipakai kalau tidak ada penanda lain.
 */
function jenisKerjaJp(v: unknown): string {
  const t = s(v).toUpperCase();
  if (!isGood(t)) return '';
  if (t.includes('BELUM') || t.includes('TIDAK BEKERJA') || t.includes('PENSIUN')) return '無職';
  if (t.includes('PNS') || t.includes('ASN') || t.includes('TNI') || t.includes('POLRI')) return '公務員';
  if (t.includes('FREELANCE') || t.includes('WIRAUSAHA') || t.includes('PEMILIK USAHA')) return '自営業';
  if (t.includes('JEPANG')) return '技能実習生';
  if (t.includes('INTERN') || t.includes('MAGANG')) return 'インターン';
  if (t.includes('KELUARGA') || t.includes('USAHA')) return '家業';
  if (t.includes('HARIAN') || t.includes('LEPAS') || t.includes('PART') || t.includes('ALBAITO')) return 'アルバイト';
  if (t.includes('KONTRAK') || t.includes('HONORER') || t.includes('ALIH')) return '契約社員';
  if (t.includes('TETAP') || t.includes('KARYAWAN')) return '正社員';
  return '非正社員';
}

/** 続柄 — huruf Jepang saja, sesuai kolom sempit A. */
function hubunganJp(v: unknown): string {
  const t = s(v).toUpperCase();
  if (!isGood(t)) return '';
  if (t.includes('AYAH') || t.includes('BAPAK')) return '父';
  if (t.includes('IBU') || t.includes('MAMA')) return '母';
  if (t.includes('KAKAK')) return t.includes('PEREMPUAN') ? '姉' : '兄';
  if (t.includes('ADIK')) return t.includes('PEREMPUAN') ? '妹' : '弟';
  if (t.includes('ISTRI')) return '妻';
  if (t.includes('SUAMI')) return '夫';
  if (t.includes('ANAK')) return '子';
  return 'その他';
}

/** 月収 dalam 万円 (form mencetak `2.5` + label `万円` di sel sebelah). */
function manYen(v: unknown): string {
  const n = Number(angka(v));
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '');
  if (n < 1000) return String(n);
  return '';
}

/** スポーツ — hanya kalau hobi benar-benar menyebut cabang olahraga. */
const SPORTS: [RegExp, string][] = [
  [/ジョギング|joging|jogging|\brun\b|lari/i, 'ジョギング'],
  [/ハイキング|hiking|naik gunung/i, 'ハイキング'],
  [/フットサル|futsal/i, 'フットサル'],
  [/バドミントン|badminton|bulu tangkis/i, 'バドミントン'],
  [/バレー|voli|volley/i, 'バレーボール'],
  [/バスケ|basket/i, 'バスケットボール'],
  [/サッカー|sepak|bola/i, 'サッカー'],
  [/水泳|renang|swim/i, '水泳'],
  [/サイクリング|sepeda|cycling/i, 'サイクリング'],
];

function sportJp(hobi: string): string {
  for (const [re, label] of SPORTS) if (re.test(hobi)) return label;
  return '';
}

/**
 * できる作業: teks bebas `keahlian_khusus` → kotak centang.
 * Hanya kata yang MUNCUL yang dicentang; sisanya `□`. `自動車運転` butuh SIM,
 * bukan sekadar niat (lihat `simJp`).
 */
const SKILLS: [RegExp, string][] = [
  [/足場|scaffold/i, 'A35'],
  [/左官|plester|plaster/i, 'J34'],
  [/溶接|las\b|welding/i, 'M34'],
  [/土木|konstruksi|bangunan/i, 'P34'],
  [/舗装|aspal/i, 'S34'],
  [/型枠|bekisting/i, 'J35'],
  [/鉄筋|besi beton/i, 'M35'],
  [/大工|tukang|kayu|carpenter/i, 'P35'],
  [/重機|excavator|alat berat/i, 'S35'],
  [/生コン|beton|cor\b/i, 'E35'],
];

/** 国籍・出身地: `〒63395 東ジャワ州 マゲタン県 …` → `インドネシア東ジャワ州マゲタン県`. */
function asalJp(alamatJp: string, tempatJp: string): string {
  // Kode pos di database tidak selalu 7 digit (`〒63395`), jadi jangan
  // mengasumsikan bentuk `123-4567`.
  const a = alamatJp.replace(/〒\s*[\d-]+/g, '').replace(/\s+/g, '');
  if (!isGood(a)) return isGood(tempatJp) ? `インドネシア${tempatJp.replace(/\s+/g, '')}` : 'インドネシア';
  const ken = a.indexOf('県');
  const ringkas = ken > 0 ? a.slice(0, ken + 1) : a;
  return `インドネシア${ringkas}`;
}

/** 実習満了後の希望 — hanya kalau kalimatnya jelas menyebut tetap bekerja di Jepang. */
function harapanSetelahJp(rencana: string): string {
  if (/日本で(も)?(長く)?働きたい|日本で就労|ずっと日本で働/.test(rencana)) return '日本での就労希望';
  return '';
}

export function buildValues(data: CandidateData): Record<string, string> {
  const id = data.identitas;
  const hobi = bersih(data.wawancara.hobi_jp) || bersih(data.wawancara.hobi);
  // ⚠️ Semua teks wawancara dibaca dari `data.wawancara`, TIDAK dari `data.raw`:
  // `getDrafCvMaster` mengembalikan bentuk BERSARANG, jadi `raw.promosi_diri_jp`
  // tidak pernah ada dan sel PR + MBTI keluar kosong untuk semua kandidat.
  const keahlian = bersih(data.wawancara.keahlian_khusus_jp) || bersih(data.wawancara.keahlian_khusus);
  const rencana = bersih(data.wawancara.rencana_pulang_jp) || bersih(data.wawancara.rencana_pulang);
  const promosi = bersih(data.wawancara.promosi_jp) || bersih(data.wawancara.promosi);
  const kelebihan = bersih(data.wawancara.kelebihan_jp) || bersih(data.wawancara.kelebihan);
  const kekurangan = bersih(data.wawancara.kekurangan_jp) || bersih(data.wawancara.kekurangan);
  const tujuan = bersih(data.wawancara.tujuan_ke_jepang_jp) || bersih(data.wawancara.motivasi_ke_jepang_jp);

  const cells: Record<string, string> = {
    /* ── identitas ──────────────────────────────────────────────────────── */
    /* `E8` di template MASIH memuat tanggal lahir kandidat contoh (serial
       38876 = 2006-06-14). Kalau kandidat tidak punya tanggal lahir, sel itu
       tidak pernah ditulis dan `S8` (DATEDIF) mencetak umur ORANG LAIN.
       Menulis '' menghapus nilai warisan itu; `buildNumbers` mengisinya kembali
       kalau tanggalnya ada. */
    ...(excelSerial(id.tgl_lahir) === null ? { E8: '' } : {}),
    E6: bersih(id.nama_lengkap),
    S6: bersih(id.panggilan_katakana) || bersih(id.panggilan),
    E7: kanaJp(id.katakana),
    S7: genderJp(id.gender),
    E9: hpLokal(id.hp),
    /* `O9` (ジャカルタから…㎞ / 飛行機で…時間…分). Dua kolom baru (migrasi 022)
       mengisi placeholder `***`; kalau keduanya kosong teks template dibiarkan
       supaya selnya tidak kosong sama sekali. */
    E10: asalJp(bersih(id.alamat_jp), bersih(id.tempat_lahir_jp)),
    E11: nikahJp(id.status_nikah),
    L11: angka(data.fisik.tb),
    E12: AGAMA_JP[s(id.agama).toUpperCase().trim()] ?? bersih(id.agama),
    L12: angka(data.fisik.bb),
    E13: minumJp(data.medis.alkohol),
    L13: darahJp(id.golongan_darah),
    E14: rokokJp(data.medis.rokok),
    L14: tanganJp(data.fisik.tangan_dominan),
    E15: adaJp(data.medis.tato),
    L15: mataJp(data.medis.mata_kanan),
    E16: bersih(data.fisik.olahraga) || sportJp(hobi),
    L16: mataJp(data.medis.mata_kiri),
    E17: hobi,
    L17: adaJp(data.medis.buta_warna),
    M3: simJp(id.sim),
  };
  /* Placeholder template yang sekarang bisa diisi dari kolom (migrasi 022):
     `I4` 第…課中, `M4` …月取得予定, `O9` jarak & lama penerbangan. */
  const bab = angka(data.sertifikasi.bab_belajar_jp);
  if (bab) cells.I4 = `第${bab}課中`;
  const bulanSim = /(\d{1,2})\s*月?$/.exec(bersih(id.rencana_sim_bulan));
  if (bulanSim) cells.M4 = `${parseInt(bulanSim[1], 10)}月取得予定`;
  const km = angka(id.jarak_jakarta_km);
  const terbang = bersih(id.lama_penerbangan);
  if (km || terbang) {
    cells.O9 = [
      km ? `ジャカルタから${km}㎞` : '',
      terbang ? `飛行機で${terbang}` : '',
    ].filter(Boolean).join('\n');
  }
  /* `I3` 日本語力: kolom `level_bahasa_jepang` menang (bisa dikoreksi admin),
     lalu tebakan dari teks JFT.
     Tanpa keduanya sel ini DIBERSIHKAN (2026-10-29). Dulu teks template
     `N5レベル` dibiarkan, dan itu berarti **243 dari 268** kandidat — yang
     kolom `jft`-nya kosong — tercetak mengaku level N5 di formulir resmi.
     Sel kosong lebih jujur daripada klaim kemampuan yang tidak pernah diisi. */
  const levelJp = bersih(data.sertifikasi.level_bahasa_jepang) || jepangLevel(data.sertifikasi.jft ?? id.jft);
  cells.I3 = levelJp;

  /* ── pendidikan: baris 19 = SMA/SMK, baris 21 = 日本語学校 ──────────────── */
  const edu = data.pendidikan as Record<string, unknown>[];
  const idxSma = edu.findIndex((p) => /SMA|SMK|ATAS|KEJURUAN/i.test(s(p.tingkat)));
  const idxLpk = edu.findIndex((p) => /日本語|BAHASA JEPANG/i.test(s(p.tingkat)));
  /* Cadangan: baris TERTINGGI non-LPK, bukan `edu[edu.length - 1]` buta.
     Daftar pendidikan sudah kronologis, jadi baris terakhir non-LPK adalah
     jenjang tertinggi — dan labelnya mengikuti jenjang itu, bukan `高校`
     yang dipatok. Dulu kandidat yang hanya punya SD tercetak sebagai
     "高校: SDN …". */
  const nonLpk = edu.filter((_, i) => i !== idxLpk);
  const sma = (idxSma >= 0 ? edu[idxSma] : nonLpk[nonLpk.length - 1]) ?? {};
  const jenjang = idxSma >= 0 ? '高校' : jenjangKinki(s(sma.tingkat));
  const sekolah = bersih(sma.sekolah ?? sma.nama_sekolah ?? sma.sekolah_id);
  const jurusan = bersih(sma.jurusan ?? sma.jurusan_id);
  if (isGood(sekolah)) {
    cells.A19 = jenjang;
    cells.D19 = ym(sma.masuk ?? sma.tahun_masuk);
    cells.E20 = ym(sma.lulus ?? sma.tahun_lulus);
    cells.H19 = durasi(sma.masuk ?? sma.tahun_masuk, sma.lulus ?? sma.tahun_lulus);
    // 地域 — kolom `wilayah_sekolah` (migrasi 022). Dulu selalu dikosongkan.
    cells.J19 = bersih(id.wilayah_sekolah);
    cells.M19 = kouritsu(sekolah);
    cells.O19 = sekolah;
    // Strip atas mencetak `専攻` dengan `=W19`. Sel kosong membuatnya `0`, jadi
    // kolom ini memakai `-` seperti sel lain yang memang belum ada isinya.
    cells.W19 = jurusan || '-';
  } else {
    for (const c of ['D19', 'E20', 'H19', 'J19', 'M19', 'O19']) cells[c] = '';
    cells.W19 = '-';
  }
  let sekolahLpk = '';
  if (idxLpk >= 0) {
    const lpk = edu[idxLpk];
    sekolahLpk = bersih(lpk.sekolah ?? lpk.nama_sekolah ?? lpk.sekolah_id);
    cells.A21 = '日本語学校';
    cells.D21 = ym(lpk.masuk ?? lpk.tahun_masuk);
    cells.E22 = isGood(s(lpk.lulus ?? lpk.tahun_lulus)) ? ym(lpk.lulus ?? lpk.tahun_lulus) : '今まで';
    cells.H21 = durasi(lpk.masuk ?? lpk.tahun_masuk, lpk.lulus ?? lpk.tahun_lulus);
    cells.M21 = kouritsu(sekolahLpk);
    cells.O21 = sekolahLpk;
    cells.W21 = '日本語';
  } else {
    // `D22` juga dibersihkan: tanpa baris 日本語学校, tanda `～` bawaan template
    // menggantung sendirian di kolom periode.
    for (const c of ['A21', 'D21', 'D22', 'E22', 'H21', 'J21', 'M21', 'O21', 'W21']) cells[c] = '';
  }

  /* ── 具体的な修学内容: dirangkai dari baris 学歴 yang sudah terisi ───────── */
  const isiSekolah: string[] = [];
  // Tanpa jurusan, versi lama berbunyi "学校では学びました。" — kalimat tanpa isi
  // yang tetap tercetak di kolom 具体的な修学内容 (terukur pada ASJ00041).
  if (isGood(sekolah)) {
    isiSekolah.push(jurusan ? `学校では${jurusan}を学びました。` : `${sekolah}で学びました。`);
  }
  if (isGood(sekolahLpk)) isiSekolah.push(`現在は${sekolahLpk}で日本語を勉強しています。`);
  cells.E23 = isiSekolah.join(' ');

  /* ── pekerjaan: tiga blok x dua baris ──────────────────────────────────── */
  const kerja = data.pekerjaan as Record<string, unknown>[];
  for (let i = 0; i < JOB_BLOCKS; i++) {
    const top = JOB_START + i * 2;
    const bottom = top + 1;
    const p = kerja[i] ?? {};
    const masuk = p.masuk ?? p.tahun_masuk;
    const keluar = p.keluar ?? p.tahun_keluar;
    cells[`A${top}`] = jenisKerjaJp(p.jenis ?? p.status_kerja);
    cells[`D${top}`] = ym(masuk);
    cells[`E${bottom}`] = ym(keluar);
    cells[`H${top}`] = durasi(masuk, keluar);
    // 業種 — kolom `pekerjaan_N_bidang` (migrasi 022). Dulu selalu ''.
    cells[`M${top}`] = bersih(p.bidang ?? p.industri);
    cells[`Q${top}`] = bersih(p.jabatan ?? p.jabatan_id);
    const gaji = manYen(p.gaji ?? p.penghasilan);
    cells[`W${top}`] = gaji;
    // Label `万円` duduk SEBARIS dengan angkanya (Y26/Y28/Y30). Bawaan template
    // menaruhnya di baris bawah blok, sehingga `1.8` dan `万円` tercetak di dua
    // baris terpisah. Pemilik menulisnya di baris atas.
    cells[`Y${top}`] = gaji ? '万円' : '';
    cells[`Y${bottom}`] = '';
    // 備考 — kolom `pekerjaan_N_catatan` (migrasi 022).
    cells[`Z${top}`] = bersih(p.catatan ?? p.keterangan);
  }
  if (!kerja.length) {
    // `年月日` dan `～` bawaan template akan tercetak apa adanya.
    for (const c of ['D26', 'E27', 'D27']) cells[c] = '';
  }

  /* ── 具体的な仕事内容: dirangkai dari blok 職歴 yang terisi ──────────────── */
  cells.E32 = kerja
    .slice(0, JOB_BLOCKS)
    .map((p) => {
      const pt = bersih(p.perusahaan ?? p.nama_perusahaan ?? p.perusahaan_id);
      if (!isGood(pt)) return '';
      const jb = bersih(p.jabatan ?? p.jabatan_id);
      return jb ? `${pt}では${jb}として勤務しました。` : `${pt}で勤務しました。`;
    })
    .filter(Boolean)
    .join(' ');

  /* ── できる作業 ────────────────────────────────────────────────────────── */
  const boxes = ['A35', 'E34', 'E35', 'J34', 'J35', 'M34', 'M35', 'P34', 'P35', 'S34', 'S35', 'W34'];
  for (const c of boxes) cells[c] = '□';
  if (isGood(keahlian)) {
    for (const [re, cell] of SKILLS) if (re.test(keahlian)) cells[cell] = '■';
    cells.W34 = '■';
    cells.X35 = keahlian.slice(0, 18);
  }
  if (cells.M3 === 'あり') cells.E34 = '■';
  cells.AC34 = 'OK';

  /* ── keluarga + 緊急連絡先 ─────────────────────────────────────────────── */
  const fam = data.keluarga as Record<string, unknown>[];
  for (let i = 0; i < FAM_ROWS; i++) {
    const row = FAM_START + i;
    const p = fam[i] ?? {};
    cells[`A${row}`] = hubunganJp(p.hubungan);
    cells[`C${row}`] = angka(p.usia ?? p.umur);
    cells[`E${row}`] = bersih(p.pekerjaan);
    cells[`J${row}`] = manYen(p.gaji ?? p.penghasilan);
    // 同居/別居 — dulu dicetak `■`/`□` tetap (selalu "tinggal bersama").
    const tinggal = s(p.tinggal ?? p.status_tinggal).toUpperCase();
    const serumah = !/TIDAK|BEDA|LUAR|PISAH|MANDIRI|INDEPENDEN/.test(tinggal);
    cells[`M${row}`] = serumah ? '■' : '□';
    cells[`O${row}`] = serumah ? '□' : '■';
  }
  const darurat = hubunganJp(id.kontak_darurat_hubungan);
  cells.X37 = darurat === 'その他' ? '' : darurat;
  cells.Z37 = hpLokal(id.hp_darurat);

  /* ── wawancara ─────────────────────────────────────────────────────────── */
  cells.T38 = lulusJp(data.sertifikasi.jft ?? id.jft);
  cells.Q43 = cells.M3 === 'あり' ? '' : 'なし';
  const ken = data.kenalan_jepang;
  cells.X39 = isGood(bersih(ken.nama_jp) || bersih(ken.nama_id))
    ? bersih(ken.nama_jp) || bersih(ken.nama_id)
    : '無し';
  cells.X43 = '未定';
  cells.X49 = harapanSetelahJp(rencana);

  /* ── kolom tes & rencana (migrasi 022) ─────────────────────────────────── */
  // 計算テスト / 目標貯金 / 学習期間 / 学習状況 / 英語レベル / その他外国語 /
  // 集団生活年数 / 就業希望年数 / 体力試験 — dulu seluruhnya dikosongkan.
  cells.Q45 = bersih(data.fisik.tes_hitung);
  cells.X45 = angka(data.wawancara.tabungan);
  cells.T37 = durasiJp(data.sertifikasi.lama_belajar_jp);
  cells.T39 = bersih(data.sertifikasi.status_belajar_jp);
  cells.Q41 = bersih(data.sertifikasi.level_bahasa_inggris);
  cells.T41 = bersih(data.sertifikasi.bahasa_lain);
  cells.X41 = bersih(data.fisik.tinggal_kursus_tahun);
  cells.X47 = bersih(data.wawancara.lamakerja_diharapkan);
  cells.AB51 = angka(data.fisik.tes_pushup);
  cells.AB52 = angka(data.fisik.tes_squat);

  /* ── kotak PR & kepribadian ────────────────────────────────────────────── */
  cells.U3 = promosi || kelebihan;
  cells.E44 = kelebihan;
  cells.E45 = kekurangan;
  cells.E46 = tujuan;
  cells.E48 = rencana;

  /* ── MBTI ──────────────────────────────────────────────────────────────── */
  // Kolom `mbti` (migrasi 022) menang supaya admin bisa mengoreksi tipe tanpa
  // mengubah teks wawancara. Kalau kosong, tipenya disimpulkan seperti dulu —
  // sel kosong terbaca sebagai formulir belum selesai.
  const mbtiKolom = bersih(data.wawancara.mbti);
  const mbti = mbtiKolom ? mbtiFromCode(mbtiKolom) : null;
  const inferred = mbti ?? inferMbti({
    promosi,
    kekurangan,
    kelebihan,
    tujuan,
    rencana,
    motivasi: bersih(data.wawancara.motivasi_ke_jepang_jp) || bersih(data.wawancara.motivasi_ke_jepang),
    hobi,
    keahlian,
  });
  cells.Q47 = inferred.typeName;
  cells.U48 = inferred.labels[0];
  cells.U49 = inferred.labels[1];
  cells.U50 = inferred.labels[2];
  cells.U51 = inferred.labels[3];
  cells.U52 = inferred.labels[4];

  return cells;
}

/** Tanggal lahir harus ANGKA: `S8` menghitung umur dengan `DATEDIF`. */
export function buildNumbers(data: CandidateData): Record<string, number> {
  const serial = excelSerial(data.identitas.tgl_lahir);
  return serial === null ? {} : { E8: serial };
}

/** Bangun workbook. Diekspor supaya geometrinya bisa diuji. */
export async function buildKinkiWorkbook(data: CandidateData): Promise<Blob> {
  return buildXlsxForm({
    base64: KINKI_BASE64,
    sheetPath: SHEET_PATH,
    drawingPath: DRAWING_PATH,
    photoPart: PHOTO_PART,
    photoRelId: PHOTO_REL_ID,
    photoBox: PHOTO_BOX,
    photoOffset: PHOTO_OFFSET,
    values: buildValues(data),
    numbers: buildNumbers(data),
    photoUrl: s(data.uploads.photo),
    sheetName: s(data.identitas.nama_lengkap),
  });
}

const template: CvTemplate = {
  id: 'kinki',
  name: 'Rirekisho Excel (Form KINKI)',
  type: 'xlsx',
  description:
    'Form CV magang klien KINKI sebagai Excel — 学歴 dua baris, 職歴 tiga blok, 家族構成 lima baris, できる作業, dan 性格診断テスト (MBTI) yang disimpulkan dari kalimat kandidat.',
  category: 'form',
  icon: 'file-excel',
  async render(data: CandidateData, _context: RenderContext): Promise<RenderResult> {
    try {
      const blob = await buildKinkiWorkbook(data);
      return { success: true, mimeType: blob.type, fileName: cvFileName(data), blob };
    } catch (e: unknown) {
      return { success: false, mimeType: '', fileName: '', error: e instanceof Error ? e.message : 'Excel render error' };
    }
  },
};

export default template;
