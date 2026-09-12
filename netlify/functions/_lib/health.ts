/**
 * health.ts — Dependency health aggregation (Phase C item 12)
 *
 * WHY THIS EXISTS
 * ---------------
 * Phase C's gate is: "an injected PostgREST failure produces an alert within
 * 2 minutes, and the health endpoint explains it." The alert half is a sink
 * (item 11); this module is the explain half.
 *
 * Without it, an on-call engineer paged at 03:00 has three log streams and no
 * answer to the only question that matters: WHICH dependency is sick, and how
 * long has it been sick? Everything needed to answer that already exists
 * in-process (kernel/resilience.ts breakers, admission.ts occupancy,
 * job_queue depth) — it was simply never assembled into one object.
 *
 * ── WHAT THIS CAN AND CANNOT SEE ─────────────────────────────────────────────
 * The honest limitation, stated up front because it changes how you read the
 * output: this endpoint is served by ONE function instance. Netlify is
 * stateless and runs many instances; there is no fleet-wide registry and
 * Netlify exposes no concurrency or instance-count API.
 *
 * So:
 *   - `instance` fields describe the instance that answered THIS request.
 *     They are a SAMPLE, not a census.
 *   - `shared` fields (PostgREST reachability, job_queue depth) are global,
 *     because they come from the database rather than from memory.
 *
 * The practical consequence: "breaker closed on this instance" does NOT prove
 * the fleet is healthy. A breaker only opens on an instance that actually saw
 * the failures. That is why the database-derived checks carry more weight than
 * the in-process ones — and it is the same reason metrics must go to a sink
 * (item 11) rather than being read back from here.
 *
 * ── COST ─────────────────────────────────────────────────────────────────────
 * The in-process half is free (no I/O). The shared half costs real PostgREST
 * round-trips, so it is budgeted and additive: a diagnostic that would itself
 * tip the load is worse than no diagnostic at all.
 */

import { breaker } from './kernel/resilience';
import { bulkhead } from './kernel/resilience';
import { snapshot as admissionSnapshot } from './kernel/admission';
import { supabaseJson } from './db/client';
import { metrics } from './kernel/metrics';
import { remainingMs } from './kernel/deadline';
import { log } from './kernel/log';

export type Overall = 'ok' | 'degraded' | 'down';

export interface BreakerView {
  state: string;
  failures: number;
  openForMs: number;
}

export interface DependencyHealth {
  name: string;
  /** In-process state on the instance that answered this request. */
  breaker: BreakerView;
  /** Concurrency slots held on this instance, and the per-dependency cap. */
  inflight: number;
  maxConcurrent: number;
  /**
   * Configured breaker thresholds, so the reader can tell "3 failures out of 3"
   * (about to open) from "3 out of 10" (noise). Reporting state without its
   * threshold forces the reader to go and read source during an incident.
   */
  threshold: number;
  windowMs: number;
  coolDownMs: number;
}

export interface HealthReport {
  status: Overall;
  /** Why the status is what it is — never leave the reader to infer it. */
  reasons: string[];
  /** Levels that fired, so an alert rule and a human read the same taxonomy. */
  levels: Array<'ok' | 'warn' | 'fail'>;
  timestamp: string;
  instance: {
    /** Per-dependency breaker + bulkhead view. Always lists every configured dep. */
    dependencies: DependencyHealth[];
    breakersOpen: number;
    bulkheadSaturated: boolean;
    /** Admission-controller occupancy: how close this instance was to shedding. */
    admission: {
      inflight: Record<string, number>;
      inflightTotal: number;
      caps: Record<string, number>;
      totalCap: number;
      postgrestEwmaMs: number;
    };
    /** Unflushed metrics in this invocation. Present so the sink can be spot-checked. */
    metricsPending: boolean;
  };
  shared: {
    postgrest: DependencyHealth['breaker'] & { reachable: boolean; latencyMs: number | null; error?: string };
    jobQueue: {
      reachable: boolean;
      /** Jobs in a runnable state — the §7.2 alert is depth > 100. */
      depth: number | null;
      dead: number | null;
      error?: string;
    };
  };
  /** Thresholds applied, so the reader knows the rule that produced `status`. */
  thresholds: Record<string, unknown>;
}

/**
 * Alert thresholds, mirroring §7.2. Named and exported rather than inlined so
 * the health endpoint, the sink, and the runbook cannot drift apart.
 */
export const HEALTH_THRESHOLDS = {
  /** Any breaker open longer than this is an alert (§7.2). */
  breakerOpenMs: 120_000,
  /** job_queue depth above this is an alert (§7.2). */
  queueDepth: 100,
  /** Any dead-letter arrival pages (§7.3). */
  deadLetter: 0,
  /** PostgREST EWMA above this feeds the admission pressure estimate. */
  postgrestEwmaWarnMs: 800,
  /** Bulkhead at/above this fraction of max is reported as saturating. */
  bulkheadWarnRatio: 0.75,
} as const;

/** Breaker configs are read through the module's own table — no second copy. */
import { DEPENDENCY_CONFIGS } from './kernel/resilience';

/**
 * Probe PostgREST with a deliberately trivial query.
 *
 * `limit=0` asks for zero rows: it still forces the full request path
 * (connection, auth, planning) so a broken URL, key, or reachability problem
 * still fails, but it transfers no data and does no table scan. A heavier probe
 * like `select=*` would make the diagnostic itself a load source.
 *
 * The result is timed locally rather than read from the admission EWMA: the
 * EWMA is deliberately smoothed (alpha 0.2) and lagged, which is right for
 * shedding and wrong for "is PostgREST up right now".
 */
async function probePostgrest(): Promise<{
  reachable: boolean;
  latencyMs: number | null;
  error?: string;
}> {
  // Don't start a probe we cannot finish — an incomplete probe reports a false
  // failure, which is worse than reporting nothing.
  if (remainingMs() <= 1_000) {
    return { reachable: false, latencyMs: null, error: 'skipped: request deadline too close' };
  }
  const t0 = Date.now();
  try {
    await supabaseJson('GET', 'job_queue', { query: { select: 'id', limit: 0 } });
    return { reachable: true, latencyMs: Date.now() - t0 };
  } catch (e) {
    // The message can carry the PostgREST body, which is safe (no PII), but it
    // is truncated by supabaseJson already. Kept because "HTTP 401" vs
    // "fetch failed" is the difference between a config problem and a network
    // problem, and that is exactly what the reader needs to know.
    return { reachable: false, latencyMs: null, error: String((e as Error)?.message ?? e).slice(0, 200) };
  }
}

interface QueueCounts {
  reachable: boolean;
  depth: number | null;
  dead: number | null;
  error?: string;
}

/**
 * Count queue depth and dead letters with HEAD + Prefer: count=exact.
 *
 * A HEAD with an exact count asks PostgREST for the row count without bodies,
 * so the cost is a single indexed count rather than a transfer. This is what
 * makes "queue depth" cheap enough to put on a health endpoint that may be
 * polled every minute.
 */
async function countQueue(status: string): Promise<number | null> {
  try {
    const url = '/rest/v1/job_queue';
    // supabaseJson cannot express "read Content-Range", so this goes through the
    // shared client's raw path (the same way the deleted supabasePaged helper
    // did) and reads the header itself.
    const { supabaseUrl, supabaseKey } = await import('./db/client');
    const u = supabaseUrl();
    const k = supabaseKey();
    if (!u || !k) return null;
    const { request } = await import('./kernel/http');
    const res = await request(
      u.replace(/\/$/, '') + url + '?select=id&status=eq.' + status,
      {
        method: 'HEAD',
        headers: {
          apikey: k,
          Authorization: 'Bearer ' + k,
          Prefer: 'count=exact',
        },
        budgetKey: 'postgrest_read',
      },
    );
    if (!res.ok) return null;
    const cr = res.headers.get('content-range') || '';
    const n = parseInt(String(cr).split('/')[1] || '', 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function probeQueue(): Promise<QueueCounts> {
  if (remainingMs() <= 1_000) {
    return { reachable: false, depth: null, dead: null, error: 'skipped: request deadline too close' };
  }
  // 'failed' is included in runnable depth because failJob() returns a job to
  // the pool for retry; only 'dead' has left the system.
  const [pending, failed, dead] = await Promise.all([
    countQueue('pending'),
    countQueue('failed'),
    countQueue('dead'),
  ]);
  const depth = pending === null && failed === null ? null : (pending ?? 0) + (failed ?? 0);
  return {
    reachable: depth !== null,
    depth,
    dead,
    ...(depth === null ? { error: 'could not read job_queue counts' } : {}),
  };
}

/**
 * Assemble the report.
 *
 * `includeShared` gates the database probes. A caller that only wants the
 * in-process view (a unit test, or a very tight request budget) sets it false
 * and pays nothing.
 */
export async function buildHealthReport(
  opts: { includeShared?: boolean } = {},
): Promise<HealthReport> {
  const includeShared = opts.includeShared !== false;
  const reasons: string[] = [];
  const levels: Array<'ok' | 'warn' | 'fail'> = [];

  const breakerSnap = breaker.snapshot();
  const bulkheadSnap = bulkhead.snapshot();
  const admission = admissionSnapshot();

  // Every configured dependency appears, healthy or not. Iterating live records
  // instead would omit exactly the healthy dependencies the reader is looking
  // for — see the note on CircuitBreaker.snapshot().
  const dependencies: DependencyHealth[] = Object.keys(DEPENDENCY_CONFIGS)
    .sort()
    .map((name) => {
      const cfg = DEPENDENCY_CONFIGS[name] || {};
      const b = breakerSnap[name] || { state: 'closed', failures: 0, openForMs: 0 };
      return {
        name,
        breaker: b,
        inflight: bulkheadSnap.inflight[name] ?? 0,
        maxConcurrent: bulkheadSnap.maxConcurrent,
        threshold: cfg.threshold ?? 5,
        windowMs: cfg.windowMs ?? 30_000,
        coolDownMs: cfg.coolDownMs ?? 15_000,
      };
    });

  // ── Interpret the in-process view ─────────────────────────────────────────
  const openDeps = dependencies.filter((d) => d.breaker.state !== 'closed');
  for (const d of openDeps) {
    // A breaker that just opened and one that has been open for ten minutes are
    // the same `state` but not the same incident. Report elapsed time so the
    // reader can tell them apart without correlating timestamps by hand.
    const long = d.breaker.openForMs >= HEALTH_THRESHOLDS.breakerOpenMs;
    reasons.push(
      `breaker ${d.breaker.state} for ${d.name}` +
        (d.breaker.openForMs > 0 ? ` (${Math.round(d.breaker.openForMs / 1000)}s)` : '') +
        (long ? ` — beyond the ${HEALTH_THRESHOLDS.breakerOpenMs / 1000}s alert threshold` : ''),
    );
    levels.push(long ? 'fail' : 'warn');
  }

  if (bulkheadSnap.saturated) {
    reasons.push(`bulkhead saturated at ${bulkheadSnap.maxConcurrent} concurrent calls`);
    levels.push('warn');
  } else {
    const hot = dependencies.filter(
      (d) => d.maxConcurrent > 0 && d.inflight / d.maxConcurrent >= HEALTH_THRESHOLDS.bulkheadWarnRatio,
    );
    for (const d of hot) {
      reasons.push(`bulkhead ${d.name} at ${d.inflight}/${d.maxConcurrent} in-flight`);
      levels.push('warn');
    }
  }

  if (admission.postgrestEwmaMs >= HEALTH_THRESHOLDS.postgrestEwmaWarnMs) {
    reasons.push(`PostgREST EWMA ${admission.postgrestEwmaMs}ms (admission floor is 400ms)`);
    levels.push('warn');
  }

  // ── Interpret the shared (database-derived) view ───────────────────────────
  let postgrest: HealthReport['shared']['postgrest'] = {
    ...(breakerSnap.postgrest || { state: 'closed', failures: 0, openForMs: 0 }),
    reachable: false,
    latencyMs: null,
  };
  let jobQueue: HealthReport['shared']['jobQueue'] = {
    reachable: false,
    depth: null,
    dead: null,
  };

  if (includeShared) {
    const [pg, q] = await Promise.all([probePostgrest(), probeQueue()]);
    postgrest = { ...postgrest, ...pg };
    jobQueue = q;

    if (!pg.reachable) {
      reasons.push('PostgREST unreachable: ' + (pg.error || 'unknown error'));
      levels.push('fail');
    } else if (
      pg.latencyMs !== null &&
      pg.latencyMs >= HEALTH_THRESHOLDS.postgrestEwmaWarnMs
    ) {
      reasons.push(`PostgREST reachable but slow: ${pg.latencyMs}ms`);
      levels.push('warn');
    }

    if (jobQueue.reachable && jobQueue.depth !== null) {
      if (jobQueue.depth > HEALTH_THRESHOLDS.queueDepth) {
        reasons.push(
          `job_queue depth ${jobQueue.depth} exceeds the ${HEALTH_THRESHOLDS.queueDepth} alert threshold`,
        );
        levels.push('warn');
      }
    } else {
      reasons.push('job_queue depth unavailable');
      levels.push('warn');
    }

    // Any dead letter at all pages (§7.3: dead-letter arrivals 0/day), because
    // a dead job is committed work that will never complete without a human.
    if (jobQueue.dead !== null && jobQueue.dead > HEALTH_THRESHOLDS.deadLetter) {
      reasons.push(`${jobQueue.dead} dead-letter job(s) — committed work that will never complete`);
      levels.push('fail');
    }
  }

  // ── Derive the single status ──────────────────────────────────────────────
  // 'fail' is reserved for things that are actually broken (unreachable DB, a
  // long-open breaker, dead letters). Everything else that is merely off-normal
  // is 'warn', so a paging rule can key on `status === 'down'` without having
  // to enumerate reason strings.
  const status: Overall = levels.includes('fail')
    ? 'down'
    : levels.includes('warn')
      ? 'degraded'
      : 'ok';

  if (reasons.length === 0) {
    reasons.push('all dependencies healthy');
  }

  return {
    status,
    reasons,
    levels: [...new Set(levels)],
    timestamp: new Date().toISOString(),
    instance: {
      dependencies,
      breakersOpen: breaker.openCount(),
      bulkheadSaturated: bulkheadSnap.saturated,
      admission,
      metricsPending: !metrics.metricsEmpty(),
    },
    shared: { postgrest, jobQueue },
    thresholds: { ...HEALTH_THRESHOLDS },
  };
}

/**
 * Log the report at an appropriate level.
 *
 * Separate from building it so the entry point controls verbosity, and so a
 * test can build a report without emitting log lines. Warnings and failures go
 * to warn/error so they surface in the Netlify log stream without any alert
 * pipeline being configured — the endpoint is useful before item 11 ships.
 */
export function logHealthReport(report: HealthReport): void {
  const fields = { status: report.status, reasons: report.reasons.slice(0, 5) };
  if (report.status === 'down') log.error('health.down', fields);
  else if (report.status === 'degraded') log.warn('health.degraded', fields);
  else log.info('health.ok', fields);
}
