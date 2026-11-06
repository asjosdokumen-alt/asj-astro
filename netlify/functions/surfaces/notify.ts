/**
 * surfaces/notify.ts — Notifications surface (WA + FCM)
 *
 * Phase 5: Bulk notifications enqueued as background jobs.
 * Single messages run synchronously if fast; bulk always background.
 */
import { enqueue, handleGetJobStatus } from '../_lib/kernel/job-queue';
import { log } from '../_lib/kernel/log';
import { requireAdmin, isOwnerOrAdmin } from '../contexts/identity';

export const NOTIFY_ACTIONS: Record<string, (payload: unknown[], sessionToken?: string) => Promise<unknown>> = {
  simpanWaTemplate: async (p: unknown[], s?: string) => {
    const notifications = await import('../contexts/notifications');
    return notifications.handleSimpanWaTemplate(p, s);
  },
  hapusWaTemplate: async (p: unknown[], s?: string) => {
    const notifications = await import('../contexts/notifications');
    return notifications.handleHapusWaTemplate(p, s);
  },
  kirimSatuPesanFonnte: async (p: unknown[], s?: string) => {
    const notifications = await import('../contexts/notifications');
    return notifications.handleKirimSatuPesanFonnte(p, s);
  },
  kirimTawaranMassal: async (p: unknown[], s?: string) => {
    // Security fix (review SEDANG/K3): guard admin dieksekusi DI SINI sebelum
    // enqueue — sebelumnya anonim bisa membanjiri job_queue. Token sesi TIDAK
    // ikut disimpan ke payload job (payload job dapat dibaca via getJobStatus
    // dan RPC claim_next_job yang semula di-GRANT ke anon) — cukup identitas
    // pembuat untuk jejak audit; otorisasi eksekusi ditangani worker internal.
    const guard = requireAdmin(s || '');
    if (guard.error) return guard.error;
    const jobId = await enqueue('wa.broadcast', { payload: p, createdBy: guard.token?.wa || 'admin' });
    log.info('notify.background-enqueued', { jobId, createdBy: guard.token?.wa || 'admin' });
    return { success: true, status: 'accepted', jobId, message: 'Pengiriman massal sedang diproses. Gunakan getJobStatus untuk mengecek.' };
  },
  getJobStatus: async (p: unknown[], s?: string) => handleGetJobStatus(p, s),

  // ── Kotak masuk kandidat (2026-11-06) ─────────────────────────────────────
  // Gerbangnya `isOwnerOrAdmin`, BUKAN `tolakKecualiSiswa`: kotak masuk ini
  // milik SEMUA kandidat, sementara `tolakKecualiSiswa` menuntut status siswa
  // ASJ (VIP / kelas LPK). Memakai penjaga itu di sini akan menyembunyikan
  // pemberitahuan dari kandidat biasa — termasuk pemberitahuan bahwa berkasnya
  // ditolak.
  getNotifikasiKandidat: async (p: unknown[], s?: string) => {
    const wa = String(p?.[0] ?? '').trim();
    if (!isOwnerOrAdmin(s, wa)) {
      return { success: false, sessionInvalid: true, message: 'Sesi tidak valid' };
    }
    const { daftarNotifikasi } = await import('../_lib/notifikasi/kotak-masuk');
    return daftarNotifikasi(wa, Number(p?.[1]) || 50);
  },

  tandaiNotifikasiDibaca: async (p: unknown[], s?: string) => {
    const wa = String(p?.[0] ?? '').trim();
    if (!isOwnerOrAdmin(s, wa)) {
      return { success: false, sessionInvalid: true, message: 'Sesi tidak valid' };
    }
    const { tandaiDibaca } = await import('../_lib/notifikasi/kotak-masuk');
    return tandaiDibaca(wa, p?.[1]);
  },

  tandaiSemuaNotifikasiDibaca: async (p: unknown[], s?: string) => {
    const wa = String(p?.[0] ?? '').trim();
    if (!isOwnerOrAdmin(s, wa)) {
      return { success: false, sessionInvalid: true, message: 'Sesi tidak valid' };
    }
    const { tandaiDibaca } = await import('../_lib/notifikasi/kotak-masuk');
    return tandaiDibaca(wa);
  },

  /**
   * Hapus satu pemberitahuan (atau semua yang sudah dibaca bila `id` kosong).
   *
   * Gerbangnya sama dengan dua action di atas: pemilik baris atau admin.
   * Tanpa ini kotak masuk hanya bisa bertambah — kandidat tidak punya cara
   * membersihkan pemberitahuan lama, dan "tandai dibaca" bukan penghapusan.
   */
  hapusNotifikasi: async (p: unknown[], s?: string) => {
    const wa = String(p?.[0] ?? '').trim();
    if (!isOwnerOrAdmin(s, wa)) {
      return { success: false, sessionInvalid: true, message: 'Sesi tidak valid' };
    }
    const { hapusNotifikasi } = await import('../_lib/notifikasi/kotak-masuk');
    return hapusNotifikasi(wa, p?.[1]);
  },

  /**
   * Berapa perangkat ADMIN yang terdaftar untuk push.
   *
   * KENAPA ADA: tombol "Aktifkan notifikasi" di panel bisa menjawab "izin
   * diberikan" padahal tokennya tidak pernah sampai ke server (VAPID kosong,
   * service worker belum aktif, dsb). Tanpa angka ini, admin mengira
   * notifikasinya hidup padahal tidak ada satu perangkat pun yang terdaftar —
   * terukur 2026-11-06: 18 token, nol di antaranya milik admin.
   */
  getStatusNotifikasiAdmin: async (_p: unknown[], s?: string) => {
    const guard = requireAdmin(s || '');
    if (guard.error) return guard.error;
    /* MENGHITUNG perangkat tidak butuh kemampuan MENGIRIM.
       Dulu action ini memanggil `getAdminTokens()` dari `_lib/fcm-helpers`, yang
       menyeret `fcm-server` ke entry `notify.js`. Query dan aturannya sama
       (`_lib/fcm-token-rules.ts`), tanpa dependensi pengiriman. */
    const { supabaseJson } = await import('../_lib/db/client');
    const { isAdminWa } = await import('../_lib/fcm-token-rules');
    const rows = await supabaseJson('GET', 'fcm_tokens', {
      query: { select: 'token,wa', limit: 200 },
    });
    const perangkat = Array.isArray(rows)
      ? rows.filter((r: Record<string, unknown>) => isAdminWa(r.wa) && r.token).length
      : 0;
    return { success: true, perangkat };
  },
};
