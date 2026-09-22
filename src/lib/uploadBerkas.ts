/**
 * uploadBerkas.ts — Upload dokumen pemberkasan ke Supabase Storage
 *
 * Pengganti uploadToCloudinary untuk dokumen kandidat: alur UI lama meng-upload
 * ke Cloudinary lalu menyimpan URL Cloudinary ke DB. Jalur ini memakai
 * getUploadUrls (files surface) yang MEMAKSA folder `kandidat/<wa>` dari sesi
 * (K3 fix) — folder dari klien tidak pernah dipakai untuk role kandidat.
 *
 * Alur: getUploadUrls → signed URL → PUT file → publicUrl disimpan ke DB oleh
 * pemanggil (simpanBerkasTahapan / simpanKandidatDanUpload).
 */
import api from './apiClient';

export interface UploadBerkasOptions {
  /** Kunci unik dokumen — dipakai sebagai prefix nama file di storage. */
  key: string;
  /** Petunjuk folder. Untuk role kandidat selalu ditimpa server → kandidat/<wa>. */
  folder?: string;
  maxRetries?: number;
}

/**
 * Upload satu file pemberkasan ke storage. Mengembalikan publicUrl (https)
 * yang siap disimpan ke kolom *_url di DB. Throw bila gagal setelah retries.
 */
export async function uploadBerkasToStorage(
  file: File,
  opts: UploadBerkasOptions,
): Promise<string> {
  const { key, folder = 'kandidat', maxRetries = 3 } = opts;
  const ext =
    (file.name.split('.').pop() || 'bin')
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase() || 'bin';
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // `silent: true` — fungsi ini mencoba ULANG sampai 3 kali, jadi toast dari
      // klien akan berbunyi sekali per percobaan untuk satu kegagalan yang sama.
      // Pemanggilnya yang menampilkan pesan akhir; di sini kita hanya melempar.
      const data = (await api.secure(
        'getUploadUrls',
        [{ folder, files: [{ key, prefix: key, ext }] }],
        { onSessionInvalid: 'throw', silent: true },
      )) as {
        success?: boolean;
        error?: string;
        message?: string;
        // `publicUrl` is what this function RETURNS (line below), so leaving it
        // out of the shape is not cosmetic: the ratchet caught it as
        // `TS2339: Property 'publicUrl' does not exist` on a file that was clean.
        urls?: Record<string, { signedUrl?: string; publicUrl?: string }>;
      };
      const entry = data && data.urls && data.urls[key];
      if (!data || data.success !== true || !entry || !entry.signedUrl) {
        throw new Error((data && (data.error || data.message)) || 'Gagal membuat link upload.');
      }
      const put = await fetch(entry.signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });
      if (!put.ok) {
        throw new Error('Upload ke storage gagal (HTTP ' + put.status + ')');
      }
      return String(entry.publicUrl || '');
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }
  console.warn('[uploadBerkas] Gagal upload storage:', lastErr);
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}