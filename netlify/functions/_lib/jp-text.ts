/**
 * jp-text.ts — satu aturan untuk kolom berakhiran `_jp`.
 *
 * MASALAH YANG DISELESAIKAN (terukur 2026-11-05, kandidat REIHAN):
 *
 *   ai_data_json.pendidikan = [
 *     { nama_sekolah: "", nama_sekolah_jp: "amanah sakura japan",
 *       jurusan: "", jurusan_jp: "pemasaran", ... }
 *   ]
 *
 * Model mengembalikan nilai INDONESIA di kunci `_jp`, dan kunci Indonesia-nya
 * kosong. Karena `buildMasterNested` membaca kolom lebih dulu lalu jatuh ke
 * `ai_data_json`, form menampilkan nama sekolah di kotak "Nama Sekolah (JP)"
 * dan kotak "(ID)" kosong — persis keluhan pemilik: "bukan hanya status, semua
 * di riwayat pendidikan rusak".
 *
 * Dua hal yang TIDAK boleh dilakukan:
 *   1. membuang nilainya — itu data kandidat, satu-satunya salinan;
 *   2. menaruhnya di kolom Jepang — CV akan mencetak kata Indonesia di 学歴.
 *
 * Jadi aturannya: nilai `_jp` yang tidak mengandung huruf Jepang DIPINDAHKAN
 * ke sisi Indonesia-nya (hanya bila sisi itu kosong), lalu kuncinya dibersihkan.
 * Nilai Indonesia yang sudah ada tidak pernah ditimpa.
 */

/** Hiragana, katakana, kanji, atau half-width katakana. */
export function adaHurufJepang(v: unknown): boolean {
  return /[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9f]/.test(String(v ?? ''));
}

/**
 * Pasangan kunci Jepang → kunci Indonesia untuk baris repeater.
 *
 * Beberapa kunci punya ejaan berbeda antara klien dan `buildMasterNested`
 * (`nama_sekolah_jp` vs `sekolah_jp`, `nama_perusahaan_jp` vs `perusahaan_jp`),
 * dan keduanya hidup berdampingan di dalam satu baris hasil merge. Karena itu
 * daftar ini memuat SEMUA ejaan yang beredar, bukan satu.
 */
const PASANGAN: Array<[jp: string, id: string[]]> = [
  ['nama_sekolah_jp', ['nama_sekolah', 'sekolah']],
  ['sekolah_jp', ['sekolah', 'nama_sekolah']],
  ['jurusan_jp', ['jurusan', 'jurusan_id']],
  ['nama_perusahaan_jp', ['nama_perusahaan', 'perusahaan']],
  ['perusahaan_jp', ['perusahaan', 'nama_perusahaan']],
  ['jabatan_jp', ['jabatan', 'jabatan_id']],
  ['hubungan_jp', ['hubungan', 'hubungan_id']],
  ['pekerjaan_jp', ['pekerjaan', 'pekerjaan_id']],
  ['jenis_jp', ['jenis']],
  ['bidang_jp', ['bidang']],
  ['catatan_jp', ['catatan']],
];

const kosong = (v: unknown) => String(v ?? '').trim() === '' || String(v ?? '').trim() === '-';

/** Perbaiki SATU baris di tempat. Mengembalikan true bila ada yang berubah. */
export function rapikanBarisJp(row: Record<string, unknown>): boolean {
  if (!row || typeof row !== 'object') return false;
  let berubah = false;
  for (const [jpKey, idKeys] of PASANGAN) {
    const v = row[jpKey];
    if (v === undefined || v === null) continue;
    const teks = String(v).trim();
    if (!teks) continue;
    if (adaHurufJepang(teks)) continue;
    // Bukan Jepang: pindahkan ke sisi Indonesia yang masih kosong.
    // SEMUA ejaan diisi, bukan hanya yang pertama: `buildMasterNested` menulis
    // `sekolah` sedangkan form CV AI membaca `nama_sekolah` (lewat
    // `ROW_KEYS`), dan keduanya hidup di baris yang sama setelah merge. Mengisi
    // satu saja membuat nilai itu hilang di salah satu pembaca.
    for (const k of idKeys) {
      if (kosong(row[k])) {
        row[k] = teks;
        berubah = true;
      }
    }
    // Apapun hasilnya, kolom `_jp` tidak boleh menyimpan teks Latin: lebih baik
    // kosong (bisa diterjemahkan ulang) daripada tercetak di CV Jepang.
    delete row[jpKey];
    berubah = true;
  }
  /* Nama keluarga memakai kunci `katakana` tanpa akhiran `_jp`. */
  const kata = row.katakana;
  if (typeof kata === 'string' && kata.trim() && !adaHurufJepang(kata)) {
    if (kosong(row.nama)) row.nama = kata.trim();
    delete row.katakana;
    berubah = true;
  }
  return berubah;
}

/** Terapkan ke array baris (pendidikan/pekerjaan/keluarga). Tidak pernah throw. */
export function rapikanBarisJpArray<T>(rows: unknown): T[] {
  if (!Array.isArray(rows)) return [];
  for (const r of rows) {
    if (r && typeof r === 'object' && !Array.isArray(r)) rapikanBarisJp(r as Record<string, unknown>);
  }
  return rows as T[];
}
