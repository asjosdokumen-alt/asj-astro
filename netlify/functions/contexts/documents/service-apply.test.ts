// ==========================================
// TESTS: documents/service — K3 submitApply jalur publik TIDAK boleh menimpa
// lamaran existing milik orang lain. Cukup tahu wa+code, penyerang bisa
// me-reset status lamaran korban — PATCH hanya untuk owner/admin.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./repository')>();
  return {
    ...actual,
    findFormByWaJob: async () => ({ id: 7 }),
    supabaseJson: vi.fn(async () => ({})),
  };
});

vi.mock('../../_lib/db/jobs', () => ({
  findJobByCodeFiltered: async () => ({
    id: 1,
    code_job: 'SSW-KAIGO',
    dokumen_share: '',
  }),
  findJobs: async () => ({ rows: [] }),
}));

vi.mock('../identity', () => ({
  requireRole: vi.fn(() => ({ error: 'bukan admin' })),
  isOwnerOrAdmin: vi.fn(() => false),
}));

import { handleSubmitApply } from './service';

describe('handleSubmitApply — jalur publik tidak bisa membajak lamaran existing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('menolak overwrite lamaran existing oleh non-owner (WA berbeda / tanpa sesi)', async () => {
    const res = await handleSubmitApply(
      [
        {
          wa: '6285700000002',
          job: 'SSW-KAIGO',
          nama: 'Penyerang',
          photoFile: '',
          cvFile: '',
          jftFile: '',
          sswFile: '',
          extraFiles: [],
        },
      ],
      'token-owner-lain',
    );

    expect(res.success).toBe(false);
    expect(String(res.message || '')).toContain('sudah ada');
  });
});