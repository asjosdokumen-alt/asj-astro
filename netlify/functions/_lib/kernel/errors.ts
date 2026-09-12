/**
 * kernel/errors.ts — Typed error taxonomy
 *
 * WHY THIS EXISTS
 * ---------------
 * All errors in the codebase are currently plain `new Error(message)` with
 * string messages. The dispatcher catches them and returns a generic
 * "Terjadi kesalahan" to the client — no retry decision, no HTTP status
 * mapping, no structured error code for monitoring.
 *
 * This module provides a single AppError class that carries:
 *   - code: machine-readable error code (e.g. 'UPSTREAM_TIMEOUT')
 *   - httpStatus: correct HTTP status code for the response
 *   - retryable: whether the caller should retry
 *   - cause: original error for debugging
 *
 * USAGE
 * -----
 *   throw new AppError('VALIDATION_FAILED', { detail: 'no_wa is required' });
 *   throw new AppError('UPSTREAM_TIMEOUT', { retryable: true });
 *   throw new AppError('FORBIDDEN', { httpStatus: 403 });
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly retryable: boolean;
  public readonly detail?: string;
  /**
   * Seconds the client should wait before retrying. Set by load shedding
   * (kernel/admission.ts) and deadline enforcement (kernel/deadline.ts) so the
   * value reflects actual measured pressure rather than a fixed guess.
   * Surfaced as the HTTP Retry-After header by the request wrappers.
   */
  public readonly retryAfter?: number;

  constructor(
    code: string,
    opts: {
      message?: string;
      httpStatus?: number;
      retryable?: boolean;
      detail?: string;
      retryAfter?: number;
      cause?: unknown;
    } = {},
  ) {
    super(opts.message || code);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = opts.httpStatus ?? codeToStatus(code);
    this.retryable = opts.retryable ?? isRetryableCode(code);
    this.detail = opts.detail;
    this.retryAfter = opts.retryAfter;
    if (opts.cause) this.cause = opts.cause;
  }

  /** Serialize for API response (never leaks internals). */
  toJSON(): { success: false; error: string; code?: string; retryAfter?: number } {
    return {
      success: false,
      error: this.message,
      code: this.code,
      retryAfter: this.retryAfter ?? (this.retryable ? Math.ceil(this.httpStatus === 429 ? 30 : 5) : undefined),
    };
  }
}

// ── Error code → HTTP status mapping ─────────────────────────────────────────
export function codeToStatus(code: string): number {
  const map: Record<string, number> = {
    VALIDATION_FAILED: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    RATE_LIMITED: 429,
    UPSTREAM_TIMEOUT: 504,
    DEADLINE_EXCEEDED: 504,
    UPSTREAM_ERROR: 502,
    INTERNAL_ERROR: 500,
    // Distinct from SERVICE_UNAVAILABLE (a dependency is down): OVERLOADED
    // means *we* are shedding this request because we are saturated. The two
    // need separate codes or monitoring cannot tell load from breakage.
    OVERLOADED: 503,
    SERVICE_UNAVAILABLE: 503,
  };
  return map[code] ?? 500;
}

function isRetryableCode(code: string): boolean {
  return (
    code === 'UPSTREAM_TIMEOUT' ||
    code === 'UPSTREAM_ERROR' ||
    code === 'RATE_LIMITED' ||
    // A shed request and an expired deadline are both worth retrying later —
    // that is the whole point of shedding rather than failing hard.
    code === 'OVERLOADED' ||
    code === 'DEADLINE_EXCEEDED' ||
    // A dependency being down is transient by definition: the database is not
    // gone, it is unreachable. Retrying is the correct client behaviour, which
    // is exactly what `Retry-After` is for. NOTE: kernel/resilience.ts passes
    // `retryable: false` EXPLICITLY when it throws this code for an open
    // breaker — "do not retry immediately" — and an explicit flag still wins,
    // because AppError only falls back to this map when none was given.
    code === 'SERVICE_UNAVAILABLE'
  );
}

// ── Domain-specific error factories ──────────────────────────────────────────
export const Errors = {
  validation: (detail: string) =>
    new AppError('VALIDATION_FAILED', { detail }),

  unauthorized: (msg = 'Sesi tidak valid') =>
    new AppError('UNAUTHORIZED', { message: msg }),

  forbidden: (msg = 'Akses ditolak') =>
    new AppError('FORBIDDEN', { message: msg }),

  notFound: (msg = 'Data tidak ditemukan') =>
    new AppError('NOT_FOUND', { message: msg }),

  rateLimited: (retryAfter: number) =>
    new AppError('RATE_LIMITED', {
      message: `Terlalu banyak permintaan. Coba lagi dalam ${retryAfter} detik.`,
      httpStatus: 429,
      retryable: true,
    }),

  upstreamTimeout: (dep: string) =>
    new AppError('UPSTREAM_TIMEOUT', {
      message: `Timeout: ${dep}`,
      retryable: true,
    }),

  /**
   * The request ran out of its wall-clock deadline (kernel/deadline.ts).
   * 504 + Retry-After: the work may well succeed on a fresh attempt, it just
   * did not fit in the slice this request was given.
   */
  deadlineExceeded: (dep: string, retryAfter = 2) =>
    new AppError('DEADLINE_EXCEEDED', {
      message: `Permintaan melewati batas waktu sebelum memanggil ${dep}`,
      retryAfter,
    }),

  /**
   * We are saturated and shed this request (kernel/admission.ts).
   * Distinct from upstream failure — nothing is broken, we are protecting
   * capacity. Always retryable, always carries a Retry-After hint.
   */
  overloaded: (retryAfter = 5) =>
    new AppError('OVERLOADED', {
      message: 'Server sedang sibuk. Coba lagi sebentar lagi.',
      retryAfter,
    }),

  upstreamError: (dep: string, status: number) =>
    new AppError('UPSTREAM_ERROR', {
      message: `Upstream error ${status}: ${dep}`,
      httpStatus: 502,
      retryable: status >= 500,
    }),

  /**
   * A dependency this request cannot proceed without is down — in practice the
   * database (db/client.ts). 503 + retryable + Retry-After, so a client backs
   * off and tries again instead of treating an outage as a bad request.
   *
   * Deliberately NOT used by kernel/resilience.ts: an open breaker is a
   * deliberate "stop calling me" and passes `retryable: false` itself.
   */
  serviceUnavailable: (msg = 'Layanan sedang tidak tersedia. Coba lagi sebentar lagi.', retryAfter = 5) =>
    new AppError('SERVICE_UNAVAILABLE', { message: msg, retryAfter }),

  internal: (msg = 'Terjadi kesalahan internal') =>
    new AppError('INTERNAL_ERROR', { message: msg }),
} as const;

/**
 * Generic client-facing message for unexpected internal errors. Exported so
 * response wrappers and tests share one literal with safeError below.
 */
export const GENERIC_ERROR_MESSAGE = 'Terjadi kesalahan saat memproses permintaan.';

/**
 * safeError — build a client-facing error string for a catch block WITHOUT
 * leaking internal detail (playbook §3.3 "never leak", Day 1–30 PR4).
 *
 *   - AppError  → its own message passes through (deliberate, user-safe).
 *   - anything else → GENERIC_ERROR_MESSAGE; the original is console.error'd
 *     here so call sites keep server-side detail without writing it themselves.
 *
 * Replaces the `'Gagal X: ' + e.message` pattern: PostgREST bodies, upstream
 * fragments and table/column names must never reach the client.
 */
export function safeError(prefix: string, err: unknown): string {
  // AppError fields are deliberate, user-safe copy — prefer `detail` (human
  // text set by Errors.validation) over `message` (which may be the raw code).
  if (err instanceof AppError) return err.detail || err.message;
  console.error('[safeError]', prefix, err);
  return prefix ? prefix + ' ' + GENERIC_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE;
}

/**
 * Convert any error to a safe API response object.
 * Never leaks stack traces or internal details to the client.
 */
export function toErrorResponse(err: unknown): {
  success: false;
  error: string;
  code?: string;
  retryAfter?: number;
} {
  if (err instanceof AppError) return err.toJSON();
  if (err instanceof Error) {
    return {
      success: false,
      error: 'Terjadi kesalahan saat memproses permintaan.',
      code: 'INTERNAL_ERROR',
    };
  }
  return {
    success: false,
    error: 'Terjadi kesalahan saat memproses permintaan.',
    code: 'INTERNAL_ERROR',
  };
}
