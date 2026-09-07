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
import { authStore } from '../store/authReactive';
import { getEndpoint } from './apiEndpoint';

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
  const sessionToken = authStore.get().sessionToken || '';
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(getEndpoint('getUploadUrls'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getUploadUrls',
          payload: [{ folder, files: [{ key, prefix: key, ext }] }],
          sessionToken,
        }),
      });
      const data = await res.json();
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