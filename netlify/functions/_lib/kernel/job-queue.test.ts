// ==========================================
// TESTS: kernel/job-queue — getJobStatus ownership + redaction (review K3,
// playbook Day 1–30 PR2).
//
// getJobStatus is client-facing polling for background jobs (wa.broadcast,
// ai.parse). Two invariants pinned here:
//   1. Ownership — only the job creator (payload.createdBy) or an admin may
//      read a job; everyone else gets FORBIDDEN, no session → UNAUTHORIZED.
//   2. Redaction — the response never carries last_error text or the raw
//      payload (legacy rows still store sessionToken / per-recipient detail);
//      clients get a boolean hasError and, when done, only payload.result.
// failJob additionally caps last_error at 300 chars at write time (same
// pattern as diagnostics/repository) so upstream fragments can't persist
// in full in the DB.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/client', () => ({
  supabaseJson: vi.fn(),
}));

import { handleGetJobStatus, failJob } from './job-queue';
import { supabaseJson } from '../db/client';
import { signToken } from '../session';
import { AppError } from './errors';

const mockDb = vi.mocked(supabaseJson);

const now = new Date().toISOString();
function jobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    type: 'wa.broadcast',
    payload: { createdBy: '6281234567890' } as Record<string, unknown>,
    idempotency_key: null,
    status: 'processing',
    attempts: 1,
    max_attempts: 3,
    run_after: now,
    locked_until: null,
    last_error: null,
    created_at: now,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleGetJobStatus — kepemilikan job (review K3)', () => {
  it('tanpa sesi / token rusak → UNAUTHORIZED', async () => {
    await expect(handleGetJobStatus(['job-1'], '')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(handleGetJobStatus(['job-1'], 'bogus.token')).rejects.toBeInstanceOf(AppError);
  });

  it('refresh token tidak bisa dipakai untuk polling', async () => {
    const rt = signToken({ role: 'kandidat', wa: '6281234567890', kind: 'refresh' });
    await expect(handleGetJobStatus(['job-1'], rt)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('bukan pembuat & bukan admin → FORBIDDEN', async () => {
    mockDb.mockResolvedValue([jobRow()]);
    const tok = signToken({ role: 'kandidat', wa: '628999' });
    await expect(handleGetJobStatus(['job-1'], tok)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('pembuat job (payload.createdBy) boleh melihat', async () => {
    mockDb.mockResolvedValue([jobRow()]);
    const tok = signToken({ role: 'kandidat', wa: '6281234567890' });
    const res: any = await handleGetJobStatus(['job-1'], tok);
    expect(res.success).toBe(true);
    expect(res.status).toBe('processing');
  });
});

describe('handleGetJobStatus — redaksi (playbook PR2)', () => {
  it('lastError tidak pernah dikirim — hanya flag hasError', async () => {
    const secretErr =
      'FetchError: POST https://secret-project.supabase.co/rest/v1/database_candidate ' +
      '{"message":"duplicate key"} sessionToken=SHOULD-NOT-LEAK';
    mockDb.mockResolvedValue([
      jobRow({
        status: 'failed',
        last_error: secretErr,
        payload: {
          createdBy: '6281234567890',
          sessionToken: 'legacy-token-in-payload',
          payload: [{ nama: 'PII' }],
        },
      }),
    ]);
    const tok = signToken({ role: 'kandidat', wa: '6281234567890' });
    const res: any = await handleGetJobStatus(['job-1'], tok);
    expect(res.success).toBe(true);
    expect(res.status).toBe('failed');
    expect(res.hasError).toBe(true);
    const flat = JSON.stringify(res);
    expect(flat).not.toContain('lastError');
    expect(flat).not.toContain('SHOULD-NOT-LEAK');
    expect(flat).not.toContain('legacy-token-in-payload');
    expect(flat).not.toContain('PII');
    expect(res.result).toBeUndefined();
  });

  it('admin boleh melihat; job done hanya mengekspos payload.result', async () => {
    mockDb.mockResolvedValue([
      jobRow({
        status: 'done',
        payload: {
          createdBy: '628999',
          sessionToken: 'legacy-token-in-payload',
          result: { results: [{ success: true }, { success: false }] },
        },
      }),
    ]);
    const tok = signToken({ role: 'admin', name: 'AGUS' });
    const res: any = await handleGetJobStatus(['job-1'], tok);
    expect(res.success).toBe(true);
    expect(res.result).toEqual({ results: [{ success: true }, { success: false }] });
    expect(JSON.stringify(res)).not.toContain('legacy-token-in-payload');
  });

  it('job bersih → hasError false', async () => {
    mockDb.mockResolvedValue([jobRow({ status: 'done', payload: { createdBy: '6281234567890' } })]);
    const tok = signToken({ role: 'admin', name: 'AGUS' });
    const res: any = await handleGetJobStatus(['job-1'], tok);
    expect(res.hasError).toBe(false);
  });
});

describe('failJob — last_error dipotong 300 karakter saat tulis', () => {
  it('menyimpan versi terpotong, bukan pesan penuh', async () => {
    mockDb.mockResolvedValue([]);
    const long = 'x'.repeat(400) + ' sessionToken=SECRET-TAIL';
    await failJob('job-9', new Error(long));
    const call = mockDb.mock.calls.find((c) => c[0] === 'PATCH' && c[1] === 'job_queue');
    expect(call).toBeTruthy();
    const body = (call![2] as { body: { status: string; last_error: string } }).body;
    expect(body.status).toBe('failed');
    expect(body.last_error.length).toBe(300);
    expect(body.last_error).not.toContain('SECRET-TAIL');
  });
});
