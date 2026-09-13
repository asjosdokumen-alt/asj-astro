/**
 * candidateExport.ts — satu sumber kebenaran untuk ekspor kandidat (CSV + Excel).
 *
 * KENAPA MODUL INI ADA
 * --------------------
 * Sebelum ini `TabPelamar.exportCsv()` menulis kolomnya sendiri, langsung di dalam
 * komponen, dan hanya **7 kolom**. Legacy (`khoci921/js/render/candidate.ts:497`
 * `exportKandidatCsv`) mengirim **11 kolom**:
 *
 *   ID Kandidat · Nama · No WA · Email · Gender · Usia · Job ID ·
 *   Tahapan · Status · Catatan Admin · Tanggal Daftar
 *
 * Jadi kekurangannya sebenarnya **dua**: (1) Excel belum ada sama sekali, dan
 * (2) CSV-nya sendiri belum parity. Menaruh definisi kolom di sini membuat
 * kedua format tidak bisa lagi menyimpang satu sama lain — persis kelas bug yang
 * sudah berulang di repo ini (dokumen/UI menjanjikan perilaku yang tidak ada).
 *
 * CATATAN PENTING soal `email` dan `tanggalDaftar`
 * ------------------------------------------------
 * Keduanya **sudah dikirim backend** (`_lib/db/candidates.ts:57,82,83` —
 * `mapCandidate` memetakan `email`, `tanggal_daftar/tanggalDaftar`, `created_at`),
 * tapi **dibuang** oleh interface `Kandidat` di `src/store/adminStore.ts` yang
 * tidak mendeklarasikannya. Jadi nilai-nilainya memang sampai ke browser; yang
 * hilang hanya deklarasinya. Tidak ada perubahan backend yang dibutuhkan.
 */

/** Baris kandidat yang diekspor. Field opsional = belum tentu dikirim backend. */
export interface ExportableCandidate {
  id?: string;
  nama?: string;
  wa?: string;
  email?: string;
  gender?: string;
  usia?: string;
  idLoker?: string;
  tahapan?: string;
  status?: string;
  catatan?: string;
  catatanExt?: string;
  tanggalDaftar?: string;
  createdAt?: string;
}

/** Kolom ekspor — nama header + cara mengambil nilainya. Urutan = urutan legacy. */
export interface ExportColumn {
  header: string;
  value: (c: ExportableCandidate) => string;
}

/**
 * Gender legacy memakai satu huruf: `P` (perempuan) / `L` (laki-laki), kosong bila
 * tidak diketahui. Legacy: `safeGender.includes('PEREMPUAN') ? 'P' : includes('LAKI') ? 'L' : ''`.
 * Perhatikan urutan cek: "PEREMPUAN" diuji lebih dulu, dan "LAKI-LAKI" mengandung
 * "LAKI" sehingga cocok dengan cabang kedua.
 */
export function genderCode(raw: unknown): string {
  const s = String(raw ?? '').toUpperCase();
  if (s.includes('PEREMPUAN') || s.includes('WANITA')) return 'P';
  if (s.includes('LAKI') || s.includes('PRIA')) return 'L';
  return '';
}

/**
 * Tanggal daftar: pakai `tanggalDaftar` bila ada, kalau tidak jatuh ke `createdAt`
 * (legacy: `c.tanggalDaftar || c.createdAt || ''`).
 */
export function registeredDate(c: ExportableCandidate): string {
  return String(c.tanggalDaftar || c.createdAt || '');
}

/**
 * Kolom ekspor. **Ini satu-satunya tempat daftar kolom boleh didefinisikan** —
 * CSV dan Excel sama-sama membacanya, jadi keduanya tidak bisa berbeda lagi.
 */
export const EXPORT_COLUMNS: ExportColumn[] = [
  { header: 'ID Kandidat', value: (c) => String(c.id ?? '') },
  { header: 'Nama', value: (c) => String(c.nama ?? '') },
  { header: 'No WA', value: (c) => String(c.wa ?? '') },
  { header: 'Email', value: (c) => String(c.email ?? '') },
  { header: 'Gender', value: (c) => genderCode(c.gender) },
  { header: 'Usia', value: (c) => String(c.usia ?? '') },
  { header: 'Job ID', value: (c) => String(c.idLoker ?? '') },
  { header: 'Tahapan', value: (c) => String(c.tahapan ?? '') },
  { header: 'Status', value: (c) => String(c.status ?? '') },
  // Kolom catatan mengikuti legacy: catatanExt || catatan (catatan_admin).
  { header: 'Catatan Admin', value: (c) => String(c.catatanExt || c.catatan || '') },
  { header: 'Tanggal Daftar', value: registeredDate },
];

/** Header kolom ekspor, terpisah dari nilai — dipakai Excel & test. */
export const EXPORT_HEADERS: string[] = EXPORT_COLUMNS.map((c) => c.header);

/**
 * Ubah daftar kandidat menjadi matriks string (baris pertama = header).
 * Excel memakai ini langsung; CSV membungkusnya dengan aturan quoting.
 */
export function toExportMatrix(rows: ExportableCandidate[]): string[][] {
  const head = [...EXPORT_HEADERS];
  const body = rows.map((c) => EXPORT_COLUMNS.map((col) => col.value(c)));
  return [head, ...body];
}

/**
 * Sel CSV: kutip hanya bila perlu (`,` `"` `\n` `\r`), escape `"` menjadi `""`.
 * Sama dengan `csvCell()` legacy.
 */
export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Teks CSV final. **Wajib ber-BOM** — tanpa BOM, Excel di Windows membaca UTF-8
 * sebagai ANSI dan nama ber-aksen/kanji rusak. Legacy juga memakai BOM
 * (`candidate.ts:563`). Baris dipisah `\r\n` (RFC 4180).
 */
export function toCsvText(rows: ExportableCandidate[]): string {
  const lines = toExportMatrix(rows).map((r) => r.map(csvCell).join(','));
  return '\uFEFF' + lines.join('\r\n');
}

/** Nama berkas ekspor, bertanggal — parity legacy (`asj-kandidat-YYYY-MM-DD`). */
export function exportFilename(ext: 'csv' | 'xlsx', now: Date = new Date()): string {
  const d = now.toISOString().slice(0, 10);
  return `asj-kandidat-${d}.${ext}`;
}

/** Nama sheet di dalam workbook. Excel native tidak suka karakter `[]:*?/\`. */
export const EXPORT_SHEET_NAME = 'Kandidat';

/**
 * Bangun workbook Excel (.xlsx) dari daftar kandidat, kembalikan `ArrayBuffer`.
 *
 * `xlsx` diimpor **dinamis**: ia library berat (~±800 KB) dan ekspor adalah aksi
 * yang jarang dipakai, jadi ia tidak boleh ikut ke bundle awal tiap halaman admin.
 * `scripts/build-sw-manifest.mjs` sudah mengecualikan chunk lazy bernama `xlsx.*`
 * dari daftar precache — jadi dynamic import di sini juga menjaga precache tetap
 * ramping. Pola yang sama dipakai `cv-template-factory/loaders/tEMPLATE-loader.ts:145`.
 *
 * Kolomnya berasal dari `toExportMatrix`, sehingga **tidak mungkin** berbeda dari CSV.
 */
export async function buildExcelBuffer(rows: ExportableCandidate[]): Promise<ArrayBuffer> {
  const XLSX = await import('xlsx');
  const matrix = toExportMatrix(rows);
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  // Lebar kolom kasar supaya hasilnya langsung terbaca, bukan ##### semua.
  sheet['!cols'] = EXPORT_HEADERS.map((h) => ({ wch: Math.max(12, Math.min(34, h.length + 10)) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, EXPORT_SHEET_NAME);
  // 'array' → ArrayBuffer (bukan string base64) supaya Blob di browser bersih.
  return XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

