/**
 * kernel/job-queue.ts — Durable job queue backed by Postgres
 *
 * WHY THIS EXISTS
 * ---------------
 * Long-running work (AI parsing, bulk WA, document ingestion) currently
 * executes synchronously within the 10 s Netlify function budget. This
 * module provides at-least-once job execution via Postgres SKIP LOCKED:
 *
 *   1. Enqueue: INSERT INTO job_queue (type, payload, idempotency_key)
 *   2. Claim:   UPDATE ... FOR UPDATE SKIP LOCKED LIMIT 1
 *   3. Execute: route by job.type, then complete or fail
 *   4. Dead-letter: after max_attempts, status → 'dead'
 *
 * USAGE
 * -----
 *   import { enqueue, claimJob, completeJob, failJob } from '../kernel/job-queue';
 *   const jobId = await enqueue('ai.parse', { wa, docUrl });
 *   // In a background function or cron sweep:
 *   const job = await claimJob();  // null if nothing pending
 *   if (job) {
 *     try { await processJob(job); await completeJob(job.id); }
 *     catch (e) { await failJob(job.id, e); }
 *   }
 */

import { supabaseJson } from '../db/client';
import { verifyToken } from '../session';
import { log } from './log';
import { Errors } from './errors';

const TABLE = 'job_queue';

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  idempotency_key: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_until: string | null;
  last_error: string | null;
  created_at: string;
}

/**
 * Enqueue a new job. Returns the job ID.
 * If idempotencyKey is provided and a job with that key already exists,
 * returns the existing job ID (dedup).
 */
export async function enqueue(
  type: string,
  payload: Record<string, unknown>,
  opts: { idempotencyKey?: string; runAfter?: Date } = {},
): Promise<string> {
  const row: Record<string, unknown> = {
    type,
    payload,
    status: 'pending',
    run_after: opts.runAfter?.toISOString() ?? new Date().toISOString(),
  };
  if (opts.idempotencyKey) {
    row.idempotency_key = opts.idempotencyKey;
  }

  const rows = await supabaseJson('POST', TABLE, {
    query: { on_conflict: 'idempotency_key' },
    body: row,
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
  });

  const inserted = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  const jobId = inserted?.id;

  if (!jobId) {
    throw new Error(`Failed to enqueue job type=${type}`);
  }

  log.info('job.enqueued', { jobId, type });
  return jobId as string;
}

/**
 * Claim the next pending job (SKIP LOCKED).
 * Returns null if no jobs are ready.
 *
 * B5 fix: Use atomic RPC function instead of non-atomic SELECT + PATCH.
 * The claim_next_job function atomically updates and returns the claimed job.
 */
export async function claimJob(): Promise<Job | null> {
  try {
    // B5 fix: Use atomic RPC function for job claiming
    const result = await supabaseJson('POST', 'rpc/claim_next_job', {
      body: {},
    });

    if (!result || !Array.isArray(result) || result.length === 0) {
      return null;
    }

    const job = result[0] as Job;
    log.info('job.claimed', { jobId: job.id, type: job.type, attempt: job.attempts });
    return job;
  } catch (err) {
    log.error('job.claim-failed', { err: String(err) });
    return null;
  }
}

/**
 * Mark a job as completed.
 */
export async function completeJob(jobId: string): Promise<void> {
  try {
    await supabaseJson('PATCH', TABLE, {
      query: { id: 'eq.' + jobId },
      body: { status: 'done', locked_until: null, last_error: null },
      headers: { Prefer: 'return=minimal' },
    });
    log.info('job.completed', { jobId });
  } catch (err) {
    log.error('job.complete-failed', { jobId, err: String(err) });
  }
}

/**
 * Simpan hasil eksekusi handler ke payload job (A06 parity: undangan kelas /
 * broadcast massal di-queue, jadi UI butuh ringkasan akhir per penerima).
 * completeJob hanya menandai status; tanpa ini getJobStatus tidak pernah
 * bisa menampilkan hasil kirim. Best-effort: kegagalan simpan tidak menggagalkan
 * penyelesaian job.
 */
export async function recordJobResult(
  jobId: string,
  existingPayload: Record<string, unknown>,
  result: unknown,
): Promise<void> {
  try {
    await supabaseJson('PATCH', TABLE, {
      query: { id: 'eq.' + jobId },
      body: {
        payload: { ...(existingPayload || {}), result },
        last_error: null,
      },
      headers: { Prefer: 'return=minimal' },
    });
    log.info('job.result-recorded', { jobId });
  } catch (err) {
    log.error('job.result-save-failed', { jobId, err: String(err) });
  }
}

/**
 * Mark a job as failed. If max_attempts exceeded, auto-promotes to 'dead'.
 */
export async function failJob(jobId: string, error: unknown): Promise<void> {
  const errMsg = String(error).slice(0, 500);
  log.error('job.failed', { jobId, err: errMsg });

  // The claim function handles dead-letter logic on next claim attempt.
  // Here we just set status='failed' and store the error.
  try {
    await supabaseJson('PATCH', TABLE, {
      query: { id: 'eq.' + jobId },
      body: {
        status: 'failed',
        locked_until: null,
        last_error: errMsg,
      },
      headers: { Prefer: 'return=minimal' },
    });
  } catch (err) {
    log.error('job.fail-write-error', { jobId, err: String(err) });
  }
}

/**
 * Get job status by ID (for client polling).
 */
export async function getJob(jobId: string): Promise<Job | null> {
  try {
    const rows = await supabaseJson('GET', TABLE, {
      query: { select: '*', id: 'eq.' + jobId, limit: '1' },
    });
    if (Array.isArray(rows) && rows.length > 0) return rows[0] as Job;
    return null;
  } catch {
    return null;
  }
}

/**
 * Cleanup expired idempotency keys (call from cron).
 * Deletes keys older than 24 hours.
 */
export async function cleanupIdempotencyKeys(): Promise<number> {
  const cutoff = new Date(Date.now() - 86_400_000).toISOString();
  try {
    // P4 fix: Batch delete with a single DELETE WHERE instead of N+1 sequential
    // DELETE calls (was up to 100 HTTP round trips, now 1).
    const result = await supabaseJson('DELETE', 'idempotency_keys', {
      query: { created_at: 'lt.' + cutoff },
      headers: { Prefer: 'return=minimal' },
    });
    // PostgREST returns the deleted rows, so count them.
    return Array.isArray(result) ? result.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Sweep the job queue: claim and process pending jobs.
 * Returns the number of jobs processed.
 */
export async function sweepQueue(processFn: (job: Job) => Promise<void>): Promise<number> {
  let processed = 0;
  // Process up to 5 jobs per sweep
  for (let i = 0; i < 5; i++) {
    const job = await claimJob();
    if (!job) break;
    try {
      await processFn(job);
      await completeJob(job.id);
      processed++;
    } catch (err) {
      await failJob(job.id, err);
    }
  }
  return processed;
}

/** getJobStatus action — poll a background job (client-facing shape).
 * Moved from the retired _lib/actions-job-status dispatcher module
 * (2026-09-04): the read belongs with the queue it polls. The 202-returning
 * surfaces (ai / ingest / notify) tell clients to poll via getJobStatus.
 *   const result = await handleGetJobStatus([jobId], sessionToken);
 *   // { success: true, status, jobId, type, attempts, ... , result? }
 * Security fix (review K3): wajib sesi valid, dan hanya pembuat job (payload
 * createdBy) atau admin yang boleh melihat. `result` hanya mengekspos
 * payload.result (ringkasan per-penerima dari recordJobResult) — payload
 * mentah tidak pernah dikirim (baris legacy masih menyimpan sessionToken). */
export async function handleGetJobStatus(
  payload: unknown[],
  sessionToken?: string,
): Promise<unknown> {
  const [jobId] = payload as [string];

  if (!jobId || typeof jobId !== 'string') {
    throw Errors.validation('jobId harus diisi');
  }

  const t = verifyToken(sessionToken);
  if (!t || t.kind === 'refresh') {
    throw Errors.unauthorized('Sesi tidak valid');
  }

  log.info('job-status.start', { jobId, role: t.role });

  const job = await getJob(jobId);

  if (!job) {
    return {
      success: true,
      status: 'not_found',
      message: 'Job tidak ditemukan',
    };
  }

  const createdBy = typeof (job.payload as Record<string, unknown>)?.createdBy === 'string'
    ? String((job.payload as Record<string, unknown>).createdBy)
    : null;
  const isCreator = createdBy !== null && createdBy === (t.wa || '');
  if (t.role !== 'admin' && !isCreator) {
    throw Errors.forbidden('Job ini bukan milik sesi Anda');
  }

  return {
    success: true,
    status: job.status,
    jobId: job.id,
    type: job.type,
    attempts: job.attempts,
    maxAttempts: job.max_attempts,
    lastError: job.last_error,
    createdAt: job.created_at,
    // Result is in the payload if status is 'done' — expose only the recorded
    // result, never the raw payload (which may contain tokens/secrets).
    result: job.status === 'done'
      ? (job.payload as Record<string, unknown> | null)?.result
      : undefined,
  };
}
