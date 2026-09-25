// ==========================================
// TESTS: documents/service — K3 submitApply jalur publik TIDAK boleh menimpa
// lamaran existing milik orang lain. Cukup tahu wa+code, penyerang bisa
// me-reset status lamaran korban — PATCH hanya untuk owner/admin.
//
// PLUS (item 11 / B3): gerbang VIP untuk job kategori "Magang". handleSubmitApply
// dipanggil PUBLIK tanpa sesi, jadi pelamar di-resolve dari nomor WA; kandidat
// NON-VIP ditolak dengan pesan Indonesia, VIP/KELAS diizinkan, dan job non-Magang
// tidak terpengaruh. Predikat server memakai isVipCatatan (tag `[VIP]` literal
// case-sensitive ATAU `[KELAS xx]`), sama seperti gate frontend.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Kontrol per-tes atas beberapa pembacaan. Mock di-hoist oleh vitest, jadi
// referensinya harus via `vi.hoisted`.
const m = vi.hoisted(() => ({
  job: null as Record<string, unknown> | null,
  candidate: null as Record<string, unknown> | null,
  existingForm: null as Record<string, unknown> | null,
  written: [] as Record<string, unknown>[],
}));

vi.mock('./repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./repository')>();
  return {
    ...actual,
    findFormByWaJob: async () => m.existingForm,
    findCandidateRow: async () => m.candidate,
    findCandidateByWa: async () => m.candidate,
    upsertFormRow: (async (body: Record<string, unknown>) => {
      m.written.push(body);
    }) as never,
    supabaseJson: vi.fn(async () => ({})),
  };
});

vi.mock('../../_lib/db/jobs', () => ({
  findJobByCodeFiltered: async () => m.job,
  findJobs: async () => ({ rows: [] }),
}));

vi.mock('../identity', () => ({
  requireRole: vi.fn(() => ({ error: 'bukan admin' })),
  isOwnerOrAdmin: vi.fn(() => false),
}));

// Bobot minimal: cukup untuk lolos gerbang dokumen di badan handler.
const APPLY_DOCS = { photoFile: '', cvFile: '', jftFile: '', sswFile: '', extraFiles: [] };

import { handleSubmitApply } from './service';

describe('handleSubmitApply — jalur publik tidak bisa membajak lamaran existing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.job = { id: 1, code_job: 'SSW-KAIGO', dokumen_share: '' };
    m.candidate = null;
    m.existingForm = { id: 7 };
    m.written = [];
  });

  it('menolak overwrite lamaran existing oleh non-owner (WA berbeda / tanpa sesi)', async () => {
    const res = await handleSubmitApply(
      [
        {
          wa: '6285700000002',
          job: 'SSW-KAIGO',
          nama: 'Penyerang',
          ...APPLY_DOCS,
        },
      ],
      'token-owner-lain',
    );

    expect(res.success).toBe(false);
    expect(String(res.message || '')).toContain('sudah ada');
  });
});

describe('handleSubmitApply — gerbang VIP job MAGANG (item 11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Lamaran BARU (tidak ada existing) supaya gate benar-benar yang diuji.
    m.existingForm = null;
    m.written = [];
    m.candidate = null;
  });

  it('job Magang + pelamar NON-VIP → DITOLAK, tanpa menulis lamaran', async () => {
    m.job = { id: 1, code_job: 'GJ1ASJ', kategori: 'Magang', dokumen_share: '' };
    m.candidate = { id: 9, no_wa: '628123', catatan_internal: 'kandidat umum' };

    const res = await handleSubmitApply([
      { wa: '628123', job: 'GJ1ASJ', nama: 'Budi', ...APPLY_DOCS },
    ]);

    expect(res.success).toBe(false);
    expect(String(res.message || '')).toContain('Magang');
    expect(String(res.message || '')).toContain('VIP');
    // Tidak ada baris lamaran yang ditulis.
    expect(m.written.length).toBe(0);
  });

  it('job Magang + pelamar [vip] huruf kecil → DITOLAK (case-sensitive)', async () => {
    m.job = { id: 1, code_job: 'GJ1ASJ', kategori: 'Magang', dokumen_share: '' };
    m.candidate = { id: 9, no_wa: '628123', catatan_internal: '[vip] catatan pribadi' };

    const res = await handleSubmitApply([
      { wa: '628123', job: 'GJ1ASJ', nama: 'Budi', ...APPLY_DOCS },
    ]);

    expect(res.success).toBe(false);
    expect(m.written.length).toBe(0);
  });

  it('job Magang + pelamar [VIP] → DIIZINKAN (lamaran ditulis)', async () => {
    m.job = { id: 1, code_job: 'GJ1ASJ', kategori: 'Magang', dokumen_share: '' };
    m.candidate = { id: 9, no_wa: '628123', catatan_internal: '[VIP] siswa resmi' };

    const res = await handleSubmitApply([
      { wa: '628123', job: 'GJ1ASJ', nama: 'Budi', ...APPLY_DOCS },
    ]);

    expect(res.success).toBe(true);
    expect(m.written.length).toBe(1);
    expect(m.written[0].code_job).toBe('GJ1ASJ');
  });

  it('job Magang + pelamar [KELAS G] (tanpa [VIP]) → DIIZINKAN (isVipCatatan mencakup KELAS)', async () => {
    m.job = { id: 1, code_job: 'GJ2ASJ', kategori: 'Magang', dokumen_share: '' };
    m.candidate = { id: 9, no_wa: '628123', catatan_internal: '[KELAS G] murid LPK' };

    const res = await handleSubmitApply([
      { wa: '628123', job: 'GJ2ASJ', nama: 'Budi', ...APPLY_DOCS },
    ]);

    expect(res.success).toBe(true);
    expect(m.written.length).toBe(1);
  });

  it('job NON-Magang + pelamar NON-VIP → TIDAK terpengaruh (lamaran tetap ditulis)', async () => {
    m.job = { id: 1, code_job: 'TG1ASJ', kategori: 'Tokutei Ginou', dokumen_share: '' };
    m.candidate = { id: 9, no_wa: '628123', catatan_internal: 'kandidat umum' };

    const res = await handleSubmitApply([
      { wa: '628123', job: 'TG1ASJ', nama: 'Budi', ...APPLY_DOCS },
    ]);

    expect(res.success).toBe(true);
    expect(m.written.length).toBe(1);
    expect(m.written[0].code_job).toBe('TG1ASJ');
  });
});
