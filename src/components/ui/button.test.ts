/**
 * button.test.ts — holds the Button recipe to what DESIGN.md §5.1 actually says.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `src/components/ui/Button.astro` is a single recipe that many call sites will
 * depend on, and every property that makes it worth having is INVISIBLE at the
 * call site. A caller writing `<Button variant="primary">` cannot see, and would
 * not notice, whether the solid fill is still AA-passing against white, whether
 * the 44px touch minimum survived, or whether a hover tier still darkens. Those
 * are exactly the defects that were already in the tree before this component
 * existed (see the header comment in Button.astro: three radii, a hover that
 * LIGHTENS, shadows that do nothing on a dark canvas).
 *
 * WHY SOURCE ASSERTIONS AND NOT A RENDER
 * --------------------------------------
 * This repo has no `.astro` render harness, and adding one is a large new
 * dependency on the critical path of the landing page. The established
 * convention here is to read the component's own source and assert the
 * invariants (see `src/lib/gallery.test.ts`). That is a real test, not a
 * formality: every case below was OBSERVED RED by mutating Button.astro before
 * this file was committed. A check never seen fail is a hypothesis.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It does not assert exact full class strings. That would make every copy tweak
 * a test failure, and the test would be re-frozen from whatever the file happens
 * to say — the failure mode `asj-session-rules` R1a names. It asserts the
 * PROPERTIES that carry meaning: which token tier, which radius, which
 * direction the hover moves.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRaw = readFileSync(join(process.cwd(), 'src/components/ui/Button.astro'), 'utf8');

/**
 * Normalise line endings before ANY assertion touches `source`.
 *
 * WHY THIS IS NOT COSMETIC — and why it was already costing a red test.
 * `.gitattributes` pins `*.astro` to no explicit eol, so this file checks out as
 * CRLF on Windows. A `source.indexOf('\\n---\\n')` slice therefore finds NOTHING
 * (`indexOf` returns -1), and `slice(-1 + 5)` silently returns the WHOLE FILE
 * instead of the template. The "template evaluates nothing" case then scanned the
 * frontmatter too, found the legitimate `target === undefined ?` comparisons, and
 * failed — a red test whose stated claim was true. Same class as the battery's
 * `lf()` fix: a difference that is not about the code.
 *
 * Assertions that need the exact bytes are unaffected; those that locate regions
 * are the ones that were broken.
 */
const source = sourceRaw.replace(/\r\n/g, '\n');

/** The `VARIANT_CLASS` map, so assertions talk about the map rather than the file. */
const variantBlock = (() => {
  const start = source.indexOf('const VARIANT_CLASS');
  expect(start, 'VARIANT_CLASS map not found in Button.astro').toBeGreaterThan(-1);
  // Slice from the map to the next `} as const;` AFTER it. Searching from index
  // 0 would find an earlier closing brace and silently truncate the map, which
  // is what made every variant lookup miss on the first run.
  const end = source.indexOf('} as const;', start);
  expect(end, 'VARIANT_CLASS closing brace not found').toBeGreaterThan(start);
  return source.slice(start, end);
})();

const variantLine = (variant: string) => {
  // Keys are unquoted object shorthand (`primary:`) except where the name is not
  // a valid identifier (`'on-artwork':`), so accept both forms.
  const match = variantBlock.match(new RegExp(`'?${variant}'?:\\s*'([^']*)'`));
  expect(match, `variant "${variant}" not found in VARIANT_CLASS`).not.toBeNull();
  return (match as RegExpMatchArray)[1];
};

/** Classes the component must never emit, because the shape has a token. */
const radiusTokens = ['rounded-control', 'rounded-card', 'rounded-panel', 'rounded-band', 'rounded-pill'];

/**
 * `rounded-control` is part of the shared shell, not of any one variant, so the
 * assertion has to look at the whole file rather than at `primary`'s line. The
 * important direction is the negative one below: a variant must not smuggle in
 * a radius of its own and quietly stop being a control-shaped thing.
 */
const shellBlock = (() => {
  const start = source.indexOf('const BASE');
  const end = source.indexOf('const SIZE_CLASS', start);
  expect(start, 'BASE shell not found in Button.astro').toBeGreaterThan(-1);
  return source.slice(start, end);
})();

/** The file minus its comment lines, so prose about a value is not read as the value. */
const codeOnly = source
  .split('\n')
  .filter((line) => !/^\s*(\*|\/\*|\/\/)/.test(line))
  .join('\n');

/** Every variant key declared in the map, discovered rather than hardcoded. */
const VARIANT_KEYS = [...variantBlock.matchAll(/^\s*'?([\w-]+)'?:\s*'/gm)].map((m) => m[1]);

const radiusClasses = (css: string) =>
  (css.match(/rounded-[a-z]+/g) ?? []).filter((c) => radiusTokens.includes(c));

const hasArbitraryRadius = (css: string) => /rounded-\[/.test(css);
const hasLiteralColour = (css: string) => /#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/.test(css);

describe('Button — the control-shaped things hold', () => {
  it('all five variants from DESIGN.md §5.1 exist', () => {
    for (const variant of ['primary', 'secondary', 'ghost', 'on-artwork', 'danger']) {
      expect(variantLine(variant), `missing variant: ${variant}`).toBeTruthy();
    }
  });

  it('uses rounded-control, the radius DESIGN.md §3.4 assigns to buttons', () => {
    expect(radiusClasses(shellBlock)).toContain('rounded-control');
  });

  it('no variant overrides the radius', () => {
    for (const variant of ['primary', 'secondary', 'ghost', 'on-artwork', 'danger']) {
      expect(radiusClasses(variantLine(variant)), `${variant} overrides the radius`).toEqual([]);
    }
  });

  it('never invents a radius literal', () => {
    // The 39 arbitrary radii in T-04 are the reason the radius scale exists. A
    // new component is the most likely place for a fortieth to appear.
    expect(hasArbitraryRadius(source), 'arbitrary radius literal carried into Button').toBe(false);
  });

  it('never writes a raw colour value', () => {
    // Code only: the header comment quotes `#f9a8d4` to explain why `bg-accent`
    // is not a valid solid surface. Reading prose as code would fail this on a
    // correct component — the same class of mistake as a class that is "used"
    // only because it appears in a comment (DESIGN.md §8.2.2).
    expect(hasLiteralColour(codeOnly), 'literal colour in Button — use a token').toBe(false);
  });

  it('meets the 44px touch minimum, and offers a 48px size for mobile forms', () => {
    // DESIGN.md §6.4: 44px general, 48px inside a mobile form. Both must be a
    // min-height rather than padding alone, so a future padding trim cannot
    // silently drop the target below the floor.
    expect(source).toContain('min-h-[44px]');
    expect(source).toContain('min-h-[48px]');
  });

  it('keeps the label visible while loading (§5.1)', () => {
    // A spinner that replaces the label tells a screen reader nothing changed.
    // The slot is emitted unconditionally in both branches, and `loading` swaps
    // only the leading glyph.
    expect((source.match(/<slot \/>/g) ?? []).length).toBe(2);
    expect(source).toMatch(/const iconName = loading \? loadingIcon/);
  });
});

describe('Button — solid fills stay readable', () => {
  /**
   * DESIGN.md §3.2b: white on pink-600 measures 4.60:1 and passes AA. The
   * global shim in `global.css:916-1010` deliberately does NOT remap pink, so
   * primary must not depend on it.
   */
  it('primary is the pink-600 tier, which passes white-on-solid without a shim', () => {
    expect(variantLine('primary')).toContain('bg-pink-600');
    expect(variantLine('primary')).toContain('text-white');
  });

  /**
   * DESIGN.md §3.2 is explicit that `--color-accent` (#f9a8d4) is the LIGHT
   * accent for text and icons on dark, NOT a solid surface. White on it is
   * about 1.6:1. This is the trap the variant table names.
   *
   * Checked across EVERY solid variant rather than just `primary`. The first
   * version of this test only inspected `primary`, and the mutation battery
   * caught the hole: a decoy variant carrying `bg-accent` was added and the
   * assertion stayed green. A rule about "solid surfaces" has to cover all of
   * them or it only documents the one someone happened to look at.
   */
  it('no variant paints a bg-accent surface', () => {
    // Checked over EVERY variant, not only the ones classified as solid.
    //
    // The mutation battery found this the hard way: the first version filtered
    // to "variants with a `bg-<family>-<tier>` fill" and then looked for
    // `bg-accent` among them — but `bg-accent` has NO tier, so a variant
    // carrying it is never classified as solid and never inspected. The guard
    // excluded exactly the case it was written to catch. Classifying first and
    // then policing is the wrong order; police all of them.
    const accentSurfaces = VARIANT_KEYS.filter((v) => /bg-accent(?!-)/.test(variantLine(v)));
    expect(accentSurfaces, `bg-accent used as a solid fill by: ${accentSurfaces.join(', ')}`).toEqual(
      [],
    );
  });

  it('danger uses a family whose -600 tier carries white at AA', () => {
    expect(variantLine('danger')).toContain('bg-red-600');
    expect(variantLine('danger')).toContain('text-white');
    expect(variantLine('danger')).not.toContain('bg-accent-red');
  });
});

describe('Button — hover moves the right way', () => {
  /**
   * The measured pre-existing defect this component exists to end: the sky CTA
   * in LayananSection.astro went `bg-sky-600` -> `hover:bg-sky-500`, i.e. it got
   * LIGHTER, which every other button's hover contradicts. A solid button must
   * darken on hover, which means a numerically HIGHER tier (-600 -> -700).
   */
  it.each(['primary', 'danger'])('%s darkens on hover (-600 -> -700)', (variant) => {
    const line = variantLine(variant);
    const base = line.match(/bg-(\w+)-(\d+)/);
    const hover = line.match(/hover:bg-\w+-(\d+)/);
    expect(base, `no solid background on ${variant}`).not.toBeNull();
    expect(hover, `no hover tier on ${variant}`).not.toBeNull();
    expect(Number((hover as RegExpMatchArray)[1])).toBeGreaterThan(Number((base as RegExpMatchArray)[2]));
  });
});

describe('Button — element and state contract', () => {
  it('renders an anchor when given an href, and a button when not', () => {
    expect(source).toMatch(/href \? \(\s*<a/);
    expect(source).toContain('<button');
  });

  it('always sets an explicit button type', () => {
    // `useButtonType` is a live lint rule in this repo (195 occurrences in the
    // baseline). A component that omits it would add a diagnostic.
    expect(source).toMatch(/type=\{type\}/);
    expect(source).toContain("type = 'button'");
  });

  it('computes every attribute in frontmatter, so the template names no lib global', () => {
    // MEASURED 2026-09-20: evaluating an absent-value keyword or calling a lib
    // global inside an `.astro` TEMPLATE expression leaves unresolved refs in the
    // indexer's deep tier, and `deep-tier.test.ts` fails on them. No other
    // component in the tree does it. So the template may only interpolate
    // frontmatter constants — this is the guard that keeps that property.
    //
    // The slice is ASSERTED, not assumed. It previously used
    // `indexOf('\n---\n')`, which returns -1 on a CRLF checkout; `slice(-1 + 5)`
    // then returned the whole file and this case silently inspected the
    // frontmatter — reporting a failure whose stated claim was true, and (worse)
    // would have PASSED a template that did evaluate a global, since frontmatter
    // legitimately contains none of the tokens.
    const fence = source.indexOf('\n---\n', source.indexOf('const aOnClick'));
    expect(fence, 'could not locate the frontmatter/template fence — the slice below is blind').toBeGreaterThan(
      -1,
    );
    const template = source.slice(fence + 5);
    expect(template, 'the template slice is empty — this case would pass vacuously').not.toBe('');
    const offenders = ['undefined', 'String(', 'Number(', 'Boolean('].filter((token) =>
      template.includes(token),
    );
    expect(offenders, `template evaluates: ${offenders.join(', ')}`).toEqual([]);
  });

  it('carries external-link safety only when it opens a new tab', () => {
    expect(source).toMatch(/const aRel = target === '_blank' \? 'noopener noreferrer' : ''/);
    // `rel` is applied to the anchor, never to the button element.
    const buttonBranch = source.slice(source.indexOf('<button'));
    expect(buttonBranch).not.toContain('rel=');
  });

  it('applies the dispatched-event handler on both elements', () => {
    // Static Astro markup reaches the App island by dispatching a CustomEvent,
    // so the handler has to survive on the anchor form too — not only on the
    // button form.
    expect((source.match(/onclick=\{aOnClick\}/g) ?? []).length).toBe(2);
  });

  it('expresses disabled as opacity + inert pointer, not a colour swap', () => {
    expect(source).toContain('opacity-50');
    expect(source).toContain('pointer-events-none');
  });

  it('moves only transform/opacity for the pressed state', () => {
    // DESIGN.md §3.7: width/height/top/left are banned. A 1px translate is a
    // transform and costs no layout.
    expect(source).toContain('active:translate-y-px');
    expect(source).not.toMatch(/active:(?:w-|h-|top-|left-)/);
  });

  it('lets reduced-motion users opt out of the transition', () => {
    expect(source).toContain('motion-reduce:transition-none');
  });
});
