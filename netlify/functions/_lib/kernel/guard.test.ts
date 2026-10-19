/**
 * guard.test.ts — the dependency-free edge guards, including `fieldsOf`.
 *
 * WHY THIS FILE EXISTS NOW
 * `fieldsOf` was added 2026-10-19 for the two CV-template actions, whose payload
 * is one OBJECT (`{ record }`, `{ rowId }`) rather than positional strings. That
 * is the first guard in this file that reaches INSIDE an argument, so it is also
 * the first one whose failure modes are not already pinned by a handler test:
 * every existing guard is exercised through the services that call it, and these
 * two services have no test file at all.
 *
 * The cases below pin the three traps this kernel documents, because each one is
 * silent in production:
 *   1. ARITY — an omitted argument arrives as `null`, never `undefined`
 *      (`JSON.stringify([a, undefined])` is `[a, null]`), so a null-check that
 *      only tests `undefined` lets it through.
 *   2. SHAPE — an array is an object in JavaScript. Without the explicit
 *      `Array.isArray` refusal, `[{...}]` would be accepted as a field bag and
 *      every field would read `undefined`, which the guards would then report as
 *      "must be filled" — a message that hides the real mistake.
 *   3. FIELD NAME — a typo in the spec (`rowID`) would silently guard nothing,
 *      because the absent field is `undefined` and `text()` rejects that. The
 *      spec's field name must be the WIRE name; the case below asserts the error
 *      message names the field, which is what makes a typo visible.
 */
import { describe, expect, it } from 'vitest';
import { AppError } from './errors';
import { fieldsOf, guardPayload, optionalText, text } from './guard';

/** The thrown AppError, or `null` when the call did not throw. */
function caught(fn: () => unknown): AppError | null {
  try {
    fn();
    return null;
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
}

describe('fieldsOf', () => {
  const spec = { rowId: text('rowId', 64) };

  it('accepts the object the client actually sends', () => {
    const [d] = guardPayload([{ rowId: '12' }], [fieldsOf('Hapus template CV', spec)]) as [
      Record<string, unknown>,
    ];
    expect(d.rowId).toBe('12');
  });

  it('rejects null — the wire form of an omitted argument', () => {
    const err = caught(() => guardPayload([null], [fieldsOf('Hapus template CV', spec)]));
    expect(err?.code).toBe('VALIDATION_FAILED');
    expect(err?.httpStatus).toBe(400);
  });

  it('rejects an array, which is an object in JavaScript', () => {
    const err = caught(() => guardPayload([['12']], [fieldsOf('Hapus template CV', spec)]));
    expect(err?.code).toBe('VALIDATION_FAILED');
    expect(err?.message).toContain('objek');
  });

  it('rejects a string payload rather than reading characters as fields', () => {
    const err = caught(() => guardPayload(['{"rowId":"12"}'], [fieldsOf('Hapus template CV', spec)]));
    expect(err?.code).toBe('VALIDATION_FAILED');
  });

  it('rejects an empty object, and names the field it wants', () => {
    const err = caught(() => guardPayload([{}], [fieldsOf('Hapus template CV', spec)]));
    expect(err?.code).toBe('VALIDATION_FAILED');
    expect(err?.message).toContain('rowId');
  });

  it('rejects a blank string — present is not the same as filled', () => {
    const err = caught(() => guardPayload([{ rowId: '   ' }], [fieldsOf('Hapus template CV', spec)]));
    expect(err?.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a value past the field bound', () => {
    const err = caught(() =>
      guardPayload([{ rowId: 'x'.repeat(65) }], [fieldsOf('Hapus template CV', spec)]),
    );
    expect(err?.code).toBe('VALIDATION_FAILED');
    expect(err?.message).toContain('panjang');
  });

  it('lets an OPTIONAL field be absent, and still guards it when present', () => {
    const optSpec = { rowId: text('rowId', 64), note: optionalText('catatan', 8) };
    const [ok] = guardPayload([{ rowId: '12' }], [fieldsOf('Template CV', optSpec)]) as [
      Record<string, unknown>,
    ];
    expect(ok.rowId).toBe('12');

    const err = caught(() =>
      guardPayload([{ rowId: '12', note: 'terlalu panjang' }], [fieldsOf('Template CV', optSpec)]),
    );
    expect(err?.code).toBe('VALIDATION_FAILED');
  });
});
