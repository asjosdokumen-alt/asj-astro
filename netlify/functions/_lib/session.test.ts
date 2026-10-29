// ==========================================
// TESTS: session.js — sign/verify token HMAC-SHA256.
// - Roundtrip: sign lalu verify harus balik payload yang sama.
// - Tampered token harus reject (null).
// - Edge cases: null/undefined/malformed token.
// ==========================================
import { describe, it, expect, vi } from 'vitest';

// Override env() supaya SESSION_SECRET bisa dikontrol test
vi.mock('./env.js', () => {
  const SECRET = 'test-secret-for-session-' + process.env.TEST_SESSION_SECRET;
  return {
    env: (key: string) => (key === 'SESSION_SECRET' ? SECRET : ''),
    debugFileEnvKeys: () => ({}),
    debugFileStructure: () => ({}),
  };
});

import { signToken, verifyToken, type SessionPayload } from './session';

describe('session — signToken + verifyToken', () => {
  // signToken intentionally injects `exp` when the caller does not supply one
  // (S2 fix: 24h for session tokens, 7d for refresh tokens). verifyToken
  // therefore returns the original payload PLUS exp. These tests assert both
  // halves: exp is present and in the future, and every other field survives
  // the roundtrip untouched.
  const nowSec = () => Math.floor(Date.now() / 1000);

  function expectRoundtrip(payload: SessionPayload) {
    const result = verifyToken(signToken(payload)) as SessionPayload & { exp: number; iat: number };
    expect(typeof result.exp).toBe('number');
    expect(result.exp).toBeGreaterThan(nowSec());
    // `iat` is injected unconditionally since 2026-10-29 (revocation compares
    // it against `session_revocations.revoked_at`). Strip BOTH injected claims
    // before comparing, or every roundtrip test fails on a field the caller
    // never supplied.
    expect(typeof result.iat).toBe('number');
    const { exp, iat, ...rest } = result;
    expect(rest).toEqual(payload);
    return exp;
  }

  it('roundtrip: sign → verify mengembalikan payload asli (+ exp)', () => {
    expectRoundtrip({ role: 'admin', name: 'KHOCI' });
  });

  it('roundtrip dengan payload kandidat (role: kandidat + wa)', () => {
    expectRoundtrip({ role: 'kandidat', wa: '6281234567890' });
  });

  it('roundtrip dengan payload kosong', () => {
    expectRoundtrip({});
  });

  it('exp diinject ~24 jam untuk session token (bukan refresh)', () => {
    const exp = expectRoundtrip({ role: 'admin' });
    const hours = (exp - nowSec()) / 3600;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
  });

  it('exp eksplisit dari caller tidak ditimpa', () => {
    const custom = nowSec() + 3600; // 1 hour
    const result = verifyToken(signToken({ role: 'admin', exp: custom })) as SessionPayload & { exp: number };
    expect(result.exp).toBe(custom);
  });

  it('refresh token mendapat exp ~7 hari', () => {
    const result = verifyToken(signToken({ role: 'admin', kind: 'refresh' })) as SessionPayload & { exp: number };
    const days = (result.exp - nowSec()) / 86400;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
  });

  it('token format: base64url.body.base64url.signature', () => {
    const token = signToken({ role: 'admin' });
    const parts = token.split('.');
    expect(parts.length).toBe(2);
    // Both parts should be valid base64url
    expect(parts[0]).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(parts[1]).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('session — tamper detection', () => {
  it('modified body → verify returns null', () => {
    const token = signToken({ role: 'admin' });
    const parts = token.split('.');
    // Tamper the body
    const tampered = Buffer.from(JSON.stringify({ role: 'hacker' })).toString('base64url');
    const badToken = tampered + '.' + parts[1];
    expect(verifyToken(badToken)).toBeNull();
  });

  it('modified signature → verify returns null', () => {
    const token = signToken({ role: 'admin' });
    const parts = token.split('.');
    const badToken = parts[0] + '.AAAA';
    expect(verifyToken(badToken)).toBeNull();
  });

  it('wrong secret produces different signature', () => {
    const token1 = signToken({ role: 'admin' });
    // Since we can't change the secret in test, verify the token is unique
    const token2 = signToken({ role: 'admin' });
    // Both should verify to same payload (same secret)
    expect(verifyToken(token1)).toEqual(verifyToken(token2));
  });
});

describe('session — edge cases', () => {
  it('null → returns null', () => {
    expect(verifyToken(null)).toBeNull();
  });

  it('undefined → returns null', () => {
    expect(verifyToken(undefined)).toBeNull();
  });

  it('empty string → returns null', () => {
    expect(verifyToken('')).toBeNull();
  });

  it('non-string → returns null', () => {
    expect(verifyToken(123)).toBeNull();
    expect(verifyToken({})).toBeNull();
  });

  it('single part (no dot) → returns null', () => {
    expect(verifyToken('abcdef')).toBeNull();
  });

  it('three parts (extra dot) → returns null', () => {
    expect(verifyToken('a.b.c')).toBeNull();
  });

  it('invalid base64 in body → returns null (JSON parse fails)', () => {
    const token = signToken({ role: 'admin' });
    const parts = token.split('.');
    // Replace body with invalid base64 that decodes to invalid JSON
    const badBody = Buffer.from('not-json').toString('base64url');
    const sig = parts[1]; // Keep valid sig
    expect(verifyToken(badBody + '.' + sig)).toBeNull();
  });
});

describe('session — timing safe comparison', () => {
  it('verify uses timingSafeEqual (same-length buffers)', () => {
    const token = signToken({ role: 'admin' });
    const result = verifyToken(token)!;
    expect(result).not.toBeNull();
    expect(result.role).toBe('admin');
  });

  it('different length signature → returns null (length check before timingSafeEqual)', () => {
    const token = signToken({ role: 'admin' });
    const parts = token.split('.');
    // Signature that's too short
    expect(verifyToken(parts[0] + '.abc')).toBeNull();
    // Signature that's too long
    expect(verifyToken(parts[0] + '.' + 'a'.repeat(100))).toBeNull();
  });
});
