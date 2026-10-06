/**
 * kernel/rate-limit.ts — Postgres-backed rate limiter (shared across instances)
 *
 * WHY THIS EXISTS
 * ---------------
 * The old rate-limit.ts used an in-memory Map. Netlify runs many concurrent
 * instances, each with its own Map — so the rate limiter was trivially
 * bypassable by distributing requests across instances.
 *
 * This module stores counters in Supabase (PostgREST), which is shared state.
 * It falls back to in-memory if the DB is unavailable (degraded but not broken).
 *
 * API (drop-in replacement for old rate-limit.ts):
 *   check(key, { limit, windowMs, lockoutAfter, lockoutMs })
 *     → { ok: true } | { ok: false, retryAfter, locked }
 *   fail(key, { lockoutAfter, lockoutMs })
 *     → void
 *
 * PERFORMANCE:
 *   One PostgREST read + conditional upsert per check. At 39ms RTT, this adds
 *   ~40ms to the request. Acceptable because:
 *     1. Rate limiting is on the hot path but not latency-critical
 *     2. The alternative (bypassable limiter) is worse than +40ms
 *     3. We can add a per-request L1 cache later (Phase 4)
 */

import { supabaseJson } from '../db/client';

interface RateLimitOpts {
  limit?: number;
  windowMs?: number;
  lockoutAfter?: number;
  lockoutMs?: number;
}

type RateLimitResult =
  | { ok: true; retryAfter?: undefined; locked?: undefined }
  | { ok: false; retryAfter: number; locked?: boolean };

interface CounterRow {
  bucket: string;
  window_start: string;
  count: number;
  fails: number;
  locked_until: string | null;
}

const _TABLE = 'rate_counters';

// B6 fix: Use atomic RPC function instead of non-atomic read-modify-write
// The rate_limit_check function atomically increments and checks limits

async function atomicRateLimitCheck(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  try {
    const result = await supabaseJson('POST', 'rpc/rate_limit_check', {
      body: {
        p_bucket: key,
        p_limit: limit,
        p_window_ms: windowMs,
      },
    });
    
    // PostgREST rpc/ returns a JSON array even for single-row results.
    // Unwrap to get the actual row object.
    const row = Array.isArray(result) ? result[0] : result;

    if (row && typeof row === 'object') {
      if (row.locked) {
        return { ok: false, retryAfter: row.retry_after || 60, locked: true };
      }
      if (!row.ok) {
        return { ok: false, retryAfter: row.retry_after || 60 };
      }
      return { ok: true };
    }
    return memoryCheck(key, { limit, windowMs });
  } catch {
    return memoryCheck(key, { limit, windowMs });
  }
}

async function atomicRateLimitFail(key: string, lockoutAfter: number, lockoutMs: number): Promise<void> {
  try {
    await supabaseJson('POST', 'rpc/rate_limit_fail', {
      body: {
        p_bucket: key,
        p_lockout_after: lockoutAfter,
        p_lockout_ms: lockoutMs,
      },
    });
  } catch {
    // Fallback to in-memory on error
    const b = memBuckets.get(key);
    if (b) {
      b.fails++;
      if (b.fails >= lockoutAfter) {
        b.lockUntil = Date.now() + lockoutMs;
        b.fails = 0;
      }
    }
  }
}

/**
 * Check rate limit for a key. Returns { ok: true } or { ok: false, retryAfter }.
 *
 * Uses Postgres for shared state, with in-memory fallback if DB is down.
 */
export async function check(
  key: string,
  opts: RateLimitOpts = {},
): Promise<RateLimitResult> {
  const limit = opts.limit ?? 5;
  const windowMs = opts.windowMs ?? 60_000;
  
  // B6 fix: Use atomic RPC function instead of non-atomic read-modify-write
  return atomicRateLimitCheck(key, limit, windowMs);
}

/**
 * Record a failure for lockout tracking.
 * After `lockoutAfter` failures within a window → lock for `lockoutMs`.
 */
export async function fail(
  key: string,
  opts: RateLimitOpts = {},
): Promise<void> {
  const lockoutAfter = opts.lockoutAfter ?? 0;
  const lockoutMs = opts.lockoutMs ?? 0;

  if (lockoutAfter <= 0) return;

  // B6 fix: Use atomic RPC function
  await atomicRateLimitFail(key, lockoutAfter, lockoutMs);
}

// ── In-memory fallback (when Postgres is down) ───────────────────────────────
// Same logic as the old rate-limit.ts — per-instance, not shared, but at least
// the service doesn't crash.

interface MemBucket {
  count: number;
  fails: number;
  resetAt: number;
  lockUntil: number;
}

const memBuckets = new Map<string, MemBucket>();
const MAX_MEM_BUCKETS = 256;

function memoryCheck(key: string, opts: RateLimitOpts): RateLimitResult {
  const now = Date.now();
  const limit = opts.limit ?? 5;
  const windowMs = opts.windowMs ?? 60_000;
  let b = memBuckets.get(key);
  if (!b) {
    // P8 fix: Evict oldest entry when at capacity to prevent unbounded growth.
    if (memBuckets.size >= MAX_MEM_BUCKETS) {
      const oldest = memBuckets.keys().next().value;
      if (oldest !== undefined) memBuckets.delete(oldest);
    }
    b = { count: 0, fails: 0, resetAt: now + windowMs, lockUntil: 0 };
    memBuckets.set(key, b);
  }
  if (b.lockUntil > now) {
    return { ok: false, retryAfter: Math.ceil((b.lockUntil - now) / 1000), locked: true };
  }
  if (now >= b.resetAt) {
    b.resetAt = now + windowMs;
    b.count = 0;
    b.fails = 0;
  }
  b.count++;
  if (b.count > limit) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true };
}
