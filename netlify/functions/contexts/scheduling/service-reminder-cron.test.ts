/**
 * service-reminder-cron.test.ts — the agenda reminder trigger (#8 in BACKEND_TODO)
 *
 * WHAT THIS LOCKS DOWN
 * --------------------
 * `checkAndSendAgendaReminders` was a correct, admin-guarded action with no
 * caller: no UI button and no cron. `agenda-reminders.ts` is the cron. Two
 * things about that wiring can regress silently, and both look like success:
 *
 *   1. **The cron forgets `{ internal: true }`.** It has no session, so
 *      `requireRole` returns `{ sessionInvalid: true }` — a *resolved* value,
 *      not a throw. The cron would log a clean run, return HTTP 200, and send
 *      nothing. This is the exact "green pulse, zero work" failure the repo has
 *      been bitten by before.
 *
 *   2. **The HTTP surface accidentally gains the bypass.** If the surface ever
 *      forwarded an opts object, any caller could opt out of the admin guard.
 *
 * So the assertions are deliberately paired: the internal path must NOT guard,
 * and the default path MUST guard. Testing only one of them would leave half the
 * hole open.
 *
 * The cron's own source is also asserted structurally — the smoke test above
 * proves the handler behaves, but only a source check proves the *trigger file*
 * calls it the right way and declares a schedule.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── The DB layer: empty result set, so the handler stops early and sends
//    nothing. These tests are about the guard, not about FCM.
let scheduleRows: unknown[] = [];
const patched: string[] = [];

vi.mock('../../_lib/db/client', () => ({
  supabaseJson: async (method: string, table: string) => {
    if (method !== 'GET') patched.push(table);
    return table === 'database_schedule' ? scheduleRows : [];
  },
  toText: (v: unknown) => (v === null || v === undefined ? '' : String(v)),
}));

// FCM must never be reached: if a test ever does reach it, the token list was
// non-empty, which means the guard let a send through. Making it throw turns
// "quietly sent a push in a unit test" into a visible failure.
vi.mock('../../_lib/fcm-server', () => ({
  sendMulticast: vi.fn(async () => {
    throw new Error('FCM must not be reached in this test');
  }),
}));

const { handleCheckAndSendAgendaReminders } = await import('./service');

beforeEach(() => {
  vi.clearAllMocks();
  scheduleRows = [];
  patched.length = 0;
});

describe('handleCheckAndSendAgendaReminders — the guard is opt-in, not opt-out', () => {
  it('rejects an unauthenticated HTTP caller', async () => {
    const res = (await handleCheckAndSendAgendaReminders(undefined)) as {
      success: boolean;
      sessionInvalid?: boolean;
    };
    expect(res.success).toBe(false);
    expect(res.sessionInvalid).toBe(true);
  });

  it('rejects a garbage token', async () => {
    const res = (await handleCheckAndSendAgendaReminders('not-a-token')) as {
      success: boolean;
    };
    expect(res.success).toBe(false);
  });

  it('runs without a session when the caller declares itself internal', async () => {
    // The cron path. No token, and the guard must not fire.
    scheduleRows = [];
    const res = (await handleCheckAndSendAgendaReminders(undefined, {
      internal: true,
    })) as { success: boolean; checked?: number; sessionInvalid?: boolean };

    expect(res.sessionInvalid).toBeUndefined();
    expect(res.success).toBe(true);
    expect(res.checked).toBe(0);
  });

  it('internal=true is not honoured when passed through the surface', async () => {
    // Structural, not behavioural: surfaces/schedule.ts must not forward opts,
    // or the bypass becomes reachable over HTTP. The surface passes only (p, s).
    const surface = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'surfaces', 'schedule.ts'),
      'utf8',
    );
    const line = surface
      .split('\n')
      .find((l) => l.includes('checkAndSendAgendaReminders'));
    expect(line, 'surface must still wire checkAndSendAgendaReminders').toBeTruthy();
    expect(line).not.toMatch(/internal/);
  });
});

describe('agenda-reminders.ts — the trigger', () => {
  // scheduling/ → contexts/ → functions/ → the entry lives in functions/.
  const cronPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'agenda-reminders.ts',
  );
  const src = readFileSync(cronPath, 'utf8');

  it('declares a schedule in code', () => {
    // Netlify reads the expression from this export, not from netlify.toml.
    // No export ⇒ the file deploys as a plain HTTP function that nothing calls.
    const m = src.match(/export\s+const\s+config\s*=\s*\{\s*schedule:\s*'([^']+)'/);
    expect(m, 'agenda-reminders must export config.schedule').toBeTruthy();

    const expr = m![1];
    expect(expr).toBe('*/10 * * * *');

    // The interval must be strictly inside the narrowest reminder window (h0 =
    // 60 min) or a schedule could enter and leave the window between two runs
    // and never fire.
    const everyMinutes = Number(expr.split(' ')[0].replace('*/', ''));
    expect(everyMinutes).toBeGreaterThan(0);
    expect(everyMinutes).toBeLessThan(60);
  });

  it('calls the reminder handler as internal, without a session', () => {
    expect(src).toMatch(/handleCheckAndSendAgendaReminders\s*\(\s*undefined\s*,\s*\{\s*internal:\s*true/);
  });

  it('exports a handler', () => {
    // Netlify deploys the file and 502s on every invocation without one.
    expect(src).toMatch(/export\s+default\b/);
  });

  it('does not reimplement the reminder logic', () => {
    // The logic belongs to the scheduling context. A copy here would drift from
    // the guarded version and the reminder windows would diverge.
    expect(src).not.toMatch(/reminder_h7_sent|markReminderSent|parseWaList/);
  });
});
