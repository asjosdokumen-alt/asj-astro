/**
 * adminData.ts — SATU payload `getAppData('admin')` untuk semua tab admin.
 *
 * Masalah yang diselesaikan (laporan pemilik 2026-10-22: *"setiap pindah tab
 * muat ulang semuanya ya, ini kok selalu ada jeda loadingnya … jadi boros
 * egress dong?"*):
 *
 * Enam tab admin — Kelola, DbJob, Jadwal, Agenda, Pelamar, Mail — semuanya
 * membaca potongan dari payload yang SAMA, dan masing-masing memanggil
 * `getAppData('admin')` sendiri saat mount. Payload itu berisi seluruh
 * kandidat + form inbox + jadwal + tugas + template WA (terukur 107 KB), jadi
 * berpindah tab = satu tarikan penuh lagi, lengkap dengan skeleton, walaupun
 * datanya belum berubah sedikit pun.
 *
 * `apiClient` memang punya cache baca, tapi TTL-nya 30 detik dan hasilnya
 * asinkron: tab tetap mulai dari daftar kosong, memasang skeleton, lalu
 * terisi satu tick kemudian. Itu yang terasa sebagai "jeda loading".
 *
 * Di sini cache-nya:
 *   - berumur 5 menit (bukan 30 detik) — data admin berubah karena AKSI ADMIN,
 *     dan setiap aksi yang mengubahnya memanggil `invalidateAdminData()` atau
 *     `loadAdminData({ force: true })`;
 *   - bisa dibaca SINKRON lewat `adminDataPeek()`, sehingga tab yang punya
 *     cache langsung merender isinya tanpa skeleton sama sekali;
 *   - menggabungkan permintaan yang berjalan (`inflight`), jadi lima tab yang
 *     mount beruntun tidak menghasilkan lima tarikan.
 *
 * ⚠ Yang TIDAK di-cache: kegagalan. Kalau permintaan gagal, cache dibiarkan
 * kosong supaya percobaan berikutnya benar-benar mencoba lagi.
 */
import api from '../lib/apiClient';

/** Umur cache. 5 menit: cukup untuk berpindah-pindah tab, cukup pendek untuk
 *  tidak menyajikan data yang basi setelah admin menutup panel sebentar. */
const TTL_MS = 5 * 60_000;

type Payload = Record<string, unknown>;

let cache: Payload | null = null;
let cachedAt = 0;
let inflight: Promise<Payload> | null = null;

/** Isi cache yang masih segar, atau `null`. Sinkron — dipakai untuk render awal. */
export function adminDataPeek<T = Payload>(): T | null {
  if (!cache) return null;
  if (Date.now() - cachedAt > TTL_MS) return null;
  return cache as T;
}

/** Buang cache. Dipanggil setelah aksi yang mengubah data admin. */
export function invalidateAdminData(): void {
  cache = null;
  cachedAt = 0;
}

/**
 * Payload admin, dari cache bila masih segar.
 *
 * `force: true` = "saya baru mengubah data, ambil yang baru" — dipakai tombol
 * Refresh dan setiap handler yang menulis.
 */
export function loadAdminData<T = Payload>(opts: { force?: boolean } = {}): Promise<T> {
  const hit = adminDataPeek<T>();
  if (hit && !opts.force) return Promise.resolve(hit);
  if (inflight) return inflight as Promise<T>;

  inflight = api
    .secure('getAppData', ['admin'], { onSessionInvalid: 'throw', silent: true, ...(opts.force ? { force: true } : {}) })
    .then((d) => {
      // Jawaban yang JELAS gagal tidak di-cache: menyimpannya berarti lima
      // menit penuh semua tab menampilkan daftar kosong tanpa mencoba lagi.
      const payload = (d || {}) as Payload;
      if (payload.success !== false) {
        cache = payload;
        cachedAt = Date.now();
      }
      return payload;
    })
    .finally(() => { inflight = null; });

  return inflight as Promise<T>;
}
