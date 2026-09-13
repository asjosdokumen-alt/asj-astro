/**
 * kernel/admission.ts — Priority classes and load shedding
 *
 * THE HONEST PREMISE (read this before trusting any number below)
 * --------------------------------------------------------------
 * Netlify exposes NO concurrency cap and NO provisioned concurrency for
 * Functions. Verified against the configuration docs: the only documented
 * keys are `external_node_modules`, `included_files`, `directory` (global),
 * `region` and `memory` (per-function), and `vcpu` (in-code only). There is
 * no `concurrency` key, no reservation, no admission gate.
 *
 * Therefore this module does NOT claim to bound fleet-wide concurrency — it
 * cannot, because Netlify answers excess load by starting more instances.
 * What it bounds is PER-INSTANCE OCCUPANCY, and that buys three real things:
 *
 *   1. Unbounded queueing becomes a fast, honest 503. Work that would have
 *      waited 40 s and then been killed at the platform's 60 s ceiling now
 *      fails in well under a millisecond with a Retry-After hint.
 *   2. One instance cannot become a straggler. Past the cap, non-essential
 *      work is refused instead of queued behind work that is already doomed.
 *   3. Shared resources are protected from a retry storm. The shed response
 *      is cheap and carries Retry-After, so well-behaved clients back off
 *      instead of piling on.
 *
 * The real FLEET-WIDE governors live elsewhere, and they are these:
 *   - kernel/rate-limit.ts — shared, Postgres-backed, per identity/IP
 *   - kernel/resilience.ts — per-dependency bulkhead + circuit breaker
 *   - migrations/011 — statement_timeout enforced at the database role
 *
 * ADMISSION MUST BE FREE
 * ----------------------
 * Every signal read here is in-process. No I/O, no database, no network.
 * That is the point, not an optimisation: admission runs BEFORE the rate
 * limiter, and the rate limiter costs 1-2 PostgREST round-trips per call.
 * Charging a database round-trip in order to reject a request would make
 * overload worse, so the shed decision is made with local state only.
 *
 * PRIORITY IS A POLICY, NOT A MEASUREMENT
 * ---------------------------------------
 * P0-P3 are declared, not inferred. The default for an unclassified action is
 * P1 (shed only at near-total saturation), so a newly added action is safe by
 * default rather than accidentally shed-first.
 */

import { log } from './log';
import { breaker } from './resilience';

// ── Priority classes ─────────────────────────────────────────────────────────

/**
 * P0 — never shed. Shedding these breaks the product or hides committed work.
 * P1 — default. Public reads and ordinary writes; shed only at the last resort.
 * P2 — expensive interactive work; shed early to protect P0/P1.
 * P3 — amplifiers and deferrable bulk work; shed first, always.
 */
export type Priority = 0 | 1 | 2 | 3;

/**
 * BLOAT WARNING — why these tables are packed strings
 * ---------------------------------------------------
 * Every entry point imports handlers.ts, and handlers.ts imports this module,
 * so these tables ship in EVERY function bundle. Netlify does no code
 * splitting, so this is unavoidable; the only question is how many bytes it
 * costs.
 *
 * Written the obvious way — `new Set(['ping', 'logout', ...])` — the ~50
 * action names plus the array literal plus the Set construction cost ~3.7 KB
 * per entry point (+6% on the narrow surfaces), which tripped the bundle-size
 * gate. As a single space-delimited string plus one split at module load, the
 * same information costs a fraction of that.
 *
 * Keep this form. If you add actions, append them to the string — do not
 * convert these back to array literals.
 */
const setOf = (packed: string): ReadonlySet<string> => new Set(packed.split(' '));

/**
 * P0: authentication, session lifecycle, and job-status polling.
 *
 * Rationale for each family:
 *   - login/refresh: shedding these logs users out. A login storm is exactly
 *     when shedding would be most damaging, because the user cannot proceed.
 *   - daftarKandidat: a shed registration is a lost user, and the client
 *     typically will not retry.
 *   - getJobStatus: async work is already committed to the queue. Shedding the
 *     status read makes completed work look lost and triggers client retries
 *     that add load for no reason.
 *   - logout / ping: trivial cost, must always succeed.
 *   - reportWebVital: our own telemetry; dropping it blinds us precisely
 *     during the incident we need to observe.
 */
const P0_ACTIONS = setOf(
  'ping logout checkAdminMaster checkAdminPersonal refreshAdminSession ' +
  'refreshKandidatSession loginKandidat daftarKandidat gantiPasswordKandidat ' +
  'registerFcmToken getJobStatus reportWebVital',
);

/**
 * P3: fan-out, bulk, and long-running work. These are the actions that turn a
 * traffic spike into an outage, and they are all deferrable or retryable.
 *
 *   bulk outbound messaging — hundreds of sequential external calls
 *   AI generation that produces a document rather than an answer
 *   one-off admin/bridge generation
 *   heavy aggregate reads
 */
const P3_ACTIONS = setOf(
  'kirimTawaranMassal kirimSatuPesanFonnte checkAndSendAgendaReminders ' +
  'generateWawancaraModel parseDokumenBiodata processUploadDoc ' +
  'buildAdminAiCandidateSummary generateFormBridge generateLegacyMasterBridge ' +
  'generateAiFormBridge getMonthlyReport downloadJobDocs',
);

/**
 * P2: expensive but genuinely interactive. Users are waiting on these, so they
 * outrank P3, but they must yield before authentication and ordinary CRUD.
 *
 *   conversational AI and AI context assembly — long external calls
 *   multi-step writes that involve storage round-trips
 *   read-heavy candidate/master lookups
 */
const P2_ACTIONS = setOf(
  'processAIChat processSiswaAIChat processAdminAIChat processAiInterview ' +
  'getAdminAiContext getUploadUrls simpanKandidatDanUpload ' +
  'simpanBerkasTahapan simpanRevisiKandidat simpanBiodataLengkap ' +
  'getCandidatesPage getMasterDataByWa getDrafCvMaster ' +
  'getExistingCandidateJsonByWa',
);

/** Classify an action. Unclassified actions default to P1 (safe direction). */
export function priorityOf(action: string): Priority {
  if (P0_ACTIONS.has(action)) return 0;
  if (P2_ACTIONS.has(action)) return 2;
  if (P3_ACTIONS.has(action)) return 3;
  return 1;
}

/**
 * Deferral table: action → job type the shed path may enqueue instead of
 * refusing the request (#9).
 *
 * THE TRAP THIS AVOIDS
 *   "Defer P3 instead of shedding" sounds like a one-line change, but an
 *   enqueued job with no registered worker sits `pending` FOREVER — the caller
 *   is told "accepted", the work never runs, and nothing logs an error. Only
 *   job types present in `sweep-queue.ts` HANDLERS may appear here.
 *
 *   That set is deliberately small: `wa.broadcast`, `wa.send`, `ai.interview`.
 *   Most P3 actions (bridge generation, monthly report, document parsing) have
 *   no worker, so for them a clean 503 with Retry-After remains the honest
 *   answer — the client can retry, whereas a black-hole queue cannot.
 *
 * NOT LISTED, ON PURPOSE
 *   - `kirimTawaranMassal` → `wa.broadcast`: the surface already enqueues
 *     unconditionally (surfaces/notify.ts), so it never reaches the shed path.
 *   - `generateWawancaraModel` → `ai.interview`: the worker exists, but the
 *     action is interactive and returns a document the admin is waiting on;
 *     silently turning that into a job ID would break the UI contract.
 *
 * Keeping this next to P3_ACTIONS means the two lists are edited in one place,
 * and `admission.test.ts` asserts every entry has a worker.
 */
const DEFERRABLE: Record<string, string> = {
  kirimSatuPesanFonnte: 'wa.send',
};

/**
 * The job type this action may be deferred as, or null if it must be shed.
 * Callers still have to enqueue; this only says whether that is *safe*.
 */
export function deferralJobTypeFor(action: string): string | null {
  // Only P3 is deferrable. P1/P2 are shed at higher thresholds precisely
  // because their callers are waiting; queueing those would hide the pressure
  // from the client while making it worse for the worker.
  if (priorityOf(action) !== 3) return null;
  return DEFERRABLE[action] ?? null;
}

// ── Tiers ────────────────────────────────────────────────────────────────────

/**
 * Resource tiers. Each carries its own in-flight cap because they compete for
 * different scarce resources: AI work holds external sockets and memory for
 * seconds, bulk work holds a long sequential loop, and the default tier is
 * mostly short I/O-bound round-trips.
 */
export type Tier = 'default' | 'ai' | 'bulk';

/** Actions that hold a long sequential loop (fan-out over many recipients). */
const BULK_TIER_ACTIONS = setOf(
  'kirimTawaranMassal checkAndSendAgendaReminders getMonthlyReport',
);

/** Actions that hold an external AI socket for seconds at a time. */
const AI_TIER_ACTIONS = setOf(
  'processAIChat processSiswaAIChat processAdminAIChat processAiInterview ' +
  'parseDokumenBiodata processUploadDoc ' +
  'generateWawancaraModel buildAdminAiCandidateSummary getAdminAiContext',
);

export function tierOf(action: string): Tier {
  if (BULK_TIER_ACTIONS.has(action)) return 'bulk';
  if (AI_TIER_ACTIONS.has(action)) return 'ai';
  return 'default';
}

// ── Caps and thresholds (env-overridable, all are guesses until calibrated) ──

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Per-tier in-flight caps for a single instance.
 *
 * These are deliberately conservative and are the numbers most likely to need
 * production calibration — hence the env overrides. They bound one instance,
 * not the fleet; see the module header.
 */
const CAP: Record<Tier, number> = {
  default: envInt('ADMISSION_MAX_INFLIGHT', 24),
  ai: envInt('ADMISSION_MAX_INFLIGHT_AI', 4),
  bulk: envInt('ADMISSION_MAX_INFLIGHT_BULK', 3),
};

/** Total in-flight across all tiers, so one tier cannot consume the instance. */
const TOTAL_CAP = envInt('ADMISSION_MAX_INFLIGHT_TOTAL', 28);

/**
 * Shed thresholds by priority, expressed as a saturation fraction.
 * P0 is absent by design — it is never shed (see `admit`).
 */
const SHED_AT: Record<Exclude<Priority, 0>, number> = {
  1: 0.95,
  2: 0.8,
  3: 0.5,
};

// ── Saturation estimator (local signals only) ────────────────────────────────

const inflightByTier: Record<Tier, number> = { default: 0, ai: 0, bulk: 0 };
let inflightTotal = 0;

/** EWMA of observed PostgREST latency, in ms. 0 until the first observation. */
let postgrestEwmaMs = 0;

/**
 * Latency contributes pressure only above FLOOR. A healthy request at ~40 ms
 * RTT must read as zero pressure, otherwise normal operation would shed.
 * CEIL is set at the point where PostgREST is unambiguously degraded.
 */
const LATENCY_FLOOR_MS = 400;
const LATENCY_CEIL_MS = 2_000;

const EWMA_ALPHA = 0.2;

/**
 * Record an observed dependency latency. Called by kernel/http.ts on every
 * PostgREST call. Only PostgREST feeds the estimator — it is the shared
 * bottleneck that all surfaces contend for.
 */
export function observeDependency(dep: string, durationMs: number): void {
  if (dep !== 'postgrest') return;
  postgrestEwmaMs = postgrestEwmaMs === 0
    ? durationMs
    : postgrestEwmaMs * (1 - EWMA_ALPHA) + durationMs * EWMA_ALPHA;
}

function latencyPressure(): number {
  if (postgrestEwmaMs <= LATENCY_FLOOR_MS) return 0;
  const span = LATENCY_CEIL_MS - LATENCY_FLOOR_MS;
  return Math.min(1, (postgrestEwmaMs - LATENCY_FLOOR_MS) / span);
}

/**
 * Saturation in [0, 1]. The maximum of four independent pressures, so any one
 * of them alone can trigger shedding:
 *   - this tier's own occupancy
 *   - total instance occupancy
 *   - observed PostgREST degradation
 *   - PostgREST circuit breaker state
 *
 * The breaker term matters most: when PostgREST is open, every action that
 * needs it will fail anyway, so accepting more of that work is pure waste.
 * Saturation pins to 1 and only P0 survives.
 */
function saturationFor(tier: Tier): number {
  const tierRatio = inflightByTier[tier] / CAP[tier];
  const totalRatio = inflightTotal / TOTAL_CAP;
  const breakerPressure = breaker.getState('postgrest') === 'open' ? 1 : 0;
  return Math.max(tierRatio, totalRatio, latencyPressure(), breakerPressure);
}

// ── Admission ────────────────────────────────────────────────────────────────

export interface Admission {
  admitted: boolean;
  priority: Priority;
  tier: Tier;
  saturation: number;
  /** Seconds to wait before retrying. Present only when not admitted. */
  retryAfter?: number;
  reason?: string;
}

/**
 * Decide whether to admit this action, and reserve an in-flight slot if so.
 *
 * Callers MUST call `release(admission.tier)` in a finally block on the
 * admitted path, or the slot leaks and the instance sheds itself.
 */
export function admit(action: string): Admission {
  const priority = priorityOf(action);
  const tier = tierOf(action);
  const saturation = saturationFor(tier);

  // P0 is never shed. Authentication, session refresh and job-status polling
  // must survive saturation, otherwise the product locks users out during the
  // exact incident where they need to get back in.
  if (priority === 0) {
    reserve(tier);
    return { admitted: true, priority, tier, saturation };
  }

  const threshold = SHED_AT[priority];
  if (saturation >= threshold) {
    // Cheaper work is told to come back sooner; heavy fan-out is told to back
    // off harder, because retrying it immediately is what causes the storm.
    const retryAfter = priority === 3 ? 10 : priority === 2 ? 5 : 2;
    return {
      admitted: false,
      priority,
      tier,
      saturation,
      retryAfter,
      reason: 'saturated',
    };
  }

  reserve(tier);
  return { admitted: true, priority, tier, saturation };
}

function reserve(tier: Tier): void {
  inflightByTier[tier] += 1;
  inflightTotal += 1;
}

/** Release an in-flight slot. Idempotent per call; safe in a finally block. */
export function release(tier: Tier): void {
  inflightByTier[tier] = Math.max(0, inflightByTier[tier] - 1);
  inflightTotal = Math.max(0, inflightTotal - 1);
}

/**
 * Build the client-facing shed response. Kept here so the shape stays in one
 * place: `code` drives the HTTP status (503 via codeToStatus), `retryAfter`
 * becomes the Retry-After header, and `overloaded` tells the wrapper not to
 * let this response be cached.
 */
export function shedResponse(retryAfter: number): {
  success: false;
  error: string;
  code: string;
  overloaded: true;
  retryAfter: number;
} {
  return {
    success: false,
    error: 'Server sedang sibuk. Coba lagi sebentar lagi.',
    code: 'OVERLOADED',
    overloaded: true,
    retryAfter,
  };
}

/** Log a shed decision at warn level with the numbers that drove it. */
export function logShed(action: string, admission: Admission): void {
  log.warn('admission.shed', {
    action,
    priority: admission.priority,
    tier: admission.tier,
    saturation: Number(admission.saturation.toFixed(3)),
    retryAfter: admission.retryAfter,
  });
}

/** Point-in-time view for metrics and diagnostics. */
export function snapshot(): {
  inflight: Record<Tier, number>;
  inflightTotal: number;
  caps: Record<Tier, number>;
  totalCap: number;
  postgrestEwmaMs: number;
} {
  return {
    inflight: { ...inflightByTier },
    inflightTotal,
    caps: { ...CAP },
    totalCap: TOTAL_CAP,
    postgrestEwmaMs: Math.round(postgrestEwmaMs),
  };
}

/** Reset all state. Test-only — production must never call this. */
export function resetForTests(): void {
  inflightByTier.default = 0;
  inflightByTier.ai = 0;
  inflightByTier.bulk = 0;
  inflightTotal = 0;
  postgrestEwmaMs = 0;
}
