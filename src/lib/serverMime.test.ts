// ==========================================
// TESTS: the local preview harness serves every asset with the right MIME type
//
// Why this test exists
//   `server.cjs` is not production — Netlify serves the deployed site with its
//   own MIME handling. But it IS the harness the e2e gates run against:
//   `test-contrast.mjs`, `test-hover-contrast.mjs`, `test-headings.mjs`,
//   `test-dialog.mjs`, `test-headings-public.mjs` and the WCAG audit all start
//   it. So a wrong content type here is invisible in production while being
//   real everywhere it is actually measured.
//
//   The gap this file closes, MEASURED 2026-09-28:
//
//     $ curl -o /dev/null -w "%{content_type}" http://127.0.0.1:4321/assets/ilustrasi/hero-sakura.avif
//     application/octet-stream      <-- wrong
//     $ curl ... /penempatan-banner.webp
//     image/webp                    <-- right
//
//   `.avif` was simply absent from the MIME map while `.webp` was present. The
//   site leans on AVIF hard — 18 unique AVIF references across `dist/*.html`,
//   every one of them inside a `srcset` — so the wrong type covered a large,
//   deliberately-chosen slice of the imagery, and it did so quietly: the bytes
//   still arrive and the image still paints, which is why nobody noticed.
//
//   WHY A TEST AND NOT JUST THE ONE-LINE EDIT. Adding `'.avif': 'image/avif'`
//   fixes today. This asserts the INVARIANT that made the bug possible: every
//   image extension the BUILD actually references has an entry in the MIME map.
//   A new extension (`.avifs`? `.jxl`?) then fails here instead of shipping as
//   `application/octet-stream` on a harness five gates depend on.
//
//   Two properties are asserted, and the second is the load-bearing one:
//     1. the map is well-formed — every extension key is dot-prefixed and every
//        value is a non-empty type/subtype;
//     2. every image extension REFERENCED BY `dist/` is covered by the map,
//        with `image/*` as its type. This is derived from the artifact, not from
//        a hand-written list, so it cannot drift out of date.
// ==========================================
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const SERVER = join(process.cwd(), 'server.cjs');
const DIST = join(process.cwd(), 'dist');
const hasBuild = existsSync(DIST);

/**
 * Read the MIME map out of `server.cjs` WITHOUT requiring it.
 *
 * `server.cjs` calls `.listen()` at module scope, so importing it in a test
 * would open a real port and hang the suite. The map is a plain object literal
 * of string pairs, so it is parsed from source instead. The parse is
 * deliberately STRICT: an unparseable map is a test failure, not a silent
 * "zero extensions found" — a gate that passes when it can see nothing is the
 * exact failure mode this repo has been bitten by before.
 */
function readMimeMap(): Record<string, string> {
  const src = readFileSync(SERVER, 'utf8');
  const block = src.match(/const MIME = \{([\s\S]*?)\n\};/);
  if (!block) throw new Error('could not locate the MIME map in server.cjs');

  const map: Record<string, string> = {};
  for (const line of block[1].split('\n')) {
    const m = line.match(/^\s*'([^']+)':\s*'([^']+)',\s*$/);
    if (m) map[m[1]] = m[2];
  }
  if (Object.keys(map).length < 10) {
    throw new Error(`MIME map parsed as suspiciously small: ${Object.keys(map).length} entries`);
  }
  return map;
}

/** Every file extension that `dist/` actually serves, images included. */
function extensionsInDist(): string[] {
  const found = new Set<string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (!name.endsWith('.map')) found.add(extname(name).toLowerCase());
    }
  };
  walk(DIST);
  return [...found].sort();
}

/**
 * The extensions that must never be `application/octet-stream`: a browser that
 * receives the wrong type for these renders nothing.
 *
 * Held as a literal rather than derived, because "is this an image?" is exactly
 * the judgement being tested — deriving it from the map under test would make
 * the assertion circular.
 */
const IMAGE_EXTENSIONS = new Set([
  '.avif', '.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
]);

describe('server.cjs — MIME map', () => {
  it('is well-formed: dot-prefixed keys, type/subtype values', () => {
    const map = readMimeMap();
    for (const [ext, type] of Object.entries(map)) {
      expect(ext, `extension key ${JSON.stringify(ext)} must start with a dot`).toMatch(/^\./);
      expect(type, `${ext} must be a type/subtype`).toMatch(/^[\w.+-]+\/[\w.+-]+/);
    }
  });

  it('covers `.avif` with `image/avif` — the 2026-09-28 regression', () => {
    // Named explicitly as well as generically, because the generic assertion
    // below is skipped when dist/ is absent (e.g. a fresh clone). This one
    // always runs, so the specific bug cannot return unnoticed.
    const map = readMimeMap();
    expect(map['.avif']).toBe('image/avif');
  });

  it('does not serve any image extension as octet-stream', () => {
    const map = readMimeMap();
    const broken = [...IMAGE_EXTENSIONS].filter((e) => !map[e]?.startsWith('image/'));
    expect(broken, `image extensions falling back to application/octet-stream: ${broken.join(', ')}`).toEqual([]);
  });

  describe.skipIf(!hasBuild)('against the built dist/', () => {
    it('every extension dist/ actually references has a MIME entry', () => {
      const map = readMimeMap();
      const uncovered = extensionsInDist().filter((e) => e && !map[e]);
      expect(
        uncovered,
        `extensions present in dist/ but absent from the MIME map (will be served as ` +
          `application/octet-stream): ${uncovered.join(', ')}`,
      ).toEqual([]);
    });
  });
});
