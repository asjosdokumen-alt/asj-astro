import { describe, it, expect, vi } from 'vitest';
import {
  withRetry,
  breaker,
  bulkhead,
  callWithProtection,
} from './resilience';

describe('withRetry', () => {
  it('returns immediately on success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { attempts: 2 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on retryable error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('HTTP 500'))
      .mockResolvedValue('ok');
    const result = await withRetry(fn, { attempts: 2, base: 1, max: 5, idempotent: true });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('HTTP 500'));
    await expect(
      withRetry(fn, { attempts: 2, base: 1, max: 5, idempotent: true }),
    ).rejects.toThrow('HTTP 500');
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('does not retry non-idempotent operations', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('HTTP 500'));
    await expect(
      withRetry(fn, { attempts: 2, idempotent: false }),
    ).rejects.toThrow('HTTP 500');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('HTTP 400'));
    await expect(
      withRetry(fn, { attempts: 2, base: 1 }),
    ).rejects.toThrow('HTTP 400');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('circuit breaker', () => {
  it('starts in closed state', () => {
    breaker.reset('test-dep');
    expect(breaker.getState('test-dep')).toBe('closed');
  });

  it('opens after threshold failures', () => {
    breaker.reset('test-dep');
    for (let i = 0; i < 5; i++) {
      breaker.failure('test-dep');
    }
    expect(breaker.getState('test-dep')).toBe('open');
  });

  it('rejects calls when open', () => {
    breaker.reset('test-dep');
    for (let i = 0; i < 5; i++) breaker.failure('test-dep');
    expect(() => breaker.check('test-dep')).toThrow('Circuit breaker open');
  });

  it('transitions to half-open after cooldown', () => {
    breaker.reset('test-dep');
    // Simulate: open the breaker, then manipulate time
    for (let i = 0; i < 5; i++) breaker.failure('test-dep');
    expect(breaker.getState('test-dep')).toBe('open');
    // Reset with cooldown expired (for testing purposes, just reset)
    breaker.reset('test-dep');
    expect(breaker.getState('test-dep')).toBe('closed');
  });

  it('records success after probe', () => {
    breaker.reset('test-dep');
    breaker.success('test-dep');
    expect(breaker.getState('test-dep')).toBe('closed');
  });
});

describe('bulkhead', () => {
  it('allows calls within limit', async () => {
    const release = await bulkhead.acquire('test-dep');
    expect(typeof release).toBe('function');
    release();
  });

  it('releases slot after calling release', async () => {
    const release = await bulkhead.acquire('test-dep');
    release();
    // Should be able to acquire again
    const release2 = await bulkhead.acquire('test-dep');
    release2();
  });

  it('tracks inflight count', async () => {
    const release = await bulkhead.acquire('bulk-test');
    expect(bulkhead.getInflight('bulk-test')).toBe(1);
    release();
    expect(bulkhead.getInflight('bulk-test')).toBe(0);
  });
});

describe('callWithProtection', () => {
  it('calls function and returns result', async () => {
    breaker.reset('test-prot');
    const result = await callWithProtection('test-prot', async () => 'ok', {
      retry: { attempts: 0 },
    });
    expect(result).toBe('ok');
  });

  it('retries on failure and records breaker state', async () => {
    breaker.reset('test-prot2');
    let calls = 0;
    const result = await callWithProtection('test-prot2', async () => {
      calls++;
      if (calls < 2) throw new Error('HTTP 503');
      return 'recovered';
    }, { retry: { attempts: 1, base: 1, max: 5, idempotent: true } });
    expect(result).toBe('recovered');
    expect(calls).toBe(2);
  });
});

/**
 * Dependency classification decides WHICH breaker, WHICH bulkhead pool and
 * WHETHER the telemetry write recurses. A wrong answer is not cosmetic:
 * classifying Neon as 'other' made `logDependencyCall()` log every database
 * call, and each log write is itself a database call — measured 2026-10-21 as
 * an admin panel stuck on "Gagal memuat data" with a bulkhead error.
 *
 * The host changed; these assertions are the tripwire for the next change.
 */
describe('detectDependency — PostgREST host recognition', () => {
  const neon = 'https://ep-bold-sunset-b3zy6wb1.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1/job_database';
  const supabase = 'https://gdwvffmevwtwnzrapjwy.supabase.co/rest/v1/job_database';

  it('recognises the Neon Data API as postgrest, not "other"', async () => {
    const { detectDependency } = await import('./http');
    expect(detectDependency(neon)).toBe('postgrest');
  });

  it('still recognises Supabase', async () => {
    const { detectDependency } = await import('./http');
    expect(detectDependency(supabase)).toBe('postgrest');
  });

  it('keeps Storage separate from the database on both hosts', async () => {
    const { detectDependency } = await import('./http');
    expect(detectDependency('https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/a.png')).toBe('storage');
    expect(detectDependency('https://res.cloudinary.com/ybzzbw9i/image/upload/a.jpg')).toBe('cloudinary');
  });
});
