/**
 * kinki.ts — form CV magang "KINKI" sebagai .xlsx, diisi dari database.
 *
 * ASAL BERKAS
 * -----------
 * Template final pemilik (`D:/ARBI ALVIANSYAH_CV.xlsx`, 2026-11-12), sudah
 * dikosongkan jadi `templates/kinki.b64.ts`. Ini form yang dipakai klien KINKI
 * dan berbeda dari versi lama: ada blok header 2–5 (KINKI 001, 年齢 otomatis,
 * 日本語力, 四輪免許, 専攻, 経歴PR), 通称/性別/年齢 di kanan, dan
 * 性格診断テスト yang teksnya diambil dari tabel rujukan di AG112:AH127
 * lewat rumus INDEX — jadi yang ditulis hanya NAMA TIPE-nya (R48).
 *
 * PETA SEL
 * --------
 *   2-5    header: B2 kode form, J4 日本語力, N4 四輪免許, V4 経歴PR,
 *          J5 第…課中, N5 …月取得予定, R4 =X20 (専攻), H4 umur (rumus)
 *   7-18   identitas: F7 nama, T7 通称, F8 kana, T8 性別, F9 lahir (serial),
 *          F10 hp, P10 jarak, F11 alamat, F12 結婚, M12/M13 tb/bb,
 *          F13 宗教, M14 血液型, F14 飲酒, M15 利き手, F15 煙草,
 *          M16/M17 視力, F16 刺青, F17 スポーツ, M18 色覚異常, F18 趣味
 *   19-25  pendidikan: E20/F21 = 専門 (mulai/selesai), I20 期間, K20 地域,
 *          N20 国公私, P20 学校名, X20 専攻; E22/F23/I22/N22/P22/X22 =
 *          日本語学校; F24 具体的な修学内容
 *   26-34  tiga blok kerja (2 baris per pekerjaan): B jenis, E mulai,
 *          F selesai, I 期間, N 業種, R 職種, X 月収, AA 備考; F33 仕事内容
 *   35-36  できる作業 — 12 kotak centang + catatan その他 di Y36
 *   37-44  keluarga (B 続柄, D 年齢, F 職業, K 月収, N 同居, P 別居) +
 *          日本語能力 U38-U40, 英語 R42, その他外国語 U42, 集団生活 Y42,
 *          自動車運転経験 R44, 結婚の予定 Y44, 緊急連絡先 Y38/AA38, 親族 Y40
 *   45-50  長所 F45, 短所 F46, 志望動機 F47, 将来の夢 F49;
 *          計算テスト R46, 目標貯金 Y46, 就業希望年数 Y48, 満了後 Y50,
 *          体力試験 AC52/AC53
 *   51-53  MBTI: R48 nama tipe, V49..V53 lima axis, B51/F51 rumus
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
 * `K20` kota sekolah, `N27` 業種, `AA27` 備考, `R46` 計算テスト, `Y46` 目標貯金,
 * `U38/U40` 学習期間 & 学習状況, `R42` 英語レベル, `Y42` 集団生活年数,
 * `Y48` 就業希望年数, `AC52/AC53` 体力試験, `P10` jarak & lama penerbangan,
 * `J5` 第…課中, `N5` …月取得予定. Migrasi 022 menambah kolomnya (lihat
 * `migrations/022_cv_field_gaps.sql`), jadi sekarang semuanya diisi — dan yang
 * kosong hanya berarti kandidatnya belum mengisi.
 *
 * `J4` 日本語力: kolom `level_bahasa_jepang` menang atas tebakan dari teks JFT,
 * karena teks `N2..N5` tidak mencakup pemegang JFT Basic (`A2`/`B1`) — dulu
 * mereka tercetak `N5レベル` hanya karena itu bawaan template.
 */
import type { CvTemplate, CandidateData, RenderContext, RenderResult } from '../types';
import { KINKI_BASE64 } from '../templates/kinki.b64';
import { isGood, isLpkTingkat, kouritsuSekolah, sortEdu } from '../../helpers_cv';
import { inferMbti, mbtiFromCode } from '../mbti';
import { buildXlsxForm, cvFileName, durasiJp, excelSerial, kanaJp, negatif, s, yearMonth, type PhotoBox } from './xlsx-form';

const SHEET_PATH = 'xl/worksheets/sheet1.xml';
const DRAWING_PATH = 'xl/drawings/drawing1.xml';
/** Placeholder transparan yang dibuat saat aset dikosongkan. */
const PHOTO_PART = 'xl/media/image2.png';
const PHOTO_REL_ID = 'rId2';

/** Kotak pas foto, disalin dari berkas pemilik (kolom X baris 7). */
const PHOTO_BOX: PhotoBox = { cx: 1590675, cy: 2143125 };
/** Foto pemilik tidak menempel sudut sel: 76200/38100 EMU dari kiri/atas. */
const PHOTO_OFFSET = { colOff: 76200, rowOff: 38100 };

const JOB_START = 27;
const JOB_BLOCKS = 3;
const FAM_START = 38;
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
 * `2021-07` → `2021年7月1日` — khusus blok 学歴 (KINKI).
 *
 * Keputusan pemilik 2026-11-12: *"untuk hari silahkan isi auto saja, manual saya
 * juga isi sama semua tanggal 1"*. Kandidat hanya menghafal tahun & bulan, dan
 * form KINKI mencetak kolom tanggal lengkap; membiarkan harinya kosong membuat
 * sel terbaca sebagai formulir belum selesai.
 *
 * Tahun saja tetap `2019年` — menambahkan bulan Januari berarti mengarang bulan,
 * dan itu kesalahan yang lebih besar daripada sel kosong.
 */
/**
 * 就業希望年数 (Y48): teks bebas Indonesia → bentuk Jepang.
 *
 * Terukur pada BUDI (ASJ00188): kolomnya berisi "Jangka Panjang" dan
 * renderer lama menyalinnya apa adanya, sehingga form klien Jepang mencetak
 * bahasa Indonesia. Pemetaan ini sengaja KONSERVATIF: teks yang tidak
 * dikenali dikembalikan apa adanya, bukan dikarang.
 */
function masaKerjaJp(v: unknown): string {
  const raw = s(v).trim();
  if (!raw) return '';
  const t = raw.toLowerCase();
  if (/jangka panjang|long ?term|selamanya|permanen/.test(t)) return '５年間以上';
  if (/jangka pendek|short ?term/.test(t)) return '１～３年';
  const th = /(\d+)\s*(tahun|thn|year)/.exec(t);
  if (th) return `${Number(th[1])}年間`;
  if (/^\d+$/.test(raw)) return `${raw}年間`;
  return raw;
}
function ymd(v: unknown): string {
  const raw = s(v).trim();
  if (/^\d{4}$/.test(raw)) return `${raw}年`;
  const p = yearMonth(v);
  if (!p.y || !p.m) return ym(v);
  return `${p.y}${p.m}1日`;
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

/* `manYen` dihapus 2026-11-12: sejak `aec08e4` seluruh 月収 memakai
   `manYenRp` (rupiah → 万円, dengan konversi), sehingga fungsi ini tidak punya
   pemanggil lagi. Ia satu-satunya sebab `lint-ratchet` merah (+1 diagnostik
   `noUnusedVariables`) pada pohon yang sebaliknya hijau. */

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

/**
 * Istilah Indonesia → Jepang untuk kolom yang dicetak apa adanya.
 *
 * Database menyimpan banyak kolom dalam bahasa Indonesia; form ini resmi
 * berbahasa Jepang, jadi menulis "PETERNAKAN" di kolom 業種 membuat pemilik
 * harus mengetik ulang kanji-nya sendiri (keluhan 2026-11-12). Kolom `*_jp`
 * dari database SELALU menang; tabel ini hanya jaring kalau kolom itu kosong.
 * Kunci dicocokkan pada teks UPPERCASE yang sudah dibersihkan tanda bacanya.
 */
const JP_TERMS: Record<string, string> = {
  // keluarga — 職業
  PETANI: '農家', 'BURUH TANI': '農業労働者', PETERNAK: '畜産家', PETENAK: '畜産家', NELAYAN: '漁師',
  'IBU RUMAH TANGGA': '主婦', 'RUMAH TANGGA': '主婦', PELAJAR: '学生', MAHASISWA: '大学生',
  KARYAWAN: '会社員', 'KARYAWAN SWASTA': '会社員', 'KARYAWAN PABRIK': '工場勤務',
  WIRASWASTA: '自営業', PENGUSAHA: '実業家', PEDAGANG: '商人', PEMILIK: '経営者',
  GURU: '教師', DOSEN: '大学教授', SOPIR: '運転手', SUPIR: '運転手', SATPAM: '警備員',
  TUKANG: '職人', BURUH: '労働者', PNS: '公務員', TNI: '軍人', POLRI: '警察官',
  PENSIUNAN: '退職者', 'TIDAK BEKERJA': '無職', SERABUTAN: '日雇い', PERAWAT: '看護師',
  'KEPALA DESA': '村長', PEKEBUN: '農園主', 'PETERNAK AYAM': '養鶏業',
  // 業種
  PERTANIAN: '農業', PETERNAKAN: '畜産業', PERKEBUNAN: '農園', PERIKANAN: '漁業',
  KEHUTANAN: '林業', KONSTRUKSI: '建設業', BANGUNAN: '建設業', MANUFAKTUR: '製造業',
  PABRIK: '製造業', PERDAGANGAN: '商業', JASA: 'サービス業', KULINER: '飲食業',
  RESTORAN: '飲食業', 'RUMAH MAKAN': '飲食業', HOTEL: 'ホテル業', PARIWISATA: '観光業',
  TEKSTIL: '繊維業', GARMEN: '縫製業', OTOMOTIF: '自動車業', ELEKTRONIK: '電子業',
  PERTAMBANGAN: '鉱業', KESEHATAN: '医療', PENDIDIKAN: '教育', TRANSPORTASI: '運輸業',
  LOGISTIK: '物流業', KOPERASI: '協同組合', BANK: '銀行', ASURANSI: '保険',
  TEKNOLOGI: 'IT業', INFORMASI: '情報通信業',
  // 職種
  OPERATOR: 'オペレーター',
  STAFF: 'スタッフ', STAF: 'スタッフ', ADMIN: '事務', ADMINISTRASI: '事務',
  TEKNISI: '技術者', MEKANIK: '整備士', LAS: '溶接工', WELDER: '溶接工', PENGELAS: '溶接工',
  GUDANG: '倉庫作業', 'JURU MASAK': '調理師', KOKI: '調理師', PELAYAN: '接客', KASIR: 'レジ係',
  MANDOR: '現場監督', KEPALA: '責任者', SALES: '営業', MARKETING: '営業',
  PENJAHIT: '縫製作業', PEMANEN: '収穫作業', PENYADAP: '搾乳作業', PETUGAS: '係員',
  // 専攻
  MULTIMEDIA: 'マルチメディア', 'TEKNIK KOMPUTER': 'コンピューター技術',
  'TEKNIK KOMPUTER DAN JARINGAN': 'コンピューターネットワーク', TKJ: 'コンピューターネットワーク',
  RPL: 'ソフトウェア開発', 'REKAYASA PERANGKAT LUNAK': 'ソフトウェア開発',
  'TEKNIK OTOMOTIF': '自動車', 'TATA BOGA': '調理', PERHOTELAN: 'ホテル',
  'BAHASA JEPANG': '日本語', AKUNTANSI: '会計', IPA: '理科', IPS: '社会',
  'TEKNIK MESIN': '機械', MESIN: '機械', 'TEKNIK ELEKTRO': '電気', ELEKTRO: '電気',
  KEPERAWATAN: '看護', HUKUM: '法律', EKONOMI: '経済', MANAJEMEN: '経営',
  DESAIN: 'デザイン', SENI: '芸術', SIPIL: '土木', 'TEKNIK SIPIL': '土木',
  KIMIA: '化学', FISIKA: '物理', BIOLOGI: '生物', MATEMATIKA: '数学',
  SEJARAH: '歴史', GEOGRAFI: '地理', SOSIOLOGI: '社会学', PSIKOLOGI: '心理学',
  KOMUNIKASI: 'コミュニケーション', BISNIS: 'ビジネス',
};

/** Teks sudah berisi kana/kanji? Kalau ya, jangan diterjemahkan lagi. */
function sudahJp(v: unknown): boolean {
  return /[\u3040-\u30ff\u4e00-\u9faf]/.test(s(v));
}

/**
 * Terjemahkan istilah Indonesia yang lazim; teks Jepang / nama diri dibiarkan.
 * Cocok persis dulu, lalu frasa terpanjang yang terkandung (mis.
 * "PETERNAKAN AYAM" → 畜産業), sisanya teks asli.
 */
function jpTerm(v: unknown): string {
  const t = bersih(v);
  if (!t || sudahJp(t)) return t;
  const key = t.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  if (JP_TERMS[key]) return JP_TERMS[key];
  let bestKey = '';
  for (const k of Object.keys(JP_TERMS)) {
    if (key.includes(k) && k.length > bestKey.length) bestKey = k;
  }
  return bestKey ? JP_TERMS[bestKey] : t;
}

/**
 * 集団生活年数 — database menyimpan BULAN, bukan tahun (owner 2026-11-12:
 * "hitungan tinggal di asrama bersama itu bulan bukan tahun"). 12 bulan ke atas
 * ditulis "1年6か月" supaya tetap terbaca sebagai 年数.
 */
function masaTinggal(v: unknown): string {
  const n = Number(angka(v));
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 12) {
    const th = Math.floor(n / 12);
    const sisa = n % 12;
    return sisa ? `${th}年${sisa}ヶ月` : `${th}年`;
  }
  return `${n}ヶ月`;
}

/**
 * Rupiah → 万円. Database menyimpan rupiah PENUH (2.000.000 = Rp 2 juta),
 * sedangkan form mencetak 万円 dengan 1万円 ≈ Rp 1.000.000 — angka yang sama
 * dengan contoh cetak pemilik (2 / 2,5 / 1 / 2,3). Baris lama yang terlanjur
 * disimpan dalam ribuan (`2000`) dikalikan 1000 dulu.
 */
function manYenRp(v: unknown): string {
  let n = Number(angka(v));
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 100_000) n *= 1000;
  const man = n / 1_000_000;
  if (man < 0.1) return '';
  return (Math.round(man * 10) / 10).toFixed(1).replace(/\.0$/, '');
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
    /* `F9` (生年月日) diisi ANGKA lewat `buildNumbers`, bukan teks: `T9` dan
       `H4` menghitung umur dengan `DATEDIF(F9,TODAY())`. */
    F7: bersih(id.nama_lengkap),
    T7: bersih(id.panggilan_katakana) || bersih(id.panggilan),
    F8: kanaJp(id.katakana),
    T8: genderJp(id.gender),
    F10: hpLokal(id.hp),
    /* `P10` (jarak & lama penerbangan). Dua kolom baru (migrasi 022) mengisi
       placeholder `***`; kalau keduanya kosong teks template dibiarkan. */
    F11: asalJp(bersih(id.alamat_jp), bersih(id.tempat_lahir_jp)),
    F12: nikahJp(id.status_nikah),
    M12: angka(data.fisik.tb),
    F13: AGAMA_JP[s(id.agama).toUpperCase().trim()] ?? bersih(id.agama),
    M13: angka(data.fisik.bb),
    F14: minumJp(data.medis.alkohol),
    M14: darahJp(id.golongan_darah),
    F15: rokokJp(data.medis.rokok),
    M15: tanganJp(data.fisik.tangan_dominan),
    F16: adaJp(data.medis.tato),
    M16: mataJp(data.medis.mata_kanan),
    F17: bersih(data.fisik.olahraga) || sportJp(hobi),
    M17: mataJp(data.medis.mata_kiri),
    F18: hobi,
    M18: adaJp(data.medis.buta_warna),
    N4: simJp(id.sim),
  };
  /* Placeholder header yang sekarang bisa diisi dari kolom (migrasi 022):
     `J5` 第…課中, `N5` …月取得予定, `P10` jarak & lama penerbangan. */
  const bab = angka(data.sertifikasi.bab_belajar_jp);
  if (bab) cells.J5 = `第${bab}課中`;
  const bulanSim = /(\d{1,2})\s*月?$/.exec(bersih(id.rencana_sim_bulan));
  if (bulanSim) cells.N5 = `${parseInt(bulanSim[1], 10)}月取得予定`;
  const km = angka(id.jarak_jakarta_km);
  const terbang = bersih(id.lama_penerbangan);
  if (km || terbang) {
    cells.P10 = [
      km ? `ジャカルタから${km}㎞` : '',
      terbang ? `飛行機で${terbang}` : '',
    ].filter(Boolean).join('\n');
  }
  /* `J4` 日本語力: kolom `level_bahasa_jepang` menang (bisa dikoreksi admin),
     lalu tebakan dari teks JFT.
     Tanpa keduanya sel ini DIBERSIHKAN (2026-10-29). Dulu teks template
     `N5レベル` dibiarkan, dan itu berarti **243 dari 268** kandidat — yang
     kolom `jft`-nya kosong — tercetak mengaku level N5 di formulir resmi.
     Sel kosong lebih jujur daripada klaim kemampuan yang tidak pernah diisi. */
  const levelJp = bersih(data.sertifikasi.level_bahasa_jepang) || jepangLevel(data.sertifikasi.jft ?? id.jft);
  cells.J4 = levelJp;

  /* ── pendidikan: baris 20 = PENDIDIKAN TERAKHIR, baris 22 = 日本語学校 ────
     Label 専門 / 日本語学校 sudah statis di template; yang diisi hanya kolom
     tanggal, 期間, 地域, 国公私, 学校名, 専攻.
     Baris 20 memakai jenjang TERTINGGI yang terisi (bukan selalu SMA/SMK):
     lulusan S1 yang mencetak “高校: SMAN 1” di formulir resmi adalah klaim
     yang salah, dan itu yang terjadi sampai 2026-10-30. Baris kosong di
     ekor daftar (slot 5 yang tidak dipakai) dilewati, karena dulu baris
     terakhir yang KOSONG membuat seluruh blok 学歴 dibersihkan. */
  // Diurutkan menurut JENJANG dulu: "pendidikan terakhir" hanya benar kalau
  // daftarnya memang naik. Baris dari Form Master mengikuti urutan slot, dan
  // slot bisa diisi tidak berurutan.
  const edu = sortEdu((data.pendidikan || []) as Record<string, unknown>[]);
  const idxLpk = edu.findIndex((p) => isLpkTingkat(p.tingkat));
  const nonLpk = edu.filter((p, i) => i !== idxLpk
    && isGood(bersih(s(p.sekolah ?? p.nama_sekolah ?? p.sekolah_id))));
  const sma = nonLpk[nonLpk.length - 1] ?? {};
  const sekolah = bersih(sma.sekolah_jp) || bersih(sma.sekolah ?? sma.nama_sekolah ?? sma.sekolah_id);
  const jurusan = jpTerm(bersih(sma.jurusan_jp) || (sma.jurusan ?? sma.jurusan_id));
  if (isGood(sekolah)) {
    cells.E20 = ymd(sma.masuk ?? sma.tahun_masuk);
    cells.F21 = ymd(sma.lulus ?? sma.tahun_lulus);
    cells.I20 = durasi(sma.masuk ?? sma.tahun_masuk, sma.lulus ?? sma.tahun_lulus);
    // 地域 — kolom `wilayah_sekolah` (migrasi 022). Dulu selalu dikosongkan.
    cells.K20 = bersih(id.wilayah_sekolah);
    cells.N20 = kouritsuSekolah(sekolah, sma.status_sekolah);
    cells.P20 = sekolah;
    // Strip atas mencetak `専攻` dengan `=X20`. Sel kosong membuatnya `0`, jadi
    // kolom ini memakai `-` seperti sel lain yang memang belum ada isinya.
    cells.X20 = jurusan || '-';
  } else {
    for (const c of ['E20', 'F21', 'I20', 'K20', 'N20', 'P20']) cells[c] = '';
    cells.X20 = '-';
  }
  let sekolahLpk = '';
  if (idxLpk >= 0) {
    const lpk = edu[idxLpk];
    sekolahLpk = bersih(lpk.sekolah_jp) || bersih(lpk.sekolah ?? lpk.nama_sekolah ?? lpk.sekolah_id);
    cells.E22 = ymd(lpk.masuk ?? lpk.tahun_masuk);
    cells.F23 = isGood(s(lpk.lulus ?? lpk.tahun_lulus)) ? ymd(lpk.lulus ?? lpk.tahun_lulus) : '今まで';
    cells.I22 = durasi(lpk.masuk ?? lpk.tahun_masuk, lpk.lulus ?? lpk.tahun_lulus);
    cells.N22 = kouritsuSekolah(sekolahLpk, lpk.status_sekolah);
    cells.P22 = sekolahLpk;
    cells.X22 = '日本語';
  } else {
    // Tanpa baris 日本語学校, tanda `～` bawaan template menggantung sendirian
    // di kolom periode.
    for (const c of ['E22', 'F23', 'I22', 'K22', 'N22', 'P22', 'X22']) cells[c] = '';
  }

  /* ── 具体的な修学内容: dirangkai dari baris 学歴 yang sudah terisi ───────── */
  const isiSekolah: string[] = [];
  // Tanpa jurusan, versi lama berbunyi "学校では学びました。" — kalimat tanpa isi
  // yang tetap tercetak di kolom 具体的な修学内容 (terukur pada ASJ00041).
  if (isGood(sekolah)) {
    isiSekolah.push(jurusan ? `学校では${jurusan}を学びました。` : `${sekolah}で学びました。`);
  }
  if (isGood(sekolahLpk)) isiSekolah.push(`現在は${sekolahLpk}で日本語を勉強しています。`);
  cells.F24 = isiSekolah.join(' ');

  /* ── pekerjaan: tiga blok x dua baris ──────────────────────────────────── */
  const kerja = data.pekerjaan as Record<string, unknown>[];
  for (let i = 0; i < JOB_BLOCKS; i++) {
    const top = JOB_START + i * 2;
    const bottom = top + 1;
    const p = kerja[i] ?? {};
    const masuk = p.masuk ?? p.tahun_masuk;
    const keluar = p.keluar ?? p.tahun_keluar;
    cells[`B${top}`] = sudahJp(p.jenis_jp)
      ? bersih(p.jenis_jp)
      : jenisKerjaJp(bersih(p.jenis_jp) || (p.jenis ?? p.status_kerja));
    cells[`E${top}`] = ym(masuk);
    cells[`F${bottom}`] = ym(keluar);
    cells[`I${top}`] = durasi(masuk, keluar);
    // 業種 (N) — DIPAKAI UNTUK NAMA PERUSAHAAN. Bukti: 9 CV manual pemilik
    // (Drive, 2026-11-12) mengisi N27 dengan "PT VERONIQUE INDONESIA",
    // "PT TSAMANIYA AMANAH MANDIR", "Hotel 101", dst., sedangkan INDUSTRI-nya
    // ditulis di kolom 備考 (AA). Kode lama menaruh industri di N dan
    // membiarkan AA kosong — kebalikan dari cara pemilik mengisi form.
    const pt = bersih(p.perusahaan_jp) || bersih(p.perusahaan ?? p.nama_perusahaan ?? p.perusahaan_id);
    cells[`N${top}`] = jpTerm(pt);
    cells[`R${top}`] = jpTerm(bersih(p.jabatan_jp) || (p.jabatan ?? p.jabatan_id));
    // 月収: `Z` sudah berisi teks tetap `万円`. Menulis "2万円" di X membuat
    // sel terbaca "2万円万円" — 9 dari 9 CV manual menulis ANGKA saja di X.
    const gaji = manYenRp(p.gaji ?? p.penghasilan);
    // `‐` bila barisnya berisi pekerjaan tetapi gajinya tidak diisi — sama
    // dengan kolom 月収 keluarga. Baris yang benar-benar kosong dibiarkan ''.
    const adaKerja = isGood(pt) || isGood(cells[`R${top}`]) || isGood(ym(masuk));
    cells[`X${top}`] = gaji || (adaKerja ? '‐' : '');
    // 備考 — industri lalu catatan.
    cells[`AA${top}`] = bersih(p.catatan_jp) || bersih(p.bidang ?? p.industri) || bersih(p.catatan ?? p.keterangan);
  }
  if (!kerja.length) {
    // `～` bawaan template akan tercetak apa adanya tanpa dua tanggal.
    for (const c of ['E27', 'E28', 'F28']) cells[c] = '';
  }

  /* ── 具体的な仕事内容: dirangkai dari blok 職歴 yang terisi ──────────────── */
  cells.F33 = kerja
    .slice(0, JOB_BLOCKS)
    .map((p) => {
      const pt = bersih(p.perusahaan ?? p.nama_perusahaan ?? p.perusahaan_id);
      if (!isGood(pt)) return '';
      const jb = jpTerm(bersih(p.jabatan_jp) || (p.jabatan ?? p.jabatan_id));
      return jb ? `${pt}では${jb}として勤務しました。` : `${pt}で勤務しました。`;
    })
    .filter(Boolean)
    .join(' ');

  /* ── できる作業 ────────────────────────────────────────────────────────── */
  /* Bukti dari 9 CV manual pemilik (2026-11-12): kotak yang PERNAH dicentang
     hanya その他 (X35) — selalu — dan 自動車運転 (F35) bila kandidat punya SIM.
     Tidak satu pun mencentang kotak keahlian spesifik (土木/大工/溶接/…),
     walaupun teks keahliannya menyebut pekerjaan itu ("建設作業" pada BUDI).
     Karena itu pemetaan kata-kunci → kotak DIBUANG: ia mengarang centang yang
     tidak pernah dipakai pemilik, dan centang itu terbaca sebagai klaim
     keahlian resmi di form klien. */
  const boxes = ['F35', 'K35', 'N35', 'Q35', 'T35', 'X35', 'B36', 'F36', 'K36', 'N36', 'Q36', 'T36'];
  for (const c of boxes) cells[c] = '□';
  if (isGood(keahlian)) {
    cells.X35 = '■';
    cells.Y36 = keahlian.slice(0, 18);
  }
  if (cells.N4 === 'あり') cells.F35 = '■';

  /* ── keluarga + 緊急連絡先 ─────────────────────────────────────────────── */
  const fam = data.keluarga as Record<string, unknown>[];
  for (let i = 0; i < FAM_ROWS; i++) {
    const row = FAM_START + i;
    const p = fam[i] ?? {};
    /* Baris tanpa anggota keluarga = `□□`, bukan `■□`. Versi lama mencentang
       同居 untuk SETIAP baris — termasuk baris kosong — sehingga form mengklaim
       seluruh slot diisi orang yang tinggal serumah. 9 CV manual pemilik
       (2026-11-12) selalu `□□` pada baris kosong.
       "Ada anggota" = ada NAMA **atau** 続柄: baris Form Master boleh hanya
       menyebut hubungan tanpa nama, dan baris seperti itu tetap anggota. */
    const adaAnggota =
      isGood(bersih(p.nama ?? p.nama_lengkap)) ||
      isGood(bersih(p.hubungan_jp ?? p.hubungan));
    cells[`B${row}`] = sudahJp(p.hubungan_jp)
      ? bersih(p.hubungan_jp)
      : hubunganJp(bersih(p.hubungan_jp) || p.hubungan);
    cells[`D${row}`] = angka(p.usia ?? p.umur);
    cells[`F${row}`] = jpTerm(bersih(p.pekerjaan_jp) || p.pekerjaan);
    // 月収 keluarga: angka, atau `‐` bila tidak ada — 9 dari 9 CV manual
    // memakai tanda itu, termasuk pada baris yang tidak diisi.
    cells[`K${row}`] = manYenRp(p.gaji ?? p.penghasilan) || '‐';
    // 同居/別居 — dulu dicetak `■`/`□` tetap (selalu "tinggal bersama").
    const tinggal = s(p.tinggal ?? p.status_tinggal).toUpperCase();
    const serumah = !/TIDAK|BEDA|LUAR|PISAH|MANDIRI|INDEPENDEN/.test(tinggal);
    cells[`N${row}`] = !adaAnggota ? '□' : serumah ? '■' : '□';
    cells[`P${row}`] = !adaAnggota ? '□' : serumah ? '□' : '■';
  }
  const darurat = hubunganJp(id.kontak_darurat_hubungan);
  cells.Y38 = darurat === 'その他' ? '' : darurat;
  cells.AA38 = hpLokal(id.hp_darurat);

  /* ── wawancara ─────────────────────────────────────────────────────────── */
  cells.U39 = lulusJp(data.sertifikasi.jft ?? id.jft);
  cells.R44 = cells.N4 === 'あり' ? '' : 'なし';
  const ken = data.kenalan_jepang;
  /* 緊急連絡先 (Y37) — nama/hubungan di Y38, telepon di AA38.
     Sebelum ini ketiganya tidak pernah ditulis, sehingga baris 緊急連絡先 di
     form resmi selalu kosong walau kolom `kontak_darurat_*` ada isinya.
     Hubungan (AYAH/IBU/…) diterjemahkan; kalau kosong, nama dipakai apa adanya. */
  const daruratNama = bersih(data.identitas.kontak_darurat_nama);
  const daruratHub = bersih(data.identitas.kontak_darurat_hubungan);
  cells.Y38 = hubunganJp(daruratHub) || daruratNama;
  cells.AA38 = hpLokal(data.identitas.hp_darurat);
  cells.Y40 = isGood(bersih(ken.nama_jp) || bersih(ken.nama_id))
    ? bersih(ken.nama_jp) || bersih(ken.nama_id)
    : '無し';
  cells.Y44 = '未定';
  cells.Y50 = harapanSetelahJp(rencana);

  /* ── kolom tes & rencana (migrasi 022) ─────────────────────────────────── */
  // 計算テスト / 目標貯金 / 学習期間 / 学習状況 / 英語レベル / その他外国語 /
  // 集団生活年数 / 就業希望年数 / 体力試験 — dulu seluruhnya dikosongkan.
  cells.R46 = bersih(data.fisik.tes_hitung);
  cells.Y46 = manYenRp(data.wawancara.tabungan);
  /* 試験合格 (U39) — hasil uji bahasa yang SUDAH lulus (`bahasa`, mis.
     "JFT-BASIC A2" / "JLPT N5"). Sebelum ini sel itu tidak pernah ditulis,
     sehingga form resmi selalu kosong di baris 試験合格 walaupun kolomnya ada.
     `level_bahasa_jepang` TIDAK dipakai di sini — itu level yang ditampilkan di
     J4, dan menyalinnya ke U39 akan menyatakan "lulus N4" hanya karena
     levelnya N4. */
  cells.U39 = bersih(data.sertifikasi.bahasa);
  cells.U38 = durasiJp(data.sertifikasi.lama_belajar_jp);
  cells.U40 = bersih(data.sertifikasi.status_belajar_jp);
  /* 英語レベル / その他外国語: `無` saat kolomnya kosong.
     7 dari 9 CV manual pemilik (2026-11-12) menulis `無` — bukan sel kosong.
     Bedanya penting di form resmi: sel kosong terbaca "belum diisi", `無`
     terbaca "memang tidak punya". */
  cells.R42 = bersih(data.sertifikasi.level_bahasa_inggris) || '無';
  cells.U42 = bersih(data.sertifikasi.bahasa_lain) || '無';
  cells.Y42 = masaTinggal(data.fisik.tinggal_kursus_tahun);
  /* 就業希望年数 — kolomnya berisi TEKS BEBAS berbahasa Indonesia
     ("Jangka Panjang", "5 tahun"). Menyalinnya apa adanya mencetak bahasa
     Indonesia di form Jepang (terukur pada BUDI: "Jangka Panjang"). */
  cells.Y48 = masaKerjaJp(data.wawancara.lamakerja_diharapkan);
  cells.AC52 = angka(data.fisik.tes_pushup);
  cells.AC53 = angka(data.fisik.tes_squat);

  /* ── kotak PR & kepribadian ────────────────────────────────────────────── */
  cells.V4 = promosi || kelebihan;
  cells.F45 = kelebihan;
  cells.F46 = kekurangan;
  cells.F47 = tujuan;
  cells.F49 = rencana;

  /* ── MBTI ──────────────────────────────────────────────────────────────── */
  // Kolom `mbti` (migrasi 022) menang supaya admin bisa mengoreksi tipe tanpa
  // mengubah teks wawancara. Kalau kosong, tipenya disimpulkan seperti dulu —
  // sel kosong terbaca sebagai formulir belum selesai.
  // Cukup tulis NAMA TIPE di R48: `B51` (=R48) dan `F51` (INDEX ke tabel
  // rujukan AG112:AH127) menghitung sendiri teks 補足説明-nya.
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
  cells.R48 = inferred.typeName;
  cells.V49 = inferred.labels[0];
  cells.V50 = inferred.labels[1];
  cells.V51 = inferred.labels[2];
  cells.V52 = inferred.labels[3];
  cells.V53 = inferred.labels[4];

  return cells;
}

/** Tanggal lahir harus ANGKA: `T9` menghitung umur dengan `DATEDIF`. */
export function buildNumbers(data: CandidateData): Record<string, number> {
  const serial = excelSerial(data.identitas.tgl_lahir);
  return serial === null ? {} : { F9: serial };
}

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
    'Form CV magang klien KINKI sebagai Excel — header KINKI 001 dengan 年齢 otomatis, 通称/性別, 経歴PR, 学歴 dua baris, 職歴 tiga blok, 家族構成 lima baris, できる作業, 計算テスト/目標貯金/体力試験, dan 性格診断テスト (MBTI) yang disimpulkan dari kalimat kandidat.',
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
