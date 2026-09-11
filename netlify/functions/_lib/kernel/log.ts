/**
 * kernel/log.ts — Structured JSON logger with PII hashing
 *
 * WHY THIS EXISTS
 * ---------------
 * The codebase currently uses `console.error('[handler-error] action=...')` with
 * string concatenation. No request IDs, no structured fields, no PII protection.
 * Every incident requires log archaeology.
 *
 * This module provides:
 *   - Structured JSON output (parseable by any log aggregator)
 *   - Request-id propagation (AsyncLocalStorage)
 *   - PII hashing (no_wa, nik, tokens are hashed, never logged raw)
 *   - Level-based filtering (debug/info/warn/error)
 *
 * USAGE
 * -----
 *   import { log, setRequestId } from '../kernel/log';
 *   log.info('handler.start', { action, ip });
 *   log.error('handler.error', { action, err: String(err) });
 */

import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

// ── Request context (AsyncLocalStorage) ──────────────────────────────────────
interface LogContext {
  requestId: string;
  action?: string;
  surface?: string;
  idempotencyKey?: string;
  traceparent?: string;
  /**
   * Absolute wall-clock deadline (epoch ms) for this invocation, set by the
   * request wrapper. Read by kernel/deadline.ts to clamp dependency timeouts
   * so per-dependency budgets cannot sum past the request deadline.
   * See kernel/deadline.ts for why occupancy, not concurrency, is the bound.
   */
  deadlineAt?: number;
}

const asyncLocalStorage = new AsyncLocalStorage<LogContext>();

/** Set the request context for the current async scope. */
export function runWithContext<T>(ctx: LogContext, fn: () => T): T {
  return asyncLocalStorage.run(ctx, fn);
}

/** Get current request context (returns empty object outside async scope). */
function getContext(): Partial<LogContext> {
  return asyncLocalStorage.getStore() ?? {};
}

/** Export for reading context values from other modules. */
export { asyncLocalStorage };

// ── PII hashing ──────────────────────────────────────────────────────────────
// Never log raw: no_wa, nik, no_pasport, tokens, passwords, session tokens.
// Hash for correlation, not for security.

const PII_FIELDS = new Set([
  'wa', 'no_wa', 'nik', 'no_pasport', 'token', 'sessionToken',
  'password', 'password_kandidat', 'pin', 'masterPin', 'personalPin',
]);

/**
 * Hash a PII value for safe logging. Returns a short, stable hash
 * suitable for correlation (first 8 hex chars).
 */
export function hashPii(value: unknown): string {
  if (value == null || value === '') return '';
  const s = String(value);
  return createHash('sha256').update(s).digest('hex').slice(0, 8);
}

/** Sanitize a fields object: hash PII fields, redact others. */
function sanitize(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (PII_FIELDS.has(k)) {
      out[k] = v != null ? hashPii(v) : null;
    } else if (k === 'err' || k === 'error') {
      // Truncate error messages — never log full stack traces in structured logs
      out[k] = String(v).slice(0, 200);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ── Logger ───────────────────────────────────────────────────────────────────
type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<Level, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
};

const MIN_LEVEL: Level = (process.env.LOG_LEVEL as Level) || 'info';

function emit(level: Level, event: string, fields: Record<string, unknown> = {}) {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[MIN_LEVEL]) return;

  const ctx = getContext();
  const entry = {
    ts: new Date().toISOString(),
    level,
    event,
    ...ctx,
    ...sanitize(fields),
  };

  // Use the appropriate console method
  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => emit('debug', event, fields),
  info:  (event: string, fields?: Record<string, unknown>) => emit('info', event, fields),
  warn:  (event: string, fields?: Record<string, unknown>) => emit('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit('error', event, fields),
};
