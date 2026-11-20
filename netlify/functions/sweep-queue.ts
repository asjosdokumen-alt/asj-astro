/**
 * sweep-queue.ts — Netlify scheduled function for job queue processing
 *
 * WHY THIS EXISTS
 * ---------------
 * Phase 5 added a Postgres-backed job queue (job_queue table) for async work
 * (AI parsing, bulk WA, document ingestion). The queue needs a periodic sweep
 * to claim and execute pending jobs. This scheduled function runs every 15
 * minutes via Netlify's scheduled functions feature.
 *
 * HOW IT WORKS
 * ------------
 * 1. Claims up to 5 pending jobs per sweep (SKIP LOCKED)
 * 2. Routes each job by type to the appropriate handler
 * 3. Marks jobs as completed or failed
 * 4. Dead-letters jobs that exceed max_attempts
 *
 * GERBANG ANTREAN (`JOB_SIGNAL_MODE`)
 * ----------------------------------
 * Sweep kosong tetap mengirim dua request Neon (claim + DELETE cleanup) yang
 * membangunkan compute instance. `_lib/kernel/job-signal.ts` menaruh satu kunci
 * skalar di Upstash Redis ("instant berikutnya antrean perlu dilihat") dan sweep
 * membacanya lebih dulu. Tiga mode, default `off`:
 *
 *   off    — jalur hari ini, byte-for-byte. Gerbang TIDAK dibaca sama sekali.
 *   shadow — jalur hari ini dijalankan penuh, LALU gerbang dibaca dan dicatat
 *            (`sweep.signal.verdict` + `falseIdle`). Ini bukti paritas: satu
 *            `falseIdle` = gerbang salah = jangan naikkan ke `on`.
 *   on     — gerbang dulu: 'idle' ⇒ nol request Neon; 'unknown' ⇒ jalur hari
 *            ini; 'due' ⇒ loop claim, lalu `next_job_due()` + `settle()`.
 *            Cleanup dan rekonsiliasi berjalan di balik lease 6 jam.
 *
 * Ledger tidak berubah: `job_queue` dan `claim_next_job()` tidak disentuh, jadi
 * `attempts`, dead-letter dan idempotensi tetap persis sama di ketiga mode.
 *
 * SCHEDULE:
 *   Declared in code below (`export const config`), not in netlify.toml.
 *   It is 15 minutes, not 2 — see the quota note at the export.
 *
 * HANDLER REGISTRATION:
 *   Each job type maps to a function that receives the payload and executes it.
 *   New job types should be added to the HANDLERS map below.
 */

import {
  claimJob, completeJob, failJob, recordJobResult, cleanupIdempotencyKeys, nextDueAt,
} from './_lib/kernel/job-queue';
import { jobSignal } from './_lib/kernel/job-signal';
import type { Verdict } from './_lib/kernel/job-signal';
import { env } from './_lib/env';
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

const _NOT_IMPL = { success: false, message: 'Fungsi ini belum diimplementasi di backend rebuild.' };

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

/** Mode gerbang antrean. Default `off` = perilaku sebelum gerbang ada. */
type SignalMode = 'off' | 'shadow' | 'on';

/**
 * Baca kill switch `JOB_SIGNAL_MODE`.
 *
 * Sengaja dibaca ulang di sini, bukan lewat `jobSignal()`: mode `off` wajib
 * TIDAK MEMBACA GERBANG SAMA SEKALI (bukan "membaca lalu mengabaikan"), jadi
 * cabangnya harus diputuskan sebelum port disentuh. Nilai tak dikenal
 * diperlakukan sebagai `off` — aksara salah ketik tidak boleh menyalakan jalur
 * yang belum tervalidasi.
 *
 * Normalisasi ini sengaja identik dengan yang dipakai `jobSignal()` di
 * `_lib/kernel/job-signal.ts`; keduanya harus menjawab mode yang sama untuk env
 * yang sama.
 */
function readSignalMode(): SignalMode {
  const raw = (env('JOB_SIGNAL_MODE') || 'off').trim().toLowerCase();
  return raw === 'on' || raw === 'shadow' ? raw : 'off';
}

/**
 * Klaim dan jalankan sampai 5 job. Ini loop yang SAMA dengan sebelumnya —
 * dipakai oleh ketiga mode supaya tidak ada dua salinan yang bisa menyimpang.
 */
async function claimLoop(): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
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
  return { processed, failed };
}

async function handler() {
  const startTime = Date.now();
  const mode = readSignalMode();
  const now = Date.now();

  let processed = 0;
  let failed = 0;
  let cleaned = 0;
  // `null` = gerbang TIDAK DIBACA (mode `off`). Bukan 'unknown': 'unknown'
  // adalah pembacaan gerbang yang gagal, dan mencampur keduanya membuat
  // `sweep.gate.unknown` melaporkan 100 % selama jendela bayangan 7 hari —
  // dashboard yang dibangun di atasnya jadi derau, bukan sinyal.
  let verdict: Verdict | null = null;
  let reconcile = false;
  let falseIdle = false;
  // Terlihat di `sweep.complete`: apakah sweep ini MEMBACA Neon karena gerbang
  // (bukan karena rekonsiliasi). Rekonsiliasi memaksa baca tanpa mengubah
  // `verdict`.
  let mustRead = false;

  log.info('sweep.start', { mode });

  if (mode === 'off') {
    // ── JALUR HARI INI, BYTE-FOR-BYTE ──────────────────────────────────────
    // Port gerbang TIDAK dibuat dan TIDAK dibaca di cabang ini — bukan
    // "dibaca lalu diabaikan". `cleanupIdempotencyKeys()` tetap tiap sweep.
    const r = await claimLoop();
    processed = r.processed;
    failed = r.failed;
    cleaned = await cleanupIdempotencyKeys();
  } else if (mode === 'shadow') {
    // ── BUKTI PARITAS ──────────────────────────────────────────────────────
    // Jalur hari ini dijalankan SEPENUHNYA (claim + cleanup tanpa syarat), lalu
    // gerbang dibaca dan dicatat apa yang AKAN dilakukannya. `falseIdle` adalah
    // inti bukti itu: gerbang menyatakan 'idle' padahal ada job ter-claim.
    // Satu saja bernilai true ⇒ gerbang salah ⇒ mode `on` jangan diaktifkan.
    const r = await claimLoop();
    processed = r.processed;
    failed = r.failed;
    cleaned = await cleanupIdempotencyKeys();

    const signal = jobSignal();
    verdict = await signal.peek(now);
    const actualClaimed = processed + failed;
    falseIdle = verdict === 'idle' && actualClaimed > 0;
    log.info('sweep.signal.verdict', {
      verdict,
      actualClaimed,
      wouldSkip: verdict === 'idle',
      falseIdle,
    });
  } else {
    // ── MODE 'on': GERBANG DULU ────────────────────────────────────────────
    // Satu handle untuk satu pass: `settle()` memakai nilai mentah yang dibaca
    // `peek()` pada instance yang sama.
    const signal = jobSignal();
    // Rekonsiliasi: sekali per 6 jam, satu sweep DIPAKSA membaca Neon walau
    // gerbang akan bilang 'idle'. Ini jaring pengaman untuk kasus "Redis hidup
    // tetapi satu EVAL gagal" — tanpa ini, satu `announce()` yang hilang bisa
    // menunda job sampai berhari-hari.
    reconcile = await signal.lease('reconcile');
    // Gerbang SELALU dibaca: nilai mentahnya adalah operand CAS `settle()`, dan
    // tanpa itu kunci yang hilang tidak akan pernah dibangun ulang.
    const gateVerdict = await signal.peek(now);
    // `verdict` adalah nilai gerbang yang SEBENARNYA, tidak pernah ditimpa oleh
    // rekonsiliasi. Lease 6 jam pada cron 15 menit berarti 4 dari 96 sweep
    // (4.17 %), jadi melabelinya 'unknown' membuat gate G2 (≤ 1 %) mustahil
    // lulus dan MENYEMBUNYIKAN nilai gerbang asli tepat saat insiden.
    verdict = gateVerdict;

    // Rekonsiliasi menjadi boolean tersendiri yang hanya memaksa pembacaan.
    mustRead = reconcile || gateVerdict !== 'idle';

    if (!mustRead) {
      // Nol request Neon: tidak ada claim, tidak ada cleanup. Inilah sweep
      // kosong yang berbiaya dua-tiga perintah Redis saja.
      log.info('sweep.signal.idle', { reconcile });
    } else {
      const r = await claimLoop();
      processed = r.processed;
      failed = r.failed;

      // Satu RPC; predikatnya identik dengan claim_next_job() (061).
      const due = await nextDueAt();
      // CAS ketat: kalau `enqueue` menurunkan gerbang di tengah pass,
      // `settle()` menolak menulis dan nilai yang lebih kecil menang.
      //
      // Operandnya `observed` APA ADANYA — termasuk `null` ("kunci harus
      // absen"), yang justru jalur bangun-ulang setelah eviction/restart.
      // Menggantinya dengan `now` membuat CAS tidak pernah cocok dan gerbang
      // terjebak 'unknown' selamanya.
      const settled = await signal.settle(signal.observed, due);
      if (!settled) {
        log.info('sweep.signal.settle-skipped', { verdict: gateVerdict, due });
      }

      // Cleanup di balik lease 6 jam: 4 DELETE/hari, bukan 96. DILEWATI saat
      // gerbang 'unknown' (Redis sedang bermasalah): kita sudah membayar
      // request Neon di jalur itu, dan menahan cleanup hanya akan membuat
      // `idempotency_keys` tumbuh tanpa batas. Jadi Redis mati = cleanup
      // berjalan seperti hari ini.
      if (gateVerdict === 'unknown' || (await signal.lease('cleanup'))) {
        cleaned = await cleanupIdempotencyKeys();
      }
    }
  }

  const durationMs = Date.now() - startTime;
  log.info('sweep.complete', {
    mode, processed, failed, cleaned, durationMs, verdict, reconcile, mustRead,
  });

  // Awaited here, unlike in the request wrappers: a scheduled function returns
  // no body to a user, so the export adding latency costs nothing. It is also
  // the only chance to send it — the instance is frozen the moment this returns.
  // exportMetrics never rejects, so this cannot fail the sweep.
  //
  // Blok tambahan gerbang HANYA dikirim bila gerbang benar-benar dibaca
  // (`verdict !== null`). Mode `off` karena itu mengirim counter yang PERSIS
  // sama dengan sebelum fitur ini ada: tanpa `sweep.gate.*`, tanpa
  // `sweep.reconcile`.
  await exportMetrics(sweepMetrics(
    { processed, failed, cleaned, durationMs },
    verdict === null ? undefined : { verdict, falseIdle, reconcile },
  ));

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
//
// QUOTA (2026-11-18): this used to be '*/2 * * * *'. Neon suspends a compute
// instance after 5 minutes idle, so a 2-minute cron resets that timer forever
// and the instance never scales to zero — 24/7 at 0.25 CU ≈ 6 CU-hrs/day, which
// burned the 100 CU-hr monthly allowance in ~17 days and PAUSED the project
// (every data read then returned HTTP 402). The DUTY CYCLE is what costs, not
// the interval: at a 5-minute suspend window even '*/7' would still be 71 %
// awake. 15 minutes puts this function at 33 %. Do not narrow it back toward
// '*/2' without checking the compute meter.
export const config = { schedule: '*/15 * * * *' };

export default adapt(handler);

