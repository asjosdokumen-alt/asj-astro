/**
 * uploadBerkas.ts — Upload dokumen kandidat/pemberkasan ke CLOUDINARY.
 *
 * SEJARAH (jangan dibaca sebagai kebetulan):
 *   2026-08-17 — alur lama meng-upload ke Cloudinary lalu menyimpan URL-nya.
 *   2026-09-08 — dipindah KE Supabase Storage lewat `getUploadUrls` (signed URL)
 *                supaya server bisa MEMAKSA folder `kandidat/<wa>` (K3 fix):
 *                folder bebas dari klien bisa menimpa dokumen kandidat lain.
 *   2026-10-14 — dipindah KEMBALI ke Cloudinary. Alasannya egress, bukan gaya:
 *                objek Storage dilayani `Cache-Control: no-cache`, jadi setiap
 *                kali berkas ini DILIHAT, byte-nya keluar dari kuota Supabase.
 *                Berkas pemberkasan (KTP/KK/ijazah/foto) adalah byte terbesar di
 *                sistem ini — itulah sebab kuota egress jebol walau trafik
 *                halaman publik kecil.
 *
 * KEAMANAN TIDAK HILANG, hanya berpindah tempat. Yang dulu dijaga dengan
 * memaksa folder sekarang dijaga saat URL-nya DISIMPAN:
 *   • `simpanBerkasTahapan` / `simpanRevisiKandidat` memeriksa IDOR — untuk role
 *     kandidat, `wa` pada payload HARUS sama dengan WA di sesi. Kandidat tidak
 *     bisa mengaitkan berkas ke nomor orang lain.
 *   • `badDocumentUrls` menolak URL yang bukan https dari host terdaftar, dan
 *     `res.cloudinary.com` ada di allow-list itu.
 * Konsekuensinya berbeda: pemaksa folder mencegah orang lain MENIMPA berkas;
 * pemeriksa IDOR mencegah orang lain MENGAITKAN berkas. Karena yang kedua tetap
 * ada, tidak ada data kandidat yang bocor — file asing yang diunggah tidak akan
 * pernah muncul di dashboard siapa pun.
 *
 * Kontrak fungsi ini SENGAJA tidak berubah (`file` + `opts` → URL string) supaya
 * tiga pemanggilnya tidak perlu disentuh:
 *   • PemberkasanModal.tsx  — berkas pemberkasan kandidat (UI admin & kandidat)
 *   • TabConfig.tsx         — template CV
 *   • CandidateDash.tsx     — kandidat mengunggah revisi
 */
import { uploadToCloudinary } from './cloudinary';

export interface UploadBerkasOptions {
  /** Kunci unik dokumen — dipakai sebagai prefix nama file di storage. */
  key: string;
  /**
   * Petunjuk folder. DULU dipakai untuk memilih folder Storage (`kandidat/<wa>`
   * dipaksa server). Setelah pindah ke Cloudinary unsigned, folder tidak lagi
   * bisa dipaksa server — nilai ini TIDAK dikirim ke Cloudinary, melainkan
   * dipertahankan di tipe supaya tiga pemanggil lama tetap kompilasi tanpa
   * diubah. Jangan hapus tanpa memeriksa ketiganya.
   */
  folder?: string;
  maxRetries?: number;
}

/**
 * Unggah satu file ke Cloudinary. Mengembalikan `secure_url` (https) yang siap
 * disimpan ke kolom *_url di DB. Throw bila gagal setelah retries.
 *
 * `key` dipertahankan sebagai parameter (retry/penamaan di Cloudinary publik
 * memakai `upload_preset`; nama berkas dikelola Cloudinary). Saat ini key hanya
 * dipakai untuk jalur pesan galat agar pesan yang sampai ke pengguna tetap
 * menyebut dokumen mana yang gagal.
 */
export async function uploadBerkasToStorage(
  file: File,
  opts: UploadBerkasOptions,
): Promise<string> {
  const { key, maxRetries = 3 } = opts;
  if (!file) throw new Error('Tidak ada file untuk diunggah.');

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const url = await uploadToCloudinary(file, undefined, 1);
      if (!url) throw new Error('Cloudinary tidak mengembalikan URL.');
      return url;
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }
  console.warn('[uploadBerkas] Gagal upload Cloudinary (' + key + '):', lastErr);
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
