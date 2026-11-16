/**
 * rirekisho-detail.ts — form CV "Rirekisho Detail" sebagai .xlsx, diisi dari database.
 *
 * ASAL BERKAS
 * -----------
 * Pemilik mengirim dua CV terisi, 2026-11-04 (`F:/template/YON ARICKH
 * RAMADHANI_CV.xlsx` dan `F:/template/ALVIN RENO ADI KURNIAWAN_CV.xlsx`) dengan
 * catatan "template baru". Keduanya **layout yang sama** — 80 merge identik,
 * lebar kolom dan tinggi baris identik, semua label identik. Jadi ini SATU
 * template baru dengan dua contoh isian, bukan dua template.
 *
 * Berkas kedua dipakai sebagai sumber template karena dua alasan terukur:
 *   • berkas pertama membawa sel bergaya sampai kolom **AMI** dan baris 200
 *     (sisa format), sehingga `<dimension>`-nya A1:AMI40;
 *   • di berkas pertama banyak merge kehilangan BORDER KANAN (`A5`,`A6`,`A7`,
 *     `A8`,`A14`,`A16`,`A18`,`A19`,`A20`,`I11`,`I12`,`I13`,`I34`), jadi garis
 *     vertikalnya bolong saat dicetak. Berkas kedua utuh.
 * Yang dipakai hanya LAYOUT-nya; seluruh isi dikosongkan (lihat
 * `deliverables/kosongkan-template.mjs` dan `templates/rirekisho-detail.b64.ts`).
 *
 * TATA LETAK (jangan diubah tanpa menyesuaikan peta sel)
 *   1-9    identitas + pas foto (I2:J9)    21-25  pendidikan (3 baris)
 *   10-20  personalia                      26-29  pekerjaan (2 baris)
 *   30-37  keluarga (5 baris)              38-40  penilaian & catatan
 *
 * BEDA DENGAN FORM ASJ (`rirekisho-xlsx`)
 *   Form ASJ memakai pas foto di `A4:C14` dan kolom A-I; form ini pas fotonya di
 *   `I2:J9` dan memakai kolom A-J. Karena itu ia template tersendiri, bukan
 *   pengganti. Mesin XML-nya sama (`xlsx-form.ts`).
 *
 * SEL YANG SENGAJA DIBIARKAN KOSONG
 * ---------------------------------
 *   1. `A17` 個人収入 — template aslinya TIDAK punya sel jawaban: `D17` kosong
 *      tanpa merge, dan `E17` sudah label berikutnya. Ini cacat template sumber,
 *      bukan kelalaian renderer. Menambal dengan menggeser label akan mengubah
 *      tata letak yang dipakai percetakan.
 *   2. `F15` 料理 — tidak ada kolom database untuk "bisa memasak". Mengisinya
 *      dengan `有` berarti mengarang jawaban atas nama kandidat.
 *   3. `I32`–`I36` 在日親戚 — tidak ada kolomnya. `I33` justru berisi PERTANYAAN
 *      「日本へ行く事に家族は」 dengan jawaban di `I34`, jadi kolom itu dipakai
 *      bergantian untuk dua hal; renderer tidak menulisinya sama sekali supaya
 *      pertanyaannya tidak tertimpa.
 *
 * PERBANDINGAN DENGAN BERKAS ASLI (2026-11-04)
 * --------------------------------------------
 * Renderer ini diuji dengan cara yang diminta pemilik: render dari DATABASE
 * untuk kedua siswa pemilik berkas contoh, lalu bandingkan sel-per-sel dengan
 * berkas aslinya. Hasil: **32 sel berbeda untuk YON, 35 untuk ALVIN**, dan
 * setelah semua perbaikan format TIDAK ADA lagi sel yang berbeda karena
 * renderer. Rinciannya:
 *
 *   • 6 sel per siswa (A23:I25) — 学歴. Database punya EMPAT riwayat (SD, SMP,
 *     SMK, + LPK AMANAH SAKURA JAPAN) sedangkan form hanya 3 baris;
 *     `batasiRiwayatSekolah` menyisakan yang TERBARU, jadi SD tidak tampil.
 *     Berkas contoh dibuat sebelum baris LPK ada.
 *   • C14/H14/F16/F17/F18 — jawaban wawancara di database memang berbeda
 *     kalimatnya dari yang ditulis tangan di berkas contoh.
 *   • G28/G29/F32/F35/F36 — database lebih rinci (`SATPAM / SECURITY` vs
 *     `SATPAM`, `QC / QUALITY CONTROL` vs `Pemilahan dan penataan barang`).
 *   • G6 (ALVIN) — database bilang 未婚, berkas contoh 既婚. Dua sumber
 *     bertentangan; renderer memakai database.
 *   • Kosong karena tidak ada datanya: D15 (集団生活経験), F15 (料理),
 *     F33 (pekerjaan ibu), G29 (uraian pekerjaan ke-2), I34 (jawaban
 *     「日本へ行く事に家族は」 — tidak ada kolomnya; menulis `賛成` berarti
 *     mengarang persetujuan keluarga).
 *   • G7 (umur) SENGAJA berbeda: berkas contoh menulis `20 歳` untuk orang yang
 *     lahir 2005-10-28. Yang benar 21. Lihat catatan di bawah.
 *
 * NILAI YANG DITURUNKAN, BUKAN DISALIN
 * ------------------------------------
 * `G7` 年齢 dihitung dari `tgl_lahir`, tidak disalin dari template: di berkas
 * contoh nilainya `20 歳` untuk orang yang lahir 2005-10-28 — sudah basi saat
 * berkasnya dikirim. Umur yang tersimpan sebagai teks tidak pernah menua
 * sendiri, dan CV yang menyebut umur salah lebih buruk daripada CV tanpa umur.
 *
 * REVISI 2026-11-16 — GAYA TULIS DISAMAKAN DENGAN CV CONTOH PEMILIK
 * ----------------------------------------------------------------
 * Pemilik mengirim dua tangkapan layar CV yang sudah dirapikan tangan dan
 * meminta template ini mengikuti cara penulisannya:
 *
 *   • 現住所 RINGKAS: `BUNGKAL - PONOROGO - JAWA TIMUR` (kecamatan - kabupaten
 *     - provinsi), bukan alamat RT/RW lengkap. → `alamatRingkas()`
 *   • Semua kolom berbahasa Jepang: 職種 (`土木工事`), 職業 keluarga (`無職`,
 *     `主婦`), 専門 (`学生`), dan jenjang memakai `高校` (bukan 高等学校).
 *   • Kolom panjang ditulis PENDEK: 長所 `勤勉で頑張り屋`, 短所 `心配がち`,
 *     bukan paragraf. → `ringkas()`
 *   • 年齢 keluarga tanpa satuan (`71`, bukan `71 歳`); 氏名 keluarga nama
 *     Indonesia huruf besar, bukan katakana.
 *   • 個人収入 / 貯金額 ditulis dalam 円 / 万円. → `uangJp()`
 *
 * Yang TIDAK diubah: peta sel, geometri, dan aturan "jangan mengarang" — sel
 * yang tidak punya data tetap kosong.
 */
import type { CvTemplate, CandidateData, RenderContext, RenderResult } from '../types';
import { RIREKISHO_DETAIL_BASE64 } from '../templates/rirekisho-detail.b64';
import { isGood, batasiRiwayatSekolah, isLpkTingkat, kanjiHubunganDari } from '../../helpers_cv';
import { jpTerm } from '../../cv-jp-terms';
import { PROVINSI } from '../../opsi-form';
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
/**
 * Bingkai pas foto = merge `I2:J9`.
 *
 * Kotaknya DIHITUNG dari geometri sheet, bukan dari `<xdr:ext>` warisan: ext di
 * template ini 1203325 x 1953260 EMU (126 x 205 px) sedangkan bingkainya
 * 139 x 200 px — foto warisan itu 13 px lebih sempit dan 5 px lebih tinggi dari
 * kotaknya, jadi tepinya tidak sejajar garis sel.
 */
const PHOTO_RANGE = 'I2:J9';

/** Baris pertama tiap bagian, persis seperti form cetaknya. */
const EDU_START = 23;
const EDU_ROWS = 3;
const JOB_START = 28;
const JOB_ROWS = 2;
const FAM_START = 32;
const FAM_ROWS = 5;

const AGAMA_JP: Record<string, string> = {
  ISLAM: 'イスラム教',
  KRISTEN: 'キリスト教',
  PROTESTAN: 'キリスト教',
  KATOLIK: 'カトリック',
  HINDU: 'ヒンドゥー教',
  BUDHA: '仏教',
  BUDDHA: '仏教',
  KONGHUCU: '儒教',
};

/** Buang placeholder database (`-`, `—`, kosong) supaya tidak masuk ke sel. */
function bersih(v: unknown): string {
  const t = s(v).trim();
  return isGood(t) ? t : '';
}

/**
 * Huruf besar untuk teks Indonesia.
 *
 * Pemilik 2026-11-04: *"banyak cell yg pakai bahasa indonesia penggunaannya
 * juga pake huruf kapital"*. Berlaku untuk semua isian berbahasa Indonesia —
 * nama, alamat, sekolah, perusahaan, uraian pekerjaan, catatan. Huruf Jepang
 * tidak terpengaruh `toUpperCase()`, jadi aman dipakai tanpa memilah dulu.
 */
function kapital(v: unknown): string {
  return bersih(v).toUpperCase();
}

/* ── RINGKAS: gaya tulis template ini (pemilik, 2026-11-16) ─────────────────
 *
 * Pemilik mengirim CV contoh yang sudah dirapikan tangan dan meminta tiga hal:
 *
 *   1. 現住所 ditulis RINGKAS — kecamatan - kabupaten - provinsi
 *      (`BUNGKAL - PONOROGO - JAWA TIMUR`), bukan alamat lengkap ber-RT/RW.
 *   2. SEMUA kolom berbahasa Jepang: 続柄, 職業 keluarga, 職種, 長所/短所.
 *   3. Kolom panjang (長所・短所・志望動機・帰国後) ditulis PENDEK, bukan
 *      paragraf. Contoh pemilik: `勤勉で頑張り屋` / `心配がち`.
 *
 * Karena renderer tidak boleh memanggil penerjemah saat mencetak, aturannya:
 * kolom `*_jp` dari database SELALU menang, lalu teksnya DIPENDEKKAN. Kalau
 * terjemahannya belum ada, teks Indonesia dicetak huruf besar seperti sebelumnya
 * — memotong kalimat Indonesia di tengah kata lebih buruk daripada membiarkannya
 * utuh, jadi pemotongan hanya berlaku untuk teks Jepang.
 */

/** `BUNGKAL - PONOROGO - JAWA TIMUR` dari alamat lengkap. */
export function alamatRingkas(alamat: unknown): string {
  const asli = kapital(alamat).replace(/\s+/g, ' ').trim();
  if (!asli) return '';
  /* Kode pos dibuang lebih dulu: `PROV. JAWA TIMUR 63462` membuat regex
     provinsi menelan angka posnya. */
  const t = asli.replace(/\b\d{5}\b/g, ' ').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim();

  const segmen = (label: RegExp): string => {
    for (const s of t.split(',')) {
      const m = label.exec(s.trim());
      if (m?.[1]) return bersih(m[1]);
    }
    return '';
  };

  let prov = segmen(/^PROV(?:INSI)?\.?\s+(.+)$/);
  let kab = segmen(/^(?:KAB(?:UPATEN)?|KOTA)\.?\s+(.+)$/);
  let kec = segmen(/^KEC(?:AMATAN)?\.?\s+(.+)$/);
  const desa = segmen(/^(?:DESA|KEL(?:URAHAN)?)\.?\s+(.+)$/);

  /* Alamat tanpa koma: `… GANDUKEPUH SUKOREJO KAB PONOROGO JAWA TIMUR 63453`.
     Provinsi dicari dari daftar resmi (yang terpanjang menang, supaya
     `DKI JAKARTA` tidak kalah oleh `JAKARTA`). */
  if (!prov) {
    prov =
      PROVINSI.map(([v]) => String(v))
        .filter((v) => new RegExp(`\\b${v}\\b`).test(t))
        .sort((a, b) => b.length - a.length)[0] ?? '';
  }
  if (!kab) kab = /\bKAB(?:UPATEN)?\.?\s+([A-Z][A-Z']*)/.exec(t)?.[1] ?? '';
  if (!kec) kec = /\bKEC(?:AMATAN)?\.?\s+([A-Z][A-Z']*)/.exec(t)?.[1] ?? '';
  if (!kec && kab) {
    /* Tanpa label KEC: kecamatan adalah kata tepat sebelum `KAB`
       (`… GANDUKEPUH SUKOREJO KAB PONOROGO` → SUKOREJO). */
    kec = new RegExp(`([A-Z][A-Z']*)\\s+KAB(?:UPATEN)?\\.?\\s+${kab}`).exec(t)?.[1] ?? '';
  }

  const bagian = [kec || desa, kab, prov].filter(Boolean);
  return bagian.length ? bagian.join(' - ') : asli;
}

/** Teks Jepang? Huruf Latin tidak dipotong — lihat catatan di atas. */
function teksJp(v: string): boolean {
  return /[\u3040-\u30ff\u4e00-\u9fff]/.test(v);
}

/**
 * Pendekkan jawaban panjang jadi satu klausa.
 *
 * `potongKlausa` = true untuk 長所/短所 (satu sifat saja, seperti contoh
 * pemilik); false untuk 志望動機/帰国後, yang memang satu kalimat utuh dan
 * hanya perlu dibuang kalimat keduanya.
 */
export function ringkas(v: unknown, maks = 24, potongKlausa = true): string {
  let t = bersih(v).replace(/\s+/g, ' ');
  if (!t) return '';
  t = t.split(potongKlausa ? /[、。]|が、|けど、|ので、/ : /[。]/)[0].trim();
  /* `〜です` di ujung klausa dibuang supaya sel 長所/短所 berbentuk frasa
     (`物忘れが多い`), bukan kalimat sopan yang terpotong. `ます` TIDAK dibuang:
     menyisakan batang kata kerja (`〜あり`) lebih buruk daripada membiarkannya. */
  t = t.replace(/(です|でした)$/, '').replace(/[、,.\s]+$/, '');
  if (t.length > 0) {
    /* Teks Jepang dipotong di `maks` (tidak ada spasi untuk dipotong rapi);
       teks Latin hanya dipotong kalau benar-benar kepanjangan, dan selalu di
       batas kata — memotong "DISCIPLIN KERJA KE" di tengah kata lebih buruk
       daripada satu kalimat utuh. */
    const batas = teksJp(t) ? maks : Math.max(maks, 40);
    if (t.length > batas) {
      const sp = t.lastIndexOf(' ', batas);
      t = (sp >= 8 ? t.slice(0, sp) : t.slice(0, batas)).trim();
    }
  }
  return t;
}

/**
 * 個人収入 / 貯金額目標 dalam bentuk yang dibaca klien Jepang.
 *
 * `1jt` (= 1 juta rupiah) ≈ ¥10.000 ≈ 1万円, jadi angka "jt/juta" ditulis
 * `… 万円` — persis seperti CV contoh pemilik (`300jt` → `300 万円`). Angka
 * tanpa satuan dianggap sudah yen dan hanya diberi pemisah ribuan.
 */
export function uangJp(v: unknown, unit: '円' | '万円'): string {
  const asli = bersih(v);
  if (!asli) return '';
  const t = asli.toLowerCase().replace(/rp\.?/g, '').replace(/\s+/g, '');
  const m = /^(\d+(?:[.,]\d+)?)(jt|juta|million|万|万円)?/.exec(t);
  if (!m) return asli.toUpperCase();
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n)) return asli.toUpperCase();
  if (m[2]) return `${n} 万円`;
  return `${n.toLocaleString('id-ID')} ${unit}`;
}

/** Tahun saja (`2012-07` → `2012`). Kolom 開始年/終了年 di 学歴 hanya tahun. */
function tahunSaja(v: unknown): string {
  const t = bersih(v);
  if (!t) return '';
  const m = /^(\d{4})/.exec(t);
  if (m) return m[1];
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '' : String(d.getFullYear());
}

/** `2025-05` → `2025/05`. Kolom 職歴 memakai bentuk ini, bukan 年月. */
function tahunBulan(v: unknown): string {
  const t = bersih(v);
  if (!t) return '';
  const m = /^(\d{4})[-/](\d{1,2})/.exec(t);
  if (m) return `${m[1]}/${m[2].padStart(2, '0')}`;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Kolom 終了年 pada 職歴: `2025/11`, atau `現在に至る` bila masih bekerja.
 *
 * Tanpa cabang ini, pekerjaan yang belum berakhir menghasilkan sel KOSONG —
 * `new Date('SEKARANG')` adalah NaN, jadi `tahunBulan` mengembalikan string
 * kosong dan CV terlihat seperti orang yang berhenti kerja tanpa tanggal.
 * Form ASJ (`rirekisho-xlsx`) sudah menangani ini; template ini belum.
 */
function tahunBulanAkhir(v: unknown): string {
  const t = bersih(v);
  if (t && /SEKARANG|SEKARANG|NOW|IMA|SAAT INI|MASIH/i.test(t)) return '現在に至る';
  return tahunBulan(t);
}

/**
 * Jenjang sekolah dalam kosakata template ini.
 *
 * `tingkatSekolahJp` di helpers_cv memetakan SMK → 専門学校 dan SMA → 高校,
 * sedangkan form ini mencetak **高校** untuk SMK — lihat CV contoh yang dikirim
 * pemilik 2026-11-16 (`SMKN 1 SLAHUNG` → 高校). Versi sebelumnya menulis
 * 高等学校; pemilik menandai bentuk itu bukan gaya template ini, jadi seluruh
 * cabang di bawah bermuara ke 高校.
 */
function tingkatJp(v: unknown): string {
  const t = bersih(v).toUpperCase();
  if (!t) return '';
  /* Nilai yang SUDAH Jepang dikembalikan apa adanya dalam bentuk baku.
     Database sempat menyimpan `小学校`/`中学校`/`高校` (diperbaiki migrasi 044,
     tapi data lama bisa muncul lagi lewat impor). */
  if (/小学校/.test(t)) return '小学校';
  if (/中学校/.test(t)) return '中学校';
  if (/高校|高等/.test(t)) return '高校';
  if (/大学/.test(t)) return '大学';
  if (/^SD|DASAR|^MI\b/.test(t)) return '小学校';
  if (/^SMP|PERTAMA|^MTS/.test(t)) return '中学校';
  if (/^SMA|^SMK|ATAS|^MA\b|ALIYAH|KEJURUAN/.test(t)) return '高校';
  if (/UNIVERSITAS|SARJANA|DIPLOMA|^D[234]|^S[12]\b/.test(t)) return '大学';
  return t;
}

/**
 * 続柄 dalam kanji.
 *
 * `kanjiHubunganDari` menerjemahkan masukan BAHASA INDONESIA (`AYAH` → 父);
 * kalau datanya sudah kanji (`父`), ia mengembalikan string kosong — dan itu
 * membuat sel kosong untuk kandidat yang datanya rapi. Nilai yang sudah kanji
 * dipakai apa adanya.
 */
function hubunganJp(p: Record<string, unknown>): string {
  const kanji = /[\u4e00-\u9fff]/;
  const jp = bersih(p.hubungan_jp);
  if (jp && kanji.test(jp)) return jp;
  const id = bersih(p.hubungan);
  if (id && kanji.test(id)) return id;
  return kanjiHubunganDari(id, jp);
}

/**
 * 家族の賛否: `賛成` / `反対`.
 *
 * Bukan 有/無 — template menanyakan 「日本へ行く事に家族は」 dan berkas contoh
 * menjawab `賛成`. Jawaban `反対` adalah informasi yang justru penting bagi
 * pengajar, jadi ia harus tercetak, bukan disembunyikan sebagai `無`.
 */
function setujuJp(v: unknown): string {
  const t = bersih(v);
  if (!t) return '';
  if (/TIDAK|BELUM|MENOLAK|反対|NO\b/i.test(t)) return '反対';
  return '賛成';
}

/** Golongan darah: form menulis `B+型`, bukan `B+`. */
function golDarah(v: unknown): string {
  const t = bersih(v).toUpperCase().replace(/\s+/g, '');
  if (!t) return '';
  return t.includes('型') ? t : `${t}型`;
}

/** 有 / 無 dari nilai yang bisa berarti "tidak ada". Kosong tetap kosong. */
function adaTidak(v: unknown): string {
  const t = bersih(v);
  if (!t) return '';
  return negatif(t) ? '無' : '有';
}

function agamaJp(raw: unknown): string {
  const t = bersih(raw);
  if (!t) return '';
  return AGAMA_JP[t.toUpperCase()] ?? t;
}

function maritalJp(raw: unknown): string {
  const t = bersih(raw).toUpperCase();
  if (!t) return '';
  if (t.includes('BELUM') || t.includes('SINGLE') || t.includes('LAJANG')) return '未婚';
  if (t.includes('MENIKAH') || t.includes('KAWIN') || t.includes('MARRIED')) return '既婚';
  if (t.includes('CERAI') || t.includes('DIVORCE')) return '離婚';
  return bersih(raw);
}

function tanganJp(raw: unknown): string {
  const t = bersih(raw).toUpperCase();
  if (!t) return '';
  if (t.includes('KANAN') || t.includes('RIGHT')) return '右';
  if (t.includes('KIRI') || t.includes('LEFT')) return '左';
  return bersih(raw);
}

/** `65` / `65 kg` → `65 kg`; kosong tetap kosong. */
function satuan(v: unknown, unit: string): string {
  const angka = bersih(v).replace(/[^\d.]/g, '');
  return angka ? `${angka} ${unit}` : '';
}

/** Umur dari tanggal lahir. Bukan dari kolom `umur` — lihat komentar atas. */
function umurDari(tglLahir: unknown, umurTersimpan: unknown): string {
  const raw = s(tglLahir).trim();
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      const kini = new Date();
      let n = kini.getFullYear() - d.getFullYear();
      const belumUlangTahun =
        kini.getMonth() < d.getMonth() ||
        (kini.getMonth() === d.getMonth() && kini.getDate() < d.getDate());
      if (belumUlangTahun) n--;
      if (n >= 0 && n < 120) return `${n} 歳`;
    }
  }
  const tersimpan = bersih(umurTersimpan).replace(/[^\d]/g, '');
  return tersimpan ? `${tersimpan} 歳` : '';
}

/** Seluruh isi form, sebagai peta alamat → teks. Diekspor supaya bisa diuji. */
export function buildValues(data: CandidateData): Record<string, string> {
  const id = data.identitas;
  const fisik = data.fisik;
  const medis = data.medis;
  const wwn = data.wawancara;
  const cells: Record<string, string> = {};

  /* ── identitas (1-9) ──────────────────────────────────────────────────── */
  cells.C5 = kanaJp(id.katakana);
  cells.C6 = kapital(id.nama_lengkap);
  cells.C7 = birthDate(id.tgl_lahir);
  /* 現住所 — RINGKAS: kecamatan - kabupaten - provinsi. Pemilik 2026-11-16:
     *"alamat model desa-kota/kab - provinsi"*; CV contohnya menulis
     `BUNGKAL - PONOROGO - JAWA TIMUR`, bukan alamat RT/RW lengkap. */
  cells.C8 = alamatRingkas(id.alamat);
  cells.G5 = agamaJp(id.agama);
  cells.G6 = maritalJp(id.status_nikah);
  cells.G7 = umurDari(id.tgl_lahir, id.umur);

  /* ── personalia (10-20) ───────────────────────────────────────────────── */
  // 視力: dua angka kalau ada (mis. `1.0 / 1.0`). Template contoh menulis
  // 「正常な視力」 sebagai teks, tapi itu KLAIM tentang mata kandidat — hanya
  // boleh muncul kalau datanya memang ada.
  const kiri = bersih(medis.mata_kiri);
  const kanan = bersih(medis.mata_kanan);
  /* Form contoh menulis 「正常な視力」, bukan angka, ketika matanya normal.
     Dua-duanya >= 1.0 dianggap normal; selain itu angkanya ditulis apa adanya
     supaya mata minus tidak hilang di balik kata "normal". */
  const angka = (t: string) => Number(String(t).replace(',', '.'));
  cells.B11 = !kiri && !kanan
    ? ''
    : angka(kiri) >= 1 && angka(kanan) >= 1
      ? '正常な視力'
      : `${kiri || '—'} / ${kanan || '—'}`;
  cells.E11 = adaTidak(medis.buta_warna);
  cells.I11 = tanganJp(fisik.tangan_dominan);
  cells.B12 = satuan(fisik.bb, 'kg');
  cells.E12 = satuan(fisik.tb, 'cm');
  cells.I12 = adaTidak(medis.tato);
  cells.E13 = adaTidak(medis.rokok);
  cells.I13 = adaTidak(medis.alkohol);
  /* 長所 / 短所 — PENDEK, satu sifat. CV contoh pemilik: `勤勉で頑張り屋` dan
     `心配がち`, bukan paragraf. Kolom `*_jp` menang; teks Indonesia hanya
     dipotong kalau sudah Jepang (lihat `ringkas`). */
  cells.C14 = kapital(ringkas(wwn.kelebihan_jp || wwn.kelebihan, 20));
  cells.H14 = kapital(ringkas(wwn.kekurangan_jp || wwn.kekurangan, 20));
  /* 集団生活経験 = pernah tinggal bersama di asrama/kursus. Diturunkan dari
     `tinggal_kursus_tahun` (angka tahun), bukan dari kolom 有/無 yang tidak ada.
     Kosong kalau kolomnya kosong — bukan ditebak. */
  /* 集団生活経験: kolom khusus (migrasi 044) lebih dulu; kalau kosong, turun ke
     `tinggal_kursus_tahun` yang sudah dipakai sebelum kolomnya ada. */
  {
    const eksplisit = adaTidak(wwn.kelompok_tinggal);
    const th = bersih(fisik.tinggal_kursus_tahun).replace(/[^\d]/g, '');
    cells.D15 = eksplisit || (th === '' ? '' : Number(th) > 0 ? '有' : '無');
  }
  cells.J15 = adaTidak(medis.riwayat_medis);
  /* 料理 — kolom `bisa_memasak` (migrasi 044). Sebelum kolom itu ada, sel ini
     sengaja dibiarkan kosong. */
  cells.F15 = adaTidak(wwn.bisa_memasak);
  /* 個人収入 — `D17` adalah satu-satunya sel bebas di baris itu; template
     aslinya tidak punya tempat jawaban (`E17` sudah label berikutnya).
     Angka rupiah yang ditulis "jt/juta" diterjemahkan ke 万円 (`uangJp`). */
  cells.D17 = uangJp(wwn.penghasilan, '円');
  cells.D16 = golDarah(id.golongan_darah);
  /* 志望動機 / 帰国後の仕事 — kolom Jepang menang, lalu dipendekkan jadi SATU
     kalimat (CV contoh: `日本の技術と日本人の働き方を学びたくて、お金を貯めたい`). */
  cells.F16 = kapital(
    ringkas(
      wwn.motivasi_ke_jepang_jp || wwn.motivasi_ke_jepang || wwn.tujuan_ke_jepang_jp || wwn.tujuan_ke_jepang,
      40,
      false,
    ),
  );
  cells.F17 = uangJp(wwn.tabungan, '万円');
  cells.F18 = kapital(
    ringkas(wwn.rencana_pulang_jp || wwn.rencana_pulang, 40, false),
  );
  {
    const visa = bersih(id.visa_jepang);
    /* Kosong → `無`, bukan kosong. Kolom ini bertanya "pernah mengajukan izin
       tinggal?", dan berkas contoh menjawab `無` ketika tidak ada. Membiarkannya
       kosong membuat pertanyaannya tampak belum dijawab. */
    cells.F19 = visa && !negatif(visa) ? '有' : '無';
    cells.F20 = visa && !negatif(visa) ? kapital(visa) : '';
  }

  /* ── pendidikan (21-25): 3 baris ──────────────────────────────────────── */
  /* LPK TIDAK masuk 学歴 di form ini.
     Pemilik 2026-11-04: *"cukup sd smp smk … lpk gak perlu di masukkan"*.
     Dua berkas contohnya memang hanya memuat SD/SMP/SMK. `batasiRiwayatSekolah`
     justru MELINDUNGI entri LPK (dipakai form lain), jadi penyaringannya
     dilakukan SEBELUM fungsi itu — kalau sesudah, LPK tetap ikut dan mendorong
     SD keluar dari 3 baris yang tersedia. */
  const semuaEdu = (data.pendidikan || []) as Record<string, unknown>[];
  const edu = batasiRiwayatSekolah(
    semuaEdu.filter((p) => !isLpkTingkat(p.tingkat)),
    EDU_ROWS,
  );
  for (let i = 0; i < EDU_ROWS; i++) {
    const row = EDU_START + i;
    const p = edu[i] || {};
    const sekolah = kapital(p.sekolah ?? p.nama_sekolah ?? p.sekolah_id);
    // 学歴 memakai TAHUN saja (`2012`), bukan 年月 — lihat berkas contoh.
    cells[`A${row}`] = tahunSaja(p.masuk ?? p.tahun_masuk);
    cells[`B${row}`] = tahunSaja(p.lulus ?? p.tahun_lulus);
    cells[`C${row}`] = sekolah;
    /* Kolom G berjudul 免許・資格, tapi di template contoh isinya TINGKAT
       sekolah (小学校 / 中学校 / 高校). Yang diikuti labelnya adalah isinya,
       jadi `tingkat` yang dipakai. */
    cells[`G${row}`] = tingkatJp(p.tingkat);
    /* 専門 — CV contoh pemilik 2026-11-16 menulis `学生` di KETIGA baris
       sekolah (SD, SMP, SMK), termasuk SMK yang jelas punya jurusan. Artinya
       kolom ini dibaca sebagai status saat menempuh, bukan nama jurusan;
       menaruh `自動車整備` di sini akan berbeda dari form yang dipakai
       percetakan. Baris tanpa sekolah tetap kosong — bukan `学生` karangan. */
    cells[`I${row}`] = sekolah ? '学生' : '';
  }

  /* ── pekerjaan (26-29): 2 baris ───────────────────────────────────────── */
  for (let i = 0; i < JOB_ROWS; i++) {
    const row = JOB_START + i;
    const p = (data.pekerjaan[i] || {}) as Record<string, unknown>;
    // 職歴 memakai `2025/05`, bukan 年月.
    cells[`A${row}`] = tahunBulan(p.masuk ?? p.tahun_masuk);
    cells[`B${row}`] = tahunBulanAkhir(p.keluar ?? p.tahun_keluar);
    cells[`C${row}`] = kapital(p.perusahaan ?? p.nama_perusahaan ?? p.perusahaan_id);
    /* G27:J27 satu kolom lebar berjudul 職歴 (isi pekerjaannya), bukan jabatan.
       Contoh: `Pemilikan dan penataan barang`. CV contoh pemilik 2026-11-16
       menulisnya dalam bahasa Jepang (`土木工事`, `販売(料理)`), jadi kolom
       `*_jp` diutamakan lalu kamus `jpTerm` dipakai sebagai jaring. */
    const posisi = jpTerm(p.jabatan_jp || p.jabatan || p.jenis_jp || p.jenis || p.jabatan_id);
    cells[`G${row}`] = posisi ? (teksJp(posisi) ? posisi : kapital(posisi)) : '';
  }

  /* ── keluarga (30-37): 5 baris ────────────────────────────────────────── */
  for (let i = 0; i < FAM_ROWS; i++) {
    const row = FAM_START + i;
    const p = (data.keluarga[i] || {}) as Record<string, unknown>;
    /* 氏名: nama Indonesia HURUF BESAR — CV contoh pemilik 2026-11-16 menulis
       `SOINEM` / `SUGENG PURWANTO` / `MISNAYANTI`, bukan katakana. Katakana
       hanya dipakai kalau kolom nama Latinnya kosong, supaya baris yang hanya
       punya terjemahan tidak hilang. */
    const kt = bersih(p.katakana);
    cells[`A${row}`] = kapital(p.nama) || (/[ぁ-ヿ一-龯]/.test(kt) ? kt : '');
    /* 続柄 ditulis KANJI (父/母/兄/…). Database menyimpannya dalam bahasa
       Indonesia (`AYAH`, `KAKAK LAKI-LAKI`), dan form cetak berbahasa Jepang. */
    cells[`D${row}`] = hubunganJp(p);
    /* 年齢 tanpa satuan: CV contoh menulis `71`, bukan `71 歳`. */
    cells[`E${row}`] = bersih(p.usia ?? p.umur).replace(/[^\d]/g, '');
    /* 職業 dalam bahasa Jepang (`無職`, `主婦`, `販売(料理)`), bukan huruf besar
       Indonesia. `pekerjaan_jp` menang; kamus hanya jaring. */
    const kerja = jpTerm(p.pekerjaan_jp || p.pekerjaan);
    cells[`F${row}`] = kerja ? (teksJp(kerja) ? kerja : kapital(kerja)) : '';
    // Kolom I tidak ditulis per baris — lihat `I32` di bawah.
  }

  /* ── 在日親戚 (I32) ───────────────────────────────────────────────────────
     Kolom ini hanya diisi di baris PERTAMA keluarga, persis seperti berkas
     contoh (`I32` = 無, sisanya kosong; `I33` berisi pertanyaan dan `I34`
     jawabannya). Isinya dari kenalan di Jepang kalau ada — kalau tidak, `無`. */
  {
    const ken = data.kenalan_jepang;
    const nama = bersih(ken.nama_jp) || bersih(ken.nama_id);
    cells.I32 = nama ? kapital(nama) : '無';
  }
  /* 家族の賛否 — jawaban pertanyaan di `I33`. Kolom `restu_keluarga`
     (migrasi 044). Sebelum kolom itu ada, sel ini dibiarkan kosong karena
     menulis `賛成` berarti mengarang persetujuan keluarga. */
  cells.I34 = setujuJp(wwn.restu_keluarga);

  /* ── catatan (38-40) ──────────────────────────────────────────────────── */
  cells.A40 = kapital(data.sertifikasi.catatan_cv);

  return cells;
}

/** Bangun workbook. Diekspor supaya geometrinya bisa diuji. */
export async function buildDetailWorkbook(data: CandidateData): Promise<Blob> {
  return buildXlsxForm({
    base64: RIREKISHO_DETAIL_BASE64,
    sheetPath: SHEET_PATH,
    drawingPath: DRAWING_PATH,
    photoPart: PHOTO_PART,
    photoRange: PHOTO_RANGE,
    values: buildValues(data),
    photoUrl: s(data.uploads.photo),
    // Tab Excel memakai nama kandidat. Template kosongnya sudah bernama `履歴書`;
    // ini menggantinya per kandidat supaya semua CV tidak bertab sama.
    sheetName: safeSheetName(s(data.identitas.nama_lengkap)),
  });
}

const template: CvTemplate = {
  id: 'rirekisho-detail',
  name: 'Rirekisho Detail (基本情報 + 個人情報)',
  type: 'xlsx',
  description:
    'Form 履歴書 dengan blok personalia lengkap (視力, 長所/短所, 志望動機, 貯金額目標, 帰国後の仕事) sebagai Excel — layout, merge, dan pas foto persis berkas pemilik; isinya dari database.',
  category: 'form',
  icon: 'file-excel',
  async render(data: CandidateData, _context: RenderContext): Promise<RenderResult> {
    try {
      const blob = await buildDetailWorkbook(data);
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
