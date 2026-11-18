// H-3 — central session gate: fork revision checks go through ONE dispatch
// point, so the ~67 synchronous requireRole/isOwnerOrAdmin call sites do not
// each have to become async. This suite proves the gate refuses revoked and
// unverifiable sessions, and that it does not lock users out of logging back
// in.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./env.js', () => ({
  env: (key: string) => (key === 'SESSION_SECRET' ? 'session-gate-test-secret' : ''),
  debugFileEnvKeys: () => ({}),
  debugFileStructure: () => ({}),
}));

const db = {
  rows: null as unknown,
  fail: false,
  calls: 0,
};

vi.mock('./db/client', async (importOriginal) => {
  const asli = await importOriginal<typeof import('./db/client')>();
  return {
    ...asli,
    supabaseJson: vi.fn(async () => {
      db.calls += 1;
      if (db.fail) throw new Error('db down');
      return db.rows;
    }),
  };
});

import { signToken } from './session';
import {
  checkSessionGate,
  clearSessionGateCache,
  invalidateSessionGateSubject,
  sessionGateIsRevoked,
  sessionGateSubject,
} from './session-gate';

const SEKARANG = () => Math.floor(Date.now() / 1000);

beforeEach(() => {
  db.rows = [];
  db.fail = false;
  db.calls = 0;
  clearSessionGateCache();
});

describe('session-gate — H-3 di dispatch terpusat', () => {
  it('token tanpa sesi dan aksi publik tidak kena gerbang', async () => {
    expect(await checkSessionGate('getAppData', '')).toEqual({ ok: true });
    expect(await checkSessionGate('submitApply', '')).toEqual({ ok: true });
    expect(db.calls).toBe(0);
  });

  it('refresh token TIDAK pernah dianggap sebagai token sesi', async () => {
    const rt = signToken({ role: 'kandidat', wa: '081234567890', kind: 'refresh', iat: SEKARANG() });
    const out = await checkSessionGate('getAppData', rt);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.sessionInvalid).toBe(true);
    expect(db.calls).toBe(0);
  });

  it('token yang lebih tua dari epoch ditolak', async () => {
    const epoch = SEKARANG();
    db.rows = [{ revoked_at: new Date(epoch * 1000).toISOString() }];
    const lama = signToken({ role: 'kandidat', wa: '081234567890', iat: epoch - 10 });
    const out = await checkSessionGate('simpanBiodataLengkap', lama);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('diakhiri');
  });

  it('token yang lebih baru dari epoch tetap lolos', async () => {
    const epoch = SEKARANG() - 10;
    db.rows = [{ revoked_at: new Date(epoch * 1000).toISOString() }];
    const baru = signToken({ role: 'kandidat', wa: '081234567890', iat: epoch + 2 });
    expect(await checkSessionGate('simpanBiodataLengkap', baru)).toEqual({ ok: true });
  });

  it('tabel revokasi tidak terbaca ⇒ GAGAL TUTUP, bukan lolos', async () => {
    db.fail = true;
    const t = signToken({ role: 'admin', name: 'AGUS', iat: SEKARANG() });
    const out = await checkSessionGate('approveForm', t);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain('tidak dapat diverifikasi');
    expect(db.calls).toBe(1);
  });

  it('jawaban cache yang masih segar tidak memerlukan DB (biaya Neon)', async () => {
    const t = signToken({ role: 'admin', name: 'AGUS', iat: SEKARANG() });
    expect((await checkSessionGate('approveForm', t)).ok).toBe(true);
    expect(db.calls).toBe(1);
    // DB mati sesudahnya: cache 15 dtk tetap dipakai, sesuai kontrak biaya.
    db.fail = true;
    expect((await checkSessionGate('approveForm', t)).ok).toBe(true);
    expect(db.calls).toBe(1);
  });

  it('setelah pencabutan berhasil, cache invalidasi ⇒ DB mati bikin gagal tutup', async () => {
    const t = signToken({ role: 'admin', name: 'AGUS', iat: SEKARANG() });
    expect((await checkSessionGate('approveForm', t)).ok).toBe(true);
    invalidateSessionGateSubject('admin:AGUS');
    db.fail = true;
    expect((await checkSessionGate('approveForm', t)).ok).toBe(false);
  });

  it('login, refresh, logout dan ganti password tidak dikunci oleh sesi lama', async () => {
    const t = signToken({ role: 'kandidat', wa: '081234567890', iat: 1 });
    for (const action of ['loginKandidat', 'refreshKandidatSession', 'logout', 'gantiPasswordKandidat']) {
      expect((await checkSessionGate(action, t)).ok, action).toBe(true);
    }
    expect(db.calls).toBe(0);
  });

  it('subjek berasal dari payload bertanda tangan, bukan field request', () => {
    const t = signToken({ role: 'kandidat', wa: '081234567890' });
    expect(sessionGateSubject(t)).toBe('kandidat:6281234567890');
    expect(sessionGateSubject('bukan-token')).toBeNull();
  });

  it('aturan iat < revoked_at identik dengan kanon identity/service', () => {
    expect(sessionGateIsRevoked(10, 11)).toBe(true);
    expect(sessionGateIsRevoked(11, 11)).toBe(false);
    expect(sessionGateIsRevoked(undefined, 11)).toBe(true);
    expect(sessionGateIsRevoked(10, null)).toBe(false);
  });

  it('burst paralel untuk subjek sama hanya satu kali baca DB', async () => {
    const t = signToken({ role: 'admin', name: 'AGUS', iat: SEKARANG() });
    const hasil = await Promise.all(
      Array.from({ length: 8 }, () => checkSessionGate('getAppData', t)),
    );
    expect(hasil.every((h) => h.ok)).toBe(true);
    expect(db.calls).toBe(1);
  });
});
