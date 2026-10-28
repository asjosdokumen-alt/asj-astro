/**
 * supabaseHost.ts — "apakah alamat ini bisa mengautentikasi siapa pun?"
 *
 * Modul ini sengaja TANPA impor. Predikat ini dibutuhkan di dua tempat yang
 * berbeda beratnya:
 *
 *   · `supabase.ts` — untuk memutuskan `isSupabaseConfigured()`;
 *   · `apiClient.ts` — untuk memutuskan APAKAH klien Supabase (212,7 KB mentah /
 *     56 KB gzip) perlu diunduh sama sekali.
 *
 * Kalau predikatnya tinggal di `supabase.ts`, pemanggil kedua harus mengimpor
 * modul berat itu hanya untuk membaca satu fungsi — dan itu persis pemborosan
 * yang ingin dihindari. Sebelum modul ini ada, `getFreshToken()` mengunduh
 * seluruh klien Supabase untuk setiap pengguna yang login, lalu
 * `isSupabaseConfigured()` menjawab `false` dan chunk itu tidak dipakai.
 */

/**
 * True bila `url` adalah endpoint Neon Data API — host yang melayani PostgREST
 * dan **tidak** punya server auth.
 *
 * Neon menerbitkan Data API di `<endpoint>.apirest.<region>.aws.neon.tech/<db>`.
 * Tidak ada GoTrue di belakangnya, jadi `<url>/auth/v1/*` tidak bisa menjawab.
 * Ini satu-satunya bentuk host yang bisa dipastikan offline; sisanya memakai
 * asumsi pra-cutover (URL Supabase = proyek Supabase, termasuk domain kustom
 * yang mem-front GoTrue).
 */
export function isNeonDataApiHost(url: string): boolean {
  const raw = String(url || '').trim();
  if (!raw) return false;
  let host: string;
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === 'neon.tech' || host.endsWith('.neon.tech');
}
