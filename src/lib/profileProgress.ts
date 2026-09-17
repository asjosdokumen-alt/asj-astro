/**
 * profileProgress.ts — progres profil kandidat (CV Mini & CV Master).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Dua progress bar di dashboard kandidat ("CV Mini (Data Dasar)" dan
 * "CV Master (Detail)") membaca `result.kandidatData.cvMiniProgress` /
 * `.cvMasterProgress` — kontrak backend GAS legacy. Backend rebuild
 * (`netlify/functions/`) **tidak pernah mengembalikan kunci `kandidatData`**:
 * respons getAppData('kandidat') hanya berisi
 * `{ success, candidates, kandidatRiwayat, mySchedules, ... }`.
 *
 * Akibatnya kedua nilai selalu 0:
 *   • kandidat melihat "0%" selamanya, walau profilnya sudah lengkap;
 *   • badge "PERFECT ASJ STUDENT" (syarat: VIP + keduanya 100%) MUSTAHIL
 *     tercapai — bukan sulit diraih, tapi secara matematis tidak mungkin.
 *
 * Berkas ini menggantinya dengan perhitungan dari data yang MEMANG ada di
 * respons: baris `candidates[0]` (mapCandidate) untuk CV Mini, dan objek
 * `bio` (dari attachBerkasBio → `master_database_candidate`) untuk CV Master.
 *
 * KENAPA "TERISI" BUKAN "PANJANG"
 * -------------------------------
 * Progres dihitung sebagai jumlah field yang tidak kosong dibagi jumlah field
 * yang dinilai. Field kosong datang dalam beberapa rasa dari backend — '',
 * '-', 'null', 'undefined' (lihat mapCandidate `toText` + adapter dashboard).
 * Semuanya diperlakukan sama: belum diisi.
 */

/** Nilai yang dianggap "belum diisi" — bentuk-bentuk kosong dari backend. */
const EMPTY = new Set(['', '-', 'null', 'undefined', 'n/a', 'na', '0']);

/** true bila nilai punya isi nyata. */
export function isFilled(v: unknown): boolean {
  const s = String(v ?? '').trim();
  if (!s) return false;
  // Hanya bentuk kosong literal yang ditolak; "0" sebagai nilai nyata masih
  // ditolak untuk field teks seperti tinggi/berat (0 cm tidak bermakna), tapi
  // daftar field di bawah tidak memuat field numerik yang sah bernilai 0.
  return !EMPTY.has(s.toLowerCase());
}

/**
 * Field CV Mini — "data dasar" yang diisi kandidat sendiri lewat modal CV Mini.
 * Nama field = keluaran mapCandidate (backend), bukan nama kolom database.
 * Terverifikasi di netlify/functions/_lib/db/candidates.ts:43-71.
 */
export const CV_MINI_FIELDS: readonly string[] = [
  'gender', 'usia', 'pendidikan', 'jftText', 'sswText', 'tb', 'bb',
] as const;

/**
 * Field CV Master — biodata lengkap, dibaca dari objek `bio` yang dilampirkan
 * attachBerkasBio dari `master_database_candidate`.
 * Kunci = kunci pendek BIO_COLUMNS (netlify/functions/_lib/db/berkas.ts:44-56)
 * yang punya kolom nyata; field tanpa kolom (ttlayah/ttlibu/shacou/telppt/
 * webpt/alamatpt) SENGAJA tidak dihitung supaya progres tidak mustahil 100%.
 */
export const CV_MASTER_FIELDS: readonly string[] = [
  'email', 'tmplahir', 'tgllahir', 'alamat', 'ayah', 'pasport', 'coe',
  'kotapasport', 'tglpasport', 'exppasport', 'pt',
] as const;

/** Persentase field terisi (0-100, dibulatkan). Daftar kosong → 0. */
export function filledPercent(values: readonly unknown[]): number {
  if (!values.length) return 0;
  const n = values.filter(isFilled).length;
  return Math.round((n / values.length) * 100);
}

/**
 * Progres CV Mini dari baris kandidat (mapCandidate).
 * Menerima nilai apa pun; kunci yang tidak ada dianggap kosong.
 */
export function computeCvMiniProgress(row: Record<string, unknown> | null | undefined): number {
  if (!row) return 0;
  return filledPercent(CV_MINI_FIELDS.map((k) => row[k]));
}

/**
 * Progres CV Master dari objek `bio` (attachBerkasBio).
 *
 * PENTING: bila `bio` tidak ada sama sekali (kandidat belum punya baris di
 * `master_database_candidate`), hasilnya 0 — dan itu memang benar, bukan bug.
 * Bedanya dengan bug lama: 0 di sini berarti "memang belum ada data", bukan
 * "datanya ada tapi tidak pernah dibaca".
 */
export function computeCvMasterProgress(bio: Record<string, unknown> | null | undefined): number {
  if (!bio || typeof bio !== 'object') return 0;
  return filledPercent(CV_MASTER_FIELDS.map((k) => bio[k]));
}

/** Rata-rata dua progres (dipakai CrownBadge & pesan profil). */
export function computeOverallProgress(mini: number, master: number): number {
  return Math.round((mini + master) / 2);
}
