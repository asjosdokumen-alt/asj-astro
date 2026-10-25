/**
 * db/identity-sync.ts — SATU daftar field identitas yang dipakai bersama oleh
 * `master_database_candidate` (sumber utama) dan `database_candidate` (baris
 * operasional yang dibaca panel admin & CV Mini).
 *
 * KENAPA BERKAS INI ADA (keluhan pemilik 2026-10-25)
 * --------------------------------------------------
 * *"cv mini yg sekarang … TT TB ada yg belum ke isi padahal sudah isi cv ai itu
 * lengkap"*. Betul, dan sebabnya bukan AI-nya: dua jalur simpan menulis ke
 * TABEL yang sama tetapi dengan DAFTAR KOLOM yang berbeda dan ditulis tangan di
 * masing-masing tempat.
 *
 *   handleSubmitMasterForm → database_candidate: gender, usia, tb, bb, nik,
 *                            email, tempat_lahir, tgl_lahir, alamat_lengkap
 *   handleSubmitDataAsj    → database_candidate: nama, gender, usia,
 *                            tempat_lahir, tgl_lahir, no_wa   ← tb/bb TIDAK
 *
 * `mapCandidate` membaca `tb`/`bb` dari `database_candidate`, dan `CvMiniModal`
 * mem-prefill dari baris itu. Jadi kandidat yang mengisi tinggi/berat di CV AI
 * menyimpan angkanya dengan benar di `master_database_candidate.tb` (kolomnya
 * memang ditulis lewat `masterColumnsFromAi`) dan tetap melihat CV Mini kosong.
 * Itu bukan "data tertahan menunggu approve" — datanya sudah masuk, hanya tidak
 * disalin ke baris yang dibaca layar.
 *
 * Karena itu daftarnya TIDAK boleh lagi hidup di dua tempat: satu tabel di sini,
 * dua pembangun patch murni di bawah, dan setiap penulis memakainya.
 *
 * ATURAN
 *  1. Hanya nilai TERISI yang menghasilkan kunci. Mengosongkan field di satu
 *     form tidak boleh menghapus nilai yang benar di tabel lain.
 *  2. Nama kolom berbeda ejaan di dua tabel ditulis eksplisit (`no_paspor` ↔
 *     `no_pasport`) — itu satu-satunya pasangan yang berbeda.
 *  3. `pendidikan` SENGAJA hanya satu arah dan dijaga: `database_candidate`
 *     menyimpan TIGA bentuk sekaligus (terukur 2026-10-25: `"SMK"` ×17, `"-"`
 *     ×3, dan JSON `[{"tingkat":"SMA"}]` ×5), sedangkan
 *     `master.pendidikan_1_tingkat` juga memuat nilai non-jenjang (`"SMA/SMK"`,
 *     `"小学校"`, `"LPK BAHASA"`). Menyalin dua arah akan menulis JSON ke kolom
 *     jenjang. Jadi: hanya nilai jenjang yang dikenal yang disalin ke
 *     `database_candidate`, dan arah sebaliknya tidak dilakukan.
 *  4. Berkas (`pas_photo`, `jft`, `ssw`, `file_cv`) ikut disalin karena panel
 *     admin menampilkan thumbnail dari baris kandidat.
 */

/** Jenjang yang boleh masuk `database_candidate.pendidikan`. */
export const PENDIDIKAN_LEVELS: ReadonlySet<string> = new Set(['SD', 'SMP', 'SMA', 'SMK', 'MA', 'D3', 'S1']);

/** `[kolom master, kolom kandidat]` — identitas yang WAJIB sama di dua tabel. */
export const MASTER_TO_CANDIDATE_IDENTITY: ReadonlyArray<readonly [string, string]> = [
  ['nama_lengkap', 'nama_lengkap'],
  ['nik', 'nik'],
  ['gender', 'gender'],
  ['usia', 'usia'],
  ['tb', 'tb'],
  ['bb', 'bb'],
  ['email', 'email'],
  ['tempat_lahir', 'tempat_lahir'],
  ['tgl_lahir', 'tgl_lahir'],
  ['alamat_lengkap', 'alamat_lengkap'],
  // Satu-satunya pasangan yang ejaannya beda: tabel master memakai `no_paspor`
  // (tanpa t), tabel kandidat `no_pasport`. Ditulis eksplisit supaya tidak
  // "diperbaiki" orang lain menjadi salah satu ejaan dan diam-diam berhenti
  // menyalin.
  ['no_paspor', 'no_pasport'],
] as const;

/** Berkas: `[kolom master, kolom kandidat]`. */
export const MASTER_TO_CANDIDATE_FILES: ReadonlyArray<readonly [string, string]> = [
  ['pas_photo', 'pas_photo'],
  ['jft_url', 'jft'],
  ['ssw_url', 'ssw'],
  ['file_cv', 'file_cv'],
] as const;

/** Nilai teks yang layak disalin (bukan undefined/null/kosong/'-'). */
function usable(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '' || s === '-') return null;
  return s;
}

/**
 * Body PATCH untuk `database_candidate` dari body master yang BARU ditulis.
 *
 * `master` boleh berupa body parsial: kunci yang tidak ada tidak menghasilkan
 * apa pun, jadi pemanggil yang hanya menulis sebagian kolom tidak menghapus
 * sisanya.
 */
export function candidateIdentityPatch(master: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [from, to] of MASTER_TO_CANDIDATE_IDENTITY) {
    const v = usable(master[from]);
    if (v !== null) out[to] = v;
  }
  for (const [from, to] of MASTER_TO_CANDIDATE_FILES) {
    const v = usable(master[from]);
    if (v !== null) out[to] = v;
  }
  const jenjang = usable(master.pendidikan_1_tingkat);
  if (jenjang !== null && PENDIDIKAN_LEVELS.has(jenjang.toUpperCase())) {
    out.pendidikan = jenjang.toUpperCase();
  }
  return out;
}

/**
 * Kebalikannya: body PATCH untuk `master_database_candidate` dari baris kandidat
 * yang baru diedit admin.
 *
 * Dipakai `updateKandidatSuper` — sebelum ini panel admin menulis HANYA baris
 * operasional, sehingga koreksi tinggi/berat/nama oleh admin tidak pernah
 * sampai ke sumber utama (dan berkas CV/rirekisho tetap memakai angka lama).
 *
 * `pendidikan` tidak dibalik — lihat aturan 3 di header.
 */
export function masterIdentityPatch(candidate: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [masterCol, candCol] of MASTER_TO_CANDIDATE_IDENTITY) {
    const v = usable(candidate[candCol]);
    if (v === null) continue;
    // Master menyimpan nama dalam huruf besar di semua jalur lain
    // (`handleSubmitMasterForm`: `String(d.nama).trim().toUpperCase()`). Satu
    // ejaan saja, kalau tidak nama yang diedit admin akan berbeda bentuk dari
    // nama yang diisi kandidat.
    out[masterCol] = candCol === 'nama_lengkap' ? v.toUpperCase() : v;
  }
  // HANYA dua kolom berkas yang artinya sama di dua tabel (URL Cloudinary).
  // `database_candidate.jft`/`ssw` bisa berisi TEKS sertifikasi, sedangkan
  // `master.jft_url`/`ssw_url` adalah URL — menyalinnya akan menaruh teks di
  // kolom URL. `pas_photo` dan `file_cv` selalu URL di kedua sisi.
  for (const col of ['pas_photo', 'file_cv']) {
    const v = usable(candidate[col]);
    if (v !== null) out[col] = v;
  }
  return out;
}
