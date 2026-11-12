/**
 * tEMPLATE-loader.ts — baca/tulis template CV (.xlsx) untuk fitur "Template CV".
 *
 * KENAPA exceljs, BUKAN `xlsx` (SheetJS) — keputusan pemilik 2026-10-10
 * ---------------------------------------------------------------------
 * Build KOMUNITAS SheetJS tidak bisa MENULIS gaya: `XLSX.write` tidak pernah
 * mengeluarkan atribut `s`, dan ia juga tidak meng-*baca* data validation sama
 * sekali. Diukur pada template rirekisho nyata:
 *
 *   | | SheetJS (read+write) | exceljs (read+write) |
 *   |---|---|---|
 *   | sel bergaya (font/warna/border/perataan) | 62 -> 0        | 154 -> 154 |
 *   | dropdown (`dataValidation`)               |  8 -> 0        | 17 -> 17   |
 *   | gambar tertanam                           | ada -> hilang  | 1 -> 1     |
 *   | pengaturan cetak (`pageSetup`)            | ada -> hilang  | ada -> ada |
 *   | sel gabungan                              | 83 -> 83       | 83 -> 83   |
 *
 * Konsekuensi desainnya penting: **gaya tidak perlu "disalin"** — selama kita
 * hanya mengubah `cell.value`, exceljs mempertahankan `cell.style` yang sudah
 * ada. Jadi mengisi CV tidak lagi menghapus tampilan template.
 *
 * Yang BENAR-BENAR harus dikerjakan manual cuma saat MENAMBAH BARIS (riwayat
 * lebih panjang daripada contoh): `spliceRows` tidak mewarisi gaya, tidak
 * menggeser sel gabungan, dan tidak menggeser alamat dropdown. Ketiganya
 * ditangani di `insertRowsWithStyle()`.
 */
import type { Cell, Workbook, Worksheet } from 'exceljs';
import type { CandidateData } from '../types';
import { fmtGajiYen, fmtMonthYearJp, getPath, isGood } from '../../helpers_cv';

export type ExcelTemplateOptions = {
  sheetName?: string;
  arrayFields?: string[];
};

const PLACEHOLDER_RE = /\{\{([^}]+)\}\}/g;

export interface TemplateFieldMap {
  [cellAddress: string]: string;
}

interface FieldLabel {
  pattern: RegExp;
  path: string;
}

function rx(pattern: string): RegExp {
  return new RegExp(`^(${pattern})$`, 'i');
}

/**
 * Cocok kalau teks sel MEMUAT salah satu kata kunci.
 *
 * Label template nyata sering menggabungkan Jepang + Indonesia dalam SATU sel
 * dengan baris baru, mis. `帰国後の目標　\nSETELAH PULANG DARI JEPANG`. Pola
 * `^(...)$` biasa tidak bisa mencocokkannya — `.` tidak melintasi baris, jadi
 * `^.*SETELAH PULANG.*$` gagal di sel itu. Di sini `[\s\S]` dipakai di kedua
 * sisi kata kunci supaya baris baru ikut terjangkau.
 */
function rxAny(...keys: string[]): RegExp {
  return new RegExp(`^[\\s\\S]*(?:${keys.join('|')})[\\s\\S]*$`, 'i');
}

export const FIELD_LABELS: FieldLabel[] = [
  { pattern: rx('nama\\s*lengkap|nama|name'), path: 'identitas.nama_lengkap' },
  { pattern: rx('furigana|katakana|nama_katakana'), path: 'identitas.katakana' },
  { pattern: rx('tempat\\s*lahir|TEMPATLAHIR'), path: 'identitas.tempat_lahir' },
  { pattern: rx('tanggal\\s*lahir|tgl\\s*lahir|TGLLAHIR'), path: 'identitas.tgl_lahir' },
  { pattern: rx('usia|umur|USIA'), path: 'identitas.umur' },
  { pattern: rx('jenis\\s*kelamin|gender|JENISKELAMIN'), path: 'identitas.gender' },
  { pattern: rx('agama|AGAMA'), path: 'identitas.agama' },
  { pattern: rx('golongan?\\s*darah|blood\\s*type|GOLDAR'), path: 'identitas.golongan_darah' },
  { pattern: rx('status\\s*nikah|marital|STATUSNIKAH'), path: 'identitas.status_nikah' },
  { pattern: rx('anak|children|JUMLAHANAK'), path: 'identitas.anak' },
  { pattern: rx('alamat|address|ALAMAT'), path: 'identitas.alamat' },
  { pattern: rx('no\\.?\\s*hp|hp|no\\s*wa|phone|mobile|NOHP'), path: 'identitas.hp' },
  { pattern: rx('email|e-mail|EMAIL'), path: 'identitas.email' },
  { pattern: rx('ktp|nik|NIK'), path: 'identitas.ktp' },
  { pattern: rx('paspor|passport|PASPOR'), path: 'identitas.paspor' },
  { pattern: rx('sim|driver\\s*license'), path: 'identitas.sim' },
  { pattern: rx('kewarganegaraan|nationality'), path: 'identitas.raw.kewarganegaraan' },
  { pattern: rx('kontak\\s*darurat'), path: 'identitas.kontak_darurat_nama' },
  { pattern: rx('tinggi\\s*badan|tb|TINGGI'), path: 'fisik.tb' },
  { pattern: rx('berat\\s*badan|bb|BERAT'), path: 'fisik.bb' },
  { pattern: rx('ukuran\\s*topi|topi|UKURANTOPI'), path: 'fisik.topi' },
  { pattern: rx('ukuran\\s*baju|baju|UKURANBAJU'), path: 'fisik.baju' },
  { pattern: rx('ukuran\\s*sepatu|sepatu|UKURANSEPATU'), path: 'fisik.sepatu' },
  { pattern: rx('tangan\\s*dominan|TANGANDOMINAN'), path: 'fisik.tangan_dominan' },
  // 2026-10-12: pertanyaannya berubah dari "Tahan AC" ke "Bekerja di Cuaca
  // Dingin" (pemilik: "jepang beda cuaca dengan indo ada musim panas ada musim
  // dinginnya"). Kedua ejaan harus tetap terbaca: template yang SUDAH diunggah
  // memakai label lama, dan template yang ditulis ulang memakai label baru.
  // `rxAny` (bukan `rx`) karena sel label nyata menggabungkan Jepang +
  // Indonesia dalam satu sel, jadi teks sel harus diuji "memuat", bukan "sama
  // persis". Kata kuncinya tetap frasa utuh supaya baris lain tidak tertangkap
  // — `Kacamata` memuat "ac" tapi bukan salah satu frasa ini.
  { pattern: rxAny('tahan\\s*ac|TAHANAC|cuaca\\s*dingin'), path: 'fisik.tahan_ac' },
  { pattern: rx('mata\\s*kiri|MATAKIRI'), path: 'medis.mata_kiri' },
  { pattern: rx('mata\\s*kanan|MATAKANAN'), path: 'medis.mata_kanan' },
  { pattern: rx('kacamata|KACAMATA'), path: 'medis.kacamata' },
  { pattern: rx('buta\\s*warna|BUTAWARNA'), path: 'medis.buta_warna' },
  { pattern: rx('tato|tattoo|TATO'), path: 'medis.tato' },
  { pattern: rx('tindik|piercing|TINDIK'), path: 'medis.tindik' },
  { pattern: rx('merokok|rokok|MEROKOK'), path: 'medis.rokok' },
  { pattern: rx('alkohol|MINUMALKOHOL'), path: 'medis.alkohol' },
  { pattern: rx('alergi|ALERGI'), path: 'medis.alergi' },
  { pattern: rx('riwayat\\s*medis|RIWAYATPENYAKIT'), path: 'medis.riwayat_medis' },
  { pattern: rx('bahasa\\s*jepang|jft|JFT'), path: 'sertifikasi.jft' },
  { pattern: rx('nilai\\s*jft|NILAIJFT'), path: 'sertifikasi.nilai' },
  { pattern: rx('ssw|SSW'), path: 'sertifikasi.ssw' },
  { pattern: rx('lisensi|license|LISENSI'), path: 'sertifikasi.lisensi' },
  { pattern: rx('bidang|BIDANG'), path: 'sertifikasi.bidang' },
  { pattern: rx('pendidikan|education'), path: 'pendidikan' },
  { pattern: rx('sekolah|school'), path: 'pendidikan' },
  { pattern: rx('tingkat|level'), path: 'pendidikan.tingkat' },
  { pattern: rx('pekerjaan|work\\s*experience'), path: 'pekerjaan' },
  { pattern: rx('perusahaan|company'), path: 'pekerjaan' },
  { pattern: rx('jabatan|position'), path: 'pekerjaan.jabatan' },
  { pattern: rx('keluarga|family'), path: 'keluarga' },
  { pattern: rx('hubungan|relationship'), path: 'keluarga.hubungan' },
  // Wawancara — DITAMBAH 2026-10-10. Tanpa ini, baris `帰国後の目標 /
  // SETELAH PULANG`, `長所 / KELEBIHAN`, `短所 / KEKURANGAN`, `趣味 / HOBI`,
  // dan `日本へ行く目的 / TUJUAN KE JEPANG` TIDAK PERNAH terisi: tidak ada pola
  // labelnya, dan sel nilainya kosong di template sehingga tidak bisa dipelajari
  // lewat pencocokan nilai. Ditemukan dari template rirekisho nyata.
  { pattern: rxAny('TUJUAN\\s*KE\\s*JEPANG', '日本へ行く目的'), path: 'wawancara.tujuan_ke_jepang' },
  { pattern: rxAny('SETELAH\\s*PULANG', '帰国後の目標'), path: 'wawancara.rencana_pulang' },
  { pattern: rxAny('KELEBIHAN', '長所'), path: 'wawancara.kelebihan' },
  { pattern: rxAny('KEKURANGAN', '短所'), path: 'wawancara.kekurangan' },
  { pattern: rxAny('HOBI', '趣味'), path: 'wawancara.hobi' },
  // Baris `日本語能力試験 / JLPT / SETARA`. Target `sertifikasi.jft` — field yang
  // sama dengan pola `jft|bahasa jepang` di atas (data.ts menaruh JFT, JFTTEXT,
  // dan `bahasa_jepang` di satu field).
  { pattern: rxAny('JLPT', '日本語能力試験'), path: 'sertifikasi.jft' },

  /* ── Label JEPANG (ditambahkan 2026-11-12) ────────────────────────────────
     Template yang dipakai sehari-hari adalah form Jepang: labelnya 氏名, 現住所,
     血液型 — bukan NAMA, ALAMAT, GOLONGAN DARAH. Tanpa pola di bawah, seluruh
     baris identitas tidak punya label yang dikenali, sehingga peta sel hanya
     bisa datang dari tebakan NILAI. Tebakan itu yang salah pada `tpl-tg708`:
     `現住所` (alamat) dipetakan ke `identitas.tempat_lahir` karena contohnya
     mengisi tempat lahir dan alamat dengan teks yang sama.

     Hanya field SKALAR yang didaftarkan di sini. Label bagian (学歴, 職歴,
     家族構成) sengaja TIDAK didaftarkan: nilai di kanannya adalah tabel
     multi-baris, dan memetakannya ke satu sel akan menimpa judul tabel. */
  { pattern: rxAny('現住所', '住所'), path: 'identitas.alamat' },
  { pattern: rxAny('出身地', '出身'), path: 'identitas.tempat_lahir' },
  { pattern: rxAny('氏名', '名前'), path: 'identitas.nama_lengkap' },
  { pattern: rxAny('フリガナ', 'カタカナ', 'ふりがな'), path: 'identitas.katakana' },
  { pattern: rxAny('生年月日'), path: 'identitas.tgl_lahir' },
  { pattern: rxAny('年齢'), path: 'identitas.umur' },
  { pattern: rxAny('性別'), path: 'identitas.gender' },
  { pattern: rxAny('血液型'), path: 'identitas.golongan_darah' },
  { pattern: rxAny('配偶者', '婚姻'), path: 'identitas.status_nikah' },
  { pattern: rxAny('扶養家族', '子女'), path: 'identitas.anak' },
  { pattern: rxAny('電話番号', '携帯番号', '連絡先'), path: 'identitas.hp' },
  { pattern: rxAny('メールアドレス', 'メール'), path: 'identitas.email' },
  { pattern: rxAny('身長'), path: 'fisik.tb' },
  { pattern: rxAny('体重'), path: 'fisik.bb' },
];

// ---------------------------------------------------------------------------
// Muat exceljs
// ---------------------------------------------------------------------------
// `exceljs` punya main CJS (`excel.js`) DAN browser field (`dist/exceljs.min.js`).
// Interop-nya berbeda antara Node dan bundler, jadi konstruktornya diambil dari
// dua tempat. Satu tempat untuk aturan ini lebih baik daripada di tiap pemanggil.
type WorkbookCtor = new () => Workbook;

async function workbookCtor(): Promise<WorkbookCtor> {
  const mod = (await import('exceljs')) as unknown as {
    Workbook?: unknown;
    default?: { Workbook?: unknown };
  };
  const ctor = mod.Workbook ?? mod.default?.Workbook;
  if (typeof ctor !== 'function') {
    throw new Error('exceljs tidak bisa dimuat (Workbook tidak ditemukan).');
  }
  return ctor as WorkbookCtor;
}

/** Baca workbook dari buffer. */
export async function readWorkbook(buffer: ArrayBuffer | Uint8Array): Promise<Workbook> {
  const Ctor = await workbookCtor();
  const wb = new Ctor();
  await wb.xlsx.load(buffer as never);
  return wb;
}

/** Ambil sheet pertama (atau yang namanya disebut). */
function pickSheet(wb: Workbook, name?: string): Worksheet {
  const ws = name ? wb.getWorksheet(name) : wb.worksheets[0];
  if (!ws) throw new Error(`Sheet "${name || '(pertama)'}" tidak ada di template.`);
  return ws;
}

/** `applyFieldMap` dan `applyRiwayatBlock` menulis satu nilai per sel. */
export async function openWorkbookFromUrl(url: string): Promise<Workbook> {
  // Batas waktunya SENDIRI, karena `apiClient` tidak dipakai di sini: URL-nya
  // objek Cloudinary absolut (`rec.fileUrl`, hasil uploadBerkasToStorage), bukan
  // endpoint fungsi — jadi timeout 20 s milik apiClient juga tidak ikut. Tanpa
  // baris ini satu CDN yang menggantung menahan modal "menyiapkan…" selamanya.
  // Angkanya disamakan dengan timeout apiClient supaya kebijakannya satu.
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Berkas template tidak bisa diambil (${res.status}).`);
  return readWorkbook(new Uint8Array(await res.arrayBuffer()));
}

/**
 * Serialisasi workbook yang sudah diisi jadi berkas .xlsx.
 *
 * Helper ini ada supaya KOMPONEN tidak memanggil `fetch` mentah dan tidak
 * meng-import exceljs sendiri: `CandidateProfileModal` punya tes yang menegakkan
 * "tidak ada fetch mentah di sumbernya", dan satu tempat untuk aturan jaringan
 * lebih baik daripada tersebar di tiap pemanggil.
 */
export async function workbookToXlsxBlob(workbook: Workbook): Promise<Blob> {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ---------------------------------------------------------------------------
// Nilai sel: baca & tulis
// ---------------------------------------------------------------------------
/**
 * Teks sebuah sel untuk pencocokan & pembacaan.
 *
 * exceljs menyimpan nilai kaya sebagai objek (`richText`, `{formula, result}`,
 * `{text, hyperlink}`) dan tanggal sebagai `Date`. `String(value)` mentah akan
 * menghasilkan `[object Object]` — itu akan membuat pencocokan nilai di
 * `analyzeFromExample` diam-diam gagal, jadi tiap bentuk ditangani eksplisit.
 */
function cellText(cell: Cell | undefined): string {
  if (!cell) return '';
  const v: unknown = cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: unknown }>).map((t) => String(t.text ?? '')).join('');
    }
    if ('result' in o) return o.result === null || o.result === undefined ? '' : String(o.result);
    if ('text' in o) return String(o.text ?? '');
    return '';
  }
  return String(v);
}

/** Nilai entri riwayat -> string. */
function toStr(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

/**
 * Tulis nilai ke sel TANPA menyentuh gayanya.
 *
 * `cell.value = x` mempertahankan `cell.style` — itulah sebabnya mengisi CV
 * tidak lagi menghapus tampilan template. Tipe nilainya dijaga: kalau sel itu
 * sebelumnya berisi ANGKA dan nilai barunya numerik, tulis sebagai angka lagi
 * (kalau ditulis sebagai teks, format angka & perataannya berubah).
 */
function writeCellValue(cell: Cell, value: string): void {
  if (value === '') {
    // `null`, bukan `''`: mengosongkan baris sisa harus benar-benar kosong,
    // tapi gaya/border sel tetap dipertahankan.
    cell.value = null;
    return;
  }
  const prev: unknown = cell.value;
  if (typeof prev === 'number' && Number.isFinite(Number(value))) {
    cell.value = Number(value);
    return;
  }
  cell.value = value;
}

function getValueFromPath(data: CandidateData, path: string): string {
  const v = getPath(data, path);
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) {
    return v
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          return Object.values(item)
            .map((x) => String(x ?? ''))
            .join(' / ');
        }
        return String(item);
      })
      .join('\n');
  }
  return String(v);
}

export function flattenDataForPlaceholders(data: CandidateData): Record<string, string> {
  const flat: Record<string, string> = {};

  function recurse(obj: Record<string, unknown>, prefix = ''): void {
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        recurse(value as Record<string, unknown>, path);
      } else if (Array.isArray(value)) {
        if (value.length > 0 && typeof value[0] === 'object') {
          flat[path] = JSON.stringify(value);
        } else {
          flat[path] = value.join(', ');
        }
      } else if (value !== null && value !== undefined) {
        flat[path] = String(value);
      }
    }
  }

  for (const [section, sectionData] of Object.entries(data)) {
    if (section === 'raw') continue;
    recurse(sectionData as Record<string, unknown>, section);
  }

  return flat;
}

function replacePlaceholders(text: string, flatData: Record<string, string>): string {
  return text.replace(PLACEHOLDER_RE, (match, key) => {
    const trimmed = String(key).trim();
    if (flatData[trimmed] !== undefined) return flatData[trimmed];
    return match;
  });
}

/** Semua sel berisi di sheet, sebagai daftar `{address, text}`. */
function eachCell(ws: Worksheet, fn: (address: string, text: string) => void): void {
  const maxRow = ws.rowCount;
  const maxCol = ws.columnCount;
  for (let r = 1; r <= maxRow; r++) {
    for (let c = 1; c <= maxCol; c++) {
      const cell = ws.getCell(r, c);
      const text = cellText(cell);
      if (text === '') continue;
      fn(cell.address, text);
    }
  }
}

// ---------------------------------------------------------------------------
// CARA MENULIS SATU SEL — dipelajari dari contoh terisi (keputusan pemilik 2026-11-12)
// ---------------------------------------------------------------------------
// Pemilik: *"saya kerjakan cv manual dengan full semua data terisi terus template
// cocokin dengan data db jadi langsung tahu ini isi ini ini isi ini … kek tulis
// cell ini dengan bhasa ind bukan jp tulis ini tulis jp nya dan lain lain kek gaji
// juga di db kan yen sedangkan db kita kan rp sama yen kalau gak di kasih cara
// penulisannya yg bener setelah generated saya revisi manual terus donk"*.
//
// Jadi contoh terisi bukan hanya menjawab "sel ini FIELD apa", tetapi juga
// "BAGAIMANA MENULISNYA": bahasa mana yang dipakai sel itu, dan format apa yang
// berlaku (tanggal Jepang, periode 年月, gaji yen). Dua hal itu DIPELAJARI dari
// teks contoh — bukan ditebak saat mencetak — lalu disimpan per sel di record
// template. Record lama tetap sah: tanpa `specs`, perilakunya sama seperti dulu.
//
// Kenapa ini bukan sekadar kosmetik: tanpa spesifikasi, satu CV memuat dua gaya
// sekaligus ("2021年1月" di satu sel, "05 MEI 2025" di sel lain; "¥ 2.000.000"
// untuk gaji rupiah). Hasilnya selalu butuh revisi manual, dan otomatisasinya
// tidak ada gunanya.
export type CellFormat = 'text' | 'upper' | 'currency_yen' | 'date_jp' | 'period_jp' | 'number';

export interface CellSpec {
  /** `'jp'` = ambil varian `*_jp` dari field yang sama, bukan nilai Indonesianya. */
  lang?: 'id' | 'jp';
  /** Cara menulis nilainya di sel ini. */
  format?: CellFormat;
}

/**
 * Field yang varian Jepangnya TIDAK berakhiran `_jp`.
 *
 * Nama orang Jepang bukan terjemahan namanya, melainkan katakana — jadi
 * `identitas.nama_lengkap` berpasangan dengan `identitas.katakana`, bukan
 * `nama_lengkap_jp` (yang tidak ada).
 */
const JP_SIBLING_ALIAS: Record<string, string> = {
  'identitas.nama_lengkap': 'identitas.katakana',
  'identitas.panggilan': 'identitas.panggilan_katakana',
};

/** Path varian Jepang untuk `path`, atau `path` itu sendiri kalau sudah `_jp`. */
export function jpSiblingOf(path: string): string {
  const alias = JP_SIBLING_ALIAS[path];
  if (alias) return alias;
  if (path.endsWith('_jp')) return path;
  if (path.endsWith('_id')) return path.slice(0, -3) + '_jp';
  return path + '_jp';
}

/** Nilai teks satu path; array/objek bukan isi sel, jadi dianggap kosong. */
function readPathValue(data: CandidateData, path: string): string {
  const v = getPath(data, path);
  if (v === undefined || v === null || Array.isArray(v) || typeof v === 'object') return '';
  return String(v);
}

const JP_CHAR_RE = /[\u3040-\u30ff\u4e00-\u9fff]/;

/** `2005-10-28` / `2005/10/28` / ISO → `2005年10月28日`. */
function birthDateJp(raw: string): string {
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(raw);
  if (m) return `${m[1]}年${parseInt(m[2], 10)}月${parseInt(m[3], 10)}日`;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return raw;
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`;
}

/**
 * Simpulkan cara penulisan satu sel dari teks CONTOH-nya.
 *
 * Urutannya penting: bahasa ditentukan dengan MEMBANDINGKAN teks sel terhadap
 * nilai Indonesia dan nilai Jepang field itu. Baru kalau tidak ada yang cocok,
 * keberadaan huruf Jepang dipakai sebagai bukti. Membalik urutan ini membuat sel
 * berisi nama orang Indonesia yang kebetulan memuat kanji salah bahasa.
 */
export function detectCellSpec(text: string, path: string, data: CandidateData): CellSpec {
  const spec: CellSpec = {};
  const t = text.trim();
  if (!t) return spec;
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const idVal = readPathValue(data, path).trim();
  const jpVal = readPathValue(data, jpSiblingOf(path)).trim();
  if (jpVal && norm(t) === norm(jpVal) && norm(t) !== norm(idVal)) spec.lang = 'jp';
  else if (idVal && norm(t) === norm(idVal)) spec.lang = 'id';
  else if (JP_CHAR_RE.test(t)) spec.lang = 'jp';

  if (/^[¥￥]\s*[\d.,]+$/.test(t) || /^[\d.,]+\s*円$/.test(t)) spec.format = 'currency_yen';
  else if (/^\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日$/.test(t)) spec.format = 'date_jp';
  else if (/^\d{4}\s*年\s*\d{1,2}\s*月$/.test(t)) spec.format = 'period_jp';
  else if (/^[\d.,]+$/.test(t)) spec.format = 'number';
  else if (t.length >= 3 && /[A-Z]/.test(t) && t === t.toUpperCase()) spec.format = 'upper';
  else spec.format = 'text';
  return spec;
}

/** Nilai final untuk satu sel: pilih varian bahasa, lalu terapkan format. */
export function resolveCellValue(data: CandidateData, path: string, spec: CellSpec = {}): string {
  let raw = spec.lang === 'jp' ? getValueFromPath(data, jpSiblingOf(path)) : getValueFromPath(data, path);
  // Kolom Jepang yang belum diterjemahkan tidak boleh mengosongkan sel: lebih
  // baik mencetak teks Indonesianya daripada sel kosong di form Jepang.
  if (!isGood(raw)) raw = getValueFromPath(data, path);
  if (!isGood(raw)) return '';
  const v = raw.trim();
  switch (spec.format) {
    case 'currency_yen':
      return fmtGajiYen(v);
    case 'date_jp':
      return birthDateJp(v);
    case 'period_jp':
      return fmtMonthYearJp(v);
    case 'upper':
      return v.toUpperCase();
    default:
      return v;
  }
}

/**
 * Pilih opsi dropdown template yang paling cocok untuk `value`.
 *
 * Template membawa `dataValidation` — dan itu kosakata yang SAH untuk sel itu
 * (`LAKI LAKI (男)`, `O`, `ADA　（有）`). Menulis teks bebas ke sel ber-validasi
 * membuat Excel menandainya tidak valid dan hasil cetak berbeda dari daftar yang
 * dipakai form. Mencocokkan ke daftar itu lebih benar daripada menebak sendiri.
 */
export function pickOption(options: string[], value: string): string {
  const squash = (s: string) => s.replace(/[\s\u3000\-_/]/g, '').toLowerCase();
  const v = squash(value);
  if (!v) return '';
  const exact = options.find((o) => squash(o) === v);
  if (exact) return exact;
  const contains = options.find((o) => squash(o).includes(v));
  if (contains) return contains;
  // Arah sebaliknya hanya untuk opsi yang cukup panjang: opsi `O` (golongan
  // darah) akan "cocok" dengan hampir semua nilai kalau dibalik begitu saja.
  return options.find((o) => squash(o).length >= 3 && v.includes(squash(o))) ?? '';
}

/** Daftar opsi literal dari `dataValidation` sel, atau `[]`. */
function listOptions(cell: Cell): string[] {
  const dv = (cell as { dataValidation?: { type?: string; formulae?: unknown[] } }).dataValidation;
  if (!dv || dv.type !== 'list' || !Array.isArray(dv.formulae) || dv.formulae.length === 0) return [];
  const f = String(dv.formulae[0] ?? '').trim();
  // Hanya daftar literal `"A,B,C"`. Rujukan rentang (`$A$1:$A$9`) bukan
  // kosakata yang bisa dibaca tanpa membuka sheet lain.
  if (!f.startsWith('"')) return [];
  return f
    .replace(/^"|"$/g, '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// BELAJAR DARI CONTOH TERISI (keputusan pemilik 2026-10-09: opsi C)
// ---------------------------------------------------------------------------
// Admin mengisi template dengan data SATU kandidat nyata lalu meng-upload-nya
// sekali. Peta sel->field disimpulkan dengan mencocokkan NILAI di setiap sel
// terhadap nilai field kandidat itu — jadi tidak perlu mengetik
// `{{placeholder}}` di setiap sel, dan template yang sudah terisi penuh
// langsung bisa dipakai ulang untuk kandidat lain.
//
// Syarat yang tidak bisa dihindari: contohnya harus dari kandidat yang datanya
// ADA di database. Tanpa itu tidak ada yang bisa dicocokkan, dan peta harus
// diisi manual. Sel yang nilainya cocok dengan LEBIH DARI SATU field tidak
// ditebak — dimasukkan ke `ambiguous` supaya admin memilih.
export interface ExampleAnalysis {
  /** sel -> path data (siap diserahkan ke `applyFieldMap`) */
  fieldMap: TemplateFieldMap;
  /** sel -> cara menulis (bahasa & format), dipelajari dari contoh */
  specs: Record<string, CellSpec>;
  /**
   * Sel yang di CONTOH berisi data kandidat contoh tetapi tidak terpetakan.
   *
   * Ini daftar sel yang harus DIKOSONGKAN saat generate. Tanpa itu, CV kandidat
   * baru mencetak nama, umur, alamat, dan foto orang yang dipakai sebagai contoh
   * — kesalahan yang terlihat wajar karena berkasnya tetap rapi.
   */
  clearCells: string[];
  /** sel -> daftar path yang nilainya sama; admin harus memilih satu */
  ambiguous: Record<string, string[]>;
  /** path yang TIDAK ketemu di template — admin tahu apa yang belum tertampung */
  unmatched: string[];
}

/** Nilai yang terlalu pendek/terlalu umum untuk dijadikan bukti. */
function tooWeakToMatch(v: string): boolean {
  const s = v.trim();
  if (s.length < 3) return true;
  if (/^[-–—.,;:/\\|]+$/.test(s)) return true;
  return false;
}

function matchKey(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export async function analyzeFromExample(
  workbook: Workbook,
  data: CandidateData,
): Promise<ExampleAnalysis> {
  const flat = flattenDataForPlaceholders(data);
  /* Hanya sheet PERTAMA yang dipetakan — sama dengan yang ditulis
     `applyFieldMap`. Versi lama memindai semua sheet lalu menulis ke sheet
     pertama: alamat dari sheet kedua masuk ke peta, dan nilainya ditulis ke sel
     bernomor sama di sheet pertama. Template multi-sheet kehilangan datanya
     tanpa satu pun pesan; sekarang ia terlihat sebagai "peta kosong" yang
     ditolak saat simpan. */
  const ws = workbook.worksheets[0];

  // Nilai -> path. Hanya nilai yang cukup khas yang boleh jadi bukti.
  const byValue = new Map<string, string[]>();
  /* Peta kedua TANPA saringan "terlalu umum". Dipakai bukan untuk memetakan,
     melainkan untuk mengenali sel mana yang berisi DATA KANDIDAT CONTOH walau
     nilainya terlalu pendek untuk dijadikan bukti — `O` (golongan darah), `1`
     (jumlah anak), `-`. Sel seperti itu harus dikosongkan saat generate; kalau
     tidak, golongan darah orang contoh ikut tercetak. */
  const byValueLoose = new Map<string, string[]>();
  for (const [path, value] of Object.entries(flat)) {
    const key = matchKey(value);
    if (!key) continue;
    const loose = byValueLoose.get(key) ?? [];
    if (!loose.includes(path)) loose.push(path);
    byValueLoose.set(key, loose);
    if (tooWeakToMatch(String(value))) continue;
    const list = byValue.get(key) ?? [];
    if (!list.includes(path)) list.push(path);
    byValue.set(key, list);
  }

  const fieldMap: TemplateFieldMap = {};
  const ambiguous: Record<string, string[]> = {};
  const used = new Set<string>();
  /** Sel yang isinya berasal dari kandidat contoh, terpetakan atau tidak. */
  const exemplarCells: Array<{ addr: string; text: string }> = [];

  if (ws) {
    eachCell(ws, (addr, text) => {
      // `{{path}}` selalu menang: itu perintah eksplisit, bukan tebakan.
      const token = PLACEHOLDER_RE.exec(text);
      PLACEHOLDER_RE.lastIndex = 0;
      if (token && flat[String(token[1]).trim()] !== undefined) {
        const path = String(token[1]).trim();
        fieldMap[addr] = path;
        used.add(path);
        return;
      }

      const paths = byValue.get(matchKey(text));
      if (!paths?.length) {
        if (byValueLoose.has(matchKey(text))) exemplarCells.push({ addr, text });
        return;
      }
      exemplarCells.push({ addr, text });
      if (paths.length === 1) {
        fieldMap[addr] = paths[0];
        used.add(paths[0]);
      } else {
        ambiguous[addr] = paths;
      }
    });
  }

  // JARING PENGAMAN — sel yang TIDAK bisa dipelajari dari nilai.
  //
  // Sel nilai yang KOSONG di contoh mustahil dicocokkan: tidak ada nilainya.
  // Tanpa langkah ini, field seperti KELEBIHAN / KEKURANGAN / HOBI / SETELAH
  // PULANG tidak pernah masuk peta walau LABELNYA ADA di template — persis yang
  // membuat baris 37-40 template rirekisho selalu kosong untuk SEMUA kandidat.
  //
  // ⚠️ LABEL MENANG atas tebakan nilai (dikoreksi 2026-11-12). Dulu bukti nilai
  // yang menang, dan itu salah untuk template yang contohnya kebetulan mengisi
  // dua kolom dengan teks sama: pada `tpl-tg708`, tempat lahir dan alamat
  // contohnya sama-sama `PONOROGO`, sehingga sel 現住所 (alamat) dipetakan ke
  // `identitas.tempat_lahir` dan alamat kandidat tidak pernah tercetak. Label
  // ditulis manusia dan menunjuk sel yang benar; nilai yang kebetulan sama
  // adalah kebetulan.
  if (ws) {
    for (const [addr, path] of Object.entries(labelFieldMap(ws))) {
      const candidates = ambiguous[addr];
      if (candidates) {
        // Nilainya cocok dengan >1 field. Label boleh MEMUTUSKAN — tapi hanya
        // kalau ia menunjuk salah satu kandidat itu. Kalau label menunjuk field
        // lain, dua sumber bukti ini bertentangan dan admin yang memilih.
        if (!candidates.includes(path)) continue;
        delete ambiguous[addr];
      }
      fieldMap[addr] = path;
      used.add(path);
    }
  }

  const specs: Record<string, CellSpec> = {};
  if (ws) {
    for (const [addr, path] of Object.entries(fieldMap)) {
      specs[addr] = detectCellSpec(cellText(ws.getCell(addr)), path, data);
    }
  }

  /* Sel contoh yang TIDAK terpetakan = data orang lain yang akan tercetak apa
     adanya. Label tidak ikut dikosongkan (itu bagian form, bukan data). */
  const clearCells = exemplarCells
    .filter(({ addr, text }) => !(addr in fieldMap) && !looksLikeLabel(text))
    .map(({ addr }) => addr);

  const unmatched = Object.keys(flat).filter((p) => !used.has(p) && !tooWeakToMatch(String(flat[p])));
  return { fieldMap, specs, clearCells, ambiguous, unmatched };
}

// ---------------------------------------------------------------------------
// BLOK RIWAYAT MULTI-BARIS (pendidikan / pekerjaan / keluarga)
// ---------------------------------------------------------------------------
// `applyFieldMap` menulis SATU nilai per sel. Tabel riwayat butuh N baris
// (satu baris per sekolah / perusahaan / anggota keluarga), jadi ia tidak bisa
// ditangani peta sel biasa — tanpa ini, CV hasil regenerasi kehilangan justru
// bagian terpentingnya.
//
// Bloknya juga dipelajari dari contoh yang sama: cari KOLOM yang nilainya
// berurutan sama dengan nilai field kunci tiap entri (mis. `tingkat` untuk
// pendidikan), lalu kolom-kolom lain di baris yang sama dipetakan dengan
// mencocokkan nilainya ke field entri pada baris itu.
export interface RiwayatBlock {
  sheet: string;
  /** Baris Excel (1-based) entri PERTAMA. */
  startRow: number;
  /** Berapa baris yang ditempati blok di template (dari contoh yang terisi). */
  rows: number;
  /** Kolom kunci, mis. 'A'. */
  keyColumn: string;
  /** Kolom -> field entri, mis. `{ A: 'tingkat', B: 'sekolah' }`. */
  columns: Record<string, string>;
}

export async function detectRiwayatBlock(
  workbook: Workbook,
  entries: Array<Record<string, unknown>>,
  keyField: string,
): Promise<RiwayatBlock | null> {
  if (!Array.isArray(entries) || entries.length < 2) return null;

  for (const ws of workbook.worksheets) {
    const maxRow = ws.rowCount;
    const maxCol = ws.columnCount;

    for (let c = 1; c <= maxCol; c++) {
      const letter = ws.getColumn(c).letter;
      // Baris mana saja di kolom ini yang cocok dengan field kunci entri ke-i?
      const hits: number[] = [];
      for (let r = 1; r <= maxRow; r++) {
        const key = matchKey(cellText(ws.getCell(r, c)));
        if (!key) continue;
        const i = entries.findIndex((e) => matchKey(e[keyField]) === key);
        if (i >= 0 && !hits.includes(i)) hits.push(i);
      }
      // Blok dikenali kalau kolom ini memuat SEMUA entri (bukan kebetulan satu).
      if (hits.length !== entries.length) continue;

      const startRow = Math.min(
        ...entries.map((e) => {
          for (let r = 1; r <= maxRow; r++) {
            if (matchKey(cellText(ws.getCell(r, c))) === matchKey(e[keyField])) return r;
          }
          return Number.MAX_SAFE_INTEGER;
        }),
      );
      if (!Number.isFinite(startRow) || startRow === Number.MAX_SAFE_INTEGER) continue;

      // Kolom lain: nilainya harus cocok dengan field entri di BARIS yang sama.
      //
      // Yang diperiksa SEMUA baris blok, bukan cuma baris pertama. Baris pertama
      // saja tidak cukup: field yang kosong di entri pertama (mis. `sekolah_jp`
      // atau `jurusan` yang belum diisi untuk SD) membuat kolomnya tidak pernah
      // terpetakan — padahal kolom itu berisi data, dan yang tidak terpetakan
      // akan mempertahankan isi contoh di baris kandidat berikutnya.
      //
      // Kalau dua baris menunjuk field yang BERBEDA, kolom itu dilewati: dua
      // sumber bukti yang bertentangan bukan dasar untuk menulis data.
      const columns: Record<string, string> = { [letter]: keyField };
      for (let cc = 1; cc <= maxCol; cc++) {
        const cl = ws.getColumn(cc).letter;
        if (cl === letter) continue;
        let mapped: string | null = null;
        let conflict = false;
        for (let i = 0; i < entries.length; i++) {
          const key = matchKey(cellText(ws.getCell(startRow + i, cc)));
          if (!key) continue;
          const hit = Object.entries(entries[i]).find(
            ([field, value]) => field !== keyField && matchKey(value) === key,
          );
          if (!hit) continue;
          if (mapped && mapped !== hit[0]) {
            conflict = true;
            break;
          }
          mapped = hit[0];
        }
        if (mapped && !conflict) columns[cl] = mapped;
      }
      return { sheet: ws.name, startRow, rows: entries.length, keyColumn: letter, columns };
    }
  }
  return null;
}

/** Salinan dalam — `cell.style` adalah objek hidup milik sel sumber. */
function cloneStyle(cell: Cell): { style: unknown; numFmt: string } {
  return {
    style: JSON.parse(JSON.stringify(cell.style ?? {})),
    numFmt: cell.numFmt || 'General',
  };
}

const REF_RE = /(\$?)([A-Z]{1,3})(\$?)(\d+)/g;

/** Geser SEMUA referensi sel di teks yang barisnya >= `fromRow0` (0-based). */
function shiftRefs(text: string, fromRow0: number, delta: number): string {
  return text.replace(REF_RE, (whole, dc: string, col: string, dr: string, row: string) => {
    const r0 = Number(row) - 1;
    return r0 >= fromRow0 ? `${dc}${col}${dr}${r0 + delta + 1}` : whole;
  });
}

/**
 * Tambah `extra` baris kosong mulai baris `at` (1-based) — dan perbaiki DUA hal
 * yang `spliceRows` tidak kerjakan sendiri:
 *
 *  1. **Alamat dropdown** (`ws.dataValidations.model`) tidak ikut bergeser —
 *     termasuk RENTANG SUMBER daftarnya (mis. `$J$29:$Z$29`). Kalau dibiarkan,
 *     dropdown berpindah ke baris yang salah tanpa error apa pun.
 *  2. **Gaya & tinggi baris** tidak diwarisi. Baris baru disalin dari baris
 *     contoh TERAKHIR blok, supaya tabel tetap bergaris seperti template.
 *
 * ⚠️ **Sel gabungan JANGAN digeser manual.** `spliceRows` sudah menggesernya
 * sendiri — tapi `ws.model.merges` mengembalikan nilai BASI tepat sesudah
 * `spliceRows`, jadi membacanya di situ lalu menggeser hasilnya akan
 * menggeser DUA KALI. (Diuji: merge `A7:C7` + sisip 2 baris di baris 4 ⇒
 * `A9:C9` sesudah write+load, sementara getter masih bilang `A7:C7`.)
 */
function insertRowsWithStyle(
  ws: Worksheet,
  at: number,
  extra: number,
  styleFromRow: number,
  cols: string[],
): void {
  const fromRow0 = at - 1;
  const snapshots = cols.map((col) => ({ col, ...cloneStyle(ws.getCell(`${col}${styleFromRow}`)) }));
  const height = ws.getRow(styleFromRow).height;

  const blanks: unknown[][] = [];
  for (let i = 0; i < extra; i++) blanks.push([]);
  ws.spliceRows(at, 0, ...blanks);

  // `dataValidations` TIDAK ada di typings exceljs (di index.d.ts baris itu
  // dikomentari), jadi bentuknya diambil manual. Objeknya ada saat runtime —
  // dibuktikan `e2e/cv-template-fidelity.test.ts`.
  const dv = (
    ws as unknown as {
      dataValidations?: { model?: Record<string, Record<string, unknown>> };
    }
  ).dataValidations;
  if (dv?.model) {
    const next: Record<string, Record<string, unknown>> = {};
    for (const [addr, rule] of Object.entries(dv.model)) {
      const clone = JSON.parse(JSON.stringify(rule)) as Record<string, unknown>;
      if (Array.isArray(clone.formulae)) {
        clone.formulae = (clone.formulae as string[]).map((f) => shiftRefs(String(f), fromRow0, extra));
      }
      next[shiftRefs(addr, fromRow0, extra)] = clone;
    }
    dv.model = next;
  }

  for (let i = 0; i < extra; i++) {
    const row = at + i;
    ws.getRow(row).height = height;
    for (const s of snapshots) {
      const cell = ws.getCell(`${s.col}${row}`);
      cell.style = s.style as never;
      cell.numFmt = s.numFmt;
    }
  }
}

/** Tulis N entri ke N baris berturut-turut mulai `block.startRow`. */
export async function applyRiwayatBlock(
  workbook: Workbook,
  block: RiwayatBlock,
  entries: Array<Record<string, unknown>>,
): Promise<void> {
  const ws = pickSheet(workbook, block.sheet);
  const cols = Object.keys(block.columns);

  // Kandidat ini punya riwayat LEBIH BANYAK daripada contoh => barisnya harus
  // DITAMBAH, bukan dipotong. Sebelum ini kelebihannya dibuang tanpa jejak:
  // sekolah/pekerjaan terakhir hilang, dan berkasnya tetap terlihat wajar.
  const extra = entries.length - block.rows;
  if (extra > 0) {
    insertRowsWithStyle(ws, block.startRow + block.rows, extra, block.startRow + block.rows - 1, cols);
  }

  for (let i = 0; i < entries.length; i++) {
    for (const [col, field] of Object.entries(block.columns)) {
      // Sel kosong pada entri tetap ditulis kosong: baris milik kandidat
      // SEBELUMNYA tidak boleh tertinggal di baris kandidat berikutnya.
      writeCellValue(ws.getCell(`${col}${block.startRow + i}`), toStr(entries[i][field]));
    }
  }
  // Sisa baris blok (kandidat ini punya riwayat LEBIH PENDEK daripada contoh)
  // harus dikosongkan — kalau tidak, nama sekolah milik kandidat contoh ikut
  // tercetak sebagai riwayat kandidat ini. Ini kesalahan yang paling mudah
  // lolos: hasilnya terlihat wajar, hanya isinya milik orang lain.
  // Seluruh RENTANG kolom disapu, bukan hanya yang terpetakan: kolom yang tidak
  // berhasil dipetakan pun berisi data contoh di baris sisa ini.
  const spanCols = blockSpan(ws, block, cols);
  for (let i = entries.length; i < block.rows; i++) {
    for (const col of spanCols) writeCellValue(ws.getCell(`${col}${block.startRow + i}`), '');
  }
}

interface MergeRange {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

/** `'D37'` → `{ r: 37, c: 4 }`. Koordinat 1-based, seperti Excel. */
const ADDR_RE = /^([A-Z]+)(\d+)$/;

function decodeAddr(addr: string): { r: number; c: number } {
  const m = ADDR_RE.exec(String(addr).toUpperCase());
  if (!m) return { r: 1, c: 1 };
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return { r: Number(m[2]), c };
}

/** Kebalikan `decodeAddr`: 4 → `'D'`. */
function letterOf(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

/**
 * Semua kolom tabel riwayat, dari yang paling kiri ke paling kanan.
 *
 * Dipakai untuk mengosongkan baris SISA tabel. Menyapu hanya kolom yang
 * terpetakan tidak cukup: kolom yang nilainya di baris contoh pertama tidak
 * cocok dengan field mana pun (mis. kolom "Catatan") tidak masuk
 * `block.columns`, sehingga data kandidat CONTOH bertahan di baris yang
 * seharusnya kosong — kelas kesalahan yang sama dengan nilai kosong di
 * `applyFieldMap`.
 *
 * Rentangnya diperluas dari kolom terpetakan ke kanan DAN ke kiri **selama
 * kolom berikutnya masih berisi data di baris blok** — jadi tabel yang lebarnya
 * lebih besar dari yang berhasil dipetakan ikut tersapu, sementara catatan
 * statis yang dipisahkan kolom kosong tidak ikut terhapus.
 */
function blockSpan(ws: Worksheet, block: RiwayatBlock, cols: string[]): string[] {
  const mapped = cols.map((c) => decodeAddr(`${c}1`).c);
  if (!mapped.length) return cols;
  const first = block.startRow;
  const last = block.startRow + block.rows - 1;
  const hasData = (c: number): boolean => {
    for (let r = first; r <= last; r++) {
      if (cellText(ws.getCell(r, c)).trim() !== '') return true;
    }
    return false;
  };
  let lo = Math.min(...mapped);
  let hi = Math.max(...mapped);
  while (hi + 1 <= ws.columnCount && hasData(hi + 1)) hi++;
  while (lo - 1 >= 1 && hasData(lo - 1)) lo--;
  const out: string[] = [];
  for (let i = lo; i <= hi; i++) out.push(letterOf(i));
  return out;
}

/** Rentang merge di sheet, sebagai koordinat 1-based. */
function mergeRanges(ws: Worksheet): MergeRange[] {
  const raw = (ws.model as { merges?: string[] }).merges;
  if (!Array.isArray(raw)) return [];
  const out: MergeRange[] = [];
  for (const text of raw) {
    const [a, b] = String(text).split(':');
    if (!a) continue;
    out.push({ s: decodeAddr(a), e: decodeAddr(b ?? a) });
  }
  return out;
}

function mergeAt(ranges: MergeRange[], row: number, col: number): MergeRange | null {
  for (const g of ranges) {
    if (row >= g.s.r && row <= g.e.r && col >= g.s.c && col <= g.e.c) return g;
  }
  return null;
}

/** Kalau (row,col) ada di dalam merge, kembalikan alamat sel kiri-atasnya. */
function topLeftOf(ws: Worksheet, ranges: MergeRange[], row: number, col: number): string {
  const g = mergeAt(ranges, row, col);
  return ws.getCell(g ? g.s.r : row, g ? g.s.c : col).address;
}

/** Teks sel ini sendiri adalah LABEL lain (bukan nilai)? */
function looksLikeLabel(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return FIELD_LABELS.some(({ pattern }) => pattern.test(t));
}

/** Apakah `addr` adalah sel KIRI-ATAS sebuah merge? */
function isMergeTopLeft(ranges: MergeRange[], addr: string): boolean {
  const { r, c } = decodeAddr(addr);
  const g = mergeAt(ranges, r, c);
  return !!g && g.s.r === r && g.s.c === c;
}

/**
 * Sel NILAI untuk sebuah label.
 *
 * Aturan utamanya: **sel pertama di KANAN rentang merge label**. Di template
 * rirekisho label menempati merge `A37:C37` dan nilai menempati merge
 * `D37:I37`, jadi "kanan dari merge label" = `D37` — sel kiri-atas area nilai.
 *
 * Aturan lama (kanan 1 kolom → kanan 2 kolom → bawah) TIDAK cukup, karena:
 *  1. label yang di-merge menyalin teksnya ke B37/C37 juga, jadi "kanan satu
 *     kolom" menunjuk SALINAN LABEL — menulis ke situ menimpa labelnya;
 *  2. sel nilai boleh KOSONG (itu justru yang mau diperbaiki), sedangkan aturan
 *     lama mensyaratkan tetangganya BERISI;
 *  3. "utamakan tetangga yang BERISI" salah kalau tetangga itu LABEL BERIKUTNYA
 *     yang kebetulan tidak dikenal pola mana pun — ia lolos sebagai "nilai".
 *
 * Dua tingkat yang dipakai, hasil pengamatan template nyata:
 *  - **label yang di-merge HORIZONTAL** = band `label | nilai` pada baris yang
 *    sama ⇒ nilainya di KANAN, ke bawah TIDAK dilihat.
 *  - **label satu sel** = formulir dua kolom. Di form ini sel NILAI adalah sel
 *    yang DI-MERGE, sedangkan labelnya sel tunggal. Karena itu kandidat yang
 *    di-merge diutamakan: `TEMPAT LAHIR` (E11, sel tunggal) nilainya ada di
 *    `D12:E12` (merge, DI BAWAH), bukan di `F11` — yang justru label
 *    `訪日経験 PERNAH KE JEPANG`. Tanpa aturan ini, tempat lahir kandidat
 *    ditulis menimpa label itu.
 */
function valueCellForLabel(
  ws: Worksheet,
  ranges: MergeRange[],
  row: number,
  col: number,
  maxRow: number,
  maxCol: number,
): string | null {
  const label = mergeAt(ranges, row, col);
  const spansCols = !!label && label.e.c > label.s.c;
  const rightCol = (label ? label.e.c : col) + 1;

  const usable = (addr: string | null): string | null => {
    if (!addr) return null;
    const text = cellText(ws.getCell(addr)).trim();
    return text && looksLikeLabel(text) ? null : addr;
  };

  const right = rightCol <= maxCol ? usable(topLeftOf(ws, ranges, row, rightCol)) : null;
  if (spansCols) return right;

  const belowRow = (label ? label.e.r : row) + 1;
  const below = belowRow <= maxRow ? usable(topLeftOf(ws, ranges, belowRow, col)) : null;

  // 1-2. kandidat yang DI-MERGE lebih dipercaya daripada sel tunggal
  for (const addr of [right, below]) {
    if (addr && isMergeTopLeft(ranges, addr)) return addr;
  }
  // 3. baru sel tunggal yang berisi
  for (const addr of [right, below]) {
    if (addr && cellText(ws.getCell(addr)).trim() !== '') return addr;
  }
  return right ?? below;
}

/** Peta sel→field dari LABEL template, tanpa melihat nilai selnya. */
function labelFieldMap(ws: Worksheet): TemplateFieldMap {
  const out: TemplateFieldMap = {};
  const maxRow = ws.rowCount;
  const maxCol = ws.columnCount;
  const ranges = mergeRanges(ws);

  for (let r = 1; r <= maxRow; r++) {
    for (let c = 1; c <= maxCol; c++) {
      const text = cellText(ws.getCell(r, c)).trim();
      if (!text) continue;
      const hit = FIELD_LABELS.find(({ pattern }) => pattern.test(text));
      if (!hit) continue;
      const addr = valueCellForLabel(ws, ranges, r, c, maxRow, maxCol);
      if (addr) out[addr] = hit.path;
    }
  }
  return out;
}

export async function analyzeExcelTemplate(workbook: Workbook): Promise<TemplateFieldMap> {
  const ws = workbook.worksheets[0];
  return ws ? labelFieldMap(ws) : {};
}

export async function applyFieldMap(
  workbook: Workbook,
  fieldMap: TemplateFieldMap,
  data: CandidateData,
  opts: { specs?: Record<string, CellSpec>; clearCells?: string[] } = {},
): Promise<void> {
  const ws = workbook.worksheets[0];
  if (!ws) throw new Error('Template tidak punya sheet.');
  const specs = opts.specs ?? {};
  for (const [cellAddress, fieldPath] of Object.entries(fieldMap)) {
    const cell = ws.getCell(cellAddress);
    let value = resolveCellValue(data, fieldPath, specs[cellAddress]);
    /* Dropdown template adalah kosakata yang SAH untuk sel itu. Menulis teks
       bebas ke sel ber-validasi membuat Excel menandainya tidak valid dan hasil
       cetak berbeda dari daftar yang dipakai form — persis "beda gaya
       penulisan" yang membuat CV harus direvisi manual. Kalau tidak ada opsi
       yang cocok, sel DIKOSONGKAN: nilai asing lebih buruk daripada sel kosong. */
    const options = listOptions(cell);
    if (options.length) value = pickOption(options, value);
    if (value) {
      writeCellValue(cell, value);
      continue;
    }
    // Nilai kosong TETAP harus dikosongkan. Kalau tidak, isi template — yaitu
    // data kandidat CONTOH yang dipakai waktu admin meng-upload — tertinggal di
    // sel itu dan tercetak sebagai milik kandidat ini. Diukur pada template
    // rirekisho: kandidat tanpa agama/golongan darah/umur keluar dengan
    // "ISLAM（イスラム） / O / 19" milik orang lain. Ini kesalahan yang sama
    // seperti sisa baris riwayat, hanya satu sel.
    //
    // Satu pengecualian: kalau sel tujuan ternyata berisi LABEL (peta bisa salah
    // di template yang tata letaknya belum kita kenal), sel itu TIDAK dihapus —
    // menghapus label template jauh lebih merusak daripada membiarkannya.
    if (looksLikeLabel(cellText(cell))) continue;
    writeCellValue(cell, '');
  }

  /* Sel yang di CONTOH berisi data kandidat contoh tetapi tidak terpetakan.
     Tanpa sapuan ini, seluruh CV kandidat baru berisi nama, umur, alamat, dan
     foto orang yang dipakai sebagai contoh — terlihat rapi, isinya orang lain.
     Daftarnya dihitung saat analisa (`clearCells`), bukan ditebak saat cetak. */
  for (const addr of opts.clearCells ?? []) {
    if (addr in fieldMap) continue;
    const cell = ws.getCell(addr);
    if (looksLikeLabel(cellText(cell))) continue;
    writeCellValue(cell, '');
  }
}

export async function loadExcelTemplate(
  file: File,
  data: CandidateData,
  options: ExcelTemplateOptions = {},
): Promise<Blob> {
  const workbook = await readWorkbook(new Uint8Array(await file.arrayBuffer()));
  const flatData = flattenDataForPlaceholders(data);
  const ws = pickSheet(workbook, options.sheetName);

  const placeholderCells: Array<{ address: string; text: string }> = [];
  eachCell(ws, (address, text) => {
    if (PLACEHOLDER_RE.test(text)) placeholderCells.push({ address, text });
    PLACEHOLDER_RE.lastIndex = 0;
  });

  if (placeholderCells.length) {
    const arrayFields = options.arrayFields || ['pendidikan', 'pekerjaan', 'keluarga'];
    const arrayLengths: Record<string, number> = {};
    for (const field of arrayFields) {
      arrayLengths[field] = (data[field as keyof CandidateData] as unknown[] | undefined)?.length || 1;
    }
    const maxArrayLength = Math.max(1, ...Object.values(arrayLengths));

    for (let i = 0; i < maxArrayLength; i++) {
      const itemFlat: Record<string, string> = {};
      for (const [field, length] of Object.entries(arrayLengths)) {
        if (i >= length) continue;
        const item = (data[field as keyof CandidateData] as Record<string, unknown>[] | undefined)?.[i];
        if (!item) continue;
        for (const [k, v] of Object.entries(item)) {
          if (v !== null && v !== undefined) itemFlat[`${field}.${k}`] = String(v);
        }
      }
      for (const { address, text } of placeholderCells) {
        let replaced = replacePlaceholders(text, itemFlat);
        replaced = replacePlaceholders(replaced, flatData);
        // Baris ke-i ditulis ke baris asal + i supaya blok placeholder bertambah
        // ke bawah, bukan menimpa baris yang sama berulang kali.
        const src = ws.getCell(address);
        writeCellValue(ws.getCell(src.row + i, src.col), replaced);
      }
    }
    return workbookToXlsxBlob(workbook);
  }

  const fieldMap = await analyzeExcelTemplate(workbook);
  await applyFieldMap(workbook, fieldMap, data);
  return workbookToXlsxBlob(workbook);
}

export async function loadDocxTemplate(file: File, data: CandidateData): Promise<{ html: string; text: string }> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const flatData = flattenDataForPlaceholders(data);

  const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
  let html = htmlResult.value || '';

  html = replacePlaceholders(html, flatData);

  const textResult = await mammoth.extractRawText({ arrayBuffer });
  const text = replacePlaceholders(textResult.value || '', flatData);

  return { html, text };
}

interface PdfParser {
  load: () => Promise<void>;
  getText: () => Promise<{ text?: string }>;
  destroy: () => void;
}

export async function loadPdfTemplate(file: File, data: CandidateData): Promise<string> {
  const pdfModule = (await import('pdf-parse')) as unknown as { PDFParse?: unknown; default?: unknown };
  const PDFClass = (pdfModule.PDFParse ?? pdfModule.default) as new (b: Uint8Array) => PdfParser;
  const arrayBuffer = await file.arrayBuffer();
  const flatData = flattenDataForPlaceholders(data);
  const fresh = new Uint8Array(arrayBuffer as ArrayBuffer);
  const parser = new PDFClass(fresh);
  await parser.load();
  const result = await parser.getText();
  parser.destroy();
  const text = result?.text || '';

  return replacePlaceholders(text, flatData);
}
