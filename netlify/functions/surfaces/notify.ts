/**
 * surfaces/notify.ts — Notifications surface (WA + FCM)
 *
 * Phase 5: Bulk notifications enqueued as background jobs.
 * Single messages run synchronously if fast; bulk always background.
 */
import { enqueue, handleGetJobStatus } from '../_lib/kernel/job-queue';
import { log } from '../_lib/kernel/log';
import { requireAdmin } from '../contexts/identity';

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
};
