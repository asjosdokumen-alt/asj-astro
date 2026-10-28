/**
 * read-truncation.test.ts — batas baca yang terpotong harus TERLIHAT.
 *
 * KENAPA
 *   Mail inbox (`database_asj_form`), jadwal, tugas, dan template WA dibaca
 *   dengan batas keras 500 dan TANPA paginasi. Lewat batas itu baris hilang
 *   tanpa penanda apa pun: `attachApplications` tidak punya baris untuk form
 *   yang tidak ikut, jadi lamaran seorang kandidat lenyap dari daftar admin dan
 *   dari dasbornya — kegagalannya terbaca sebagai "tidak ada lamaran", bukan
 *   "tidak ikut termuat".
 *
 *   Memindahkan bacaan ini ke keyset BUKAN pilihan yang aman: `rowIndex` di
 *   inbox admin adalah POSISI di array ini, dan handler review/approve/reject/
 *   delete menerima indeks itu — paginasi akan menomori ulang setiap baris.
 *   Yang bisa dilakukan tanpa mengubah kontrak itu adalah membuat pemotongannya
 *   kelihatan di log. Itulah yang dikunci di sini.
 *
 * KENAPA DI e2e/ (R13f-bis): tanpa DOM; `.ts` di tier e2e tidak dihitung counter
 * beku `indexer`. Tanpa baris exclude di vitest.config.ts ia jalan DUA KALI.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { jsonMock } = vi.hoisted(() => ({ jsonMock: vi.fn() }));

vi.mock('../netlify/functions/_lib/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../netlify/functions/_lib/db/client')>();
  return { ...actual, supabaseJson: jsonMock };
});

const { findFormsLight } = await import('../netlify/functions/_lib/db/forms');
const { log } = await import('../netlify/functions/_lib/kernel/log');

// ONE spy for the whole file. `vi.spyOn` on an already-spied method returns the
// SAME mock, so re-creating it per test kept the previous test's call history and
// the 499-row control failed with "called 1 time".
const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);

describe('batas baca mail inbox', () => {
  beforeEach(() => {
    jsonMock.mockReset();
    warn.mockClear();
  });

  it('halaman PENUH (500) memicu peringatan — hasilnya mungkin terpotong', async () => {
    jsonMock.mockResolvedValue(Array.from({ length: 500 }, (_, i) => ({ id: i })));

    const rows = await findFormsLight();

    expect(rows).toHaveLength(500);
    expect(warn).toHaveBeenCalledWith(
      'forms.truncated',
      expect.objectContaining({ what: 'findFormsLight', limit: 500 }),
    );
  });

  it('halaman tidak penuh (499) TIDAK memicu peringatan', async () => {
    jsonMock.mockResolvedValue(Array.from({ length: 499 }, (_, i) => ({ id: i })));

    await findFormsLight();

    expect(warn).not.toHaveBeenCalled();
  });
});
