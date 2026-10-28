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
 *
 * ⚠️ JANGAN cukup memeriksa akhiran `.neon.tech`. Neon punya host lain di domain
 * yang sama — `<endpoint>.neonauth.<region>.aws.neon.tech` adalah **Neon Auth**,
 * yang justru PUNYA server auth. Diverifikasi 2026-10-29 dari
 * `JWK_URL_PROVIDER` di kredensial Neon: host itu berakhiran `.neon.tech` dan
 * bukan Data API. Yang membedakan hanya segmen `.apirest.`.
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
  return host.endsWith('.neon.tech') && host.includes('.apirest.');
}
