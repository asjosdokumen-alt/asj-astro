/**
 * sweep-queue.ts — Netlify scheduled function for job queue processing
 *
 * WHY THIS EXISTS
 * ---------------
 * Phase 5 added a Postgres-backed job queue (job_queue table) for async work
 * (AI parsing, bulk WA, document ingestion). The queue needs a periodic sweep
 * to claim and execute pending jobs. This scheduled function runs every 2 minutes
 * via Netlify's scheduled functions feature.
 *
 * HOW IT WORKS
 * ------------
 * 1. Claims up to 5 pending jobs per sweep (SKIP LOCKED)
 * 2. Routes each job by type to the appropriate handler
 * 3. Marks jobs as completed or failed
 * 4. Dead-letters jobs that exceed max_attempts
 *
 * NETLIFY CONFIG (netlify.toml):
 *   [functions."sweep-queue"]
 *     schedule = "@every 2m"
 *
 * HANDLER REGISTRATION:
 *   Each job type maps to a function that receives the payload and executes it.
 *   New job types should be added to the HANDLERS map below.
 */

import {
  claimJob, completeJob, failJob, recordJobResult, cleanupIdempotencyKeys,
} from './_lib/kernel/job-queue';
import { adapt } from './_lib/netlify-adapter.js';
import { log } from './_lib/kernel/log';
// Phase C item 11: this function never goes through a request wrapper, so it
// exports its own metrics. Without this, the one component whose liveness you
// most want to confirm — if the sweep stops, the queue silently fills — would
// export nothing at all. See _lib/metrics-sink.ts sweepMetrics().
import { exportMetrics, sweepMetrics } from './_lib/metrics-sink';
import type { Job } from './_lib/kernel/job-queue';

// ── Job type handlers ─────────────────────────────────────────────────────────
// Each handler receives the job payload and executes the actual work.
// Import from the same contexts the surfaces use.

const NOT_IMPL = { success: false, message: 'Fungsi ini belum diimplementasi di backend rebuild.' };

const HANDLERS: Record<string, (payload: Record<string, unknown>) => Promise<unknown>> = {
  'ai.interview': async (payload) => {
    const { handleProcessAiInterview } = await import('./_lib/ai/chat');
    const p = payload.payload as unknown[];
    const s = payload.sessionToken as string;
    return handleProcessAiInterview(p, s);
  },

  // parseDokumenBiodata no longer enqueues 'ingest.parse' — surfaces/ingest
  // routes it synchronously to the real classify handler (admin AI copilot
  // upload flow, A11 parity). Worker removed to avoid a dead NOT_IMPL path.

  // WA broadcast (kirimTawaranMassal) — surface notify men-queue payload
  // { payload, createdBy }; worker ini yang benar-benar mengirim lewat
  // handleKirimTawaranMassal (parity legacy bulk invite dengan jeda interval
  // antar pesan). Jalur internal=true: sesi admin sudah divalidasi saat
  // enqueue, dan token TIDAK disimpan di payload job (keamanan getJobStatus).
  'wa.broadcast': async (payload) => {
    const { handleKirimTawaranMassal } = await import('./contexts/notifications');
    const inner = payload as { payload?: unknown[]; sessionToken?: string };
    return handleKirimTawaranMassal(inner.payload || [], undefined, { internal: true });
  },

  // Single-message Fonnte send (Phase E row 4). The surface enqueues this only
  // when Fonnte itself is unreachable, so this worker IS the retry. It
  // deliberately does not catch: a throw becomes failJob(), `attempts`
  // increments, and claim_next_job re-claims the job until max_attempts (5,
  // default) before dead-lettering it. Returning a failure object instead would
  // be read as success and mark the message delivered.
  'wa.send': async (payload) => {
    const { handleKirimSatuPesanFonnte } = await import('./contexts/notifications');
    const inner = payload as { wa?: unknown; message?: unknown };
    return handleKirimSatuPesanFonnte([inner.wa, inner.message], undefined, { internal: true });
  },
};

// ── Sweep logic ───────────────────────────────────────────────────────────────

async function processJob(job: Job): Promise<void> {
  const handler = HANDLERS[job.type];
  if (!handler) {
    throw new Error(`No handler registered for job type: ${job.type}`);
  }
  log.info('sweep.processing', { jobId: job.id, type: job.type, attempt: job.attempts });
  const result = await handler(job.payload);
  // A06: simpan hasil handler (mis. rincian per-penerima broadcast WA) ke
  // payload job supaya getJobStatus bisa menampilkan ringkasan akhir ke UI.
  if (result !== undefined) {
    try {
      await recordJobResult(job.id, job.payload, result);
    } catch (err) {
      log.error('sweep.record-result-failed', { jobId: job.id, err: String(err) });
    }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

async function handler() {
  const startTime = Date.now();
  let processed = 0;
  let failed = 0;

  log.info('sweep.start', {});

  // Process up to 5 jobs per sweep
  for (let i = 0; i < 5; i++) {
    const job = await claimJob();
    if (!job) break;

    try {
      await processJob(job);
      await completeJob(job.id);
      processed++;
    } catch (err) {
      await failJob(job.id, err);
      failed++;
    }
  }

  // Cleanup expired idempotency keys (run once per sweep)
  const cleaned = await cleanupIdempotencyKeys();

  const durationMs = Date.now() - startTime;
  log.info('sweep.complete', { processed, failed, cleaned, durationMs });

  // Awaited here, unlike in the request wrappers: a scheduled function returns
  // no body to a user, so the export adding latency costs nothing. It is also
  // the only chance to send it — the instance is frozen the moment this returns.
  // exportMetrics never rejects, so this cannot fail the sweep.
  await exportMetrics(sweepMetrics({ processed, failed, cleaned, durationMs }));

  return {
    statusCode: 200,
    body: JSON.stringify({
      processed,
      failed,
      cleaned,
      durationMs,
    }),
  };
}

// The schedule used to live in netlify.toml as [functions."sweep-queue"].
// Modern Netlify Functions declare it in code instead. SAME cron expression
// as before — a change here is the single easiest way to stop the sweep
// silently, so verify from the logs after deploying.
export const config = { schedule: '*/2 * * * *' };

export default adapt(handler);

