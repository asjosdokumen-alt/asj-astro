// ==========================================
// TESTS: contexts/identity/service — session refresh + token guards.
// Relocated from the retired _lib/actions-auth dispatcher suite (2026-09-04):
// surfaces/auth delegates refresh + guard logic to contexts/identity now, so
// the coverage follows the logic. Assertions follow identity's live contract
// ({ success:false, message } on rejection, kind:'session' on re-issued
// tokens), not the legacy { sessionInvalid:true } shape.
// ==========================================
import { describe, it, expect, vi } from 'vitest';
import { refreshAdminSession, refreshKandidatSession, requireRole, requireAdmin, isOwnerOrAdmin } from './service';
import { signToken, verifyToken } from '../../_lib/session';

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
