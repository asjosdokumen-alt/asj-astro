/**
 * ai/classify — dulu: parse dokumen biodata/CV oleh model (PDF/Excel/Word/CSV/
 * TXT/gambar → Gemini → JSON). **FITURNYA DIHAPUS 2026-10-30** atas keputusan
 * pemilik: *"hapus saja parse ai bikin kuota cepet abis"*.
 *
 * Berkas ini TETAP ADA (bukan dihapus) karena tiga hal masih bergantung padanya:
 * `surfaces/ingest.ts` + entry point `ingest.js` (bentuk deploy), kontrak aksi
 * `parseDokumenBiodata` yang mungkin masih dipanggil klien lama (service worker
 * yang belum memperbarui precache), dan `classify.limits.test.ts` yang menjaga
 * aritmetika batas body platform di bawah.
 *
 * Yang penting: TIDAK ADA satu pun jalur di sini yang mencapai provider model.
 */
import { requireRole } from '../../contexts/identity';

// Batas body fungsi. Netlify Functions berjalan di atas AWS Lambda, yang
// menolak body permintaan sinkron di atas 6 MB — dan penolakan itu terjadi di
// PLATFORM, sebelum handler ini jalan.
const PLATFORM_BODY_LIMIT_BYTES = 6 * 1024 * 1024;

// Batas berkas yang BENAR-BENAR bisa diperiksa kalau fitur ini suatu hari
// dihidupkan lagi. Nilai sebelumnya 8 MiB, dan itu mustahil dieksekusi: klien
// mengirim berkas sebagai base64 DI DALAM body JSON, sehingga 8 MiB menjadi
// ~10,7 MiB — di atas batas 6 MB platform. Aritmetika: base64 = ceil(n/3)*4
// ≈ n * 4/3, jadi n <= 6 MB * 3/4 ≈ 4,5 MiB. Diambil 4 MiB (≈5,59 MB di wire,
// ~89% dari batas) supaya amplop JSON masih muat.
const PARSE_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Kontrak aksi `parseDokumenBiodata` — sekarang MENOLAK tanpa memanggil model.
 *
 * Gerbang admin dipertahankan supaya aksi ini tidak bisa dipakai orang luar
 * untuk menebak-nebak; pesan penolakannya tetap sama untuk semua pemanggil yang
 * lolos gerbang.
 */
async function handleParseDokumenBiodata(payload: unknown, sessionToken: string | undefined) {
  const guard = requireRole(sessionToken, 'admin');
  if (guard.error) return guard.error;
  void payload;
  return {
    success: false,
    code: 'AI_PARSE_REMOVED',
    error:
      'Parse dokumen dengan AI sudah dihapus supaya kuota AI tidak cepat habis. ' +
      'Isi biodata lewat CV AI atau Form Master.',
  };
}

export { PARSE_MAX_BYTES, PLATFORM_BODY_LIMIT_BYTES, handleParseDokumenBiodata };
