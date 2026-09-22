// ==========================================
// TESTS: A16 parity crosscheck (2026-09-05) — Simulator Wawancara VIP
//
// Legacy ground truth: js/ai_copilot/interview.ts + js/03_candidate.ts
// (isVipCatatan) + #modal-interview → callAPI actions processAiInterview /
// selesaikanWawancara / simpanHasilWawancara.
//
// A16 root bugs:
//  1. The whole interview chat was never ported (the Astro "Latihan
//     Interview" button pointed at the AI CV Master page) — the frontend
//     half of this pass.
//  2. The ai surface ENQUEUED processAiInterview as an 'ai.interview'
//     background job (2-minute sweep) even though an interactive chat turn
//     must return live like legacy callAPI. Now synchronous.
//  3. handleProcessAiInterview never unwrapped the args ARRAY
//     ([{wa, candidateName, history}]) — unlike every sibling handler — so
//     wa/candidateName/history were dropped on every single turn.
//  4. isVipCatatan still used the OLD broad regex that matched ANY bracketed
//     tag ([MCU], [VISA], [NOTE]); legacy tightened it to literal [VIP] or
//     [KELAS xx] only (03_candidate.ts:108 "SYNC with backend").
//
// These tests pin the DB-free contract: the pure shared helpers, the sync
// surface routing (guard answers before any DB read — never the old
// {status:'accepted', jobId} shape), and the end-to-end args unwrap reaching
// the AI provider with the real history.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signToken } from '../_lib/session';
import { AI_ACTIONS } from '../surfaces/ai';
import {
  isVipCatatan,
  unwrapPayloadArgs,
  lastHistory,
} from '../_lib/ai/interview-shared';

const asRec = (p: Promise<unknown>): Promise<Record<string, unknown>> =>
  p as Promise<Record<string, unknown>>;

const { geminiMock } = vi.hoisted(() => ({ geminiMock: vi.fn() }));

vi.mock('../_lib/ai/providers', () => ({
  geminiGenerate: (...args: unknown[]) => geminiMock(...args),
  parseJsonLoose: (txt: unknown) => {
    try {
      return JSON.parse(String(txt || ''));
    } catch {
      return null;
    }
  },
}));

describe('A16 — interview-shared pure helpers (VIP gate + args unwrap)', () => {
  it('isVipCatatan: literal [VIP] unlocks', () => {
    expect(isVipCatatan('[VIP] Kekuatan/Catatan khusus admin')).toBe(true);
    expect(isVipCatatan('note [VIP] more')).toBe(true);
  });
  it('isVipCatatan: [KELAS xx] unlocks (case-insensitive tag)', () => {
    expect(isVipCatatan('[KELAS G] murid LPK')).toBe(true);
    expect(isVipCatatan('[kelas 12] murid')).toBe(true);
  });
  it('isVipCatatan: ANY other bracketed tag does NOT unlock (legacy tightening)', () => {
    expect(isVipCatatan('[MCU] jadwal medis')).toBe(false);
    expect(isVipCatatan('[VISA] paspor')).toBe(false);
    expect(isVipCatatan('[NOTE] biasa')).toBe(false);
    expect(isVipCatatan('[G] bare class tag')).toBe(false);
  });
  it('isVipCatatan: falsy/empty → false', () => {
    expect(isVipCatatan('')).toBe(false);
    expect(isVipCatatan(undefined)).toBe(false);
    expect(isVipCatatan(null)).toBe(false);
  });
  it('unwrapPayloadArgs: args ARRAY [obj] → obj (legacy GAS object still accepted)', () => {
    expect(unwrapPayloadArgs([{ wa: '1', history: [] }])).toEqual({
      wa: '1',
      history: [],
    });
    expect(unwrapPayloadArgs({ wa: '1' })).toEqual({ wa: '1' });
  });
  it('unwrapPayloadArgs: empty / non-object shapes → {}', () => {
    expect(unwrapPayloadArgs([])).toEqual({});
    expect(unwrapPayloadArgs([null])).toEqual({});
    expect(unwrapPayloadArgs(undefined)).toEqual({});
    expect(unwrapPayloadArgs('x')).toEqual({});
  });
  it('lastHistory caps at 20 (parity legacy sendInterviewMessage slice(-20))', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ role: 'user', content: 'm' + i }));
    expect(lastHistory(many).length).toBe(20);
    expect((lastHistory(many)[0] as { content: string }).content).toBe('m5');
    expect(lastHistory([{ role: 'user' }]).length).toBe(1);
    expect(lastHistory('nope')).toEqual([]);
  });
});

describe('A16 — surfaces/ai processAiInterview is SYNCHRONOUS (interactive chat)', () => {
  beforeEach(() => {
    geminiMock.mockReset();
    geminiMock.mockResolvedValue({ reply: '(mock)' });
  });

  it('anonymous → sessionInvalid via the real handler, NOT {status:accepted} enqueue', async () => {
    const r = await asRec(AI_ACTIONS.processAiInterview([{ wa: '6281' }], ''));
    expect(r.status).toBeUndefined(); // sync: never the old accepted/jobId shape
    expect(r.jobId).toBeUndefined();
    expect(r.success).toBe(false);
    expect(r.sessionInvalid).toBe(true);
  });

  it('admin session token → ditolak (interview = kandidat-only), pre-DB', async () => {
    const adminTok = signToken({ role: 'admin', name: 'Kepala', kind: 'session' });
    const r = await asRec(AI_ACTIONS.processAiInterview([{ wa: '6281' }], adminTok));
    expect(r.sessionInvalid).toBe(true);
    expect(geminiMock).not.toHaveBeenCalled();
  });

  it('refresh-kind kandidat token → ditolak (session kind), pre-DB', async () => {
    const rt = signToken({ role: 'kandidat', wa: '6281234567890', kind: 'refresh' });
    const r = await asRec(AI_ACTIONS.processAiInterview([{ wa: '6281234567890' }], rt));
    expect(r.sessionInvalid).toBe(true);
    expect(geminiMock).not.toHaveBeenCalled();
  });

  it('kandidat session → sync reply, ARGS UNWRAPPED: real history reaches the AI provider', async () => {
    const k = signToken({ role: 'kandidat', wa: '6281234567890', kind: 'session' });
    geminiMock.mockResolvedValue({ reply: 'Konnichiwa Budi-san!' });
    const r = await asRec(
      AI_ACTIONS.processAiInterview(
        [
          {
            wa: '',
            candidateName: 'Budi',
            history: [
              { role: 'assistant', content: 'Perkenalkan dirimu' },
              { role: 'user', content: 'Nama saya Budi' },
            ],
          },
        ],
        k,
      ),
    );
    // Sync response — the reply is returned directly (parity legacy callAPI).
    expect(r.reply).toBe('Konnichiwa Budi-san!');
    // WA kosong → profil resolve batal sebelum DB; history dari args array
    // harus SAMPAI ke provider (unwrap terbukti bekerja end-to-end).
    const [system, history] = geminiMock.mock.calls[0] as [string, unknown[]];
    expect(String(system)).toContain('Budi-san');
    expect((history as { content: string }[]).length).toBe(2);
    expect((history as { content: string }[])[1].content).toBe('Nama saya Budi');
  });
});
