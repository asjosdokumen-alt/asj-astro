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
 */
import type { CvTemplate, CandidateData, RenderContext, RenderResult } from '../types';
import { RIREKISHO_DETAIL_BASE64 } from '../templates/rirekisho-detail.b64';
import { isGood, batasiRiwayatSekolah, isLpkTingkat, kanjiHubunganDari } from '../../helpers_cv';
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
 * sedangkan form ini menulis **高等学校** untuk SMK (`SMKN 2 JIWAN` di berkas
 * contoh). Memakai helper itu akan menghasilkan isi yang berbeda dari form
 * cetak, jadi pemetaannya ditulis di sini.
 */
function tingkatJp(v: unknown): string {
  const t = bersih(v).toUpperCase();
  if (!t) return '';
  /* Nilai yang SUDAH Jepang dikembalikan apa adanya dalam bentuk baku.
     Database sempat menyimpan `小学校`/`中学校`/`高校` (diperbaiki migrasi 044,
     tapi data lama bisa muncul lagi lewat impor), dan tanpa cabang ini `高校`
     tercetak `高校` sedangkan form memakai `高等学校`. */
  if (/小学校/.test(t)) return '小学校';
  if (/中学校/.test(t)) return '中学校';
  if (/高校|高等/.test(t)) return '高等学校';
  if (/大学/.test(t)) return '大学';
  if (/^SD|DASAR|^MI\b/.test(t)) return '小学校';
  if (/^SMP|PERTAMA|^MTS/.test(t)) return '中学校';
  if (/^SMA|^SMK|ATAS|^MA\b|ALIYAH|KEJURUAN/.test(t)) return '高等学校';
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
  cells.C8 = kapital(id.alamat);
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
  cells.C14 = kapital(wwn.kelebihan);
  cells.H14 = kapital(wwn.kekurangan);
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
     aslinya tidak punya tempat jawaban (`E17` sudah label berikutnya). */
  cells.D17 = kapital(wwn.penghasilan);
  cells.D16 = golDarah(id.golongan_darah);
  cells.F16 = kapital(wwn.motivasi_ke_jepang) || kapital(wwn.tujuan_ke_jepang);
  cells.F17 = kapital(wwn.tabungan);
  cells.F18 = kapital(wwn.rencana_pulang);
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
    // 学歴 memakai TAHUN saja (`2012`), bukan 年月 — lihat berkas contoh.
    cells[`A${row}`] = tahunSaja(p.masuk ?? p.tahun_masuk);
    cells[`B${row}`] = tahunSaja(p.lulus ?? p.tahun_lulus);
    cells[`C${row}`] = kapital(p.sekolah ?? p.nama_sekolah ?? p.sekolah_id);
    /* Kolom G berjudul 免許・資格, tapi di template contoh isinya TINGKAT
       sekolah (小学校 / 中学校 / 高等学校). Yang diikuti labelnya adalah
       isinya, jadi `tingkat` yang dipakai. */
    cells[`G${row}`] = tingkatJp(p.tingkat);
    /* 専門 kosong ditulis `-`, seperti berkas contoh (SD/SMP tidak punya
       jurusan). Sel kosong di tengah tabel terbaca seperti kolom yang lupa
       diisi, bukan seperti "tidak ada". */
    cells[`I${row}`] = kapital(p.jurusan ?? p.jurusan_id) || '-';
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
       Contoh: `Pemilahan dan penataan barang`, `PKL MEKANIK`. */
    cells[`G${row}`] = kapital(p.jabatan ?? p.jenis ?? p.jabatan_id);
  }

  /* ── keluarga (30-37): 5 baris ────────────────────────────────────────── */
  for (let i = 0; i < FAM_ROWS; i++) {
    const row = FAM_START + i;
    const p = (data.keluarga[i] || {}) as Record<string, unknown>;
    cells[`A${row}`] = kapital(p.nama);
    /* 続柄 ditulis KANJI (父/母/兄/…). Database menyimpannya dalam bahasa
       Indonesia (`AYAH`, `KAKAK LAKI-LAKI`), dan form cetak berbahasa Jepang. */
    cells[`D${row}`] = hubunganJp(p);
    cells[`E${row}`] = satuan(p.usia ?? p.umur, '歳');
    cells[`F${row}`] = kapital(p.pekerjaan);
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
