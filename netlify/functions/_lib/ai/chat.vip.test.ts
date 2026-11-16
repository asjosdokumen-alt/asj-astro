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

// Stub the model layer: the security regression test below deliberately
// reaches geminiGenerate when the VIP gate is bypassed. Without this stub that
// would be a real network call from a unit test.
vi.mock('./providers', () => ({
  geminiGenerate: vi.fn(async () => ({ reply: 'OK' })),
  parseJsonLoose: (t: string) => {
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  },
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

  // SECURITY (audit 2026-11-15): `flow` was client-controlled and the VIP gate
  // only ran when its value was literally 'master'. AiCvForm never sends a
  // `flow` at all (it posts [{ history, currentData }]), so ANY other string
  // skipped the entitlement check while still reaching the AI CV Master prompt
  // and burning Gemini quota. The gate must not depend on a client-supplied
  // label.
  it('flow selain master TIDAK boleh melewati gerbang VIP', async () => {
    const res = (await handleProcessAIChat(
      {
        flow: 'bukan-master',
        history: [],
        currentData: {},
        lang: 'id',
      },
      'token-kandidat-biasa',
    )) as { success?: boolean; error?: string };

    expect(res.success).toBe(false);
    expect(String(res.error || '')).toContain('VIP');
  });
});