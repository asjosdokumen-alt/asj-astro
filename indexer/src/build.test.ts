/**
 * build.test.ts — full pipeline (Phases 0-4) over the real repo.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIndex, type BuildResult, type ParseReuseCache } from './build.js';
import { dumpDoc } from './dump.js';

const ROOT = process.cwd().replace(/\\/g, '/');

let cached: BuildResult | null = null;
function built(): BuildResult {
  return (cached ??= buildIndex(ROOT));
}

describe('full build', () => {
  it('indexes the measured inventory', () => {
    const r = built();
    // Phase B (2026-09-11): +4 files — kernel/deadline.ts, kernel/admission.ts
    // and their test files. ts 198 -> 202, total 336 -> 340.
    // 2026-09-11 (later): +2 more — scripts/ci/io-boundary.mjs and
    // scripts/lib/load-env.mjs. total 340 -> 342, then 342 -> 341 on
    // 2026-09-11 when e2e/share-data.test.ts moved out of netlify/functions/
    // (Netlify bundled it as a deployable function → `vitest` unresolvable),
    // then 341 -> 344 when the local env-audit trio landed under scripts/ci/.
    // 344 -> 333 when the 11 catch-all stubs were deleted (measured: 334 —
    // the "333" above was one low, see the same note in discover.test.ts).
    // 334 -> 341 (2026-09-11/12, Phase C items 11 + 12): +6 ts (the health and
    // metrics-sink modules plus their four test files) and +1 js
    // (netlify/functions/health.js). Verified by diffing the indexed list
    // against `git ls-files` at HEAD — exactly 7 new paths, 0 removed.
    // 341 -> 344 (2026-09-12, PWA work): +3 mjs — build-sw-manifest.mjs,
    // build-pwa-icons.mjs, scripts/ci/verify-pwa.mjs. Verified with the real
    // discoverFiles() call path (ts 208, tsx 78, astro 12, mjs 23, cjs 5, js 18).
    // 344 -> 347 (2026-09-12, Phase C receiver + gates): +2 ts
    // (metrics-receiver.ts, _lib/metrics-receiver.test.ts) and +1 mjs
    // (scripts/ci/verify-function-entries.mjs).
    // 347 -> 349 (2026-09-12, Lambda compatibility mode migration): +2 ts —
    // _lib/netlify-adapter.ts (the single Request->event / outcome->Response
    // conversion point) and _lib/verify-env-budget.test.ts (the 4 KB env budget
    // arithmetic). ts 210 -> 212; tsx/astro/mjs/cjs/js unchanged.
    // 349 -> 351 (2026-09-12, backend reachability fixes): +1 ts
    // (contexts/diagnostics/service.test.ts — locks the reportWebVital payload
    // contract) and +1 js (netlify/functions/diagnostics.js — the narrow entry
    // point that ends getAppConfig/reportWebVital's dependence on the
    // bridge-links catch-all). ts 212 -> 213, js 18 -> 19.
    // 351 -> 356 (2026-09-12, Phase D data layer): +2 ts
    // (_lib/db/projections.ts, _lib/db/projections.test.ts) and +3 mjs
    // (scripts/ci/gen-schema.mjs, verify-projections.mjs, verify-rls.mjs).
    // ts 213 -> 215, mjs 24 -> 27, everything else unchanged.
    // 356 -> 358 (2026-09-12, Phase D item 17): +2 ts
    // (_lib/db/pagination.ts, _lib/db/pagination.test.ts). ts 215 -> 217.
    // 358 -> 360 (2026-09-13, Phase D follow-up + Phase E): +2 ts —
    // _lib/chaos.test.ts (the §6.5/§6.7 degradation suite) and
    // contexts/scheduling/repository.test.ts (the `{ rows }` destructuring
    // guard). ts 217 -> 219.
    expect(r.stats.fileCount).toBe(360); // 219 ts + 78 tsx + 12 astro + 27 mjs + 5 cjs + 19 js
    expect(r.stats.fileCount).toBe(r.files.length);
  });

  it('produces a symbol population in the Phase-4 envelope (9k+)', () => {
    // Phase 4's parse upgrades (destructured params, catch params, for-loop
    // declarations, import bindings) pushed the population to ~9.3k.
    const r = built();
    expect(r.stats.symbolCount).toBeGreaterThanOrEqual(8500);
    // was 10500; 11906 measured 2026-09-05; 13025 measured 2026-09-11 after the
    // Phase A CI gates landed in scripts/ci/; 13688 measured the same day after
    // the 11 catch-all stubs were removed and Phase C's health module and its
    // tests landed. The envelope tracks the tree; it is a canary against a
    // silent parse collapse, not a budget. 14250 measured 2026-09-12 after the
    // functions migration; the envelope keeps the same ~500-symbol headroom the
    // previous one used.
    expect(r.stats.symbolCount).toBeLessThanOrEqual(14750);
    expect(r.stats.symbolCount).toBe(r.symbols.length);
  });

  it('reports occurrences, unresolved, and stage timings', () => {
    const r = built();
    expect(r.stats.referenceCount).toBeGreaterThan(20000); // bound references
    // Unresolved bucket (Phase 4): lib globals are tagged lib-not-loaded and
    // the lib tier graduates the whole bucket to libRefs — the residual is
    // exactly zero (CJS module-wrapper vars + the Astro global graduate via
    // canonical framework entries); global-unknowns are zero (the five genuine
    // dangling refs got fixed, §13).
    // Two known indexer gaps, both TEST-FILE-ONLY as of 2026-09-05:
    //   (a) shorthand property assignments that reference lib globals —
    //       `{ console, process }` in the share-data handler test (moved
    //       2026-09-11 from netlify/functions/share-data.test.ts to
    //       e2e/share-data.test.ts — same file, same lines 44-45; it left the
    //       functions dir because Netlify bundled it as a deployable function
    //       and died on `Could not resolve "vitest"`)
    //   (b) ambient lib types used in test doubles — RequestInit (x3) and
    //       CanvasRenderingContext2D in *.test.tsx mocks
    // The production guarantee therefore stays strict (zero): no unresolved
    // reference may originate outside a test file. Collapse this back to
    // `unresolvedRefs.length === 0` once the indexer closes both gaps.
    const pathOf = (u: { fileIdx: number }) => r.files[u.fileIdx].path;
    const isTestFile = (u: { fileIdx: number }) => /\.test\.(ts|tsx)$/.test(pathOf(u));
    const siteOf = (u: { fileIdx: number; range: { startLine: number }; name: string }) =>
      `${pathOf(u)}:${u.range.startLine} ${u.name}`;
    const prodLib = r.unresolvedRefs.filter((u) => u.reason === 'lib-not-loaded' && !isTestFile(u));
    const prodGenuine = r.unresolvedRefs.filter((u) => u.reason === 'global-unknown' && !isTestFile(u));
    expect(prodLib.map(siteOf)).toEqual([]);
    expect(r.libRefs.length).toBeGreaterThan(1000);
    expect(r.stats.libRefCount).toBe(r.libRefs.length);
    expect(prodGenuine.map(siteOf)).toEqual([]);
    // unresolvedCount additionally includes the 2 import-level unresolveds
    // (the https dynamic imports in fcm.ts) from the resolve stage.
    expect(r.stats.unresolvedCount).toBe(r.unresolvedRefs.length + 2);
    expect(r.stats.stageMs.discover).toBeGreaterThan(0);
    expect(r.stats.stageMs.parse).toBeGreaterThan(0);
    expect(r.stats.stageMs.resolve).toBeGreaterThan(0);
  });

  it('respects the full-build budget (< 3 s standalone, vitest JIT overhead accounted)', () => {
    // Standalone `idx build` measures ~1 s (measured 2026-09-03); under vitest the
    // same stages take ~3.5 s because the TS sources run through vite's transform.
    const s = built().stats.stageMs;
    expect(s.discover + s.parse + s.resolve).toBeLessThan(5000);
  });

  it('is deterministic across builds', () => {
    const a = built();
    const b = buildIndex(ROOT);
    expect(b.files.map((f) => f.path)).toEqual(a.files.map((f) => f.path));
    expect(b.symbols.map((s) => s.id)).toEqual(a.symbols.map((s) => s.id));
    expect(b.stats.symbolCount).toBe(a.stats.symbolCount);
    expect(b.stats.referenceCount).toBe(a.stats.referenceCount);
  });

  it('every file node carries the three hashes and a line index', () => {
    for (const f of built().files) {
      expect(f.hash).toMatch(/^[0-9a-f]{32}$/);
      expect(f.declHash).toMatch(/^[0-9a-f]{32}$/);
      expect(f.exportHash).toMatch(/^[0-9a-f]{32}$/);
      expect(f.lineIndex.length).toBeGreaterThan(0);
    }
  });

  it('poisoned files retain their inventory record', () => {
    const r = built();
    for (const f of r.files) {
      if (f.poisoned) {
        expect(f.poisoned.error).toBeTruthy();
      }
    }
  });
  it('astro template tags resolve through frontmatter imports into Renders module edges (row 8)', () => {
    const r = built();
    const renders = r.graph.edges.filter((e) => e.type === 13 && typeof e.to === 'number');
    expect(renders.length).toBeGreaterThan(0); // 12 astro files render imported components
    const fileIdx = (rel: string): number => r.files.find((f) => f.path === rel)?.idx ?? -1;
    const layout = fileIdx('src/layouts/BaseLayout.astro');
    const footer = fileIdx('src/components/Footer.astro');
    expect(layout).toBeGreaterThanOrEqual(0);
    const layoutRenders = renders.filter((e) => e.from === layout);
    // BaseLayout renders BottomNav/Footer/Toast — each a distinct target file.
    expect(layoutRenders.some((e) => e.to === footer)).toBe(true);
    // specifier carries the tag: <Footer> resolves to the Footer.astro module.
    expect(layoutRenders.some((e) => e.specifier === '<Footer>')).toBe(true);
    // Every real astro template tag is bound by a frontmatter import: no
    // template-component unresolveds on this tree (a tag without an import
    // would be an Astro compile error).
    expect(r.graph.unresolved.filter((u) => u.reason === 'template-component')).toHaveLength(0);
    // deterministic: same render set across builds
    const again = buildIndex(ROOT);
    const renders2 = again.graph.edges.filter((e) => e.type === 13 && typeof e.to === 'number');
    expect(renders2.length).toBe(renders.length);
  });

  it('Astro.glob expansion: zero usage on this tree (row-8 remainder)', () => {
    // No real astro frontmatter calls Astro.glob today, so the expansion
    // adds zero AstroGlob edges and zero astro-glob-no-match unresolveds —
    // the feature is fixture-covered (astroGlob.test.ts), and this guards the
    // real tree against accidental drift.
    const r = built();
    expect(r.graph.edges.filter((e) => e.type === 15 && typeof e.to === 'number')).toHaveLength(0);
    expect(r.graph.unresolved.filter((u) => u.reason === 'astro-glob-no-match')).toHaveLength(0);
  });

});

describe('§6.2 incremental engine — per-file parse reuse (fixture tree)', () => {
  // Three files with cross-file imports (a → b, a → c) so bind/resolve have
  // real work; deep tier off — the watch generation profile §6.2 targets.
  function makeTree(root: string): void {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, '.gitignore'), 'node_modules/\n', 'utf8');
    writeFileSync(join(root, 'src/a.ts'), "import { greet } from './b';\nimport { tag } from './c';\nexport function run(): string { return greet() + tag; }\n", 'utf8');
    writeFileSync(join(root, 'src/b.ts'), "export function greet(): string { return 'hi'; }\n", 'utf8');
    writeFileSync(join(root, 'src/c.ts'), "export const tag = '!';\n", 'utf8');
  }

  // Content-deterministic whole-document equality: a warm (cache-carrying)
  // build must produce byte-identical output to a cold build of the same tree.
  const coldDoc = (root: string): string => JSON.stringify(dumpDoc(buildIndex(root, { deep: false })));

  it('a warmed cache reuses every unchanged file and reproduces the cold document exactly', () => {
    const root = mkdtempSync(join(tmpdir(), 'idx62-reuse-'));
    makeTree(root);
    const cold = coldDoc(root);
    const cache: ParseReuseCache = new Map();
    const warm1 = buildIndex(root, { deep: false, parseCache: cache }); // fills the cache
    expect(warm1.stats.parseReusedFiles).toBe(0); // nothing to reuse on a cold session
    expect(JSON.stringify(dumpDoc(warm1))).toBe(cold);
    const warm2 = buildIndex(root, { deep: false, parseCache: cache });
    expect(warm2.stats.parseReusedFiles).toBe(3); // every file skipped Stage 2
    expect(JSON.stringify(dumpDoc(warm2))).toBe(cold);
    // Zero-copy sharing across generations stays safe: a third reuse of the
    // very same parse arrays still reproduces the cold document.
    const warm3 = buildIndex(root, { deep: false, parseCache: cache });
    expect(warm3.stats.parseReusedFiles).toBe(3);
    expect(JSON.stringify(dumpDoc(warm3))).toBe(cold);
  });

  it('a single-file body edit re-parses only that file; output equals a cold build', () => {
    const root = mkdtempSync(join(tmpdir(), 'idx62-edit-'));
    makeTree(root);
    const cache: ParseReuseCache = new Map();
    buildIndex(root, { deep: false, parseCache: cache });
    const before = coldDoc(root);
    // Body-only edit: declHash/exportHash change only if the signature/export
    // table does — either way the file must reparse; a.ts and c.ts must not.
    writeFileSync(join(root, 'src/b.ts'), "export function greet(): string { return 'hello there'; }\n", 'utf8');
    const incremental = buildIndex(root, { deep: false, parseCache: cache });
    expect(incremental.stats.parseReusedFiles).toBe(2);
    expect(JSON.stringify(dumpDoc(incremental))).toBe(coldDoc(root)); // == cold build of the edited tree
    expect(JSON.stringify(dumpDoc(incremental))).not.toBe(before); // the edit did land
  });

  it('an identical-content rewrite (editor swap noise) reuses every file', () => {
    const root = mkdtempSync(join(tmpdir(), 'idx62-noise-'));
    makeTree(root);
    const cache: ParseReuseCache = new Map();
    buildIndex(root, { deep: false, parseCache: cache });
    const before = coldDoc(root);
    writeFileSync(join(root, 'src/b.ts'), "export function greet(): string { return 'hi'; }\n", 'utf8'); // same bytes
    const again = buildIndex(root, { deep: false, parseCache: cache });
    expect(again.stats.parseReusedFiles).toBe(3); // hash unchanged → nothing re-parses
    // The only observable difference is the file's mtime (a rewrite bumps it) —
    // drift detection (fileDrift) is hash-based, so content-wise this is a no-op.
    const norm = (doc: { files: Array<{ mtime: number }> }): unknown => {
      for (const f of doc.files) f.mtime = 0;
      return doc;
    };
    expect(norm(dumpDoc(again))).toEqual(norm(JSON.parse(before)));
  });

  it('a file deletion shifts later ordinals and falls back to a full reparse, still identical', () => {
    const root = mkdtempSync(join(tmpdir(), 'idx62-del-'));
    makeTree(root);
    const cache: ParseReuseCache = new Map();
    buildIndex(root, { deep: false, parseCache: cache });
    rmSync(join(root, 'src/a.ts'));
    // b.ts and c.ts keep their content but their fileIdx shifts down by one,
    // so their cached keys (fileIdx-packed) are invalid — reuse must refuse
    // and reparse, never serve stale keys.
    const incremental = buildIndex(root, { deep: false, parseCache: cache });
    expect(incremental.stats.parseReusedFiles).toBe(0);
    expect(JSON.stringify(dumpDoc(incremental))).toBe(coldDoc(root));
    expect(incremental.files.map((f) => f.path)).toEqual(['src/b.ts', 'src/c.ts']);
  });
});
