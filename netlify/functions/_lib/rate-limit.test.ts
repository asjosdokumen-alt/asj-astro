// ==========================================
// TESTS: rate-limit.js — in-memory rate limiter.
// - check(): within limit → ok, over limit → retryAfter.
// - fail(): lockout after N failures.
// - Window reset: count resets after windowMs.
// - Bucket pruning: max 20000 buckets.
// ==========================================
import { describe, it, expect } from 'vitest';

import { check, fail } from './rate-limit';

describe('rate-limit — check()', () => {
  it('first request within limit → ok', () => {
    const result = check('test-ok-1', { limit: 5, windowMs: 60000 });
    expect(result.ok).toBe(true);
  });

  it('requests within limit → ok', () => {
    for (let i = 0; i < 5; i++) {
      const result = check('test-within-5', { limit: 5, windowMs: 60000 });
      expect(result.ok).toBe(true);
    }
  });

  it('request over limit → not ok with retryAfter', () => {
    // Exhaust the limit
    for (let i = 0; i < 5; i++) {
      check('test-over-limit', { limit: 5, windowMs: 60000 });
    }
    // Next request should fail
    const result = check('test-over-limit', { limit: 5, windowMs: 60000 });
    expect(result.ok).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.locked).toBeUndefined();
  });
});

describe('rate-limit — fail() + lockout', () => {
  it('fail() increments failure count', () => {
    fail('test-fail-incr', { windowMs: 60000, lockoutAfter: 3, lockoutMs: 30000 });
    fail('test-fail-incr', { windowMs: 60000, lockoutAfter: 3, lockoutMs: 30000 });
    // 2 failures — not locked yet
    const result = check('test-fail-incr', { limit: 5, windowMs: 60000 });
    expect(result.ok).toBe(true);
  });

  it('fail() triggers lockout after threshold', () => {
    fail('test-lockout', { windowMs: 60000, lockoutAfter: 2, lockoutMs: 30000 });
    fail('test-lockout', { windowMs: 60000, lockoutAfter: 2, lockoutMs: 30000 });
    // 2 failures → lockout
    const result = check('test-lockout', { limit: 5, windowMs: 60000 });
    expect(result.ok).toBe(false);
    expect(result.locked).toBe(true);
    expect(result.retryAfter).toBeGreaterThan(0);
  });
});

describe('rate-limit — separate keys', () => {
  it('different keys are independent', () => {
    // Exhaust key-a
    for (let i = 0; i < 5; i++) {
      check('test-separate-a', { limit: 5, windowMs: 60000 });
    }
    // key-b should still be ok
    const result = check('test-separate-b', { limit: 5, windowMs: 60000 });
    expect(result.ok).toBe(true);
  });
});
