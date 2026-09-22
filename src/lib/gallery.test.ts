/**
 * gallery.test.ts — proves the gallery ships only photographs that exist, and
 * only photographs we are allowed to publish.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The landing page had a documented hole at `index.astro:406`, where the spec
 * called for a building photo and the block shipped with none, because rendering
 * an <img> at a path that does not exist shows every visitor a broken image. That
 * reasoning was correct and it is easy to undo by accident: adding a tenth entry
 * to `GALLERY` with a path that was never copied produces a broken tile that no
 * other gate in this repo would notice. A `.tsx` component cannot check its own
 * file existence at build time — Astro happily emits whatever `src` it is given —
 * so the check belongs here.
 *
 * The second half is the more important one. Four of the twenty-six photographs
 * were deliberately left out for privacy and honesty reasons, and the single most
 * likely future edit to this folder is somebody "completing" the gallery by adding
 * them back because they look like content. That edit must fail loudly.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GALLERY, GALLERY_EXCLUDED } from './gallery';

/** `public/` is the served root, so `/assets/x.webp` is `<repo>/public/assets/x.webp`. */
const publicDir = join(process.cwd(), 'public');
const toDiskPath = (src: string) => join(publicDir, src.replace(/^\//, ''));

/**
 * Every `public/assets/*.webp` name the repo refuses to commit.
 *
 * Read from `.gitignore` so this test agrees with `scripts/ci/verify-assets.mjs`
 * about which files are blocked. A clean checkout does not contain the excluded
 * photographs (they are gitignored), so disk presence alone cannot tell a live
 * exclusion from a stale one — but the RULE naming them survives the checkout,
 * and that is what this set represents.
 *
 * Comment lines are stripped, so the explanatory §11.2 prose above the rules
 * cannot make this set succeed by quoting the filenames it guards.
 */
const ignoredNames = new Set(
  readFileSync(join(process.cwd(), '.gitignore'), 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
    .map((l) => /^\/public\/assets\/(.+\.webp)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1]),
);

describe('gallery — every tile points at a file that is really there', () => {
  it('has a non-empty gallery, so the existence check cannot pass vacuously', () => {
    // "No broken images" is also true of an empty list. This is the guard that
    // makes the next assertion mean something.
    expect(GALLERY.length).toBeGreaterThan(0);
  });

  it.each(GALLERY.map((item) => [item.src, item] as const))('%s exists in public/', (src) => {
    expect(existsSync(toDiskPath(src)), `${src} is referenced but not in public/`).toBe(true);
  });

  it('declares the real intrinsic size of every file', () => {
    // A wrong width/height is worse than none: the browser reserves the wrong box
    // and the layout shifts anyway, but now it looks deliberate. Measured against
    // the file, not against the constant.
    for (const item of GALLERY) {
      const dims = readWebpSize(toDiskPath(item.src));
      expect(dims, `could not read ${item.src}`).not.toBeNull();
      expect({ w: dims?.width, h: dims?.height }, `declared size for ${item.src} is wrong`).toEqual({
        w: item.width,
        h: item.height,
      });
    }
  });

  it('gives every tile alt text that describes it, and no two share one', () => {
    for (const item of GALLERY) {
      expect(item.alt.length, `${item.src} has no useful alt text`).toBeGreaterThan(20);
    }
    const alts = GALLERY.map((i) => i.alt);
    expect(new Set(alts).size, 'two tiles share an alt text, so one describes the wrong photo').toBe(alts.length);
  });

  it('never publishes a photograph from the excluded list', () => {
    const shipped = new Set(GALLERY.map((i) => i.src));
    for (const excluded of GALLERY_EXCLUDED) {
      expect(
        shipped.has(excluded.src),
        `${excluded.src} was added to GALLERY, but it is excluded on purpose: ${excluded.why}`,
      ).toBe(false);
    }
  });

  it('the exclusion list is real files, not a stale list of names', () => {
    // If a file were renamed or deleted, this list would silently stop protecting
    // anything — it would be asserting about paths that no longer exist.
    //
    // CORRECTION (2026-09-20, R11 pass). This case asserted the files are on disk,
    // which is TRUE only on the owner's machine. Measured: all four excluded
    // photographs are untracked AND gitignored — they exist here solely because
    // they were copied from `E:\desain\`, and a clean worktree at HEAD contains
    // none of them. So the assertion went RED at HEAD while passing locally: the
    // R11a false-red class, in the very suite that guards the R11 fix.
    //
    // A first attempt at this fix replaced disk presence with shape checks (does
    // it start with `/assets/`, does it end `.webp`, is there a reason). That
    // DISCARDED the property instead of relocating it: a mutation renaming
    // `poster-rekrutmen.webp` to `poster-rekrutmen-old.webp` still satisfied every
    // shape check, so the "stale list of names" defect the case is NAMED for went
    // undetected. The correction must keep the case able to fail for its own
    // reason — hence the cross-check below.
    //
    // The real property is: every excluded path must be a file the PROJECT KNOWS
    // ABOUT, and it must not be one that ships. Known-about means on disk OR
    // gitignored — the second holds in a clean checkout where the file is absent
    // but the rule still names it.
    for (const excluded of GALLERY_EXCLUDED) {
      expect(excluded.src.startsWith('/assets/'), `${excluded.src} is not an absolute asset path`).toBe(true);
      expect(
        excluded.src.endsWith('.webp'),
        `${excluded.src} is not a .webp — the exclusion list is not protecting a real file name`,
      ).toBe(true);
      expect(excluded.why.trim().length, `${excluded.src} is excluded with no recorded reason`).toBeGreaterThan(
        10,
      );

      const name = excluded.src.replace('/assets/', '');
      const knownByName = ignoredNames.has(name);
      const onDiskHere = existsSync(toDiskPath(excluded.src));
      expect(
        knownByName || onDiskHere,
        `${name} is listed as excluded but no longer corresponds to a known file — ` +
          `it is neither present in public/assets/ nor named in .gitignore. ` +
          `A stale exclusion protects nothing; fix the path or drop the entry.`,
      ).toBe(true);
    }

    // Not vacuous: the loop above is asserting real properties on a non-empty list.
    expect(GALLERY_EXCLUDED.length, 'the exclusion list is empty').toBeGreaterThan(0);
  });
});

/**
 * Read width and height out of a WebP header.
 *
 * WHY NOT IMPORT AN IMAGE LIBRARY: the three lossy/lossless variants of the
 * format store the dimensions differently, and adding `sharp` as a devDependency
 * to read two integers in a test is a large dependency for a small job. The
 * `public/assets` files are all VP8L (lossless) or VP8 (lossy); the two branches
 * below cover both, and return null rather than a wrong number for anything else,
 * so a mis-read fails the test instead of passing it.
 */
function readWebpSize(path: string): { width: number; height: number } | null {
  if (!existsSync(path)) return null;
  const buf = require('node:fs').readFileSync(path) as Buffer;
  if (buf.length < 30) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;

  const fourcc = buf.toString('ascii', 12, 16);
  if (fourcc === 'VP8 ') {
    // Lossy: 3-byte frame tag, then 3 sync bytes, then 14-bit dimensions.
    const start = 20 + 3 + 3;
    return { width: buf.readUInt16LE(start) & 0x3fff, height: buf.readUInt16LE(start + 2) & 0x3fff };
  }
  if (fourcc === 'VP8L') {
    // Lossless: 1 signature byte, then 14 bits width-1 and 14 bits height-1.
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (fourcc === 'VP8X') {
    // Extended: canvas size as 24-bit little-endian minus one, at offset 24.
    const w = buf.readUIntLE(24, 3) + 1;
    const h = buf.readUIntLE(27, 3) + 1;
    return { width: w, height: h };
  }
  return null;
}
