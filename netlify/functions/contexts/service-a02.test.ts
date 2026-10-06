// ==========================================
// TESTS: A02 parity crosscheck (2026-09-04) — CandidateProfileModal root
//
// Fixes verified here:
//   1. mapCandidate isSiswaASJ semantics — [VIP] is a VIP tag, NOT a class
//      tag. Legacy js/admin_modal/cv.ts treats [VIP] as its own checkbox;
//      only [KELAS X] / a bare non-VIP [TAG] marks a Siswa ASJ. The old
//      regex /\[(?:KELAS\s*[A-Z0-9]+|[A-Z0-9]+)\]/ matched [VIP] too, so a
//      VIP-only candidate was wrongly flagged as an ASJ student.
//   2. registry.handleUpdateCatatanKandidat remains admin-gated before any
//      DB call (the modal's save path goes through this action).
// Every rejection below fires BEFORE any DB/network call (DB-free).
// ==========================================
import { describe, it, expect } from 'vitest';
import { mapCandidate, toKandidatView } from '../_lib/db/candidates';
import { signToken } from '../_lib/session';
import { handleUpdateCatatanKandidat, buildKandidatSuperPatch } from './registry/service';

const kandidatA = signToken({ role: 'kandidat', wa: '6281111111111' });

const asRecord = (p: Promise<unknown>): Promise<Record<string, any>> => p as Promise<Record<string, any>>;

describe('mapCandidate — [VIP] is not a class tag (A02)', () => {
  it('a [VIP]-only internal note is NOT an ASJ student', () => {
    const c = mapCandidate({ catatan_internal: '[VIP] Rencana resmi' });
    expect(c.isSiswaASJ).toBe(false);
  });

  it('a [KELAS G] note IS an ASJ student', () => {
    const c = mapCandidate({ catatan_internal: '[KELAS G] Angkatan Genji' });
    expect(c.isSiswaASJ).toBe(true);
  });

  it('a bare non-VIP tag (e.g. [G]) IS an ASJ student', () => {
    const c = mapCandidate({ catatan_internal: '[G] grup kelas' });
    expect(c.isSiswaASJ).toBe(true);
  });

  it('an empty internal note is not an ASJ student', () => {
    const c = mapCandidate({ catatan_internal: '' });
    expect(c.isSiswaASJ).toBe(false);
  });
});

// ==========================================
// TESTS: server-derived VIP flags + kandidat payload (#10, 2026-10-05)
//
// The dashboard and the /ai-cv guard used to read the RAW internal memo
// (`catatanInt`) to decide VIP/class. That forced an admin-only note onto the
// wire for `mode=kandidat`. `mapCandidate` now derives the flags and
// `toKandidatView` drops the memo — the client reads only the flags.
// ==========================================
describe('mapCandidate — server-derived VIP flags for the kandidat payload (#10)', () => {
  it('a [VIP]-only note sets isVIP, but NOT kelas / isSiswaASJ', () => {
    const c = mapCandidate({ catatan_internal: '[VIP] Rencana resmi' });
    expect(c.isVIP).toBe(true);
    expect(c.kelas).toBe('');
    expect(c.isSiswaASJ).toBe(false);
  });

  it('a [KELAS G] note sets kelas (the code) and isSiswaASJ, but not isVIP', () => {
    const c = mapCandidate({ catatan_internal: '[KELAS G] Angkatan Genji' });
    expect(c.kelas).toBe('G');
    expect(c.isSiswaASJ).toBe(true);
    expect(c.isVIP).toBe(false);
  });

  it('[vip] lowercase is NOT VIP (case-sensitive — parity the dashboard badge)', () => {
    const c = mapCandidate({ catatan_internal: '[vip] catatan pribadi' });
    expect(c.isVIP).toBe(false);
    expect(c.kelas).toBe('');
  });

  it('falls back to catatan_admin ONLY when catatan_internal is empty (parity old client)', () => {
    // The client's old source was `row.catatanInt || row.catatan`; this keeps the
    // same input so no candidate's badge or gate can flip.
    expect(mapCandidate({ catatan_internal: '', catatan_admin: '[VIP] memo' }).isVIP).toBe(true);
    expect(mapCandidate({ catatan_internal: 'biasa', catatan_admin: '[VIP] memo' }).isVIP).toBe(false);
  });

  // `toKandidatView` removes `catatan`/`catatanInt`/`_raw` BY NAME. If the mapper
  // ever renames one, the strip silently stops matching — so the names are pinned
  // here, next to the mapper that emits them.
  it('still carries the raw memo + row for ADMIN use (the keys toKandidatView removes)', () => {
    const c = mapCandidate({ catatan_admin: 'ADMIN', catatan_internal: 'INT' });
    expect(c.catatan).toBe('ADMIN');
    expect(c.catatanInt).toBe('INT');
    expect(c._raw).toEqual({ catatan_admin: 'ADMIN', catatan_internal: 'INT' });
  });
});

describe('toKandidatView — the server half of the kandidat payload contract (#10)', () => {
  it('drops catatan/catatanInt/_raw and keeps the derived flags + own fields', () => {
    const view = toKandidatView(
      mapCandidate({
        catatan_admin: 'MEMO-ADMIN',
        catatan_internal: '[KELAS G] MEMO-INTERNAL',
        email: 'a@b.test',
      }),
    );
    expect(view).not.toHaveProperty('catatan');
    expect(view).not.toHaveProperty('catatanInt');
    expect(view).not.toHaveProperty('_raw');
    const wire = JSON.stringify(view);
    expect(wire).not.toContain('MEMO-ADMIN');
    expect(wire).not.toContain('MEMO-INTERNAL');
    expect(view.kelas).toBe('G');
    expect(view.email).toBe('a@b.test');
  });
});

describe('registry — updateCatatanKandidat requires an admin session (A02)', () => {
  it('anonymous callers are rejected before any DB read/write', async () => {
    const res = await asRecord(handleUpdateCatatanKandidat(['ASJ00159', 'catatan', '']));
    expect(res.sessionInvalid).toBe(true);
    expect(res.success).toBe(false);
  });

  it('a kandidat session is rejected', async () => {
    const res = await asRecord(handleUpdateCatatanKandidat(['ASJ00159', 'catatan', ''], kandidatA));
    expect(res.sessionInvalid).toBe(true);
  });
});

describe('registry — buildKandidatSuperPatch parity legacy super-edit (A03)', () => {
  const row = { catatan_internal: '[KELAS G] Catatan internal', catatan_external: 'Ext lama', pendidikan: 'SMA' };

  it('persists pendidikan + catatan external and turns the VIP tag on', () => {
    const b = buildKandidatSuperPatch(row, { pendidikan: 'SMK', catatanExt: 'Ext baru', isVip: true });
    expect(b.pendidikan).toBe('SMK');
    expect(b.catatan_external).toBe('Ext baru');
    expect(b.catatan_internal).toContain('[VIP]');
    expect(b.catatan_internal).toContain('[KELAS G]');
  });

  it('removes the VIP tag when toggled off, preserving class tags', () => {
    const b = buildKandidatSuperPatch(
      { catatan_internal: '[VIP] [KELAS G] Catatan internal' },
      { isVip: false },
    );
    expect(b.catatan_internal).toBe('[KELAS G] Catatan internal');
  });

  it('leaves notes untouched when neither isVip nor catatanExt is provided', () => {
    const b = buildKandidatSuperPatch(row, { tahapan: 'LIST' });
    expect(b.catatan_internal).toBeUndefined();
    expect(b.catatan_external).toBeUndefined();
  });

  // REGRESI item 10: tag `[VIP]` case-SENSITIVE (parity lib/vip.ts +
  // isVipCatatan). Dulu /\[VIP\]/i membuat `[vip]` dianggap sudah ada sehingga
  // penulis TIDAK menambahkan `[VIP]` — kandidat tetap terkunci dari gerbang.
  it('turns VIP on for a [vip] note by ADDING the canonical [VIP] tag (case-sensitive)', () => {
    const b = buildKandidatSuperPatch(
      { catatan_internal: '[vip] catatan pribadi' },
      { isVip: true },
    );
    // Tag kanonikal ditambahkan; `[vip]` bukan tag VIP sehingga TIDAK dianggap
    // sebagai tanda "sudah ada".
    expect(b.catatan_internal).toContain('[VIP]');
    expect(b.catatan_internal).toContain('[vip]');
  });

  it('toggling VIP off strips only the canonical [VIP], not a lowercase [vip]', () => {
    const b = buildKandidatSuperPatch(
      { catatan_internal: '[VIP] [vip] catatan' },
      { isVip: false },
    );
    // `[VIP]` kanonikal dihapus, `[vip]` (bukan tag) UTUH.
    expect(b.catatan_internal).toBe('[vip] catatan');
  });
});
