/**
 * contexts/notifications/service.ts — Business logic for WA templates + Fonnte messaging
 *
 * Other contexts and surfaces import ONLY from index.ts.
 */
import { env } from '../../_lib/env';
import { safeError } from '../../_lib/kernel/errors';
import { enqueue } from '../../_lib/kernel/job-queue';
import { log } from '../../_lib/kernel/log';
import { requireRole } from '../identity';
import { normalizeWa, upsertWaTemplate, deleteWaTemplate, getWaTemplates } from './repository';

/** Attach the HTTP status to a thrown error so callers can classify it. */
function withStatus(err: Error, status: number): Error {
  (err as Error & { status?: number }).status = status;
  return err;
}

/**
 * Should a failed send be retried, or will the identical call fail again?
 *
 * Retry:   no HTTP status (the request never completed — DNS/TLS/timeout/
 *          socket), 429 (rate limited), and any 5xx (Fonnte's own fault).
 * Skip:    4xx. A malformed number or a rejected token is permanent, and the
 *          queue would burn all five attempts re-sending the same bad message.
 *
 * Exported for the tests: the classification is the whole point of the retry
 * path, so it is asserted directly rather than only through a send.
 */
export function isRetryableFonnteFailure(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === 'number') return status === 429 || status >= 500;
  return true;
}

async function fonnteSend(target: string, message: string): Promise<any> {
  const token = env('FONNTE_TOKEN') || env('FONNTE_API_KEY');
  // No credentials is a configuration fault, not a transient one. Tag it 401
  // so `isRetryableFonnteFailure` refuses to park the message in the retry
  // queue, where it could only fail again — five times, every two minutes.
  if (!token) throw withStatus(new Error('FONNTE_TOKEN belum dikonfigurasi'), 401);
  const params = new URLSearchParams();
  params.set('target', String(target));
  params.set('message', String(message));
  const res = await fetch('https://api.fonnte.com/send', {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw withStatus(new Error('Fonnte HTTP ' + res.status + ' ' + text.slice(0, 200)), res.status);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function applyTemplatePlaceholders(text: string, nama: string, jobCode: string, linkGrup: string): string {
  return String(text || '')
    .replace(/\{nama\}/g, nama)
    .replace(/<<NAMA>>/gi, nama)
    .replace(/\{job_code\}/g, jobCode)
    .replace(/\{job\}/g, jobCode)
    .replace(/<<JOB>>/gi, jobCode)
    .replace(/\{link_grup\}/g, linkGrup)
    .replace(/\{link\}/g, linkGrup)
    .replace(/<<LINK>>/gi, linkGrup);
}

export function buildPesanTawaranMassal(
  variants: string[],
  templateIsi: string | null,
  nama: string,
  jobCode: string,
  linkGrup: string,
  index: number,
): string {
  if (variants.length) {
    return applyTemplatePlaceholders(variants[index % variants.length], nama, jobCode, linkGrup);
  }
  if (templateIsi) {
    return applyTemplatePlaceholders(templateIsi, nama, jobCode, linkGrup);
  }
  return 'Halo ' + nama + '! Anda terpilih untuk Lowongan ' + jobCode + '. Silakan bergabung ke grup resmi kami: ' + linkGrup;
}

export async function handleSimpanWaTemplate(payload: any[], sessionToken?: string) {
  const guard = requireRole(sessionToken || '', 'admin');
  if (guard.error) return guard.error;
  const id = String((payload && payload[0]) || '');
  const nama = String((payload && payload[1]) || '').trim();
  const isi = String((payload && payload[2]) || '');
  if (!nama) return { success: false, error: 'Nama template wajib diisi.' };
  try {
    await upsertWaTemplate(
      { nama, isi, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      id || undefined,
    );
    return { success: true };
  } catch (e: any) {
    return { success: false, error: safeError('Gagal simpan template.', e) };
  }
}

export async function handleHapusWaTemplate(payload: any[], sessionToken?: string) {
  const guard = requireRole(sessionToken || '', 'admin');
  if (guard.error) return guard.error;
  const id = String((payload && payload[0]) || '');
  if (!id) return { success: false, error: 'ID template tidak ditemukan.' };
  try {
    await deleteWaTemplate(id);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: safeError('Gagal hapus template.', e) };
  }
}

/**
 * Send ONE WhatsApp message.
 *
 * Phase E, row 4 of the degradation matrix. This used to call Fonnte directly
 * and throw: a Fonnte outage lost the message outright — the operator saw an
 * error toast, and nothing retried. The docs already promised "enqueue to
 * job_queue on failure", so the code now does that.
 *
 * Two paths, deliberately different:
 *
 *   HTTP (default)  — on a *transient* failure, park the message in job_queue
 *                     (`wa.send`) and hand the caller the job id to poll. The
 *                     sweep retries it every 2 minutes up to max_attempts (5).
 *                     A *permanent* failure (4xx) still returns the error: it
 *                     would fail identically on every retry.
 *   Worker (internal) — called by sweep-queue with a job already claimed. It
 *                     does NOT catch: the throw becomes failJob(), attempts
 *                     increments, and claim_next_job re-claims it. Catching
 *                     here would mark a failed send as done, and enqueuing here
 *                     would loop forever.
 *
 * Delivery is at-least-once, the same guarantee `wa.broadcast` already has: if
 * Fonnte accepted the message but the response was lost, the retry sends it
 * twice. That is the deliberate trade — a duplicate beats a silent loss for a
 * job offer.
 */
export async function handleKirimSatuPesanFonnte(
  payload: any[],
  sessionToken?: string,
  opts?: { internal?: boolean },
) {
  let actor = 'admin';
  if (!opts?.internal) {
    const guard = requireRole(sessionToken || '', 'admin');
    if (guard.error) return guard.error;
    actor = guard.token?.wa || 'admin';
  }
  const wa = String((payload && payload[0]) || '');
  const message = String((payload && payload[1]) || '');
  if (!wa || !message) return { success: false, error: 'Nomor WA dan pesan wajib diisi.' };
  const target = normalizeWa(wa);

  // Worker path: let the error propagate so the queue owns the retry.
  if (opts?.internal) {
    const result = await fonnteSend(target, message);
    return { success: true, result };
  }

  try {
    const result = await fonnteSend(target, message);
    return { success: true, result };
  } catch (e: any) {
    if (isRetryableFonnteFailure(e)) {
      try {
        const jobId = await enqueue('wa.send', { wa: target, message, createdBy: actor });
        log.info('fonnte.single-enqueued', { jobId });
        return {
          success: true,
          status: 'accepted',
          queued: true,
          jobId,
          message: 'Fonnte sedang tidak bisa dihubungi. Pesan masuk antrean dan akan dikirim otomatis.',
        };
      } catch (enqueueErr) {
        // Usually the same outage that broke the send (both are HTTP calls to
        // the outside). Fall through to the plain failure — never tell the
        // caller a message was accepted when it is not in the queue.
        log.error('fonnte.enqueue-failed', { err: String(enqueueErr) });
      }
    }
    return { success: false, error: safeError('Gagal kirim pesan.', e) };
  }
}

export async function handleKirimTawaranMassal(
  payload: any[],
  sessionToken?: string,
  opts?: { internal?: boolean },
) {
  // internal=true dipakai sweep-queue worker (kode server terpercaya yang
  // sudah meng-claim job dari antrean); sesi admin sudah divalidasi di
  // surfaces/notify.ts saat enqueue, jadi token tidak perlu disimpan di
  // payload job. Jalur HTTP langsung tetap wajib sesi admin.
  if (!opts?.internal) {
    const guard = requireRole(sessionToken || '', 'admin');
    if (guard.error) return guard.error;
  }
  const d = (payload && payload[0]) || {};
  const cands = Array.isArray(d.candidates) ? d.candidates : [];
  if (cands.length === 0) return { success: false, error: 'Tidak ada kandidat.' };
  const jobCode = String(d.jobCode || '');
  const linkGrup = String(d.linkGrup || '');
  const interval = Math.max(Number(d.interval) || 5, 1);
  const results: any[] = [];
  const variants = String(d.customMessage || '')
    .split(/^---\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    let templateIsi: string | null = null;
    try {
      const rows = await getWaTemplates();
      const tpl = rows.find(
        (r: any) =>
          String(r.nama || '').toLowerCase().includes('grup') ||
          String(r.nama || '').toLowerCase().includes('undang'),
      );
      if (tpl) templateIsi = String(tpl.isi || '');
    } catch { /* template opsional */ }

    for (let i = 0; i < cands.length; i += 1) {
      const c = cands[i];
      const wa = normalizeWa(String(c.wa || ''));
      const nama = String(c.nama || 'Kandidat');
      const message = buildPesanTawaranMassal(variants, templateIsi, nama, jobCode, linkGrup, i);
      try {
        await fonnteSend(wa, message);
        results.push({ wa: c.wa, nama, success: true });
      } catch (e: any) {
        results.push({ wa: c.wa, nama, success: false, error: safeError('Gagal kirim.', e) });
      }
      if (interval > 0) await new Promise((r) => setTimeout(r, interval * 1000));
    }
    return { success: true, results };
  } catch (e: any) {
    return { success: false, error: safeError('Gagal kirim massal.', e), results };
  }
}
