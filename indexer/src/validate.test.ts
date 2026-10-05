/**
 * validate.test.ts — guardrail for the differential-validation harness (§13).
 *
 * Runs the validator in `--sample` mode (fast; the full-inventory run is a
 * manual `node dist/indexer/src/validate.js`) and asserts the Tier-1 binder
 * and the compiler agree on every bindable occurrence in the sample:
 * same name at the same offset when bound, genuinely unresolvable otherwise.
 * Deliberate deviations (lib-not-loaded, non-bindable roles, JSX intrinsics)
 * are counted separately and must not leak into the disagreement buckets.
 */

import { describe, expect, it } from 'vitest';
import { runValidation } from './validate.js';

const ROOT = process.cwd().replace(/\\/g, '/');

describe('differential validation (sample)', () => {
  // The sample run builds the full 247-file program + index under vitest's
  // transform; the declaration-identity chains push it past the default 5 s.
  // 60 s -> 180 s (2026-10-04): MEASURED 61.9 s escalated, i.e. over the old cap
  // on its own; under full-suite parallelism it flaked. Must match the indexer
  // project's testTimeout in vitest.config.ts — an inline value wins over it.
  const TIMEOUT = 180_000;

  it('agrees with the compiler on every bindable occurrence', { timeout: TIMEOUT }, () => {
    const r = runValidation(ROOT, { sampleOnly: true });
    // Agreement buckets are non-trivial (the sample is real code)…
    expect(r.counts.agreeBound).toBeGreaterThan(1000);
    expect(r.counts.agreeUnresolved).toBe(0); // the five known dangling refs (§13 Phase 4) are gone
    // …and every disagreement bucket is empty.
    expect(r.counts.disagreeBoundNoCompiler).toBe(0);
    expect(r.counts.disagreeNameMismatch).toBe(0);
    expect(r.counts.disagreeFalsePositive).toBe(0);
    expect(r.counts.offsetMismatch).toBe(0);
    expect(r.disagreements).toHaveLength(0);
  });

  it('astro template interpolations are scope-resolved and excluded from compiler checks', { timeout: TIMEOUT }, () => {
    const r = runValidation(ROOT, { sampleOnly: true });
    // The compiler program receives frontmatter-stripped .astro sources, so
    // template positions (the BaseLayout interpolation reads of
    // lang/description/sprite/showFooter/showBottomNav) carry no compiler
    // identifier — they bind against the module scope and are excluded here.
    expect(r.counts.skippedAstroTemplate).toBeGreaterThanOrEqual(4);
    expect(r.counts.disagreeFalsePositive).toBe(0);
    expect(r.disagreements).toHaveLength(0);
  });

  it('graduates lib globals and CJS/framework intrinsics; the residual bucket is empty', { timeout: TIMEOUT }, () => {
    const r = runValidation(ROOT, { sampleOnly: true });
    // The lib tier emitted checker-confirmed lib refs for the bucket. Every
    // emitted row must bind the same name at the offset (never a guess), and
    // the framework/intrinsic rows (CJS module-wrapper exports in the sample's
    // .js functions, the Astro frontmatter global) graduate through canonical
    // entries — the residual lib-not-loaded bucket is exactly zero.
    expect(r.counts.libRefs).toBeGreaterThan(400);
    expect(r.counts.libRefAgree).toBe(r.counts.libRefs - r.counts.libRefFramework);
    expect(r.counts.libRefDisagree).toBe(0);
    expect(r.counts.libRefFramework).toBeGreaterThanOrEqual(1); // CJS wrapper vars + Astro
    expect(r.counts.libNotLoaded).toBe(0);
  });
});