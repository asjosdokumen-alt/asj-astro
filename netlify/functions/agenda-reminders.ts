/**
 * agenda-reminders.ts — Netlify scheduled function for agenda reminders
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `checkAndSendAgendaReminders` was a live, admin-guarded surface action with
 * **no caller**: no UI button reached it and no cron triggered it. The handler
 * was correct — it just never ran. This is the trigger.
 *
 * (The underlying repository bug that made it a no-op even when invoked —
 * `getActiveSchedules()` destructuring `{ rows }` from a helper that resolves
 * the array directly — was fixed on 2026-09-13. So until this file existed the
 * feature was doubly dead; now only the data is missing, not the machinery.)
 *
 * WHY A CRON AND NOT A UI BUTTON
 * ------------------------------
 * The reminder windows are time-based, not user-initiated:
 *
 *   h7  6–8 days before  ·  h1  20–28 hours before  ·  h0  0–60 minutes before
 *
 * A button would only fire when an admin happened to remember. The whole point
 * of the h0 "starts in N minutes" push is that it goes out when a human is not
 * looking at the dashboard.
 *
 * ── WHY EVERY 10 MINUTES ────────────────────────────────────────────────────
 * The narrowest window is h0 (0–60 min, i.e. 60 minutes wide). The sweep must be
 * strictly narrower than that or a schedule could be entered and exited between
 * two runs and never fire. 10 min gives 6 attempts per window — enough that a
 * single missed run (cold start, deploy) does not lose the reminder — while
 * costing 144 invocations/day against a feature that sends at most 3 pushes per
 * schedule.
 *
 * It does NOT need to be as tight as sweep-queue's two-minute interval: that
 * exists to keep a *queue* from filling up, where latency is user-visible. Here
 * the h7/h1/h0 bands are measured in hours, so minutes of jitter are irrelevant.
 * (Note the cron expression in that file had to stay out of this comment: the
 * two characters that end a block comment appear inside it, and writing them
 * here silently terminated the comment and broke the bundle. It failed loudly
 * under zisi, but it is the kind of thing worth not repeating.)
 *
 * ── WHY THIS DOES NOT GO THROUGH THE HTTP SURFACE ───────────────────────────
 * A scheduled function has no session, and `checkAndSendAgendaReminders` is
 * admin-guarded over HTTP. Calling the surface would therefore return
 * `{ sessionInvalid: true }` — a silent no-op that looks like a working cron in
 * the logs. Instead this file imports the CONTEXT directly and passes
 * `{ internal: true }`, the same trusted-server convention sweep-queue uses for
 * `wa.broadcast` / `wa.send`. The HTTP guard is untouched: an external caller
 * still cannot reach the unguarded path, because the surface passes no opts.
 *
 * HANDLER REGISTRATION
 * --------------------
 * The schedule is declared in code (`export const config`) per the modern
 * Netlify Functions contract — NOT in netlify.toml. If reminders ever stop
 * arriving, check that export first: a schedule that moves without being
 * verified is the quietest way to break this.
 */

import { adapt } from './_lib/netlify-adapter.js';
import { log } from './_lib/kernel/log';
// Like sweep-queue, this function never goes through a request wrapper, so it
// exports its own metrics. Without this there is no signal at all that the cron
// stopped running — the failure mode is "reminders silently never arrive",
// which is indistinguishable from "no schedules exist" in the logs.
import { exportMetrics } from './_lib/metrics-sink';
import type { MetricsPayload } from './_lib/metrics-sink';

/**
 * Run one reminder pass.
 *
 * Deliberately does NOT catch: a throw here should surface as a failed
 * invocation in the Netlify function log, which is the only alert channel this
 * feature currently has. Swallowing it would produce a green cron that sends
 * nothing.
 */
async function handler() {
  const startTime = Date.now();
  log.info('agenda-reminders.start', {});

  // Imported inside the handler rather than at module scope: this is the only
  // consumer, and the scheduling context pulls in FCM + the Supabase client,
  // which would otherwise be loaded on every cold start of a function that may
  // have nothing to do.
  const { handleCheckAndSendAgendaReminders } = await import('./contexts/scheduling');

  const result = (await handleCheckAndSendAgendaReminders(undefined, {
    internal: true,
  })) as { success?: boolean; sent?: number; errors?: number; checked?: number; error?: string };

  const durationMs = Date.now() - startTime;
  // `sent` counts send *batches*, not messages — see sendToWaList in
  // contexts/scheduling/service.ts. Named accordingly so a dashboard does not
  // read it as "N people were notified".
  const checked = Number(result?.checked ?? 0);
  const sent = Number(result?.sent ?? 0);
  const errors = Number(result?.errors ?? 0);

  if (result?.success === false) {
    log.error('agenda-reminders.failed', { err: result.error, durationMs });
  } else {
    log.info('agenda-reminders.complete', { checked, sent, errors, durationMs });
  }

  // Awaited here, unlike in the request wrappers: a scheduled function returns
  // no body to a user, so the export costs nothing, and the instance is frozen
  // the moment this returns. exportMetrics never rejects, so this cannot fail
  // the run.
  await exportMetrics(agendaReminderMetrics({ checked, sent, errors, durationMs }));

  return {
    statusCode: result?.success === false ? 500 : 200,
    body: JSON.stringify({ checked, sent, errors, durationMs }),
  };
}

/**
 * Liveness + outcome signal for the cron run.
 *
 * Namespaced `agenda.*`, matching the `sweep.*` convention in metrics-sink so a
 * receiver can key on one pattern for both scheduled functions. `duration_ms` is
 * a gauge for the same reason sweep's is: the value is only meaningful per run.
 */
function agendaReminderMetrics(fields: {
  checked: number;
  sent: number;
  errors: number;
  durationMs: number;
}): MetricsPayload {
  return {
    counters: {
      'agenda.checked': fields.checked,
      'agenda.sent': fields.sent,
      'agenda.errors': fields.errors,
    },
    histograms: {},
    gauges: { 'agenda.duration_ms': fields.durationMs },
  };
}

// Every 10 minutes. See the header for why this is narrower than the h0 window
// (60 min) and looser than sweep-queue's */2. Changing this line is the single
// easiest way to stop reminders silently — verify from the logs after deploying.
export const config = { schedule: '*/10 * * * *' };

export default adapt(handler);
