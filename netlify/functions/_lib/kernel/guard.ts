/**
 * kernel/guard.ts — dependency-free input guards for the handler edge.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT ZOD
 * --------------------------------------
 * `kernel/validate.ts` validates with zod, and zod is the preferred tool. It
 * cannot be used everywhere, and the reason is measured rather than stylistic:
 * zod costs about 67 KB minified inside an entry point's bundle. Netlify
 * bundles every function separately, and `scripts/ci/bundle-size.mjs` fails any
 * narrow entry that grows more than 5% AND 8 KB.
 *
 * Measured 2026-09-16, by importing `validate.ts` from `contexts/jobs` and
 * `contexts/applications`:
 *
 *     jobs.js     77.4 -> 142.9 KB        mail.js   100.6 -> 167.6 KB
 *     files.js   555.3 -> 622.6 KB   <-- over the 600 KB hard ceiling
 *
 * and six more entries grew by the same ~67 KB, because
 * `contexts/applications/service.ts` is imported by `master-data`, `registry`
 * and `_lib/ai/cv`. So a single zod import in a shared context leaks the whole
 * library into most of the deployment. That is the regression Phase A exists to
 * prevent, and the bundle gate caught it.
 *
 * The split that follows: zod where the entry can already afford it — the auth
 * surface pays for it today — and these guards, which import nothing but
 * `errors.ts`, everywhere else. Same semantics, no bundle cost.
 *
 * THE TWO TRAPS THESE GUARDS ENCODE
 * ---------------------------------
 * Both were real failures in this repo's history, and both are silent:
 *
 *   1. ARITY. `JSON.stringify({ payload: args })` (src/lib/apiClient.ts) is how
 *      every call travels, and an exact-arity expectation is what breaks: B01
 *      was a four-slot tuple that killed candidate registration end-to-end
 *      while presenting as a business error. `guardPayload` therefore accepts
 *      every arity from 1..n and refuses only an empty or over-long payload.
 *      Arity tolerance also protects the retiring alias path in
 *      `_lib/netlify-wrapper.ts`, where already-deployed clients may call an
 *      action with fewer arguments than the current UI sends.
 *
 *   2. NULL. `JSON.stringify([a, b, undefined])` produces `[a, b, null]`, so an
 *      omitted optional argument arrives as **null**, never as `undefined`. An
 *      `!== undefined` check lets that `null` through to the database. Optional
 *      guards accept both.
 *
 * SCOPE — these validate TYPES and PRESENCE, not business vocabulary. The set
 * of legal `status` values lives in the UI and in the existing rows; narrowing
 * it here would start rejecting data that is already in the table.
 */

import { AppError } from './errors';

/** One positional argument's check. Throws AppError on failure. */
export type Guard = (value: unknown) => void;

function fail(message: string): never {
  throw new AppError('VALIDATION_FAILED', { message, httpStatus: 400 });
}

/**
 * Validate a positional payload and return it unchanged.
 *
 * Deliberately returns `unknown[]` rather than a typed tuple: the arity is not
 * fixed (trap 1), so a fixed tuple type would be a lie. Call sites cast after
 * validation, which is sound because the guards proved the shape at runtime —
 * and is strictly better than the `payload as [string, string]` casts this
 * replaces, which asserted the shape without checking it.
 */
export function guardPayload(payload: unknown, guards: Guard[]): unknown[] {
  const arr = Array.isArray(payload) ? payload : [];
  if (arr.length === 0 || arr.length > guards.length) {
    fail(`Payload harus berisi 1 sampai ${guards.length} argumen`);
  }
  for (let i = 0; i < arr.length; i++) guards[i](arr[i]);
  return arr;
}

/** A required, non-blank string of bounded length. */
export const text =
  (label: string, max = 64): Guard =>
  (v) => {
    if (typeof v !== 'string') fail(`${label} harus diisi`);
    if (v.trim().length === 0) fail(`${label} harus diisi`);
    if (v.length > max) fail(`${label} terlalu panjang`);
  };

/** A string that may be absent — `null` (the wire form) or `undefined`. */
export const optionalText =
  (label: string, max = 64): Guard =>
  (v) => {
    if (v === null || v === undefined) return;
    text(label, max)(v);
  };

/**
 * A string that may be absent OR empty.
 *
 * "Absent" and "blank" are different, and conflating them breaks live calls:
 *
 *   - `updateDokumenShare` sends an empty string to CLEAR the shared-document
 *     list. A blank-rejecting guard makes clearing impossible.
 *   - `rejectForm` sends an empty reason deliberately; the handler falls back
 *     to the legacy wording 'Lamaran ditolak'.
 *
 * Both were caught by the acceptance cases in service-input-validation.test.ts
 * before they shipped, which is the reason those cases pin the payloads the
 * client actually builds rather than convenient ones.
 */
export const optionalTextOrEmpty =
  (label: string, max = 64): Guard =>
  (v) => {
    if (v === null || v === undefined) return;
    if (typeof v !== 'string') fail(`${label} harus berupa teks`);
    if (v.length > max) fail(`${label} terlalu panjang`);
  };

/** A row index, as the current UI (number) or the legacy path (numeric string)
 *  sends it. The integer rule itself stays with the handler that owns it. */
export const indexLike =
  (label: string): Guard =>
  (v) => {
    if (typeof v !== 'number' && typeof v !== 'string') fail(`${label} tidak valid`);
  };

/**
 * An argument accepted for wire compatibility and never read.
 *
 * `rejectForm`'s second slot is legacy's admin display name; the rebuild takes
 * the identity from the verified session instead. It must NOT be a `text`
 * guard: the current UI sends an empty string there, and a required-text check
 * would reject every real call.
 */
export const ignored: Guard = () => {};

/**
 * Reject a write that would carry nothing.
 *
 * Not cosmetic: `updateTahapanDbJob` with neither `tahapan` nor `status` used
 * to build an empty body, PATCH `{}`, and still answer `{success:true}`. An
 * empty write is not a successful write.
 */
export function requireAtLeastOne(values: unknown[], message: string): void {
  if (values.every((v) => v === null || v === undefined)) fail(message);
}
