// ==========================================
// TESTS: kernel/errors — safeError + leak-guard (playbook Day 1–30 PR4)
//
// safeError is the blessed primitive for client-facing error strings:
//   - AppError → its own message passes through (deliberate, user-safe);
//   - anything else → the generic message, original console.error'd server-side.
// The guard test at the bottom scans contexts/** + surfaces/** + _lib/ai/**
// + the two raw endpoints for the forbidden `'... ' + e.message` return
// pattern so the leak cannot be reintroduced silently (playbook §4.2 invariant).
// ==========================================
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { safeError, toErrorResponse, GENERIC_ERROR_MESSAGE, AppError, Errors } from './errors';

describe('safeError — kontrak string error klien (PR4)', () => {
  it('AppError → pesannya lolos (disengaja, aman utk user)', () => {
    const e = Errors.validation('jobId harus diisi');
    expect(safeError('Gagal proses.', e)).toBe('jobId harus diisi');
    expect(safeError('Gagal proses.', new AppError('FORBIDDEN', { message: 'Akses ditolak' }))).toBe('Akses ditolak');
  });

  it('Error biasa → pesan generik + prefix, detail TIDAK lolos, asli di-log server', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const leaky = new Error('duplicate key value violates unique constraint "database_candidate_pkey"');
      const out = safeError('Gagal simpan kandidat.', leaky);
      expect(out).toBe('Gagal simpan kandidat. ' + GENERIC_ERROR_MESSAGE);
      expect(out).not.toContain('duplicate key');
      expect(errSpy).toHaveBeenCalledWith('[safeError]', 'Gagal simpan kandidat.', leaky);
    } finally {
      errSpy.mockRestore();
    }
  });

  it('non-Error (string/throw aneh) → generik juga', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(safeError('Gagal.', 'PostgREST http 500 {"trace":...}')).toBe('Gagal. ' + GENERIC_ERROR_MESSAGE);
    } finally {
      errSpy.mockRestore();
    }
  });

  it('tanpa prefix → pesan generik polos', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(safeError('', new Error('x'))).toBe(GENERIC_ERROR_MESSAGE);
    } finally {
      errSpy.mockRestore();
    }
  });

  it('toErrorResponse tetap generik (regression guard)', () => {
    const out = toErrorResponse(new Error('PostgREST body'));
    expect(out.success).toBe(false);
    expect(out.error).toBe(GENERIC_ERROR_MESSAGE);
    expect(out.code).toBe('INTERNAL_ERROR');
  });
});

// ── Leak-guard invariant (playbook §4.2) ────────────────────────────────────
// Scan every .ts under contexts/ + surfaces/ + _lib/ai/ for catch blocks that
// hand e.message to a client. Allowed: `const msg = ...` kept for NON-response
// use (conflict classification), as long as no response line concatenates it.
function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walkFiles(p, out);
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

const CONTEXTS_DIR = join(import.meta.dirname, '..', '..', 'contexts');
const SURFACES_DIR = join(import.meta.dirname, '..', '..', 'surfaces');
const AI_DIR = join(import.meta.dirname, '..', 'ai');

// Response-shaped lines that concatenate runtime error text into a client field.
const LEAK_PATTERNS: RegExp[] = [
  /error:\s*[^;]*\+\s*(e|err|ex)\.message/,
  /message:\s*[^;]*\+\s*(e|err|ex)\.message/,
  /error:\s*(e|err|ex)\.message/,
  /message:\s*(e|err|ex)\.message/,
];

describe('leak-guard — tidak ada e.message di respons klien (playbook §4.2)', () => {
  it('contexts/** + surfaces/** + _lib/ai/** bebas pola `error: ... + e.message`', () => {
    const offenders: string[] = [];
    for (const file of [...walkFiles(CONTEXTS_DIR), ...walkFiles(SURFACES_DIR), ...walkFiles(AI_DIR)]) {
      const lines = readFileSync(file, 'utf-8').split(/\r?\n/);
      lines.forEach((line, i) => {
        if (LEAK_PATTERNS.some((re) => re.test(line))) {
          offenders.push(file.replace(/\\/g, '/') + ':' + (i + 1) + ' → ' + line.trim());
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('share-data.js + ingest.js tidak lagi mengirim Error internal', () => {
    const share = readFileSync(join(import.meta.dirname, '..', '..', 'share-data.js'), 'utf-8');
    const ingest = readFileSync(join(import.meta.dirname, '..', '..', 'ingest.js'), 'utf-8');
    for (const [name, src] of [['share-data.js', share], ['ingest.js', ingest]] as const) {
      expect(src, name).not.toMatch(/\+\s*e\.message/);
      expect(src, name).not.toContain('Error internal:');
      // Satu pemilik pesan generik: endpoint mentah harus MENGKONSUMSI
      // GENERIC_ERROR_MESSAGE (via _lib/handlers), bukan menyalin literalnya.
      expect(src, name).toContain('GENERIC_ERROR_MESSAGE');
      expect(src, name).not.toContain('Terjadi kesalahan saat memproses permintaan.');
    }
  });
});
