// ==========================================
// TESTS: contexts/identity/service — session refresh + token guards.
// Relocated from the retired _lib/actions-auth dispatcher suite (2026-09-04):
// surfaces/auth delegates refresh + guard logic to contexts/identity now, so
// the coverage follows the logic. Assertions follow identity's live contract
// ({ success:false, message } on rejection, kind:'session' on re-issued
// tokens), not the legacy { sessionInvalid:true } shape.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Revocation state, controlled by the tests.
 *
 * `vi.hoisted` because `vi.mock` is hoisted above every import: a plain
 * top-level `const` would still be in its temporal dead zone when the factory
 * runs. Everything NOT overridden below comes from the real module, so the
 * existing login/refresh tests keep their real behaviour.
 */
const revoked = vi.hoisted(() => ({
  subjects: new Map<string, number>(),
  /** WA whose candidate row no longer exists. */
  candidateMissing: new Set<string>(),
  /** Simulates an unreachable DB: every lookup answers "unknown". */
  dbDown: false,
}));

vi.mock('./repository', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('./repository');
  return {
    ...actual,
    getSessionRevokedAt: async (subject: string) => revoked.subjects.get(subject) ?? null,
    revokeSessionSubject: async (subject: string) => {
      revoked.subjects.set(subject, Math.floor(Date.now() / 1000));
      return true;
    },
    candidateExistsForRefresh: async (wa: string) =>
      revoked.dbDown ? null : !revoked.candidateMissing.has(wa),
  };
});

import {
  refreshAdminSession,
  refreshKandidatSession,
  revokeSession,
  isRevoked,
  requireRole,
  requireAdmin,
  isOwnerOrAdmin,
} from './service';
import { signToken, verifyToken } from '../../_lib/session';

beforeEach(() => {
  revoked.subjects.clear();
  revoked.candidateMissing.clear();
  revoked.dbDown = false;
});

describe('refreshKandidatSession — pemulihan sesi kandidat diam-diam', () => {
  it('refresh token kandidat yang sah → sessionToken baru + wa', async () => {
    const rt = signToken({ role: 'kandidat', wa: '6281234567890', kind: 'refresh' });
    const res = await refreshKandidatSession(rt);
    if (!res.success) throw new Error('expected refresh success: ' + res.message);
    expect(res.wa).toBe('6281234567890');
    const t = verifyToken(res.sessionToken);
    expect(t && t.role).toBe('kandidat');
    expect(t && t.wa).toBe('6281234567890');
    expect(t && t.kind).toBe('session'); // token sesi biasa, bukan refresh
  });

  it('menolak token non-refresh (sesi biasa / role lain / rusak)', async () => {
    const st = signToken({ role: 'kandidat', wa: '6281234567890' });
    expect((await refreshKandidatSession(st)).success).toBe(false);
    const adm = signToken({ role: 'admin', name: 'AGUS', kind: 'refresh' });
    expect((await refreshKandidatSession(adm)).success).toBe(false);
    expect((await refreshKandidatSession('bogus.token')).success).toBe(false);
    expect((await refreshKandidatSession('')).success).toBe(false);
  });

  it('refresh token TIDAK bisa dipakai sebagai sesi aksi lain (guard kind)', () => {
    // requireRole & isOwnerOrAdmin harus menolak token kind 'refresh'.
    const rt = signToken({ role: 'kandidat', wa: '6281234567890', kind: 'refresh' });
    const guarded = requireRole(rt, 'kandidat');
    expect('error' in guarded && guarded.error).toBeTruthy();
    expect(isOwnerOrAdmin(rt, '6281234567890')).toBe(false);
    const rtAdm = signToken({ role: 'admin', name: 'AGUS', kind: 'refresh' });
    const guardedAdm = requireAdmin(rtAdm);
    expect('error' in guardedAdm && guardedAdm.error).toBeTruthy();
  });
});

describe('refreshAdminSession — pemulihan sesi admin diam-diam', () => {
  it('refresh token admin yang sah → sessionToken baru (nama di payload)', async () => {
    const rt = signToken({ role: 'admin', name: 'AGUS', kind: 'refresh' });
    const res = await refreshAdminSession(rt);
    if (!res.success) throw new Error('expected refresh success: ' + res.message);
    const t = verifyToken(res.sessionToken);
    expect(t && t.role).toBe('admin');
    expect(t && t.name).toBe('AGUS');
    expect(t && t.kind).toBe('session');
  });

  it('menolak token non-refresh (sesi biasa / role lain / rusak)', async () => {
    const st = signToken({ role: 'admin', name: 'AGUS' });
    expect((await refreshAdminSession(st)).success).toBe(false);
    const kand = signToken({ role: 'kandidat', wa: '6281234567890', kind: 'refresh' });
    expect((await refreshAdminSession(kand)).success).toBe(false);
    expect((await refreshAdminSession('bogus.token')).success).toBe(false);
    expect((await refreshAdminSession('')).success).toBe(false);
  });
});

// ==========================================
// TESTS: login MENERBITKAN token penyegar (B8 / keputusan A3, 2026-10-29)
//
// Sampai 2026-10-29 tidak ada satu pun `signToken({ kind: 'refresh' })` di repo:
// `refreshAdminSession` / `refreshKandidatSession` sudah benar dan sudah diuji
// di atas, tapi tidak pernah ada token yang bisa ditukar — jadi sesi mati keras
// 24 jam setelah login dan seluruh jalur penyegaran itu kode mati.
//
// Tes di atas memakai token penyegar BUATAN. Yang tidak pernah diuji adalah
// PENERBITANNYA, dan justru itu yang hilang. Tes ini menutup celah tersebut:
// login → tukar → sesi baru yang sah.
// ==========================================
describe('login menerbitkan token penyegar yang bisa ditukar', () => {
  const HASH = '$2b$04$gbWzIrJxRD68GKiTXZqxB.k5COp/zdrEhF5RRII9dEBvzLahOwBSS'; // bcrypt('rahasia')

  it('loginKandidat → refreshToken sah → refreshKandidatSession memberi sesi baru', async () => {
    vi.doMock('./repository', () => ({
      findCandidateForAuth: async () => ({
        no_wa: '6281234567890',
        nama_lengkap: 'BUDI',
        password_kandidat: HASH,
      }),
      // `doMock` replaces the WHOLE module, so every function the code under
      // test calls has to be present — a missing one surfaces as
      // "repo.getSessionRevokedAt is not a function", not as a failed assertion.
      getSessionRevokedAt: async () => null,
      revokeSessionSubject: async () => true,
      candidateExistsForRefresh: async () => true,
    }));
    vi.resetModules();
    const svc = await import('./service');

    const login = await svc.loginKandidat('6281234567890', 'rahasia');
    if (!login.success) throw new Error(`login gagal: ${login.message}`);
    expect(typeof login.refreshToken).toBe('string');

    // Penyegar itu harus BERBEDA dari token sesi dan berjenis `refresh`.
    const rt = verifyToken(login.refreshToken as string);
    expect(rt?.kind).toBe('refresh');
    expect(login.refreshToken).not.toBe(login.token);

    const refreshed = await svc.refreshKandidatSession(login.refreshToken as string);
    if (!refreshed.success) throw new Error(`refresh gagal: ${refreshed.message}`);
    const st = verifyToken(refreshed.sessionToken as string);
    expect(st?.kind).toBe('session');
    expect(st?.wa).toBe('6281234567890');

    vi.doUnmock('./repository');
  });
});

// ==========================================
// TESTS: pencabutan sesi (migrasi 026, 2026-10-29)
//
// SEBELUM INI tidak ada kill switch sama sekali: `logout` menjawab
// `{success:true}` dan tidak melakukan apa pun, dan ganti password tidak
// menyentuh token yang sudah terbit. Karena refresh diperpanjang DIAM-DIAM
// 60 detik sebelum kedaluwarsa, satu token penyegar yang dicuri berlaku penuh
// 7 hari tanpa satu pun sinyal ke pemiliknya.
//
// Aturannya satu baris: token ditolak bila `iat < revoked_at`. Yang diuji di
// sini adalah PERILAKU (refresh ditolak / diterima), bukan hanya predikatnya.
// ==========================================
describe('pencabutan sesi — kill switch yang benar-benar mematikan', () => {
  const WA = '6281234567890';
  const nowSec = () => Math.floor(Date.now() / 1000);

  it('isRevoked: hanya yang LEBIH TUA; cap waktu sama tetap hidup', () => {
    expect(isRevoked(100, null)).toBe(false); // belum pernah dicabut
    expect(isRevoked(99, 100)).toBe(true); // terbit sebelum pencabutan
    expect(isRevoked(100, 100)).toBe(false); // login ulang di detik yang sama
    expect(isRevoked(101, 100)).toBe(false); // terbit sesudahnya
    // Tanpa `iat` = usia tidak diketahui ⇒ diperlakukan sebagai yang tertua,
    // supaya token lama tidak selamat dari kill switch.
    expect(isRevoked(undefined, 100)).toBe(true);
  });

  it('KONTROL: token penyegar yang sah tetap bisa ditukar', async () => {
    const rt = signToken({ role: 'kandidat', wa: WA, kind: 'refresh' });
    const res = await refreshKandidatSession(rt);
    expect(res.success).toBe(true);
  });

  it('refresh kandidat DITOLAK setelah subjeknya dicabut', async () => {
    const rt = signToken({ role: 'kandidat', wa: WA, kind: 'refresh' });
    // +1 detik: `iat` beresolusi detik, jadi pencabutan harus benar-benar
    // SETELAH token terbit agar tesnya menguji pertidaksamaan, bukan waktu.
    revoked.subjects.set(`kandidat:${WA}`, nowSec() + 1);

    const res = await refreshKandidatSession(rt);

    expect(res.success).toBe(false);
    expect((res as { sessionInvalid?: boolean }).sessionInvalid).toBe(true);
  });

  it('refresh admin DITOLAK setelah subjeknya dicabut', async () => {
    const rt = signToken({ role: 'admin', name: 'AGUS', kind: 'refresh' });
    revoked.subjects.set('admin:AGUS', nowSec() + 1);

    expect((await refreshAdminSession(rt)).success).toBe(false);
  });

  it('pencabutan SATU subjek tidak menyentuh subjek lain', async () => {
    revoked.subjects.set('kandidat:6289999999999', nowSec() + 1);
    const rt = signToken({ role: 'kandidat', wa: WA, kind: 'refresh' });
    expect((await refreshKandidatSession(rt)).success).toBe(true);
  });

  it('revokeSession memakai subjek dari token TERTANDATANGAN, bukan argumen', async () => {
    const rt = signToken({ role: 'kandidat', wa: WA, kind: 'refresh' });
    const res = await revokeSession(undefined, rt);
    expect(res.success).toBe(true);
    expect(revoked.subjects.has(`kandidat:${WA}`)).toBe(true);
  });

  it('revokeSession menolak token yang tidak bisa diverifikasi', async () => {
    expect((await revokeSession('bogus.token', '')).success).toBe(false);
    expect(revoked.subjects.size).toBe(0);
  });
});

// ==========================================
// TESTS: kandidat yang DIHAPUS tidak boleh tetap punya sesi
//
// Sebelum ini `refreshKandidatSession` hanya menandatangani ulang dari payload:
// tidak ada satu pun pembacaan DB. Kandidat yang barisnya dihapus tetap bisa
// menukar token penyegar sampai 7 hari. Pencabutan (026) tidak menutup ini —
// penghapusan tidak menaikkan epoch siapa pun.
//
// TAPI penolakan hanya boleh terjadi pada `false` yang EKSPLISIT. `null` berarti
// kueri gagal; memaksa logout seluruh kandidat saat DB goyang adalah gangguan
// yang lebih besar daripada yang ditutup di sini.
// ==========================================
describe('refresh kandidat — baris yang sudah tidak ada', () => {
  const WA = '6281234567890';

  it('DITOLAK bila kandidatnya sudah tidak ada', async () => {
    const rt = signToken({ role: 'kandidat', wa: WA, kind: 'refresh' });
    revoked.candidateMissing.add(WA);

    const res = await refreshKandidatSession(rt);

    expect(res.success).toBe(false);
    expect((res as { sessionInvalid?: boolean }).sessionInvalid).toBe(true);
  });

  it('KONTROL: DB tidak bisa dihubungi TIDAK mematikan sesi (fail-open)', async () => {
    const rt = signToken({ role: 'kandidat', wa: WA, kind: 'refresh' });
    revoked.dbDown = true;

    expect((await refreshKandidatSession(rt)).success).toBe(true);
  });

  it('KONTROL: kandidat yang masih ada tetap bisa menyegarkan', async () => {
    const rt = signToken({ role: 'kandidat', wa: WA, kind: 'refresh' });
    expect((await refreshKandidatSession(rt)).success).toBe(true);
  });
});
