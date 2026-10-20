/**
 * surfaces/sync.ts — Sync surface (admin)
 *
 * Actions: syncProbe, syncDelta, syncManifest
 *
 * Tiga aksi untuk store lokal-first: probe murah untuk memutuskan, delta untuk
 * menarik yang berubah, manifest untuk mendeteksi penghapusan. Semua
 * admin-only karena delta membaca SELURUH isi tabel — bukan baris satu WA.
 */
import * as sync from '../contexts/sync';

export const SYNC_ACTIONS: Record<string, (payload: unknown[], sessionToken?: string) => Promise<unknown>> = {
  syncProbe: (p, s) => sync.handleSyncProbe(p, s),
  syncDelta: (p, s) => sync.handleSyncDelta(p, s),
  syncManifest: (p, s) => sync.handleSyncManifest(p, s),
};
