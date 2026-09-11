// ==========================================
// TESTS: kernel/deadline — the occupancy bound (Phase B)
//
// The deadline is what stops per-dependency budgets from summing past the
// request's allowance. These tests pin the three behaviours that matter:
//   1. no deadline set → completely inert (Infinity, no clamping)
//   2. a budget larger than the remaining time is clamped down
//   3. an exhausted deadline refuses work instead of issuing a doomed call
// ==========================================
import { describe, it, expect } from 'vitest';

import { runWithContext } from './log';
import {
  remainingMs,
  clampBudget,
  expired,
  assertAlive,
  deadlineFrom,
  DEFAULT_DEADLINE_MS,
  MIN_SLICE_MS,
} from './deadline';

/** Run `fn` as if inside a request with the given absolute deadline. */
function inRequest<T>(deadlineAt: number | undefined, fn: () => T): T {
  return runWithContext({ requestId: 'test-req', deadlineAt }, fn);
}

describe('kernel/deadline — occupancy bound', () => {
  it('is inert when no deadline is set (outside a request context)', () => {
    inRequest(undefined, () => {
      expect(remainingMs()).toBe(Number.POSITIVE_INFINITY);
      expect(expired()).toBe(false);
      // An unclamped budget must pass through untouched, or background jobs
      // and scripts that never set a deadline would lose their timeouts.
      expect(clampBudget(5_000)).toBe(5_000);
      expect(() => assertAlive('postgrest')).not.toThrow();
    });
  });

  it('clamps a budget that would outlive the deadline', () => {
    inRequest(Date.now() + 800, () => {
      const clamped = clampBudget(5_000);
      expect(clamped).toBeLessThanOrEqual(800);
      expect(clamped).toBeGreaterThan(700);
    });
  });

  it('leaves a budget that fits comfortably inside the deadline alone', () => {
    inRequest(Date.now() + 10_000, () => {
      expect(clampBudget(2_000)).toBe(2_000);
    });
  });

  it('reports an exhausted deadline and clamps to zero', () => {
    inRequest(Date.now() - 1, () => {
      expect(expired()).toBe(true);
      expect(clampBudget(2_000)).toBe(0);
    });
  });

  it('assertAlive throws a retryable 504 once no usable slice remains', () => {
    inRequest(Date.now() - 1, () => {
      let caught: any;
      try {
        assertAlive('postgrest');
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeDefined();
      expect(caught.code).toBe('DEADLINE_EXCEEDED');
      expect(caught.httpStatus).toBe(504);
      // The request itself is worth retrying — it just did not fit this time.
      expect(caught.retryable).toBe(true);
    });
  });

  it('refuses work while a sliver of time remains, rather than starting it', () => {
    // Half the minimum slice: not enough to open a socket and get an answer.
    inRequest(Date.now() + Math.floor(MIN_SLICE_MS / 2), () => {
      expect(() => assertAlive('postgrest')).toThrow();
    });
    // Just over the minimum: allowed through.
    inRequest(Date.now() + MIN_SLICE_MS * 4, () => {
      expect(() => assertAlive('postgrest')).not.toThrow();
    });
  });

  it('deadlineFrom composes an absolute deadline and the default is sane', () => {
    expect(deadlineFrom(1_000, 5_000)).toBe(6_000);
    // Must be well under the 60 s Netlify synchronous ceiling, because a longer
    // budget means longer slot occupancy — the opposite of bounding load.
    expect(DEFAULT_DEADLINE_MS).toBeGreaterThan(1_000);
    expect(DEFAULT_DEADLINE_MS).toBeLessThan(30_000);
  });
});
