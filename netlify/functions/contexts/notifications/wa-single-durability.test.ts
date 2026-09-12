// ==========================================
// TESTS: notifications — single-message Fonnte durability (Phase E row 4).
//
// Before this, `handleKirimSatuPesanFonnte` called Fonnte directly and threw on
// any failure: an outage lost the WhatsApp message outright. The fix parks a
// *transient* failure in job_queue (`wa.send`) and lets the 2-minute sweep
// retry it up to max_attempts (5). What is pinned here:
//
//   - the transient/permanent split — only a transient failure is worth a retry
//   - the HTTP path enqueues and hands back a job id
//   - a permanent failure, and a *failed enqueue*, both return a real failure —
//     never a false "accepted"
//   - the worker path THROWS, because the queue owns the retry: returning a
//     failure object would be read as success and mark the message delivered
//
// `fetch` is stubbed; no test here reaches api.fonnte.com.
// ==========================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../_lib/kernel/job-queue', () => ({
  enqueue: vi.fn(async () => 'job-123'),
}));
vi.mock('../../_lib/kernel/log', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { enqueue } from '../../_lib/kernel/job-queue';
import { signToken } from '../../_lib/session';
import { normalizeWa } from './repository';
import { handleKirimSatuPesanFonnte, isRetryableFonnteFailure } from './service';

const WA = '08123456789';
const MSG = 'Halo, ada tawaran kerja.';
const TARGET = normalizeWa(WA);
const adminToken = () => signToken({ role: 'admin', name: 'KHOCI', kind: 'session' });

/** Minimal fetch Response stand-in — only the fields `fonnteSend` reads. */
function reply(status: number, text = '{}') {
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

let savedToken: string | undefined;
let savedApiKey: string | undefined;

beforeEach(() => {
  savedToken = process.env.FONNTE_TOKEN;
  savedApiKey = process.env.FONNTE_API_KEY;
  process.env.FONNTE_TOKEN = 'test-token';
  delete process.env.FONNTE_API_KEY;
  vi.mocked(enqueue).mockReset();
  vi.mocked(enqueue).mockResolvedValue('job-123');
});

afterEach(() => {
  if (savedToken === undefined) delete process.env.FONNTE_TOKEN;
  else process.env.FONNTE_TOKEN = savedToken;
  if (savedApiKey === undefined) delete process.env.FONNTE_API_KEY;
  else process.env.FONNTE_API_KEY = savedApiKey;
  vi.unstubAllGlobals();
});

describe('isRetryableFonnteFailure — transien vs permanen', () => {
  it('tanpa status HTTP (DNS/TLS/timeout) → layak diulang', () => {
    expect(isRetryableFonnteFailure(new TypeError('fetch failed'))).toBe(true);
    expect(isRetryableFonnteFailure(new Error('socket hang up'))).toBe(true);
  });

  it('429 dan 5xx → layak diulang', () => {
    expect(isRetryableFonnteFailure({ status: 429 })).toBe(true);
    expect(isRetryableFonnteFailure({ status: 500 })).toBe(true);
    expect(isRetryableFonnteFailure({ status: 503 })).toBe(true);
  });

  it('4xx lain → permanen (mengulang hanya membakar 5 percobaan)', () => {
    expect(isRetryableFonnteFailure({ status: 400 })).toBe(false);
    expect(isRetryableFonnteFailure({ status: 401 })).toBe(false);
    expect(isRetryableFonnteFailure({ status: 404 })).toBe(false);
  });
});

describe('HTTP path — kegagalan transien masuk antrean', () => {
  it('Fonnte 500 → enqueue wa.send + kembalikan jobId', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(500, 'boom')));
    const r: any = await handleKirimSatuPesanFonnte([WA, MSG], adminToken());
    expect(r.success).toBe(true);
    expect(r.status).toBe('accepted');
    expect(r.queued).toBe(true);
    expect(r.jobId).toBe('job-123');
    expect(enqueue).toHaveBeenCalledTimes(1);
    const [type, body] = vi.mocked(enqueue).mock.calls[0];
    expect(type).toBe('wa.send');
    expect(body).toMatchObject({ wa: TARGET, message: MSG });
  });

  it('kegagalan jaringan (fetch reject) juga masuk antrean', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const r: any = await handleKirimSatuPesanFonnte([WA, MSG], adminToken());
    expect(r.queued).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('sukses → tidak ada enqueue, hasil Fonnte diteruskan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, '{"status":true}')));
    const r: any = await handleKirimSatuPesanFonnte([WA, MSG], adminToken());
    expect(r.success).toBe(true);
    expect(r.queued).toBeUndefined();
    expect(r.result).toBeTruthy();
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('HTTP path — kegagalan permanen TIDAK diantrekan', () => {
  it('Fonnte 400 → gagal, tanpa job', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(400, 'bad number')));
    const r: any = await handleKirimSatuPesanFonnte([WA, MSG], adminToken());
    expect(r.success).toBe(false);
    expect(r.error).toBeTruthy();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('Fonnte 401 (token ditolak) → gagal, tanpa job', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(401, 'unauthorized')));
    const r: any = await handleKirimSatuPesanFonnte([WA, MSG], adminToken());
    expect(r.success).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('enqueue ikut gagal → tetap lapor gagal, bukan "accepted" palsu', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(503)));
    vi.mocked(enqueue).mockRejectedValue(new Error('db down'));
    const r: any = await handleKirimSatuPesanFonnte([WA, MSG], adminToken());
    expect(r.success).toBe(false);
    expect(r.queued).toBeUndefined();
    expect(r.error).toBeTruthy();
  });
});

describe('HTTP path — otorisasi', () => {
  it('tanpa sesi admin → ditolak sebelum menyentuh Fonnte', async () => {
    const fetchMock = vi.fn(async () => reply(200));
    vi.stubGlobal('fetch', fetchMock);
    const r: any = await handleKirimSatuPesanFonnte([WA, MSG], '');
    expect(r.success).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe('Worker path (internal) — melempar supaya antrean yang mengulang', () => {
  it('Fonnte 500 → throw, tanpa enqueue ulang (kalau tidak, job berputar selamanya)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(500, 'boom')));
    await expect(
      handleKirimSatuPesanFonnte([WA, MSG], undefined, { internal: true }),
    ).rejects.toThrow();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('sukses → hasil dikembalikan (job ditandai selesai oleh sweep)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(200, '{"status":true}')));
    const r: any = await handleKirimSatuPesanFonnte([WA, MSG], undefined, { internal: true });
    expect(r.success).toBe(true);
    expect(r.result).toBeTruthy();
  });

  it('field kosong tetap ditolak (tidak melempar)', async () => {
    const r: any = await handleKirimSatuPesanFonnte(['', ''], undefined, { internal: true });
    expect(r.success).toBe(false);
  });
});
