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
// This test pins the fix: the function file now requires _lib/handlers and
// delegates with the ?job query param (same contract as the previous
// generation build). The file is CommonJS while the repo is type:module, so
// it is loaded through the VM shim below — pure handler-level test, no
// DB/network.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { GENERIC_ERROR_MESSAGE } from './_lib/kernel/errors';

const { mockHandle } = vi.hoisted(() => ({ mockHandle: vi.fn() }));

let handler: (event: any) => Promise<any>;

beforeEach(() => {
  mockHandle.mockReset();
  mockHandle.mockResolvedValue({ success: true, job: { code: 'TG658' }, candidates: [] });

  // Evaluate netlify/functions/share-data.js in a CJS-style sandbox where
  // require('./_lib/handlers') resolves to our mock.
  const src = readFileSync(new URL('./share-data.js', import.meta.url), 'utf-8');
  const moduleObj = { exports: {} as Record<string, unknown> };
  const sandbox: Record<string, unknown> = {
    module: moduleObj,
    exports: moduleObj.exports,
    require: (id: string) => {
      if (id === './_lib/handlers') {
        return {
          handleShareData: mockHandle,
          handleAction: vi.fn(),
          NOT_IMPLEMENTED: vi.fn(),
          // Pesan generik datang dari PEMILIKnya (kernel/errors), bukan
          // literal kedua di test — satu wording, satu owner.
          GENERIC_ERROR_MESSAGE,
        };
      }
      throw new Error('unexpected require: ' + id);
    },
    console,
    process,
  };
  vm.runInNewContext(src, sandbox);
  handler = moduleObj.exports.handler as (e: any) => Promise<any>;
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
