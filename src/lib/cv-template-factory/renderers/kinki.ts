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
 * SEL YANG TIDAK PUNYA SUMBER DI DATABASE
 * ----------------------------------------
 * `J19` kota sekolah, `M26` 業種, `Z26` 備考, `Q45` 計算テスト,
 * `X45` 目標貯金, `T37/T39` 学習期間 & 学習状況, `Q41` 英語レベル,
 * `X41` 集団生活年数, `X47` 就業希望年数, `AB51/AB52` 体力試験 — dibiarkan
 * kosong, bukan diisi tebakan.
 *
 * `O9` (ジャカルタから…㎞ / 飛行機で…), `I4` (第…課中) dan `M4` (…月取得予定)
 * DIBIARKAN apa adanya dari template: tidak ada kolomnya, dan pemilik lebih suka
 * placeholder yang bisa diisi tangan daripada sel kosong (2026-10-26).
 */
import type { CvTemplate, CandidateData, RenderContext, RenderResult } from '../types';
import { KINKI_BASE64 } from '../templates/kinki.b64';
import { isGood } from '../../helpers_cv';
import { inferMbti } from '../mbti';
import { buildXlsxForm, cvFileName, excelSerial, kanaJp, s, yearMonth, type PhotoBox } from './xlsx-form';

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
  if (!isGood(t) || /^(TIDAK|NO|NONE|-|無|0)$/.test(t)) return '無飲';
  if (t.includes('BANYAK') || t.includes('多')) return '多飲';
  if (t.includes('SEDANG') || t.includes('中')) return '中飲';
  return '小飲';
}

/** 煙草 — dropdown: 喫煙/非喫煙. */
function rokokJp(v: unknown): string {
  const t = s(v).toUpperCase();
  if (!isGood(t) || /^(TIDAK|NO|NONE|-|無|0)$/.test(t)) return '非喫煙';
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
  const t = s(v).toUpperCase();
  if (!isGood(t) || /^(TIDAK|NO|NONE|-|無)$/.test(t)) return 'なし';
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
  const t = bersih(v).toUpperCase();
  if (!isGood(t) || /^(TIDAK|NO|NONE|-|無|0)$/.test(t)) return 'なし';
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

/** 国公私 — dropdown: 国立/公立/私立. */
function kouritsu(sekolah: string): string {
  return /^(SMAN|SMKN|SMK\s*NEGERI|SMA\s*NEGERI|NEGERI|MAN)/i.test(sekolah.trim()) ? '国立' : '私立';
}

/** 雇用形態 — dropdown: アルバイト/正社員/非正社員/インターン/家業. */
function jenisKerjaJp(v: unknown): string {
  const t = s(v).toUpperCase();
  if (!isGood(t)) return '';
  if (t.includes('INTERN') || t.includes('MAGANG')) return 'インターン';
  if (t.includes('KELUARGA') || t.includes('USAHA')) return '家業';
  if (t.includes('TETAP') || t.includes('KARYAWAN')) return '正社員';
  if (t.includes('ALIH') || t.includes('KONTRAK') || t.includes('HONORER')) return '非正社員';
  if (t.includes('PART') || t.includes('HARIAN') || t.includes('BANTU')) return 'アルバイト';
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
    E6: bersih(id.nama_lengkap),
    S6: bersih(id.panggilan_katakana) || bersih(id.panggilan),
    E7: kanaJp(id.katakana),
    S7: genderJp(id.gender),
    E9: hpLokal(id.hp),
    // `O9` (ジャカルタから…㎞ / 飛行機で…) SENGAJA tidak ditulis: jarak & lama
    // penerbangan tidak ada di database, dan menghapusnya membuat kotaknya
    // kosong sama sekali — pemilik lebih suka teks template tetap ada untuk
    // diisi tangan.
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
    E16: sportJp(hobi),
    L16: mataJp(data.medis.mata_kiri),
    E17: hobi,
    L17: adaJp(data.medis.buta_warna),
    M3: simJp(id.sim),
    // `I4` (第…課中) dan `M4` (…月取得予定) dibiarkan seperti template: tidak
    // ada kolomnya, dan placeholder-nya lebih berguna daripada sel kosong.
  };
  // `I3` hanya ditimpa kalau database benar-benar punya levelnya; kalau tidak,
  // teks template (`N5レベル`) yang dipakai.
  const levelJp = jepangLevel(data.sertifikasi.jft ?? id.jft);
  if (levelJp) cells.I3 = levelJp;

  /* ── pendidikan: baris 19 = SMA/SMK, baris 21 = 日本語学校 ──────────────── */
  const edu = data.pendidikan as Record<string, unknown>[];
  const idxSma = edu.findIndex((p) => /SMA|SMK|ATAS|KEJURUAN/i.test(s(p.tingkat)));
  const idxLpk = edu.findIndex((p) => /日本語|BAHASA JEPANG/i.test(s(p.tingkat)));
  const sma = (idxSma >= 0 ? edu[idxSma] : edu[edu.length - 1]) ?? {};
  const sekolah = bersih(sma.sekolah ?? sma.nama_sekolah ?? sma.sekolah_id);
  const jurusan = bersih(sma.jurusan ?? sma.jurusan_id);
  if (isGood(sekolah)) {
    cells.A19 = '高校';
    cells.D19 = ym(sma.masuk ?? sma.tahun_masuk);
    cells.E20 = ym(sma.lulus ?? sma.tahun_lulus);
    cells.H19 = durasi(sma.masuk ?? sma.tahun_masuk, sma.lulus ?? sma.tahun_lulus);
    cells.J19 = '';
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
  if (isGood(sekolah)) {
    isiSekolah.push(`学校では${jurusan ? `${jurusan}を` : ''}学びました。`);
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
    cells[`M${top}`] = '';
    cells[`Q${top}`] = bersih(p.jabatan ?? p.jabatan_id);
    const gaji = manYen(p.gaji ?? p.penghasilan);
    cells[`W${top}`] = gaji;
    // Label `万円` duduk SEBARIS dengan angkanya (Y26/Y28/Y30). Bawaan template
    // menaruhnya di baris bawah blok, sehingga `1.8` dan `万円` tercetak di dua
    // baris terpisah. Pemilik menulisnya di baris atas.
    cells[`Y${top}`] = gaji ? '万円' : '';
    cells[`Y${bottom}`] = '';
    cells[`Z${top}`] = '';
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
    cells[`M${row}`] = '■';
    cells[`O${row}`] = '□';
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

  /* ── kotak PR & kepribadian ────────────────────────────────────────────── */
  cells.U3 = promosi || kelebihan;
  cells.E44 = kelebihan;
  cells.E45 = kekurangan;
  cells.E46 = tujuan;
  cells.E48 = rencana;

  /* ── MBTI ──────────────────────────────────────────────────────────────── */
  // Selalu terisi: kalau kandidat belum punya teks, tipenya jatuh ke bawaan
  // (lihat `mbti.ts`) — sel kosong terbaca sebagai formulir belum selesai.
  const mbti = inferMbti({
    promosi,
    kekurangan,
    kelebihan,
    tujuan,
    rencana,
    motivasi: bersih(data.wawancara.motivasi_ke_jepang_jp) || bersih(data.wawancara.motivasi_ke_jepang),
    hobi,
    keahlian,
  });
  cells.Q47 = mbti.typeName;
  cells.U48 = mbti.labels[0];
  cells.U49 = mbti.labels[1];
  cells.U50 = mbti.labels[2];
  cells.U51 = mbti.labels[3];
  cells.U52 = mbti.labels[4];

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
