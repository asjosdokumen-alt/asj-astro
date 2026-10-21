/**
 * syncTransport.ts — Client-side caller untuk surface sync (probe/delta/manifest)
 *
 * Ringkas: satu fungsi `syncTransport(table)` yang mengembalikan objek
 * `SyncTransport<T>` yang dipakai oleh `localSync.localFirst()`.
 *
 * Bentuk baris yang dikembalikan adalah BENTUK MENTAH dari server
 * (`decorate` di `sync/service.ts` melewati baris apa adanya untuk tabel
 * `master` dan `forms`, dan `mapJob`/`mapCandidate` untuk `jobs`/`candidates`).
 * Pemanggil yang membutuhkan `Kandidat` atau `Job` menulis pemetaannya
 * sendiri — pemetaan itu BUKAN tanggung jawab transport.
 */
import type { SyncTransport } from './localSync';
import api from './apiClient';

/** Buat transport untuk satu tabel sync.
 *
 *  `full()` sengaja melempar: transport ini hanya untuk delta, dan tarikan
 *  penuh pertama harus menggunakan jalur baca aplikasi yang sudah ada
 *  (`getAppData`, `getCandidatesPage`, …) supaya bentuk baris yang disimpan
 *  di mirror konsisten dengan bentuk yang dirender. Mengimplementasikan
 *  `full()` lewat `syncDelta` berisiko loop tak berujung saat semua baris
 *  berbagi watermark sama (migrasi 017). */
export function syncTransport<T>(
  table: string,
  keyOf: (row: T) => string,
): SyncTransport<T> {
  return {
    table,
    keyOf,
    async probe() {
      return (await api.secure('syncProbe', [], { onSessionInvalid: 'throw' })) as {
        success?: boolean;
        tables?: Record<string, { count: number; watermark: string | null }>;
        error?: string;
      };
    },
    async delta(since: string) {
      return (await api.secure(
        'syncDelta',
        [table, since],
        { onSessionInvalid: 'throw' },
      )) as {
        success?: boolean;
        rows?: unknown[];
        nextSince?: string | null;
        more?: boolean;
        error?: string;
      };
    },
    async manifest() {
      return (await api.secure(
        'syncManifest',
        [table],
        { onSessionInvalid: 'throw' },
      )) as {
        success?: boolean;
        manifest?: Array<{ id: string; updatedAt: string | null }>;
        error?: string;
      };
    },
    async full(): Promise<T[]> {
      throw new Error(
        'syncTransport.full() belum diimplementasikan. ' +
          'Gunakan jalur baca aplikasi untuk tarikan penuh pertama.',
      );
    },
  };
}
