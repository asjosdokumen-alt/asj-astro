/**
 * PrincessMascot.test.ts — the mascot wrapper's contract.
 *
 * WHAT THIS FILE IS DEFENDING
 * ---------------------------
 * This component sits at the join of two systems that drift silently, plus one
 * gate that fails in a way that names the wrong cause. Each failure mode is
 * asserted below, and every case was OBSERVED RED by mutating the component or
 * the asset table before this file was committed (R5). Mutations are recorded
 * at the bottom.
 *
 *  1. **A pose whose asset is missing.** The `<img>` points at a basename in
 *     `public/mascot/`. Renaming the artwork without the table (or vice versa)
 *     produces a 404 that renders as an empty box — the landing page has
 *     already shipped one broken-image defect, which is why the runtime guard
 *     exists. This is the highest-value assertion here: it checks the FILE
 *     SYSTEM against the TABLE, which no type can do.
 *
 *  2. **`w`/`h` disagreeing with the real image.** These numbers reserve layout
 *     space. If they are wrong the box is the wrong shape and the page shifts
 *     when the image lands. The renders are PORTRAIT and each pose has a
 *     different height, so a copy-paste of one entry into another is a realistic
 *     mistake that a type check cannot catch.
 *
 *  3. **The two pose registries drifting.** `Mascot.tsx` (Preact) and this
 *     component both declare princess poses. If someone edits one only, the
 *     same pose name resolves to different artwork depending on which component
 *     a caller happens to use.
 *
 *  4. **Generic syntax reappearing.** This is the one that costs the most time,
 *     because the failure names the wrong thing: `astro build` is fine, but
 *     `indexer/src/build.test.ts` goes red with "unresolved template-component"
 *     refs. The indexer parses angle brackets in `.astro` as component tags,
 *     INCLUDING inside comments. It was already hit twice while writing this
 *     file — once by a generic annotation in the frontmatter, once by a comment
 *     explaining it.
 *
 *  5. **The one-line union regression.** A multi-line type union with a leading
 *     `|` on each continuation breaks `astro build` outright with
 *     `Unexpected "|"` at a line number that maps to nothing in the source.
 *     Asserted so the "tidy up the formatting" edit is caught by a test rather
 *     than by a build.
 *
 * WHY SOURCE ASSERTIONS AND NOT A RENDER
 * --------------------------------------
 * This repo has NO `.astro` render harness (measured: no test in `src/` imports
 * a `.astro` file; vitest has no Astro plugin and fails with "content contains
 * invalid JS syntax"). The established convention is to read the source and
 * assert invariants — same choice, and the same reason, as
 * `src/components/public/JapanTexture.test.ts` and `src/components/ui/button.test.ts`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const COMPONENT = join(ROOT, 'src/components/public/PrincessMascot.astro');
const MASCOT_TSX = join(ROOT, 'src/components/ui/Mascot.tsx');
const MASCOT_DIR = join(ROOT, 'public/mascot');

/* ⚠ NORMALISE LINE ENDINGS FIRST. `.astro` checks out as CRLF on Windows in this
 * repo, so any assertion that slices on a multi-line needle silently finds
 * nothing (or matches the wrong region) without this. `JapanTexture.test.ts`
 * documents the same hazard. */
const source = readFileSync(COMPONENT, 'utf8').replace(/\r\n/g, '\n');
const tsxSource = readFileSync(MASCOT_TSX, 'utf8').replace(/\r\n/g, '\n');

/** Every `file: '...'` basename the component names. */
const namedFiles = [...source.matchAll(/file:\s*'([^']+)'/g)].map((m) => m[1]);

/** The pose keys of the exported table. */
const poseKeys = [...source.matchAll(/'(princess-[a-z]+)':\s*\{/g)].map((m) => m[1]);

describe('PrincessMascot — asset contract', () => {
  it('declares at least the five shipped poses', () => {
    // A floor, not an exact count: adding a pose is a legitimate future edit,
    // and an exact count would make this test the thing that has to change for
    // every new render. The real defence is the file-existence check below.
    expect(poseKeys.length).toBeGreaterThanOrEqual(5);
    expect(poseKeys).toContain('princess-wave');
    expect(poseKeys).toContain('princess-head');
  });

  it('every named basename exists as WebP + AVIF, at 1x and @2x', () => {
    expect(namedFiles.length).toBeGreaterThanOrEqual(5);

    const missing: string[] = [];
    for (const file of namedFiles) {
      for (const name of [
        `${file}.webp`,
        `${file}.avif`,
        `${file}@2x.webp`,
        `${file}@2x.avif`,
      ]) {
        if (!existsSync(join(MASCOT_DIR, name))) missing.push(name);
      }
    }

    expect(missing).toEqual([]);
  });

  it('declared w/h are positive and portrait, and each pose is its own entry', () => {
    const dims = [...source.matchAll(/w:\s*(\d+),\s*\n?\s*h:\s*(\d+)/g)].map((m) => ({
      w: Number(m[1]),
      h: Number(m[2]),
    }));

    expect(dims.length).toBeGreaterThanOrEqual(5);
    for (const d of dims) {
      expect(d.w).toBeGreaterThan(0);
      expect(d.h).toBeGreaterThan(0);
      // The renders are full-body portraits of a standing figure. A square or
      // landscape box means someone copied an Aa-chan entry, whose renders ARE
      // square — that would squash her.
      expect(d.h).toBeGreaterThan(d.w);
    }
  });
});

describe('PrincessMascot — source invariants', () => {
  it('contains NO generic/angle-bracket syntax, INCLUDING in comments', () => {
    /* The indexer parses `.astro` angle brackets as component tags and this
     * component must contribute ZERO unresolved refs.
     *
     * ⚠ THE FIRST VERSION OF THIS ASSERTION WAS WRONG AND SURVIVED ITS OWN
     * MUTATION. It matched `<` followed by a capital letter or `[`, which covers
     * a tag-like token (`<Foo>`) but NOT a generic whose argument is lowercase —
     * `Record<string, number>` has `<s`. The mutation battery reported M2
     * SURVIVED, and a direct check confirmed `type Fake = Record<string, number>`
     * left the suite at 10/10 green. The pattern was too narrow for the exact
     * defect it was written for.
     *
     * The shape that actually catches it: an identifier immediately followed by
     * `<`, i.e. `Name<`. That is invalid in `.astro` template markup and is how
     * every generic is written, whatever the argument's case. `<=` and `<<` are
     * excluded, and a leading `[` is kept for mapped/index types. */
    const offenders = source
      .split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /[A-Za-z_$][A-Za-z0-9_$]*\s*<(?!<|=)|<[[]/.test(line))
      .map(({ line, n }) => `${n}: ${line.trim()}`);

    expect(offenders).toEqual([]);
  });

  it('keeps the pose union on ONE line', () => {
    // A leading `|` continuation does not survive Astro's frontmatter pass and
    // breaks the build with `Unexpected "|"`. See the header note.
    expect(source).not.toMatch(/export type PrincessPose\s*=\s*\n/);
    expect(source).toContain('export type PrincessPose =');
  });

  it('computes aria-hidden in the frontmatter, not inline as a bare literal', () => {
    /* A ternary whose false branch is the `undefined` literal, written inside a
     * template expression, is reported by the indexer as an unresolved ref
     * named `undefined`. Measured: it produced exactly that entry and turned
     * build.test.ts red. The value must come from a frontmatter binding. */
    expect(source).toContain('const ariaHidden =');
    expect(source).toContain('aria-hidden={ariaHidden}');
    expect(source).not.toContain("'true' : undefined}");
  });

  it('emits a picture with BOTH modern formats and reserves the box', () => {
    expect(source).toContain('type="image/avif"');
    expect(source).toContain('type="image/webp"');
    expect(source).toContain('width={w}');
    expect(source).toContain('height={h}');
    // Lazy: she is far below the fold and must not compete with the hero.
    expect(source).toContain('loading="lazy"');
  });

  it('defaults to decorative, so she never announces herself as content', () => {
    // The opposite default from Mascot.tsx, deliberately: this component is only
    // ever decoration. If someone flips the default, this fails.
    expect(source).toMatch(/decorative\s*=\s*true/);
  });
});

describe('the two princess pose registries agree', () => {
  it('every pose this component ships is also known to Mascot.tsx', () => {
    // WHY THIS CROSS-CHECK EXISTS. `Mascot.tsx` (Preact, used by /login, /404,
    // the candidate dashboard) and this `.astro` wrapper both carry princess
    // entries. If they disagree, the SAME pose name renders different artwork
    // depending on which component a caller uses — a bug with no natural
    // red test, because each component works fine in isolation.
    const missingFromTsx = poseKeys.filter((k) => !tsxSource.includes(`'${k}'`));
    expect(missingFromTsx).toEqual([]);
  });

  it('Mascot.tsx does not claim a princess file this component does not ship', () => {
    const tsxPrincessFiles = [...tsxSource.matchAll(/file:\s*'(princess-[^']+)'/g)].map(
      (m) => m[1],
    );
    const notShipped = tsxPrincessFiles.filter((f) => !namedFiles.includes(f));
    expect(notShipped).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   MUTATION RECORD (R5) — every case above was OBSERVED RED before this file
   was committed. Battery: `.downloads/render/mutate-mascot-gate.mjs`.

     CONTROL      unmutated file                      OK-GREEN
     M1           basename renamed to a non-existent  KILLED  (file-exists case)
     M2           generic syntax, lowercase argument  KILLED  (generic case)
     M3           square w/h copied from Aa-chan      KILLED  (portrait case)
     M4           aria-hidden inline as bare literal  KILLED  (frontmatter case)
     M5           decorative default flipped to false KILLED  (default case)
     M6           pose union broken across lines      KILLED  (one-line case)
     RESTORE      file put back                       GREEN

   ⚠ M2 IS THE ONE WORTH READING, because the FIRST version of that assertion
   SURVIVED it. The pattern was `<` followed by a capital letter or `[`, which
   catches a tag-like token but not `Record<string, number>` — the `<` there is
   followed by a lowercase `s`. A direct check confirmed the mutation left the
   suite at 10/10 GREEN: the assertion could not see the exact defect it was
   written for. The pattern now requires an identifier immediately followed by
   `<` (`Name<`), which is how every generic is spelled regardless of the
   argument's case. That is the fix that killed M2.

   ⚠ M2 ALSO EXPOSED A BATTERY BUG. Its first version anchored on a bare
   `interface PoseMeta {` that did not match the file, so the mutation was a
   silent no-op and the battery printed SURVIVED — indistinguishable from a real
   survivor. The battery now prints COULD-NOT-APPLY for a mutation whose replace
   changed nothing, so a broken mutation can never be read as a passing test.
   ══════════════════════════════════════════════════════════════════════════ */
