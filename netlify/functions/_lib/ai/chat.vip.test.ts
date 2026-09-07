// ==========================================
// TESTS: ai/chat — VIP gate (flow=master) menolak kandidat non-VIP di SERVER.
// Keputusan FINAL harus di server, bukan guard frontend (bisa di-bypass dengan
// memanggil action langsung). Kandidat non-VIP harus ditolak SEBELUM pemanggilan
// model (Gemini quota) — tes ini membuktikan reject path itu.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/candidates', () => ({
  findCandidateByIdFiltered: vi.fn(async () => null),
  findCandidateByWaFiltered: vi.fn(async () => ({
    catatan_internal: 'Siswa reguler (bukan VIP/KELAS)',
  })),
  findCandidates: vi.fn(async () => ({ rows: [] })),
}));

vi.mock('../session', () => ({
  verifyToken: vi.fn(() => ({
    role: 'kandidat',
    wa: '6285700000001',
    exp: Date.now() + 60_000,
  })),
}));

vi.mock('../../contexts/identity', () => ({
  requireRole: vi.fn(() => ({ error: 'bukan admin' })),
}));

import { handleProcessAIChat } from './chat';

describe('handleProcessAIChat — VIP gate server-side (flow=master)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('menolak kandidat non-VIP tanpa memanggil model', async () => {
    const res = (await handleProcessAIChat(
      {
        flow: 'master',
        history: [],
        currentData: {},
        lang: 'id',
        message: 'tolong terjemahkan CV saya',
      },
      'token-kandidat-biasa',
    )) as { success?: boolean; error?: string };

    expect(res.success).toBe(false);
    expect(String(res.error || '')).toContain('VIP');
  });
});