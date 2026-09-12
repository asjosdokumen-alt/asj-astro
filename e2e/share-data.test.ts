// ==========================================
// TESTS: A15 parity crosscheck (2026-09-05) — share-data GET endpoint
//
// Legacy ground truth: netlify/functions/share-data.js → handleShareData
// (share.html?job=CODE fetches '/.netlify/functions/share-data?job=CODE').
//
// A15 root bug: netlify/functions/share-data.js was a NOT_IMPLEMENTED stub
// ("Fungsi ini belum diimplementasi di backend rebuild") while the real
// implementation lived in contexts/catalog handleShareData (re-exported by
// _lib/handlers) — so every share-view link from the admin Share modal
// returned HTTP 400 and the TSK viewer never loaded candidates.
//
// This test pins the fix: the function file imports _lib/handlers and delegates
// with the ?job query param (same contract as the previous generation build).
// Pure handler-level test, no DB/network.
//
// CARA MEMUAT HANDLER (diubah 2026-09-12): dulu file ini mengevaluasi sumber
// share-data.js di dalam vm dengan shim CommonJS, karena entry-nya CommonJS
// (`exports.handler =`) sementara repo ini `type: module`. Setelah migrasi ke
// runtime Netlify modern (batas 4 KB env Lambda compatibility mode yang mematikan
// deploy), entry-nya sudah ESM murni — jadi cukup di-import, dan `_lib/handlers`
// diganti dengan vi.mock alih-alih `require` yang ditulis ulang.
//
// Bentuk kembaliannya tetap { statusCode, body } karena `_lib/netlify-adapter.ts`
// bersifat DUAL-MODE: diberi event biasa, ia mengembalikan bentuk lama apa adanya.
// Itu sebabnya seluruh assertion di bawah tidak perlu berubah.
//
// LOKASI (dipindah 2026-09-11): file ini dulu tinggal di netlify/functions/
// sebagai `share-data.test.ts`. Netlify men-scan SELURUH direktori functions
// secara flat dan menganggap setiap file di dalamnya (termasuk *.test.ts)
// sebagai satu function yang bisa di-deploy. Karena file ini meng-import
// `vitest` — devDependency, dan `NODE_ENV=production` membuat Netlify
// menjalankan `npm ci --omit=dev` — bundling gagal dengan
// `Could not resolve "vitest"` dan SELURUH deploy berhenti.
// Pelajarannya: TIDAK BOLEH ada *.test.ts langsung di netlify/functions/.
// Test di subdirektori (contexts/, _lib/) aman karena Netlify hanya men-scan
// direktori functions secara flat dan file itu ikut ke-bundle sebagai
// included_files, bukan sebagai entry point.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GENERIC_ERROR_MESSAGE } from '../netlify/functions/_lib/kernel/errors';

const { mockHandle } = vi.hoisted(() => ({ mockHandle: vi.fn() }));

// vi.mock is hoisted above the imports, so the entry below resolves against the
// mock. The factory re-reads GENERIC_ERROR_MESSAGE from its OWNER
// (kernel/errors) instead of hard-coding a second copy of the wording — one
// message, one owner, as before.
vi.mock('../netlify/functions/_lib/handlers.js', async () => {
  const errors = await import('../netlify/functions/_lib/kernel/errors');
  return {
    handleShareData: mockHandle,
    handleAction: vi.fn(),
    NOT_IMPLEMENTED: vi.fn(),
    GENERIC_ERROR_MESSAGE: errors.GENERIC_ERROR_MESSAGE,
  };
});

import shareDataHandler from '../netlify/functions/share-data.js';

type Res = { statusCode: number; body: string };
const handler = shareDataHandler as unknown as (e: unknown) => Promise<Res>;

beforeEach(() => {
  mockHandle.mockReset();
  mockHandle.mockResolvedValue({ success: true, job: { code: 'TG658' }, candidates: [] });
});

describe('A15/B06 — share-data GET endpoint delegates to real handler', () => {
  it('reads ?job + ?tk and returns the real handler result (200)', async () => {
    const res = await handler({ queryStringParameters: { job: 'TG658', tk: 'tok1' }, headers: {} });
    expect(mockHandle).toHaveBeenCalledWith('TG658', 'tok1');
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.job.code).toBe('TG658');
  });

  it('forwards an empty token when ?tk is missing (handler rejects bare ?job)', async () => {
    const res = await handler({ queryStringParameters: { job: 'TG658' }, headers: {} });
    expect(mockHandle).toHaveBeenCalledWith('TG658', '');
    expect(res.statusCode).toBe(200);
  });

  it('empty job → delegates anyway (handler answers "Kode job tidak ditemukan.")', async () => {
    mockHandle.mockResolvedValue({ error: 'Kode job tidak ditemukan.' });
    const res = await handler({ queryStringParameters: {}, headers: {} });
    expect(mockHandle).toHaveBeenCalledWith('', '');
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('Kode job');
  });

  it('no longer returns the NOT_IMPLEMENTED stub body', async () => {
    const res = await handler({ queryStringParameters: { job: 'ASJ1' }, headers: {} });
    expect(res.body).not.toContain('belum diimplementasi');
  });

  // PR4 (playbook §3.3 "never leak"): handler throw → generic message.
  // Internal detail ('boom' etc.) stays in server logs, never in the body.
  it('handler throw → 400 with generic message, no internal detail', async () => {
    mockHandle.mockRejectedValue(new Error('boom'));
    const res = await handler({ queryStringParameters: { job: 'X' }, headers: {} });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe(GENERIC_ERROR_MESSAGE);
    expect(JSON.stringify(body)).not.toContain('boom');
  });
});
