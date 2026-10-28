// ==========================================
// TESTS: rate-limit.js — in-memory rate limiter.
// - check(): within limit → ok, over limit → retryAfter.
// - fail(): lockout after N failures.
// - Window reset: count resets after windowMs.
// - Bucket pruning: max 20000 buckets.
// ==========================================
import { describe, it, expect } from 'vitest';

import { check, fail } from './rate-limit';
import { clientIp } from './kernel/request-helpers';

/**
 * The IP is the RATE-LIMIT KEY (`netlify-wrapper.ts:88` passes
 * `ip: clientIp(event)`), so anything a caller can influence here is a caller
 * choosing its own bucket — i.e. no limit at all.
 *
 * `x-forwarded-for` is a LIST that each proxy appends to: the left-most entry is
 * whatever the CLIENT sent, the right-most is the last hop that actually saw the
 * connection. Reading `[0]` therefore let a caller send
 * `X-Forwarded-For: 1.2.3.4` and pick a fresh bucket per request. Netlify also
 * sets `x-nf-client-connection-ip` from the connection itself, which a client
 * cannot forge, so that wins when present.
 */
describe('clientIp — the rate-limit key must not be client-chosen', () => {
  it('prefers the connection header Netlify sets over a forged XFF', () => {
    expect(
      clientIp({
        headers: {
          'x-nf-client-connection-ip': '9.9.9.9',
          'x-forwarded-for': '1.2.3.4',
        },
      }),
    ).toBe('9.9.9.9');
  });

  it('takes the LAST XFF hop, not the client-supplied first entry', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.7' } })).toBe('203.0.113.7');
  });

  it('still answers with the only hop when XFF has one entry', () => {
    expect(clientIp({ headers: { 'x-forwarded-for': '203.0.113.7' } })).toBe('203.0.113.7');
  });

  it('falls back to client-ip / x-real-ip, and null when nothing is present', () => {
    expect(clientIp({ headers: { 'client-ip': '198.51.100.2' } })).toBe('198.51.100.2');
    expect(clientIp({ headers: {} })).toBe(null);
  });
});

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
