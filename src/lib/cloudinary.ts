/**
 * cloudinary.ts — Direct unsigned upload ke Cloudinary
 * Ported from legacy/js/cloudinary.ts
 * Cloud: ybzzbw9i, Preset: asjportal
 */

const CLOUDINARY_CLOUD_NAME = import.meta.env.PUBLIC_CLOUDINARY_CLOUD_NAME || '' || 'ybzzbw9i';
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.PUBLIC_CLOUDINARY_UPLOAD_PRESET || '' || 'asjportal';

export function cloudinaryEndpoint(): string {
  return 'https://api.cloudinary.com/v1_1/' + encodeURIComponent(CLOUDINARY_CLOUD_NAME) + '/upload';
}

/**
 * Nama berkas yang bisa dibaca manusia: `<nama>_<jenis>_<waktu>`.
 *
 * KENAPA (pemilik 2026-11-03): *"rapikan penamaan file nya sehingga jelas.
 * contoh agus khoci_ktp … jadi ketika upload file yg sama bisa menimpa file yg
 * lama"*. Menimpa TIDAK mungkin di jalur unsigned — Cloudinary menolak
 * `overwrite` untuk unggahan unsigned ("Cannot set overwrite to true in
 * unsigned presets", terlihat di dashboard), dan unggahan kedua dengan
 * public_id sama dijawab 200 dengan aset LAMA. Jadi keputusan pemilik:
 * **unggah ulang = URL baru**.
 *
 * Karena itu ada akhiran waktu: setiap unggahan menghasilkan public_id unik,
 * sehingga URL-nya berganti dan yang lama tidak pernah dipakai lagi. Tanpa
 * akhiran waktu, unggahan kedua akan "berhasil" tetapi mengembalikan berkas
 * lama — persis kegagalan senyap yang harus dihindari.
 */
export function buatPublicId(nama: string, jenis: string, waktu = Date.now()): string {
  const slug = (s: string) =>
    String(s || '')
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  const n = slug(nama) || 'kandidat';
  const j = slug(jenis) || 'berkas';
  return `${n}_${j}_${waktu}`;
}

/**
 * Upload file ke Cloudinary (unsigned, retry 3x dengan backoff).
 * Returns secure_url (HTTPS).
 *
 * `publicId` (opsional) menentukan nama berkas di Cloudinary. Tanpa itu
 * Cloudinary mengarang dari nama berkas unggahan — terukur menghasilkan
 * `nama_TG630ASJcv_dpgghx.xlsx` yang tidak bisa dibaca maupun diurutkan.
 */
/**
 * Perkecil foto SEBELUM diunggah.
 *
 * KENAPA (2026-11-05): tidak ada satu pun jalur unggah yang mengecilkan foto.
 * Foto kamera HP 3–8 MB naik apa adanya, jadi di jaringan seluler kandidat —
 * audiens utama portal ini — satu unggah bisa puluhan detik, dan Cloudinary
 * menyimpan byte yang tidak pernah dipakai: CV hanya butuh wajah, bukan 4000 px.
 *
 * Batasnya sengaja konservatif supaya tidak merusak apa pun:
 *   • hanya JPEG/HEIC/WebP (PNG bisa punya transparansi, SVG bukan raster, GIF
 *     bisa beranimasi — ketiganya dilewati);
 *   • hanya berkas > 500 KB (foto kecil tidak perlu diutak-atik);
 *   • sisi terpanjang maksimal 1600 px, kualitas 0.82 — masih tajam untuk cetak
 *     CV ukuran passport;
 *   • kalau hasilnya TIDAK lebih kecil, atau canvas gagal (browser lama, HEIC
 *     yang tidak bisa didekode), berkas ASLI yang dipakai. Kompresi tidak boleh
 *     pernah menggagalkan unggahan.
 */
const MAKS_SISI_PIKSEL = 1600;
const AMBANG_KOMPRES_BYTE = 500 * 1024;

export async function kompresGambar(file: File): Promise<File> {
  try {
    if (!file || !String(file.type).startsWith('image/')) return file;
    if (/png|svg|gif/i.test(file.type)) return file;
    if (file.size <= AMBANG_KOMPRES_BYTE) return file;
    if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return file;

    const bitmap = await createImageBitmap(file);
    const skala = Math.min(1, MAKS_SISI_PIKSEL / Math.max(bitmap.width, bitmap.height));
    const lebar = Math.max(1, Math.round(bitmap.width * skala));
    const tinggi = Math.max(1, Math.round(bitmap.height * skala));
    const kanvas = document.createElement('canvas');
    kanvas.width = lebar;
    kanvas.height = tinggi;
    const ctx = kanvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, lebar, tinggi);
    const blob = await new Promise<Blob | null>((selesai) => kanvas.toBlob(selesai, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

export async function uploadToCloudinary(
  file: File,
  opts?: { uploadPreset?: string; endpoint?: string; publicId?: string },
  maxRetries = 3
): Promise<string> {
  if (!file) throw new Error('Tidak ada file untuk diupload ke Cloudinary.');
  // Setiap unggahan gambar lewat sini, jadi satu titik ini mengecilkan foto
  // untuk SEMUA jalur (CV Mini, CV AI, pemberkasan, lamaran, admin).
  file = await kompresGambar(file);
  const preset = opts?.uploadPreset || CLOUDINARY_UPLOAD_PRESET;
  const endpoint = opts?.endpoint || cloudinaryEndpoint();

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', preset);
    if (opts?.publicId) fd.append('public_id', opts.publicId);

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 30000) : null;

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: fd,
        signal: controller?.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!res.ok) {
        let detail = '';
        try {
          const j = await res.json();
          detail = j?.error?.message || '';
        } catch { /* not JSON */ }

        const errMsg = 'Upload Cloudinary gagal (HTTP ' + res.status + ')' + (detail ? ': ' + detail : '');

        // 4xx = client error → fatal
        if (res.status >= 400 && res.status < 500) throw new Error(errMsg);

        // 5xx = server error → retry
        if (res.status >= 500) {
          lastError = new Error(errMsg);
          if (attempt < maxRetries - 1) {
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
            continue;
          }
        }
      }

      const data = await res.json();
      if (!data?.secure_url) throw new Error('Cloudinary tidak mengembalikan secure_url.');
      return data.secure_url;
    } catch (e: any) {
      if (timeoutId) clearTimeout(timeoutId);

      if (e.name === 'AbortError' || e.message?.includes('network')) {
        lastError = new Error('Upload Cloudinary timeout: ' + e.message);
        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
          continue;
        }
      } else {
        throw e;
      }
    }
  }

  throw lastError || new Error('Upload Cloudinary gagal setelah ' + maxRetries + ' percobaan');
}

/**
 * UploadCollectionError — gagal meng-upload salah satu file dalam uploadMany.
 * key = file-key di map (caller memakai label-nya utk toast, kontrak lama).
 */
export class UploadCollectionError extends Error {
  readonly key: string;
  constructor(key: string, message: string) {
    super(message);
    this.name = 'UploadCollectionError';
    this.key = key;
  }
}

/**
 * Upload banyak file sekaligus: iterate map (file-key → payload-key), upload
 * tiap file yang ADA ke Cloudinary, kumpulkan URL dgn payload-key. File yang
 * tidak ada dilewati; error pertama membatalkan sisa upload dan melempar
 * UploadCollectionError (message = pesan asli) — caller memutuskan toast/path
 * error (kontrak per form dipertahankan byte-identical).
 *
 * Map dipegang terpusat di src/lib/documentColumns.ts.
 */
export async function uploadMany(
  files: Record<string, File | null | undefined>,
  map: Record<string, string>,
  upload: (file: File) => Promise<string> = uploadToCloudinary,
  opsi?: { nama?: string }
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  for (const [stateKey, payloadKey] of Object.entries(map)) {
    const file = files[stateKey];
    if (!file) continue;
    /* `public_id` hanya dipasang pada uploader BAWAAN. Uploader yang di-inject
       (tes, atau pemanggil lain) tetap dipanggil `(file)` saja — kontraknya
       sudah dipakai di banyak tempat dan tidak perlu ikut berubah hanya karena
       penamaan. */
    const pakaiDefault = upload === uploadToCloudinary && opsi?.nama;
    const fn = pakaiDefault
      ? (f: File) => uploadToCloudinary(f, { publicId: buatPublicId(String(opsi?.nama), stateKey) })
      : upload;
    try {
      urls[payloadKey] = await fn(file);
    } catch (e: any) {
      throw new UploadCollectionError(stateKey, (e && e.message) || String(e));
    }
  }
  return urls;
}
