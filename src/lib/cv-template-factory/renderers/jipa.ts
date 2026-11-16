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
 * SEL YANG TIDAK DIISI
 * --------------------
 * `B5` CODE LOWONGAN (diisi agensi; kolomnya ada di `database_candidate`, bukan
 * di baris master). `J5` 希望職種, `E54` ビザ種類 dan `E55` 在日期間 SUDAH
 * diisi sejak migrasi 022 (`bidangssw`, `visa_jepang`, `lama_di_jepang`).
 * Tanggal perolehan sertifikat (`B47:B51`) dan 日付 (`M58`) + kotak tanda
 * tangan (`L60`) TERISI sejak 2026-11-16 — lihat di bawah.
 *
 * BAHASA & ATURAN PENGISIAN — KEPUTUSAN PEMILIK 2026-11-16
 * -------------------------------------------------------
 *   1. 学歴 専攻 (`K19:K23`) bahasa Jepang (`TEKNIK PEMESINAN` → 機械加工).
 *   2. 出身地 (`F13`) bahasa Jepang — `tempat_lahir_jp` menang, lalu
 *      `wilayahJp` (PONOROGO → ポノロゴ).
 *   3. 職歴: 年月 memakai kanji `年`/`月` seperti blok 学歴 (dulu angka
 *      telanjang `2024` / `08`); nama perusahaan tetap ejaan Indonesia,
 *      sedangkan 業種 (`L27:L30`) bahasa Jepang.
 *   4. 家族: 氏名 kembali ke nama Indonesia (dulu katakana); 職業 = opsi
 *      dropdown di `K`, dan kalau pekerjaannya TIDAK ada di daftar →
 *      `その他(lain-lain)` + pekerjaan Jepangnya di sel sebelah (`L`).
 *   5. 資格試験: tanggal dulu (`B`), lalu opsi dropdown (`F`), lalu penjelasan
 *      (`I`) — `国際交流基金日本語基礎テスト 190点(250)`. Urutan baris:
 *      JFT/JLPT → SSW → SIM → その他. Sertifikat yang sama tidak lagi dicetak
 *      dua kali (dulu baris `sertifikat_lain` muncul lagi sebagai その他).
 *   6. 日付 (`M58`) dan kotak tanda tangan (`L60`) = tanggal CV dicetak,
 *      `2026年11月16日`. Pemilik: *"cukup tulis kapan cv ini di cetak"*.
 */
import type { CvTemplate, CandidateData, RenderContext, RenderResult } from '../types';
import { JIPA_BASE64 } from '../templates/jipa.b64';
import { isGood, kouritsuSekolah, tingkatSekolahJp, batasiRiwayatSekolah } from '../../helpers_cv';
import { isCurrent } from '../../cvPeriod';
import { jpTerm, sudahJp, wilayahJp, opsiJp, bidangJp } from '../../cv-jp-terms';
import { buildXlsxForm, cvFileName, durasiJp, kanaJp, negatif, s } from './xlsx-form';

const SHEET_PATH = 'xl/worksheets/sheet1.xml';
const DRAWING_PATH = 'xl/drawings/drawing1.xml';
const PHOTO_PART = 'xl/media/image1.png';
const PHOTO_REL_ID = 'rId1';
/**
 * Bingkai pas foto = SEL GABUNGAN `B6:E13`, bukan ukuran berkas gambar.
 *
 * `ext` di aset masih 9753600 x 14630400 EMU (1024x1536 px = 10,67 x 16 inci):
 * itu ukuran natural foto kandidat contoh di berkas sumber, dan kalau dipakai
 * apa adanya foto menutupi hampir seluruh halaman serta tidak masuk bingkai
 * (pemilik, 2026-10-26: "gak pass bingkai cellnya terlalu gede"). Geometri
 * selnya 192 x 208 px (2,00 x 2,17 in) — dihitung `cellRangeEmu` saat render,
 * jadi kalau tinggi baris template diubah, bingkainya ikut.
 */
export const PHOTO_RANGE = 'B6:E13';
/** 2 px tiap sisi supaya garis bingkai sel tetap terlihat di atas foto. */
export const PHOTO_INSET = 2 * 9525;

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
  HINDU: 'ヒンズー教', BUDHA: '仏教', BUDDHA: '仏教',
};

/**
 * `父(AYAH)`, `母(IBU)`, … — nilai yang sah di dropdown 続柄.
 *
 * Daftarnya BERBEDA per baris, dan itu bukan detail: `B33` memuat
 * `本人(DIRI SENDIRI)` serta `祖父(KAKEK)`/`祖母(NENEK)` huruf besar, sedangkan
 * `B34:B39` menulis `祖父(kakek)`/`祖母(nenek)` huruf kecil. Satu peta untuk
 * semua baris membuat nilai kakek/nenek tidak ada di daftar barisnya sendiri.
 * `B40` hanya memuat orang tua & saudara — hubungan lain tetap dicetak apa
 * adanya supaya namanya tidak kehilangan keterangan.
 */
const HUBUNGAN: [RegExp, string][] = [
  // URUTAN PENTING: 祖父/祖母 mengandung 父/母, jadi diperiksa lebih dulu.
  [/KAKEK|祖父/i, '祖父(KAKEK)'],
  [/NENEK|祖母/i, '祖母(NENEK)'],
  [/AYAH|BAPAK|^父$/i, '父(AYAH)'],
  [/^IBU|MAMA|MOTHER|^母$/i, '母(IBU)'],
  [/ISTRI|^妻$/i, '妻(ISTRI)'],
  [/SUAMI|^夫$/i, '夫(SUAMI)'],
  [/DIRI\s*SENDIRI|SENDIRI|本人/i, '本人(DIRI SENDIRI)'],
  [/KAKAK.*PEREMPUAN|KAKAK.*WANITA/i, '姉(KAKAK PEREMPUAN)'],
  [/KAKAK/i, '兄（KAKAK LAKI-LAKI)'],
  [/ADIK.*PEREMPUAN|ADIK.*WANITA/i, '妹(ADIK PEREMPUAN)'],
  [/ADIK/i, '弟(ADIK LAKI-LAKI)'],
  [/ANAK|CHILD|^子$/i, '子供(ANAK)'],
];

/** 続柄 untuk satu baris; baris 34-39 memakai ejaan huruf kecil di template. */
function hubunganJipa(v: unknown, i: number): string {
  const t = s(v).toUpperCase().replace(/\s+/g, ' ').trim();
  if (!isGood(t)) return '';
  const label = HUBUNGAN.find(([re]) => re.test(t))?.[1] ?? '';
  if (i >= 1 && i <= 6) {
    if (label === '祖父(KAKEK)') return '祖父(kakek)';
    if (label === '祖母(NENEK)') return '祖母(nenek)';
  }
  return label;
}

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
  return negatif(v) ? 'しない(TIDAK)' : 'する(MEROKOK)';
}

function minumJp(v: unknown): string {
  return negatif(v) ? '飲まない(TIDAK MINUM)' : '飲む(MINUM)';
}

/** ある(ADA) / 無い(TIDAK) — dipakai 入れ墨 dan アレルギー. */
function adaJp(v: unknown): string {
  return negatif(v) ? '無い(TIDAK)' : 'ある(ADA)';
}

function butaWarnaJp(v: unknown): string {
  return negatif(v) ? '正常（NORMAL)' : bersih(v);
}

/** 同居 / 別居 / 独立. */
function tinggalJp(v: unknown): string {
  const t = s(v).toUpperCase();
  if (!isGood(t)) return '同居(t.l bersama)';
  if (t.includes('MANDIRI') || t.includes('INDEPENDEN')) return '独立(t.mandiri)';
  if (t.includes('TIDAK') || t.includes('BEDA') || t.includes('LUAR') || t.includes('PISAH')) return '別居(t pisah)';
  return '同居(t.l bersama)';
}

/* (tingkatSekolahJp/kouritsuSekolah sekarang di helpers_cv — satu sumber untuk semua renderer.) */

/**
 * Nilai sertifikat yang berarti "tidak ada" (`TIDAK`, `無`, `-`) JANGAN dicetak
 * sebagai keterangan lulus — kolom `ssw`/`jft` di database memang diisi `TIDAK`
 * untuk kandidat yang belum punya sertifikatnya.
 */
function sertifikatAda(v: unknown): string {
  return negatif(v) ? '' : bersih(v);
}

/**
 * 職業 keluarga — dropdown `K33:K40`, nilainya `日本語(indonesia)`.
 *
 * Keputusan pemilik 2026-11-16: kalau pekerjaannya ADA di daftar, tulis opsinya
 * dan biarkan sel di sebelahnya (`L`) kosong; kalau TIDAK ada, pilih
 * `その他(lain-lain)` dan tulis pekerjaan sebenarnya dalam bahasa Jepang di `L`.
 * `主婦` hanya sah di baris ke-2 (dropdown K34 memuatnya, K35:K40 tidak), jadi
 * pemetaannya bergantung indeks baris.
 */
function pekerjaanJp(v: unknown, i: number): { opsi: string; catatan: string } {
  const t = s(v).toUpperCase();
  if (!isGood(t)) return { opsi: '', catatan: '' };
  const lain = (ket: string) => ({ opsi: 'その他(lain-lain)', catatan: ket });
  if (/IBU RUMAH|RUMAH TANGGA|主婦/.test(t)) return i === 1 ? { opsi: '主婦', catatan: '' } : lain('主婦');
  if (/PETANI|TANI|農業/.test(t)) return { opsi: '農業(petani)', catatan: '' };
  if (/WIRASWASTA|USAHA|自営/.test(t)) return { opsi: '自営業(wirausaha)', catatan: '' };
  if (/KARYAWAN|PABRIK|MANUFAKTUR|BURUH/.test(t)) return { opsi: '製造業(manufaktur)', catatan: '' };
  if (/RESTORAN|KULINER|WARUNG/.test(t)) return { opsi: '飲食業(restoran dsb)', catatan: '' };
  if (/HOTEL|PENGINAPAN/.test(t)) return { opsi: '宿泊(perhotelan)', catatan: '' };
  if (/PELAJAR|MAHASISWA|SEKOLAH|学生/.test(t)) return lain('学生');
  const jp = jpTerm(bersih(v));
  return lain(sudahJp(jp) ? jp : '');
}

/** 業種 dropdown `L27:L30` — harus PERSIS salah satu nilai ini. */
const BIDANG_OPSI = [
  '自営業(wirausaha)',
  '飲食業(restoran dll)',
  '製造業(manufaktur)',
  '宿泊業(perhotelan)',
  '教師(guru dsb)',
  '農業(petani)',
  '販売業(jualan)',
  'アルバイト(paru waktu)',
  'その他',
];

const NAMA_JFT = '国際交流基金日本語基礎テスト';

/**
 * Satu baris `sertifikat_lain` → tanggal + nama + nilai.
 *
 * Bentuk yang ditulis CV AI: `NAMA — lulus YYYY-MM (nilai X)`. Baris yang tidak
 * cocok pola tetap dicetak (nama saja) — kehilangan satu sertifikat lebih buruk
 * daripada kehilangan tanggalnya.
 */
function uraiSertifikat(raw: string): { tanggal: string; nama: string; nilai: string } {
  const m = /^(.*?)\s*[—–-]\s*lulus\s+(\d{4})-(\d{1,2})(?:\s*\(nilai\s+([^)]+)\))?/i.exec(raw);
  if (!m) return { tanggal: '', nama: raw.trim(), nilai: '' };
  return {
    tanggal: `${m[2]}年${parseInt(m[3], 10)}月`,
    nama: m[1].trim(),
    nilai: (m[4] ?? '').trim(),
  };
}

/** `190/250` → `国際交流基金日本語基礎テスト 190点(250)` (pemilik 2026-11-16). */
function detailJft(jft: string, nilai: string): string {
  const raw = jft || nilai;
  const m = /(\d+)\s*[/／]\s*(\d+)/.exec(raw);
  if (m) return `${NAMA_JFT} ${m[1]}点(${m[2]})`;
  const n = /^(\d+)$/.exec(raw.trim());
  if (n) return `${NAMA_JFT} ${n[1]}点`;
  return `${NAMA_JFT} ${raw}`.trim();
}

/**
 * 資格試験 (baris 47-51) — tanggal dulu, lalu opsi dropdown, lalu penjelasan.
 *
 * Keputusan pemilik 2026-11-16: *"tulis tahun bulan mendapatkan sertifikatnya di
 * awal, terus dropdown pilihan jft ssw, sampingnya baru dijelaskan … kalau SSW
 * juga di tulis juga baris bawahnya, SIM juga"*. Urutannya karena itu:
 * JFT → SSW → SIM → sisanya, dan tanggal diambil dari baris `sertifikat_lain`
 * yang menyebut sertifikat itu (satu-satunya sumber tanggal yang ada).
 *
 * Baris `sertifikat_lain` yang sudah "dipakai" JFT/SSW/SIM TIDAK dicetak ulang
 * sebagai その他 — dulu sertifikat yang sama muncul dua kali di blok ini.
 */
function barisSertifikat(data: CandidateData): { tanggal: string; label: string; detail: string }[] {
  const sert = data.sertifikasi;
  const lines = sertifikatAda(sert.sertifikat_lain)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(uraiSertifikat);
  const ambil = (re: RegExp) => {
    const i = lines.findIndex((l) => re.test(l.nama));
    return i >= 0 ? lines.splice(i, 1)[0] : null;
  };

  const out: { tanggal: string; label: string; detail: string }[] = [];
  const jftLine = ambil(/JFT|日本語基礎|KSIC/i);
  const jft = sertifikatAda(sert.jft) || jftLine?.nilai || '';
  if (isGood(jft)) {
    const n = /N([1-5])/.exec(jft.toUpperCase())?.[1];
    out.push({
      tanggal: jftLine?.tanggal ?? '',
      label: n ? '日本語能力(JLPT)' : '日本語基礎力(JFT Basic)',
      /* JLPT: teks kolomnya sudah Jepang dan lengkap (`N3 合格`) — disalin
         apa adanya. JFT: disusun ulang jadi `… 190点(250)`. */
      detail: n ? jft : detailJft(jft, jftLine?.nilai ?? ''),
    });
  }
  const ssw = sertifikatAda(sert.ssw);
  if (isGood(ssw)) {
    const line = ambil(/SSW|特定技能/i);
    out.push({ tanggal: line?.tanggal ?? '', label: '特定技能(SSW)', detail: ssw });
  }
  const sim = sertifikatAda(data.identitas.sim);
  if (isGood(sim)) {
    const line = ambil(/SIM|運転免許/i);
    out.push({ tanggal: line?.tanggal ?? '', label: '自動車免許(SIM A)', detail: sim });
  }
  for (const l of lines) {
    out.push({
      tanggal: l.tanggal,
      label: 'その他(lain-lain)',
      detail: l.nilai ? `${l.nama} ${l.nilai}` : l.nama,
    });
  }
  return out.slice(0, CERT_ROWS);
}

/** Tanggal cetak untuk 日付 (`M58`) dan kotak tanda tangan (`L60`). */
export function tanggalCetak(kini: Date = new Date()): string {
  return `${kini.getFullYear()}年${kini.getMonth() + 1}月${kini.getDate()}日`;
}

export function buildValues(data: CandidateData): Record<string, string> {
  const id = data.identitas;
  const cells: Record<string, string> = {
    /* ── identitas ──────────────────────────────────────────────────────── */
    /* `id.id_kandidat` DULU ada di sini sebagai cadangan pertama, padahal
       `identitas` tidak pernah punya kunci itu: `normalizeMasterData` hanya
       menyalin field CV. Nilainya selalu `undefined`, jadi yang dipakai memang
       `raw.id_kandidat` — dan sekarang hanya itu yang tertulis. */
    H5: bersih((data.raw as Record<string, unknown>).id_kandidat),
    F7: bersih(id.nama_lengkap),
    F8: kanaJp(id.katakana),
    F9: bersih(id.panggilan_katakana) || bersih(id.panggilan),
    F11: tanggalJp(id.tgl_lahir),
    J11: angka(id.umur),
    /* 出身地 — bahasa Jepang (pemilik 2026-11-16). `tempat_lahir_jp` menang;
       kalau kosong, nama kotanya diterjemahkan lewat daftar `KOTA`/`PROVINSI`
       (`wilayahJp`) — PONOROGO → ポノロゴ. Nama yang tidak dikenal tetap
       dicetak huruf besar seperti dulu, bukan dikarang. */
    F13: (() => {
      const asal = wilayahJp(bersih(id.tempat_lahir_jp) || bersih(id.tempat_lahir));
      return sudahJp(asal) ? asal : asal.toUpperCase();
    })(),
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
    I16: negatif(data.medis.alergi)
      ? '無い(TIDAK)'
      : bersih(data.medis.alergi_jp) || bersih(data.medis.alergi),
    J16: minumJp(data.medis.alkohol),
    /* ── kontak ─────────────────────────────────────────────────────────── */
    E58: hpLokal(id.hp),
    // Kolom `email` sebagian baris menyimpan tautan `mailto:` apa adanya.
    E59: bersih(id.email).replace(/^mailto:/i, ''),
    E60: bersih(id.alamat),
    E61: bersih(id.ktp),
    /* 希望職種 (J5) — dulu kosong. `bidangssw` adalah sektor kerja yang memang
       dipilih kandidat; kalau kosong dipakai `bidang`. */
    J5: bersih(data.sertifikasi.bidang),
    /* ビザ種類 (E54) dan 在日期間 (E55) — kolom migrasi 022. */
    E54: bersih(id.visa_jepang),
    E55: durasiJp(data.wawancara.lama_di_jepang),
    /* ── 訪日経験 ───────────────────────────────────────────────────────── */
    B54: negatif(id.status_eks_jepang) ? '無し(TIDAK)' : 'あり(ADA)',
  };

  /* ── pendidikan: 5 baris (migrasi 028: daftar bisa 6 — `batasiRiwayatSekolah`
     membuang jenjang terendah, tidak pernah LPK) ───────────────────────────── */
  const eduRows = batasiRiwayatSekolah((data.pendidikan || []) as Record<string, unknown>[], EDU_ROWS);
  for (let i = 0; i < EDU_ROWS; i++) {
    const row = EDU_START + i;
    const p = eduRows[i] || {};
    const masuk = ym(p.masuk ?? p.tahun_masuk);
    const lulus = ym(p.lulus ?? p.tahun_lulus);
    const sekolah = bersih(p.sekolah ?? p.nama_sekolah ?? p.sekolah_id);
    cells[`B${row}`] = masuk.y ? `${masuk.y}年` : '';
    cells[`C${row}`] = masuk.m ? `${masuk.m.padStart(2, '0')}月` : '';
    cells[`D${row}`] = masuk.y || lulus.y ? '-' : '';
    cells[`E${row}`] = lulus.y ? `${lulus.y}年` : '';
    cells[`F${row}`] = lulus.m ? `${lulus.m.padStart(2, '0')}月` : '';
    cells[`G${row}`] = isGood(sekolah)
      ? [kouritsuSekolah(sekolah, p.status_sekolah), sekolah, tingkatSekolahJp(p.tingkat)].filter(Boolean).join(' ')
      : '';
    /* 専攻 — bahasa Jepang (pemilik 2026-11-16): TEKNIK PEMESINAN → 機械加工,
       BAHASA JEPANG → 日本語. Kolom `jurusan_jp` selalu menang. */
    cells[`K${row}`] = jpTerm(bersih(p.jurusan_jp) || bersih(p.jurusan ?? p.jurusan_id));
  }

  /* ── pekerjaan: 4 baris ─────────────────────────────────────────────────── */
  for (let i = 0; i < JOB_ROWS; i++) {
    const row = JOB_START + i;
    const p = (data.pekerjaan[i] || {}) as Record<string, unknown>;
    const masuk = ym(p.masuk ?? p.tahun_masuk);
    const keluarRaw = p.keluar ?? p.tahun_keluar;
    const keluar = ym(keluarRaw);
    /* 退職年月 untuk pekerjaan yang masih berjalan: `SEKARANG` bukan tanggal,
       jadi `ym()` mengembalikan kosong dan sel itu terbaca seperti data hilang.
       Formulir Jepang menulis 現在 di kolom tahun. */
    const masihKerja = isCurrent(String(keluarRaw ?? ''));
    /* 年月 memakai kanji `年`/`月` PERSIS seperti blok 学歴 (pemilik 2026-11-16:
       *"tgl bulan nya pake kanji sama kek riwayat sekolah"*). Dulu blok ini
       mencetak angka telanjang (`2024` / `08`) di sebelah blok yang menulis
       `2024年` / `08月`. */
    cells[`B${row}`] = masuk.y ? `${masuk.y}年` : '';
    cells[`C${row}`] = masuk.m ? `${masuk.m.padStart(2, '0')}月` : '';
    cells[`D${row}`] = masuk.y || keluar.y || masihKerja ? '-' : '';
    cells[`E${row}`] = masihKerja ? '現在' : keluar.y ? `${keluar.y}年` : '';
    cells[`F${row}`] = masihKerja || !keluar.m ? '' : `${keluar.m.padStart(2, '0')}月`;
    /* Nama perusahaan tetap ejaan Indonesia (pemilik: "nama perusahaan bhsa
       indo dah bener"), sedangkan 業種 dicetak Jepang dan — kalau ada — memakai
       string opsi dropdown yang persis. */
    cells[`G${row}`] = bersih(p.perusahaan ?? p.nama_perusahaan ?? p.perusahaan_id);
    const jabatanJp = jpTerm(bersih(p.jabatan_jp) || (p.jabatan ?? p.jabatan_id));
    cells[`L${row}`] = opsiJp(bidangJp(bersih(p.bidang ?? p.industri), jabatanJp), BIDANG_OPSI);
  }

  /* ── keluarga: 8 baris ──────────────────────────────────────────────────── */
  for (let i = 0; i < FAM_ROWS; i++) {
    const row = FAM_START + i;
    const p = (data.keluarga[i] || {}) as Record<string, unknown>;
    const hub = s(p.hubungan).toUpperCase();
    cells[`B${row}`] = hubunganJipa(p.hubungan, i);
    cells[`E${row}`] = isGood(hub) ? tinggalJp(p.tinggal ?? p.status_tinggal) : '';
    /* 氏名: nama INDONESIA (pemilik 2026-11-16) — dulu katakana didahulukan.
       Katakana hanya dipakai kalau nama Latinnya memang kosong. */
    cells[`G${row}`] = bersih(p.nama) || bersih(p.katakana);
    cells[`J${row}`] = angka(p.usia ?? p.umur) ? `${angka(p.usia ?? p.umur)}歳` : '';
    /* 職業: opsi dropdown di `K`; kalau pekerjaannya tidak ada di daftar,
       `その他(lain-lain)` + pekerjaan Jepangnya di sel sebelah (`L`). */
    const kerja = pekerjaanJp(p.pekerjaan, i);
    cells[`K${row}`] = kerja.opsi;
    cells[`L${row}`] = kerja.catatan;
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

  /* ── 資格試験: tanggal + opsi dropdown + penjelasan (lihat `barisSertifikat`) */
  const sertifikat = barisSertifikat(data);
  for (let i = 0; i < CERT_ROWS; i++) {
    const row = CERT_START + i;
    const c = sertifikat[i];
    cells[`B${row}`] = c?.tanggal ?? '';
    cells[`F${row}`] = c?.label ?? '';
    cells[`I${row}`] = c?.detail ?? '';
  }

  /* ── 日付 + kotak tanda tangan: tanggal cetak (pemilik 2026-11-16) ──────── */
  const cetak = tanggalCetak();
  cells.M58 = cetak;
  cells.L60 = cetak;

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
    photoRange: PHOTO_RANGE,
    photoInset: PHOTO_INSET,
    // Foto duduk 2 px dari sudut sel, sejajar dengan inset kanan/bawah.
    photoOffset: { colOff: PHOTO_INSET, rowOff: PHOTO_INSET },
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
