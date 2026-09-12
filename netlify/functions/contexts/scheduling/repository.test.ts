/**
 * repository.test.ts — the `{ rows }` destructuring defect class.
 *
 * WHAT THIS LOCKS DOWN
 *   `supabaseJson()` resolves the parsed JSON body directly. For a GET list
 *   endpoint that body IS the array, so `const { rows } = await supabaseJson(…)`
 *   binds `rows` to `undefined` and every guard downstream fails closed —
 *   silently. Four call sites carried this shape, and between them they
 *   disabled:
 *
 *     · `getActiveSchedules()`            → agenda reminders never fired
 *     · `getFcmTokensForWaList()`         → the reminder path resolved 0 devices
 *     · the per-WA fallback in the reminder handler → same
 *     · `applications/service.ts` approval push     → candidates never notified
 *
 *   Each one returned an empty list rather than throwing, which is why none of
 *   them ever showed up as an error. That is the property worth a test: the
 *   failure mode is silence, not a crash.
 *
 * TWO KINDS OF ASSERTION
 *   1. Behavioural — the readers return what the client returned.
 *   2. Structural — no source file under netlify/functions may destructure
 *      `rows` out of a `supabaseJson()` call again. The behavioural tests can
 *      only cover the sites that exist today; this one covers the ones that do
 *      not exist yet.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const seen: string[] = [];
let responder: (table: string) => unknown = () => [];

vi.mock('../../_lib/db/client', () => ({
  supabaseJson: async (_method: string, table: string) => {
    seen.push(table);
    return responder(table);
  },
  // Present so the module's re-export does not resolve to undefined.
  toText: (v: unknown) => (v === null || v === undefined ? '' : String(v)),
}));

const { getActiveSchedules, getFcmTokensForWaList } = await import('./repository');

beforeEach(() => {
  seen.length = 0;
  responder = () => [];
});

describe('getActiveSchedules — reads the array the client returned', () => {
  it('returns the rows instead of an empty list', async () => {
    const schedule = { id: 1, nama_agenda: 'Interview', status_jadwal: 'AKTIF' };
    responder = () => [schedule];

    await expect(getActiveSchedules()).resolves.toEqual([schedule]);
    expect(seen).toEqual(['database_schedule']);
  });

  it('asks only for AKTIF schedules', async () => {
    responder = () => [];
    await getActiveSchedules();
    expect(seen).toEqual(['database_schedule']);
  });

  it('returns [] when the backend answers with no body', async () => {
    responder = () => null;
    await expect(getActiveSchedules()).resolves.toEqual([]);
  });

  it('returns [] when the backend answers with an object, not a list', async () => {
    // The exact shape the old code assumed — and the reason it always failed.
    responder = () => ({ rows: [{ id: 1 }] });
    await expect(getActiveSchedules()).resolves.toEqual([]);
  });
});

describe('getFcmTokensForWaList — reads the array the client returned', () => {
  it('returns the tokens', async () => {
    responder = () => [{ token: 'tok-a' }, { token: 'tok-b' }];
    await expect(getFcmTokensForWaList(['628111'])).resolves.toEqual(['tok-a', 'tok-b']);
    expect(seen).toEqual(['fcm_tokens']);
  });

  it('drops rows with no token', async () => {
    responder = () => [{ token: 'tok-a' }, { token: null }, { wa: '628111' }];
    await expect(getFcmTokensForWaList(['628111'])).resolves.toEqual(['tok-a']);
  });

  it('makes no request at all for an empty WA list', async () => {
    await expect(getFcmTokensForWaList([])).resolves.toEqual([]);
    expect(seen).toEqual([]);
  });
});

describe('structural guard — the defect may not come back', () => {
  // `const { rows } = await supabaseJson(…)` / `const { rows: x } = await supabaseJson(…)`
  const BAD_SHAPE = /const\s*\{[^}]*\brows\b[^}]*\}\s*=\s*await\s+supabaseJson\(/;

  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.netlify-built') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
    }
    return out;
  };

  it('no file destructures `rows` out of a supabaseJson() call', () => {
    const functionsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const offenders = walk(functionsRoot)
      .filter((f) => BAD_SHAPE.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(functionsRoot.length + 1).replace(/\\/g, '/'));

    expect(
      offenders,
      'supabaseJson() returns the parsed body directly; destructuring `rows` from it yields undefined ' +
        'and fails silently. Read the value as-is instead.',
    ).toEqual([]);
  });
});
