// ==========================================
// TESTS: input validation at the handler edge — jobs + mail (2026-09-16)
//
// WHY THIS SUITE EXISTS
//   Three documents described edge validation as universal. Measured, none of
//   it was true: `validatePayload()` had 7 call sites, all in surfaces/auth.ts,
//   against 81 routed actions. The `jobs` surface was the worst of the gap —
//   four actions read an argument as `unknown` and handed it straight to a
//   PostgREST body whose column is TEXT.
//
// WHAT IS PINNED HERE
//   1. ORDERING — the session guard runs BEFORE validation, so an anonymous
//      caller gets the auth verdict rather than a schema verdict.
//   2. TYPE/PRESENCE — a malformed argument becomes a 400 VALIDATION_FAILED
//      instead of an invalid PostgREST body reported as a generic failure.
//   3. AN EMPTY WRITE IS NOT A SUCCESSFUL WRITE — `updateTahapanDbJob` used to
//      PATCH `{}` and answer `{success:true}`.
//   4. THE TWO WIRE TRAPS, each with a counterfactual so the test proves the
//      guard is load-bearing rather than merely passing:
//        - ARITY: an exact-arity expectation rejects a 2-argument call. That is
//          B01, where a four-slot tuple killed candidate registration
//          end-to-end while presenting as a business error.
//        - NULL: `JSON.stringify([a, b, undefined])` is `[a, b, null]`, so an
//          omitted optional argument arrives as `null`, never `undefined`.
//   5. ACCEPTANCE — the exact payloads the client builds still validate.
//
// Every rejection below happens BEFORE any DB/network call, so this suite runs
// without env or a database.
// ==========================================
import { describe, it, expect } from 'vitest';
import { signToken } from '../_lib/session';
import { AppError } from '../_lib/kernel/errors';
import { guardPayload, text, optionalText, optionalTextOrEmpty, requireAtLeastOne } from '../_lib/kernel/guard';
import {
  handleUbahStatusJob,
  handleHapusJobData,
  handleUpdateTahapanDbJob,
  handleUpdateDokumenShare,
  handleTandaiGagalJob,
} from './jobs/service';
import { handleRejectForm } from './applications/service';

const admin = signToken({ role: 'admin', name: 'TESTADMIN' });
const kandidat = signToken({ role: 'kandidat', wa: '6281111111111' });

/** Run a call that is expected to throw; return the error instead of failing. */
async function caught(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
}

function expectValidationFailure(err: unknown, hint: RegExp) {
  expect(err).toBeInstanceOf(AppError);
  const app = err as AppError;
  expect(app.code).toBe('VALIDATION_FAILED');
  expect(app.httpStatus).toBe(400);
  expect(app.message).toMatch(hint);
}

// The guard list each handler installs, so the acceptance cases below exercise
// the same arity and null semantics the handlers actually run.
const statusGuards = [text('Kode loker', 64), text('Status', 40), optionalText('Timestamp', 64)];

// ── 1. Ordering: identity before input ───────────────────────────────────────

describe('ordering — the session guard runs before validation', () => {
  // A schema verdict for an anonymous caller would both leak the contract and
  // report "your input is wrong" for a request that was never authenticated.
  it('anonymous callers get the auth verdict, not a validation verdict', async () => {
    const res = (await handleUbahStatusJob(['TG1ASJ', { evil: 1 }])) as Record<string, unknown>;
    expect(res.sessionInvalid).toBe(true);
    expect(res.code).toBeUndefined();
  });

  it('a kandidat session is rejected before validation too', async () => {
    const res = (await handleUbahStatusJob(['TG1ASJ', { evil: 1 }], kandidat)) as Record<string, unknown>;
    expect(res.sessionInvalid).toBe(true);
  });

  it('the guard wins for every validated jobs action', async () => {
    const calls = [
      handleHapusJobData([{}]),
      handleUpdateTahapanDbJob([[{}]]),
      handleUpdateDokumenShare([{}]),
      handleTandaiGagalJob([[{}]]),
    ];
    for (const c of calls) {
      const res = (await c) as Record<string, unknown>;
      expect(res.sessionInvalid).toBe(true);
    }
  });
});

// ── 2. Type / presence rules ─────────────────────────────────────────────────

describe('jobs — a malformed argument is rejected instead of reaching PostgREST', () => {
  it('ubahStatusJob rejects a non-string status', async () => {
    expectValidationFailure(await caught(() => handleUbahStatusJob(['TG1ASJ', { evil: 1 }], admin)), /Status/);
  });

  it('ubahStatusJob rejects a non-string code', async () => {
    expectValidationFailure(await caught(() => handleUbahStatusJob([{ evil: 1 }, 'BUKA'], admin)), /Kode loker/);
  });

  it('ubahStatusJob rejects a blank code', async () => {
    // Blank would make `code_job=eq.` match nothing while still reporting success.
    expectValidationFailure(await caught(() => handleUbahStatusJob(['   ', 'BUKA'], admin)), /Kode loker/);
  });

  it('hapusJobData rejects a non-string code', async () => {
    // Previously: code_job=eq.<object> deleted zero rows and answered success:true.
    expectValidationFailure(await caught(() => handleHapusJobData([{ evil: 1 }], admin)), /Kode loker/);
  });

  it('updateTahapanDbJob rejects a non-string tahapan', async () => {
    expectValidationFailure(await caught(() => handleUpdateTahapanDbJob(['TG1ASJ', ['a', 'b']], admin)), /Tahapan/);
  });

  it('updateDokumenShare rejects a non-string document list', async () => {
    expectValidationFailure(await caught(() => handleUpdateDokumenShare(['TG1ASJ', { evil: 1 }], admin)), /Daftar dokumen/);
  });

  it('tandaiGagalJob rejects a non-string WA', async () => {
    expectValidationFailure(await caught(() => handleTandaiGagalJob([42, 'TG1ASJ'], admin)), /Nomor WA/);
  });

  it('tandaiGagalJob rejects a blank job code', async () => {
    expectValidationFailure(await caught(() => handleTandaiGagalJob(['6281111111111', ''], admin)), /Kode loker/);
  });
});

describe('jobs — an empty write is not a successful write', () => {
  it('updateTahapanDbJob rejects a payload with neither tahapan nor status', async () => {
    // Before: `body` stayed {} , the handler PATCHed an empty body and still
    // answered {success:true}. The failure was invisible to the caller.
    expectValidationFailure(
      await caught(() => handleUpdateTahapanDbJob(['TG1ASJ'], admin)),
      /Tahapan atau status/,
    );
    expectValidationFailure(
      await caught(() => handleUpdateTahapanDbJob(['TG1ASJ', null, null], admin)),
      /Tahapan atau status/,
    );
  });
});

describe('mail — rejectForm', () => {
  it('rejects a non-string reason before it can reach the keterangan column', async () => {
    expectValidationFailure(await caught(() => handleRejectForm([3, '', { evil: 1 }], admin)), /Alasan/);
  });

  it('rejects a non-numeric row index', async () => {
    expectValidationFailure(await caught(() => handleRejectForm([{ evil: 1 }, '', 'x'], admin)), /Index form/);
  });

  it('an empty reason is legal — the legacy fallback covers it', async () => {
    // Argument 2 is legacy's admin name and is deliberately unvalidated: the
    // current UI sends an empty string there.
    const err = await caught(() => handleRejectForm([3, '', ''], admin));
    // It must fail on something OTHER than validation: with no DB in this
    // suite the call cannot succeed, but it must not be a VALIDATION_FAILED.
    if (err) expect((err as AppError).code).not.toBe('VALIDATION_FAILED');
  });
});

// ── 3. The arity trap (B01) ──────────────────────────────────────────────────

describe('arity — a trailing argument may be absent entirely', () => {
  it('accepts 1..n arguments and refuses only empty or over-long payloads', () => {
    expect(() => guardPayload(['TG12ASJ'], statusGuards)).not.toThrow();
    expect(() => guardPayload(['TG12ASJ', 'BUKA'], statusGuards)).not.toThrow();
    expect(() => guardPayload(['TG12ASJ', 'BUKA', '2026-09-16T00:00:00Z'], statusGuards)).not.toThrow();
    expect(() => guardPayload([], statusGuards)).toThrow(/1 sampai 3 argumen/);
    expect(() => guardPayload(['a', 'b', 'c', 'd'], statusGuards)).toThrow(/1 sampai 3 argumen/);
  });

  it('the exact-arity expectation would have rejected the 2-argument call — B01', () => {
    // Counterfactual: this is the shape that killed candidate registration.
    const exactArity = (arr: unknown[]) => {
      if (arr.length !== 3) throw new Error('Array must contain at least 3 element(s)');
    };
    expect(() => exactArity(['TG12ASJ', 'BUKA'])).toThrow();
    expect(() => guardPayload(['TG12ASJ', 'BUKA'], statusGuards)).not.toThrow();
  });
});

// ── 4. The null trap ─────────────────────────────────────────────────────────

describe('wire format — an omitted optional argument arrives as null, not undefined', () => {
  it('JSON.stringify turns an undefined array slot into null', () => {
    // The fact the guards are built around, asserted rather than assumed.
    const wire = JSON.parse(JSON.stringify(['TG12ASJ', 'BUKA', undefined]));
    expect(wire[2]).toBeNull();
    expect(wire[2]).not.toBeUndefined();
  });

  it('the guards accept that wire form', () => {
    const wire = JSON.parse(JSON.stringify(['TG12ASJ', 'BUKA', undefined]));
    expect(() => guardPayload(wire, statusGuards)).not.toThrow();
  });

  it('a naive `!== undefined` optional check would let null through — the trap is real', () => {
    // Counterfactual for the second trap, mirroring the arity case above.
    const naiveOptional = (v: unknown) => {
      if (v !== undefined) throw new Error('Timestamp tidak valid');
    };
    const wire = JSON.parse(JSON.stringify(['TG12ASJ', 'BUKA', undefined]));
    expect(() => naiveOptional(wire[2])).toThrow();
    expect(() => guardPayload(wire, statusGuards)).not.toThrow();
  });

  it('requireAtLeastOne treats null and undefined as absent alike', () => {
    expect(() => requireAtLeastOne([null, null], 'kosong')).toThrow(/kosong/);
    expect(() => requireAtLeastOne([undefined, null], 'kosong')).toThrow(/kosong/);
    expect(() => requireAtLeastOne([null, 'BUKA'], 'kosong')).not.toThrow();
  });
});

// ── 5. Acceptance: the payloads the client actually builds ───────────────────

describe('acceptance — the exact payloads the client builds still validate', () => {
  // Each case cites its call site; these are the regression pins that keep a
  // stricter guard from breaking a live call (the B01 failure mode).
  it('ubahStatusJob ← TabKelola.tsx:72 [code, newStatus, job?.updated_at]', () => {
    expect(() => guardPayload(['TG12ASJ', 'TUTUP', '2026-09-16T00:00:00.000Z'], statusGuards)).not.toThrow();
    expect(() => guardPayload(JSON.parse(JSON.stringify(['TG12ASJ', 'TUTUP', undefined])), statusGuards)).not.toThrow();
    expect(() => guardPayload(['TG12ASJ', 'TUTUP'], statusGuards)).not.toThrow();
  });

  it('hapusJobData ← TabKelola.tsx:84 [code]', () => {
    expect(() => guardPayload(['TG12ASJ'], [text('Kode loker', 64)])).not.toThrow();
  });

  it('updateDokumenShare ← AdminShareModal.tsx:138 [job.code, joined]', () => {
    const guards = [text('Kode loker', 64), optionalTextOrEmpty('Daftar dokumen', 400)];
    expect(() => guardPayload(['TG12ASJ', 'CV,JFT,ALL'], guards)).not.toThrow();
    // An empty selection is a legitimate state — it CLEARS the list, and a
    // blank-rejecting guard would make clearing impossible.
    expect(() => guardPayload(['TG12ASJ', ''], guards)).not.toThrow();
  });

  it('tandaiGagalJob ← ListKandidatModal.tsx:97 [wa, jobCode]', () => {
    expect(() => guardPayload(['6281111111111', 'TG12ASJ'], [text('Nomor WA', 32), text('Kode loker', 64)])).not.toThrow();
  });
});
