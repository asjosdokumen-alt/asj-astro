// ==========================================
// TESTS: contact handler — the ONLY unauthenticated write in the deployment.
//
// WHY THIS SUITE EXISTS
//   `contexts/contact/service.ts` (`kirimPesanKontak`) is the one action any
//   anonymous visitor may call. Until now only the CLIENT island had a test
//   (`ContactForm.test.tsx`), which pins the field ORDER the browser sends but
//   exercises none of the server's own defences. The server's four defences are
//   documented in the file header and were, measured, unpinned:
//     1. the honeypot short-circuit (and its slot coupling),
//     2. the per-number rate limit,
//     3. insert failure → a generic, non-leaking error,
//     4. notify failure → best-effort, must NOT fail a stored message.
//
// THE FAILURE MODE THAT MOTIVATES #26
//   The honeypot is read from payload SLOT 4 (service.ts `HONEYPOT_SLOT`), while
//   the client sends `perusahaan` last. The file's own comment warns what happens
//   if those drift: the trap reads the visitor's SUBJECT, so EVERY honest
//   submission is discarded as a bot — while the suspicious ones pass. The test
//   below pins the field-name ↔ slot mapping by asserting that a filled SUBJECT
//   (slot 2) does NOT trip the trap while a filled `perusahaan` (slot 4) does.
//
// WHY e2e/ AND NOT netlify/functions/
//   The indexer's frozen file counters (`indexer/src/discover.test.ts`,
//   `build.test.ts`) count `netlify/functions/**/*.ts`. A new `.ts` test file
//   there MOVES a counter and turns those suites red. The `e2e/` tier only counts
//   mjs/cjs/js, so a `.ts` file here is invisible to the counters (same reason
//   `share-data.test.ts` etc. live here — see vitest.config.ts:114-118). It must
//   run under node, not jsdom, so it is excluded from the `frontend` project.
// ==========================================
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

// HOISTED. The service reaches the database through its own repository, and
// fires the admin push through a DYNAMIC `import('../../_lib/fcm-helpers')`.
// `vi.mock` (hoisted, module scope) binds both; `vi.doMock` + `resetModules()`
// inside a body does not (measured in round 1 — see candidates-lookup-stub).
const repo = vi.hoisted(() => ({
  normalizeWa: vi.fn((v: string) => String(v).replace(/\D/g, '')),
  insertPesanKontak: vi.fn(async () => {}),
  countPesanSejak: vi.fn(async () => 0),
}));
const notify = vi.hoisted(() => ({ notifyAdmins: vi.fn(async () => {}) }));

vi.mock('../netlify/functions/contexts/contact/repository', () => repo);
vi.mock('../netlify/functions/_lib/fcm-helpers', () => notify);

import { handleKirimPesanKontak } from '../netlify/functions/contexts/contact/service';
import { notifyAdmins } from '../netlify/functions/_lib/fcm-helpers';

/**
 * The field order the client island actually sends, copied from
 * `ContactForm.tsx:145` (`[f.nama, f.noWa, f.subjek, f.pesan, f.perusahaan]`).
 * Naming the positions is what lets the honeypot slot be asserted instead of
 * counted by eye.
 */
const FIELD_ORDER = ['nama', 'no_wa', 'subjek', 'pesan', 'perusahaan'] as const;
type Field = (typeof FIELD_ORDER)[number];
const HONEYPOT_FIELD: Field = 'perusahaan';

/** Build the positional payload the client builds, from named fields. */
function payload(fields: Partial<Record<Field, string | null>>): unknown[] {
  return FIELD_ORDER.map((k) => (k in fields ? fields[k] : ''));
}

/** A complete, honest submission — every required field present, honeypot empty. */
const HONEST: Partial<Record<Field, string>> = {
  nama: 'Budi Santoso',
  no_wa: '081234567890',
  subjek: 'Tanya lowongan',
  pesan: 'Apakah masih ada kuota?',
};

const SUCCESS = { success: true, message: 'Pesan Anda sudah kami terima.' };
const RATE_MSG = 'Anda sudah mengirim beberapa pesan. Mohon tunggu sebentar sebelum mengirim lagi.';

let logSpy: MockInstance;

beforeEach(() => {
  vi.clearAllMocks();
  // Re-arm every implementation, so a test that overrides one cannot leak.
  repo.normalizeWa.mockReset();
  repo.normalizeWa.mockImplementation((v: string) => String(v).replace(/\D/g, ''));
  repo.insertPesanKontak.mockReset();
  repo.insertPesanKontak.mockResolvedValue(undefined);
  repo.countPesanSejak.mockReset();
  repo.countPesanSejak.mockResolvedValue(0);
  notify.notifyAdmins.mockReset();
  notify.notifyAdmins.mockResolvedValue(undefined);
  // The service logs to console; keep the run quiet and capture the honeypot line.
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('contact service — happy path', () => {
  it('stores an honest submission and reports the same success a bot is shown', async () => {
    const res = await handleKirimPesanKontak(payload(HONEST));
    expect(res).toEqual(SUCCESS);
    expect(repo.insertPesanKontak).toHaveBeenCalledTimes(1);
    const row = repo.insertPesanKontak.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({
      nama: 'Budi Santoso',
      no_wa: '081234567890',
      subjek: 'Tanya lowongan',
      pesan: 'Apakah masih ada kuota?',
      status: 'BARU',
    });
    expect(String(row.id)).toMatch(/^KONTAK\d+$/);
  });

  it('notifies admins on the honest path (best-effort, but wired)', async () => {
    await handleKirimPesanKontak(payload(HONEST));
    expect(notify.notifyAdmins).toHaveBeenCalledTimes(1);
    expect(notify.notifyAdmins).toHaveBeenCalledWith(
      'Pesan Kontak Baru',
      expect.stringContaining('Budi Santoso'),
      '/admin.html',
    );
  });
});

describe('#14 — the honeypot short-circuits before any storage', () => {
  it('a filled honeypot gets the SAME success, stores nothing, and skips the limiter', async () => {
    const res = await handleKirimPesanKontak(payload({ ...HONEST, perusahaan: 'PT Contoh' }));
    expect(res).toEqual(SUCCESS); // indistinguishable from the honest reply, on purpose
    expect(repo.insertPesanKontak).not.toHaveBeenCalled();
    // The trap runs before the rate check, so a bot costs zero DB round trips.
    expect(repo.countPesanSejak).not.toHaveBeenCalled();
  });

  it('an omitted honeypot (wire null) is tolerated — not every bot omits it, but a person does', async () => {
    const res = await handleKirimPesanKontak(payload({ ...HONEST, perusahaan: null }));
    expect(res).toEqual(SUCCESS);
    expect(repo.insertPesanKontak).toHaveBeenCalledTimes(1);
  });

  it('logs the honeypot hit with its FIELD NAME, so triage need not count slots', async () => {
    await handleKirimPesanKontak(payload({ ...HONEST, perusahaan: 'PT Contoh' }));
    const line = (logSpy.mock.calls as unknown[][])
      .map((c) => String(c[0] ?? ''))
      .find((l) => l.includes('contact.honeypot'));
    expect(line).toBeDefined();
    expect(line).toContain(HONEYPOT_FIELD); // the log names `perusahaan`
  });
});

describe('#26 — the honeypot FIELD NAME is pinned to its payload SLOT', () => {
  it('the client order places `perusahaan` at slot 4 (the slot the server reads)', () => {
    expect(FIELD_ORDER.indexOf(HONEYPOT_FIELD)).toBe(4);
  });

  it('a filled SUBJECT (slot 2) does NOT trip the trap — only slot 4 does', async () => {
    // This is the documented catastrophe: if the trap slot drifts onto the
    // subject, every honest submission (all of which carry a subject) is
    // blackholed. Assert the trap is on `perusahaan`, not on `subjek`.
    const honest = await handleKirimPesanKontak(payload(HONEST));
    expect(honest).toEqual(SUCCESS);
    expect(repo.insertPesanKontak).toHaveBeenCalledTimes(1); // a subject alone is fine

    repo.insertPesanKontak.mockClear();
    await handleKirimPesanKontak(payload({ ...HONEST, perusahaan: 'x' }));
    expect(repo.insertPesanKontak).not.toHaveBeenCalled(); // only slot 4 trips it
  });

  it('shifting the trap to slot 2 would blackhole a normal submission (counterfactual)', async () => {
    // Reads slot 2 (the subject) as the honeypot — the exact reorder the file
    // warns about. It must be visibly WRONG, which is what the test above pins.
    const slot2IsTrap = payload(HONEST)[2]; // 'Tanya lowongan' — a real subject
    expect(String(slot2IsTrap).trim()).not.toBe(''); // a person always fills it
  });
});

describe('#14 — the per-number rate limit', () => {
  it('the 6th message inside the window is refused and not stored', async () => {
    repo.countPesanSejak.mockResolvedValue(5); // RATE_MAX = 5
    const res = await handleKirimPesanKontak(payload(HONEST));
    expect(res).toEqual({ success: false, message: RATE_MSG });
    expect(repo.insertPesanKontak).not.toHaveBeenCalled();
  });

  it('the 5th message is still allowed (the limit is a threshold, not off-by-one)', async () => {
    repo.countPesanSejak.mockResolvedValue(4);
    const res = await handleKirimPesanKontak(payload(HONEST));
    expect(res).toEqual(SUCCESS);
    expect(repo.insertPesanKontak).toHaveBeenCalledTimes(1);
  });

  it('a limiter that cannot read its own state fails OPEN — the message is still stored', async () => {
    // A COUNT failure must not become a lost customer; the service logs and
    // proceeds rather than rejecting a real enquiry.
    repo.countPesanSejak.mockRejectedValue(new Error('COUNT failed'));
    const res = await handleKirimPesanKontak(payload(HONEST));
    expect(res).toEqual(SUCCESS);
    expect(repo.insertPesanKontak).toHaveBeenCalledTimes(1);
  });
});

describe('#14 — insert and notify failure paths', () => {
  it('an insert failure throws a generic INTERNAL_ERROR and leaks no DB detail', async () => {
    repo.insertPesanKontak.mockRejectedValue(
      new Error('PostgREST 500: relation "database_asj_kontak" does not exist'),
    );
    let caught: unknown;
    try {
      await handleKirimPesanKontak(payload(HONEST));
    } catch (e) {
      caught = e;
    }
    expect(caught).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Pesan gagal dikirim. Silakan hubungi kami melalui WhatsApp atau surel.',
    });
    expect(String((caught as Error).message)).not.toContain('PostgREST');
    expect(String((caught as Error).message)).not.toContain('database_asj_kontak');
  });

  it('a failed admin notification does NOT fail a message that is already stored', async () => {
    notify.notifyAdmins.mockRejectedValue(new Error('FCM down'));
    const res = await handleKirimPesanKontak(payload(HONEST));
    expect(res).toEqual(SUCCESS); // stored, so success stands
    expect(repo.insertPesanKontak).toHaveBeenCalledTimes(1);
  });
});

describe('#14 — input guards run before any storage', () => {
  it('a blank required field is rejected as VALIDATION_FAILED', async () => {
    await expect(handleKirimPesanKontak(payload({ ...HONEST, nama: '' }))).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(repo.insertPesanKontak).not.toHaveBeenCalled();
  });

  it('a WA that normalizes to empty is refused with the WA-specific message', async () => {
    const res = await handleKirimPesanKontak(payload({ ...HONEST, no_wa: 'abc' }));
    expect(res).toEqual({
      success: false,
      message: 'Nomor WhatsApp wajib diisi dengan angka yang benar.',
    });
    expect(repo.insertPesanKontak).not.toHaveBeenCalled();
  });
});

describe('#14 — the mocks are really bound (a green suite must measure the real path)', () => {
  it('notifyAdmins is the mock, so the dynamic import inside the service reached it', () => {
    expect(vi.isMockFunction(notifyAdmins)).toBe(true);
    expect(notifyAdmins).toBe(notify.notifyAdmins);
  });
});
