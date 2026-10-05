// ==========================================
// TESTS: uploadGuard.validateFile — the client-side gate on every upload.
//
// WHY THIS SUITE EXISTS
//   `src/lib/uploadGuard.ts:31` (`validateFile`) had ZERO test references, yet
//   it is the only thing standing between a visitor and the storage bucket: the
//   sole live caller is `ApplyFullForm.tsx:215`
//       validateFile(file, { accept: acceptMap[docType], maxMb: 2 })
//   which decides whether the file is even offered for upload. Its logic is
//   small but full of edges — extension parsing from an `accept` string, the
//   `image/*` expansion, the last-dot rule, and an inclusive size boundary.
//
// WHY e2e/ AND NOT src/lib/
//   The indexer's frozen counters (`indexer/src/discover.test.ts`,
//   `build.test.ts`) count `src/**` at ALL extensions, so a new
//   `src/lib/uploadGuard.test.ts` MOVES a counter and turns those suites red.
//   The `e2e/` tier counts only mjs/cjs/js, so a `.ts` file here is invisible to
//   the counters (see vitest.config.ts:114-118). The module has no DOM
//   dependency, so it runs in the `backend` (node) project; it is excluded from
//   the `frontend` project so it does not run twice.
// ==========================================
import { describe, expect, it } from 'vitest';
import { validateFile } from '../src/lib/uploadGuard';

/** A minimal stand-in — `validateFile` only reads `name` and `size`. */
const f = (name: string, size = 1024): File => ({ name, size }) as unknown as File;
const MB = 1024 * 1024;

// The real accept strings from ApplyFullForm.tsx (doc-type → accept).
const ACCEPT_PHOTO = '.jpg,.jpeg,.png';
const ACCEPT_CV = '.pdf,.xls,.xlsx,.doc,.docx';

describe('validateFile — format (accept) check', () => {
  it('accepts a file whose extension is in the accept list', () => {
    expect(validateFile(f('cv.pdf'), { accept: ACCEPT_CV })).toEqual({ valid: true });
    expect(validateFile(f('pas_photo.jpg'), { accept: ACCEPT_PHOTO })).toEqual({ valid: true });
  });

  it('matches the extension case-insensitively', () => {
    expect(validateFile(f('PHOTO.PNG'), { accept: ACCEPT_PHOTO })).toEqual({ valid: true });
  });

  it('rejects a disallowed extension, naming the file and the allowed set', () => {
    const r = validateFile(f('malware.exe'), { accept: ACCEPT_CV });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('malware.exe');
    expect(r.error).toContain('.pdf');
    expect(r.error).toContain('atau'); // the human-readable list form
  });

  it('an empty accept string disables the format check (any type passes)', () => {
    expect(validateFile(f('anything.bin'), { accept: '' })).toEqual({ valid: true });
    expect(validateFile(f('anything.bin'))).toEqual({ valid: true }); // no opts at all
  });

  it('expands image/* to the image extension set', () => {
    for (const n of ['a.jpg', 'a.jpeg', 'a.png', 'a.gif', 'a.webp', 'a.bmp']) {
      expect(validateFile(f(n), { accept: 'image/*' }).valid).toBe(true);
    }
    expect(validateFile(f('a.pdf'), { accept: 'image/*' }).valid).toBe(false);
  });
});

describe('validateFile — extension edge cases', () => {
  it('a file with no extension is rejected when a format is required', () => {
    const r = validateFile(f('README'), { accept: '.pdf' });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('README');
  });

  it('multi-dot names use the LAST extension', () => {
    expect(validateFile(f('scan.tar.gz'), { accept: '.gz' }).valid).toBe(true);
    expect(validateFile(f('scan.tar.gz'), { accept: '.tar' }).valid).toBe(false);
  });
});

describe('validateFile — size limit', () => {
  it('accepts exactly the limit and rejects one byte over (the boundary is inclusive)', () => {
    expect(validateFile(f('a.pdf', 5 * MB), { accept: '.pdf', maxMb: 5 }).valid).toBe(true);
    const r = validateFile(f('a.pdf', 5 * MB + 1), { accept: '.pdf', maxMb: 5 });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('a.pdf');
    expect(r.error).toContain('5 MB');
  });

  it('defaults to 5 MB when maxMb is omitted', () => {
    expect(validateFile(f('a.pdf', 5 * MB), { accept: '.pdf' }).valid).toBe(true);
    expect(validateFile(f('a.pdf', 5 * MB + 1), { accept: '.pdf' }).valid).toBe(false);
  });

  it('honours a caller-supplied maxMb (ApplyFullForm uses 2)', () => {
    expect(validateFile(f('a.pdf', 2 * MB), { accept: '.pdf', maxMb: 2 }).valid).toBe(true);
    expect(validateFile(f('a.pdf', 2 * MB + 1), { accept: '.pdf', maxMb: 2 }).valid).toBe(false);
  });

  it('checks FORMAT before SIZE — a huge wrong-type file reports the format', () => {
    const r = validateFile(f('huge.exe', 999 * MB), { accept: '.pdf', maxMb: 5 });
    expect(r.valid).toBe(false);
    expect(r.error).toContain('Format');
  });
});

describe('validateFile — degenerate inputs', () => {
  it('a missing file is valid (nothing to validate)', () => {
    expect(validateFile(undefined as unknown as File)).toEqual({ valid: true });
    expect(validateFile(null as unknown as File)).toEqual({ valid: true });
  });

  it('a file with an empty name is rejected when a format is required', () => {
    const r = validateFile(f(''), { accept: '.pdf' });
    expect(r.valid).toBe(false);
  });
});
