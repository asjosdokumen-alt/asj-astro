/**
 * kernel/deadline.ts — Per-request wall-clock deadline (occupancy bound)
 *
 * WHY THIS EXISTS
 * ---------------
 * Occupancy = concurrency x duration. Phase B established that Netlify offers
 * NO concurrency cap and NO provisioned concurrency for Functions (the only
 * per-function knobs are `region` and `memory`), so the concurrency half of
 * that product cannot be governed from inside the app. The *duration* half can.
 *
 * Before this module, every request was bounded only by the platform ceiling:
 * 60 s for synchronous functions. A single slow action could therefore hold a
 * slot for a full minute, and because the per-dependency budgets (2 s read +
 * 3 s write + retries + 5 s storage + ...) simply *sum*, nothing prevented a
 * request from walking the whole way there. Under load that is the worst
 * possible failure mode: slots fill with work that is already doomed.
 *
 * This module gives each invocation one wall-clock deadline. Dependency calls
 * clamp their own timeout to whatever is left, and a call that cannot fit is
 * refused locally instead of being issued. The request fails fast, releases
 * its slot, and the client gets an honest 504 with Retry-After.
 *
 * NOTE ON THE 60 s CEILING
 * ------------------------
 * Several comments in this codebase claimed a 10 s synchronous limit. That is
 * stale: Netlify documents 60 s for synchronous functions, 30 s for scheduled,
 * 15 min for background. We do NOT raise budgets to exploit the extra room —
 * a longer budget means longer occupancy, which is the opposite of bounding
 * load. The default deadline here is deliberately far below the ceiling.
 *
 * WHY THE DEADLINE LIVES IN AsyncLocalStorage
 * -------------------------------------------
 * It must be readable from kernel/http.ts without an import cycle (http.ts
 * already participates in one with db/client.ts). LogContext already
 * propagates through every async continuation of a request, so the deadline
 * rides along for free and cannot drift between call sites.
 */

import { asyncLocalStorage } from './log';
import { AppError } from './errors';

/**
 * Default per-request deadline for synchronous functions (ms).
 *
 * Chosen as the p99-ish tail of a healthy request (a typical action is
 * 2-4 round-trips at ~40 ms RTT) with generous headroom, while staying well
 * under the 60 s platform ceiling. Overridable per invocation by the wrapper.
 */
export const DEFAULT_DEADLINE_MS = 12_000;

/**
 * Smallest slice worth issuing a network call for. Below this we refuse
 * locally rather than open a socket that cannot possibly complete in time.
 */
export const MIN_SLICE_MS = 150;

/** Read the absolute deadline (epoch ms) for the current request, if any. */
export function deadlineAt(): number | undefined {
  return asyncLocalStorage.getStore()?.deadlineAt;
}

/**
 * Milliseconds left before the deadline. Returns Infinity when no deadline is
 * set, so callers can `Math.min()` against it without a branch.
 */
export function remainingMs(): number {
  const at = deadlineAt();
  if (at === undefined) return Number.POSITIVE_INFINITY;
  return at - Date.now();
}

/** True once the request has run out of time. */
export function expired(): boolean {
  return remainingMs() <= 0;
}

/**
 * Clamp a desired timeout to the time actually left in the request.
 *
 * This is the load-bearing function: it is what stops the per-dependency
 * budgets from summing past the deadline. A 5 s storage budget issued with
 * 800 ms left becomes an 800 ms call, not a 5 s one.
 */
export function clampBudget(desiredMs: number): number {
  const left = remainingMs();
  if (left === Number.POSITIVE_INFINITY) return desiredMs;
  return Math.min(desiredMs, Math.max(0, left));
}

/**
 * Throw if there is no usable slice left. Callers use this before starting
 * work that would otherwise consume a slot for no benefit.
 */
export function assertAlive(dep: string): void {
  if (remainingMs() <= MIN_SLICE_MS) {
    throw new AppError('DEADLINE_EXCEEDED', {
      message: `Permintaan melewati batas waktu sebelum memanggil ${dep}`,
      retryAfter: 2,
    });
  }
}

/** Compute a deadline from a start timestamp. Used by the request wrappers. */
export function deadlineFrom(startedAt: number, budgetMs: number = DEFAULT_DEADLINE_MS): number {
  return startedAt + budgetMs;
}
