/**
 * kernel/http.ts — Centralized HTTP client with timeout + error taxonomy
 *
 * WHY THIS EXISTS
 * ---------------
 * Every outbound fetch in the codebase currently uses bare `fetch()` with no
 * timeout. A single hung PostgREST call consumes the entire request budget.
 * This module provides:
 *
 *   1. Per-request timeout via AbortSignal.timeout()
 *   2. Typed errors (UPSTREAM_TIMEOUT, HTTP_ERROR) for retry/breaker decisions
 *   3. A single place to add keep-alive, connection pooling, or tracing later
 *   4. Retry with full jitter (via resilience module)
 *   5. Circuit breaker + bulkhead (via resilience module)
 *
 * MIGRATION
 * ---------
 * Phase 1: wire into db/client.ts supabaseJson() only.
 * Phase 2: wire into all outbound fetch() calls.
 * Phase 5: added retry/breaker/bulkhead via resilience module.
 * Phase B: budgets are clamped to a per-request deadline (kernel/deadline.ts),
 *          and observed latency feeds the admission controller's pressure
 *          estimate (kernel/admission.ts).
 */

/**
 * Timeouts per dependency (ms).
 *
 * These are OCCUPANCY BUDGETS, not platform limits. The Netlify synchronous
 * ceiling is 60 s (not 10 s — comments elsewhere claiming 10 s are stale), but
 * exploiting that headroom would be wrong: a longer budget means a slot is
 * held longer, which is the opposite of bounding load under pressure.
 *
 * So each value is chosen as "long enough that a healthy call never trips it,
 * short enough that a sick call releases the slot quickly". Every value is
 * additionally clamped at call time to whatever remains of the request
 * deadline, so these figures are ceilings rather than sums.
 */
export const BUDGETS = {
  /** PostgREST reads — the dominant call; tripping this means real trouble */
  postgrest_read:  2_000,
  /** PostgREST writes — no retry on non-idempotent, but still need timeout */
  postgrest_write: 3_000,
  /** Supabase Storage operations */
  storage:         5_000,
  /** External APIs (Gemini, Fonnte, FCM) */
  external:        5_000,
  /** AI chat — the longest legitimate call; bounded further by the ai tier cap */
  ai_chat:         8_000,
} as const;

export type BudgetKey = keyof typeof BUDGETS;

/**
 * Custom error for upstream failures. Carries enough context for the caller
 * to decide retry/degradation without inspecting the raw error.
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean = status >= 500 || status === 429,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class TimeoutError extends Error {
  constructor(url: string, budgetMs: number) {
    super(`Timeout after ${budgetMs}ms: ${url}`);
    this.name = 'TimeoutError';
  }
}

/**
 * Fetch wrapper with timeout. Drop-in replacement for fetch() in the codebase.
 *
 * Usage:
 *   const data = await request(url, { budgetMs: BUDGETS.postgrest_read });
 */
export async function request(
  url: string,
  init: RequestInit & { budgetMs?: number; budgetKey?: BudgetKey; action?: string } = {},
): Promise<Response> {
  const { budgetMs: explicitBudget, budgetKey, action: actionName, ...fetchInit } = init;
  const requestedBudget = explicitBudget ?? (budgetKey ? BUDGETS[budgetKey] : BUDGETS.postgrest_read);

  // Bound the call by whatever is left of the request deadline. Without this,
  // the per-dependency budgets simply sum (2s read + 3s write + 5s storage +
  // retries) and a single request can walk toward the platform ceiling while
  // holding a slot. This is the line that makes the deadline binding.
  const budgetMs = clampBudget(requestedBudget);
  if (budgetMs <= MIN_SLICE_MS) {
    // Not enough time left to be worth opening a socket. Refuse locally rather
    // than issue a call that cannot complete and will only occupy a slot.
    throw new AppError('DEADLINE_EXCEEDED', {
      message: `Permintaan kehabisan waktu sebelum memanggil ${url}`,
      retryAfter: 2,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);

  // Merge caller's signal with our timeout
  const signal = fetchInit.signal
    ? AbortSignal.any([fetchInit.signal, controller.signal])
    : controller.signal;

  const startTime = Date.now();
  const dep = detectDependency(url);

  // P13 fix: Always apply circuit breaker + bulkhead for any dependency,
  // not just reads. This prevents writes from overwhelming a failing service.
  // (Retry is NOT applied here — that decision belongs to the caller via
  // resilience.withRetry, which defaults to idempotent:false for safety.)
  const shouldProtect = !!dep;

  // Phase 7: propagate traceparent for distributed tracing (§10.3)
  // B4 fix: read from AsyncLocalStorage instead of globalThis.
  const traceparent = asyncLocalStorage.getStore()?.traceparent;
  const headers = new Headers(fetchInit.headers as HeadersInit | undefined);
  if (traceparent && !headers.has('traceparent')) {
    headers.set('traceparent', traceparent);
  }

  // ── REMOVED: statement_timeout request header ──────────────────────────────
  // This block used to do:
  //   if (dep === 'postgrest') headers.set('statement_timeout', isRead ? '2000' : '3000');
  //
  // It was dead code that created false confidence. PostgREST does not read a
  // `statement_timeout` request header — it is not in its recognised header set
  // (Prefer, Accept, Range, Authorization, Content-Type, *-Profile). PostgREST
  // applies statement_timeout as a *hoisted transaction setting*, configured
  // server-side via `db-hoisted-tx-settings` and sourced from database ROLE
  // settings. Unknown headers are simply ignored, so this line silently did
  // nothing while looking like query protection.
  //
  // Verified before removal: no `db-pre-request` hook is installed in this
  // project (nothing in migrations/ or config reads request.headers), so no
  // server-side function was consuming it either.
  //
  // The real control now lives in migrations/011_statement_timeout.sql, which
  // sets it via ALTER ROLE for anon/authenticated/service_role/authenticator.
  // Client-side, the equivalent bound is the per-request deadline above.

  // P16 fix: Move bulkhead acquire inside try block so clearTimeout(timer)
  // runs even if acquireBulkhead or checkBreaker throws.
  let release: (() => void) | null = null;
  try {
    if (shouldProtect) {
      release = await bulkhead.acquire(dep);
      breaker.check(dep);
    }

    const res = await fetch(url, { ...fetchInit, headers, signal });
    const durationMs = Date.now() - startTime;
    clearTimeout(timer);
    if (shouldProtect) breaker.success(dep);
    // Feed the admission controller's pressure estimate. Only successful calls
    // are observed, so the EWMA measures "how slow is a working query" rather
    // than "how often do we fail" — failure pressure is the breaker's job.
    observeDependency(dep, durationMs);
    metrics.increment('dependency.call', { dep, outcome: 'success' });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      void logDependencyCall(dep, actionName, budgetMs, durationMs, 'http_error', res.status);
      throw new HttpError(
        `HTTP ${res.status} ${url}: ${body.slice(0, 200)}`,
        res.status,
      );
    }
    // Log successful call (only if slow or for sampling)
    if (durationMs > 100 || Math.random() < 0.05) {
      void logDependencyCall(dep, actionName, budgetMs, durationMs, 'ok');
    }
    return res;
  } catch (e: unknown) {
    const durationMs = Date.now() - startTime;
    clearTimeout(timer);
    if (shouldProtect) breaker.failure(dep);
    metrics.increment('dependency.call', { dep, outcome: 'error' });
    if (e instanceof HttpError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') {
      void logDependencyCall(dep, actionName, budgetMs, durationMs, 'timeout');
      throw new TimeoutError(url, budgetMs);
    }
    void logDependencyCall(dep, actionName, budgetMs, durationMs, 'network_error');
    throw e;
  } finally {
    release?.();
  }
}

/**
 * Convenience: fetch + parse JSON with timeout.
 * Direct replacement for the fetch+JSON pattern in supabaseJson().
 */
export async function requestJson<T = unknown>(
  url: string,
  init: RequestInit & { budgetMs?: number; budgetKey?: BudgetKey; action?: string } = {},
): Promise<T> {
  const res = await request(url, init);
  const text = await res.text();
  return text ? JSON.parse(text) : (null as T);
}

// ── Dependency detection ──────────────────────────────────────────────────────

function detectDependency(url: string): string {
  // P14 fix: Check 'storage' before 'supabase' — Storage URLs are
  // https://<project>.supabase.co/storage/v1/... which contain 'supabase'.
  if (url.includes('/storage/') || url.includes('storage/v1')) return 'storage';
  if (url.includes('supabase')) return 'postgrest';
  if (url.includes('generativelanguage') || url.includes('gemini')) return 'gemini';
  if (url.includes('fonnte') || url.includes('api.fonnte')) return 'fonnte';
  if (url.includes('fcm') || url.includes('fcm.googleapis')) return 'fcm';
  if (url.includes('cloudinary')) return 'cloudinary';
  return 'other';
}



import { metrics } from './metrics';
import { log, asyncLocalStorage } from './log';
import { breaker, bulkhead } from './resilience';
import { AppError } from './errors';
import { clampBudget, MIN_SLICE_MS } from './deadline';
import { observeDependency } from './admission';

// ── Dependency call logging ───────────────────────────────────────────────────
// Writes to dependency_calls table. Fire-and-forget: never blocks the caller.
// Uses supabaseJson directly to avoid circular import with db/client.ts.

async function logDependencyCall(
  dep: string,
  action: string | undefined,
  budgetMs: number,
  durationMs: number,
  outcome: string,
  statusCode?: number,
): Promise<void> {
  // B7 fix: Skip logging PostgREST calls to break the recursion cycle.
  // logDependencyCall → supabaseJson → request → logDependencyCall (unbounded).
  if (dep === 'postgrest') return;
  try {
    await supabaseJson('POST', 'dependency_calls', {
      body: {
        dep,
        action: action ?? 'unknown',
        budget_ms: budgetMs,
        duration_ms: durationMs,
        outcome,
        status_code: statusCode ?? null,
        attempts: 1,
      },
      headers: { Prefer: 'return=minimal' },
    });
  } catch {
    // Logging must never fail the request. Silently drop.
  }
}

// Import supabaseJson at module level (lazy to avoid circular dep issues)
import { supabaseJson } from '../db/client';
