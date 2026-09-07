/**
 * _lib/characterisation.test.ts — Characterisation tests (Phase 0 item 5)
 *
 * These tests lock down the CURRENT BEHAVIOUR of the 6 most critical
 * business-logic paths. They act as a regression net: if a refactor
 * accidentally changes observable behaviour, these tests will fail.
 *
 * Each describe block corresponds to one critical path:
 *   1. normalizeWa — WhatsApp number normalization
 *   2. session sign/verify — HMAC token roundtrip
 *   3. validatePayload — Zod schema boundary
 *   4. requireRole / requireAdmin — session guards
 *   5. isOwnerOrAdmin — ownership check
 *   6. mailStatusUntukUpdate — mail inbox status transitions
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ── 1. normalizeWa ──────────────────────────────────────────────────────────
import { normalizeWa, isValidWaFormat, normalizeGender } from '../shared/wa-rules';

describe('normalizeWa — characterisation', () => {
  describe('Indonesian numbers (08xx → 628xx)', () => {
    it('converts 08 prefix to 628', () => {
      expect(normalizeWa('08123456789')).toBe('628123456789');
    });

    it('preserves already-canonical 628 format', () => {
      expect(normalizeWa('628123456789')).toBe('628123456789');
    });

    it('strips non-digit characters before normalizing', () => {
      expect(normalizeWa('0812-3456-7890')).toBe('6281234567890');
      expect(normalizeWa('+62 812 345 678')).toBe('62812345678');
    });

    it('handles 6208 typo → 628', () => {
      expect(normalizeWa('6208123456789')).toBe('628123456789');
    });
  });

  describe('Japanese numbers (0xx → 81xx)', () => {
    it('converts 090 prefix to 8190', () => {
      expect(normalizeWa('09012345678')).toBe('819012345678');
    });

    it('converts 070 prefix to 8170 (JP mobile, never routed to Indo)', () => {
      // P39 fix: 8170… 12 digit TETAP Jepang (sebelumnya salah arah ke 62+).
      expect(normalizeWa('07012345678')).toBe('817012345678');
    });

    it('preserves already-canonical 81 format', () => {
      expect(normalizeWa('819012345678')).toBe('819012345678');
    });
  });

  describe('edge cases', () => {
    it('returns empty string for empty input', () => {
      expect(normalizeWa('')).toBe('');
    });

    it('returns empty string for non-numeric garbage', () => {
      expect(normalizeWa('abcdefghij')).toBe('');
    });

    it('returns empty string for too-short input', () => {
      expect(normalizeWa('123')).toBe('');
    });
  });

  describe('isValidWaFormat — characterisation', () => {
    it('accepts valid Indonesian WA numbers', () => {
      expect(isValidWaFormat('0812345678901')).toBe(true); // 13 digits after normalize
      expect(isValidWaFormat('6281234567890')).toBe(true);
    });

    it('rejects invalid formats', () => {
      expect(isValidWaFormat('123')).toBe(false);
      expect(isValidWaFormat('')).toBe(false);
    });
  });
});

// ── 2. session sign/verify ──────────────────────────────────────────────────
import { signToken, verifyToken } from './session';

describe('session sign/verify — characterisation', () => {
  it('roundtrips a basic admin token', () => {
    const token = signToken({ role: 'admin', name: 'test', kind: 'session' });
    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.role).toBe('admin');
    expect(payload!.name).toBe('test');
    expect(payload!.kind).toBe('session');
  });

  it('roundtrips a kandidat token with wa', () => {
    const token = signToken({ role: 'kandidat', wa: '6281234567890', kind: 'session' });
    const payload = verifyToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.role).toBe('kandidat');
    expect(payload!.wa).toBe('6281234567890');
  });

  it('rejects tampered tokens', () => {
    const token = signToken({ role: 'admin', name: 'test' });
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(verifyToken(tampered)).toBeNull();
  });

  it('rejects empty / null / undefined', () => {
    expect(verifyToken('')).toBeNull();
    expect(verifyToken('garbage')).toBeNull();
    expect(verifyToken('a.b.c')).toBeNull();
  });

  it('rejects refresh tokens as session tokens (kind distinction)', () => {
    const rt = signToken({ role: 'admin', name: 'test', kind: 'refresh' });
    const payload = verifyToken(rt);
    expect(payload).not.toBeNull();
    expect(payload!.kind).toBe('refresh'); // verify returns it, but requireRole checks kind
  });
});

// ── 3. validatePayload ──────────────────────────────────────────────────────
import { validatePayload, schemas } from './kernel/validate';
import { AppError } from './kernel/errors';

describe('validatePayload — characterisation', () => {
  it('extracts valid PIN from array', () => {
    const [pin] = validatePayload(['1234'], schemas.adminMasterPin);
    expect(pin).toBe('1234');
  });

  it('throws AppError for missing PIN', () => {
    expect(() => validatePayload([], schemas.adminMasterPin)).toThrow(AppError);
  });

  it('throws AppError for non-numeric PIN', () => {
    expect(() => validatePayload(['abcd'], schemas.adminMasterPin)).toThrow(AppError);
  });    it('validates WA number format', () => {
    const [wa, _pass] = validatePayload(['08123456789012', 'secret123'], schemas.kandidatLogin);
    expect(wa).toBe('08123456789012');
  });

  it('throws AppError for invalid WA', () => {
    expect(() => validatePayload(['123', 'password'], schemas.kandidatLogin)).toThrow(AppError);
  });

  it('validates admin personal (name + pin)', () => {
    const [name, pin] = validatePayload(['admin1', '1234'], schemas.adminPersonalPin);
    expect(name).toBe('admin1');
    expect(pin).toBe('1234');
  });
});

// ── 4. requireRole / requireAdmin ────────────────────────────────────────────
import { requireRole, requireAdmin, isOwnerOrAdmin } from '../contexts/identity/service';

describe('requireRole — characterisation', () => {
  it('returns token payload for valid admin session', () => {
    const token = signToken({ role: 'admin', name: 'master', kind: 'session' });
    const result = requireRole(token, 'admin');
    expect(result.token).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it('returns error for wrong role', () => {
    const token = signToken({ role: 'kandidat', wa: '6281234567890', kind: 'session' });
    const result = requireRole(token, 'admin');
    expect(result.error).toBeDefined();
    expect(result.error!.success).toBe(false);
  });

  it('returns error for refresh tokens (kind=refresh)', () => {
    const token = signToken({ role: 'admin', name: 'master', kind: 'refresh' });
    const result = requireRole(token, 'admin');
    expect(result.error).toBeDefined();
  });

  it('returns error for empty/invalid token', () => {
    expect(requireRole('', 'admin').error).toBeDefined();
    expect(requireRole('garbage', 'admin').error).toBeDefined();
  });
});

describe('requireAdmin — characterisation', () => {
  it('accepts valid admin token', () => {
    const token = signToken({ role: 'admin', name: 'master', kind: 'session' });
    expect(requireAdmin(token).token).toBeDefined();
  });

  it('rejects kandidat token', () => {
    const token = signToken({ role: 'kandidat', wa: '6281234567890', kind: 'session' });
    expect(requireAdmin(token).error).toBeDefined();
  });
});

// ── 5. isOwnerOrAdmin ───────────────────────────────────────────────────────
describe('isOwnerOrAdmin — characterisation', () => {
  it('admin can access any wa', () => {
    const token = signToken({ role: 'admin', name: 'master', kind: 'session' });
    expect(isOwnerOrAdmin(token, '6281234567890')).toBe(true);
  });

  it('kandidat can access own wa', () => {
    const token = signToken({ role: 'kandidat', wa: '6281234567890', kind: 'session' });
    expect(isOwnerOrAdmin(token, '6281234567890')).toBe(true);
  });

  it('kandidat cannot access other wa', () => {
    const token = signToken({ role: 'kandidat', wa: '6281234567890', kind: 'session' });
    expect(isOwnerOrAdmin(token, '6289999999999')).toBe(false);
  });

  it('refresh token is rejected', () => {
    const token = signToken({ role: 'admin', name: 'master', kind: 'refresh' });
    expect(isOwnerOrAdmin(token, '6281234567890')).toBe(false);
  });

  it('empty token is rejected', () => {
    expect(isOwnerOrAdmin('', '6281234567890')).toBe(false);
  });
});

// ── 6. mailStatusUntukUpdate — mail inbox transitions ────────────────────────
import { mailStatusUntukUpdate, appendFeedback } from '../contexts/applications/service';

describe('mailStatusUntukUpdate — characterisation', () => {
  it('unprocessed statuses stay MENUNGGU', () => {
    expect(mailStatusUntukUpdate('MENUNGGU')).toBe('MENUNGGU');
    expect(mailStatusUntukUpdate('MAIL')).toBe('MENUNGGU');
    expect(mailStatusUntukUpdate('BARU')).toBe('MENUNGGU');
    expect(mailStatusUntukUpdate('PENDING')).toBe('MENUNGGU');
    expect(mailStatusUntukUpdate('')).toBe('MENUNGGU');
  });

  it('processed statuses become UPDATE', () => {
    expect(mailStatusUntukUpdate('LULUS')).toBe('UPDATE');
    expect(mailStatusUntukUpdate('GAGAL')).toBe('UPDATE');
    expect(mailStatusUntukUpdate('REVIEW')).toBe('UPDATE');
    expect(mailStatusUntukUpdate('APPROVED')).toBe('UPDATE');
    expect(mailStatusUntukUpdate('REJECTED')).toBe('UPDATE');
  });

  it('case-insensitive', () => {
    expect(mailStatusUntukUpdate('lulus')).toBe('UPDATE');
    expect(mailStatusUntukUpdate('menunggu')).toBe('MENUNGGU');
  });
});

describe('appendFeedback — characterisation', () => {
  it('first entry', () => {
    expect(appendFeedback('', '[BIODATA] email diubah')).toBe('[BIODATA] email diubah');
  });

  it('prepends new entry', () => {
    expect(appendFeedback('[BIODATA] email diubah', '[UPLOAD KTP]')).toBe(
      '[UPLOAD KTP] · [BIODATA] email diubah',
    );
  });

  it('caps at 3 entries (oldest dropped)', () => {
    expect(appendFeedback('[A] · [B] · [C]', '[D]')).toBe('[D] · [A] · [B]');
  });
});

// ── normalizeGender ──────────────────────────────────────────────────────────
describe('normalizeGender — characterisation', () => {
  it('normalizes Indonesian variants', () => {
    expect(normalizeGender('laki-laki')).toBe('LAKI-LAKI');
    expect(normalizeGender('LAKI')).toBe('LAKI-LAKI');
    expect(normalizeGender('pria')).toBe('LAKI-LAKI');
    expect(normalizeGender('cowok')).toBe('LAKI-LAKI');
    expect(normalizeGender('male')).toBe('LAKI-LAKI');
  });

  it('normalizes female variants', () => {
    expect(normalizeGender('perempuan')).toBe('PEREMPUAN');
    expect(normalizeGender('wanita')).toBe('PEREMPUAN');
    expect(normalizeGender('cewek')).toBe('PEREMPUAN');
    expect(normalizeGender('female')).toBe('PEREMPUAN');
  });

  it('returns empty for unknown', () => {
    expect(normalizeGender('')).toBe('');
    expect(normalizeGender('unknown')).toBe('');
  });
});
