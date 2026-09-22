/**
 * resolve.test.ts — Phase 2 exit criteria:
 *  - zero unresolved *relative* specifiers across the repo,
 *  - `?raw` / CSS specifiers resolve to asset nodes,
 *  - bare packages resolve to ext nodes,
 *  - every barrel and every module edge target exists.
 */

import { describe, expect, it } from 'vitest';
import { buildIndex, type BuildResult } from './build.js';
import { createResolver } from './resolve.js';
import { fileIdx } from './util.js';

const ROOT = process.cwd().replace(/\\/g, '/');

let cached: BuildResult | null = null;
function built(): BuildResult {
  return (cached ??= buildIndex(ROOT));
}

describe('specifier resolution (full repo)', () => {
  it('has zero unresolved relative specifiers (Phase 2 exit criterion)', () => {
    const bad = built().graph.unresolved.filter((u) => u.specifier.startsWith('.'));
    expect(bad).toEqual([]);
  });

  it('only unresolved imports are the remote https dynamic imports in fcm.ts', () => {
    const unresolved = built().graph.unresolved;
    expect(unresolved).toHaveLength(2);
    expect(unresolved.every((u) => u.reason === 'remote-specifier')).toBe(true);
    const from = new Set(unresolved.map((u) => built().files[u.from as unknown as number].path));
    expect([...from]).toEqual(['src/lib/fcm.ts']);
  });

  it('resolves ?raw and CSS specifiers to asset nodes', () => {
    const g = built().graph;
    const assets = g.edges.filter((e) => typeof e.to === 'string' && e.to.startsWith('asset:'));
    expect(assets.length).toBeGreaterThanOrEqual(4); // sprite.svg?raw + 3 fontsource css
    expect(assets.some((e) => e.specifier === '../icons/sprite.svg?raw')).toBe(true);
    expect(assets.some((e) => e.specifier === '@fontsource/inter/latin-400.css')).toBe(true);
  });

  it('resolves bare packages to ext nodes', () => {
    const g = built().graph;
    const exts = new Set(g.edges.filter((e) => typeof e.to === 'string' && e.to.startsWith('ext:')).map((e) => e.to));
    expect(exts.has('ext:preact')).toBe(true);
    expect(exts.has('ext:@nanostores/persistent')).toBe(true);
  });

  it('every contexts/*/index.ts barrel resolves its relative imports to files', () => {
    const r = built();
    const barrels = r.files.filter((f) => /^netlify\/functions\/contexts\/[^/]+\/index\.ts$/.test(f.path));
    // 14 -> 15 (2026-09-21): +1 — netlify/functions/contexts/contact/index.ts.
    // The contact context is the 15th, so every counter keyed on "how many
    // context barrels exist" moves: here, exportTables.test.ts's identical
    // assertion, and the const-catalog counts in build.test.ts. A new context
    // is therefore never a one-line change, and the number below is the
    // independently MEASURED one (the probe listed the 15 paths and this was
    // the count of that list), not 14 + 1.
    expect(barrels).toHaveLength(15);
    for (const b of barrels) {
      const edges = r.graph.outgoing.get(b.idx) ?? [];
      expect(edges.length).toBeGreaterThan(0);
      for (const e of edges) {
        if (e.specifier.startsWith('.')) expect(typeof e.to).toBe('number');
      }
    }
  });

  it('every file→file edge target exists in the inventory', () => {
    const r = built();
    for (const e of r.graph.edges) {
      if (typeof e.to === 'number') {
        expect(r.files[e.to as unknown as number]).toBeDefined();
      }
    }
  });
});

describe('resolver unit behavior', () => {
  it('probes extensions, including /index.<ext> and .js→.ts swapping', () => {
    const r = built();
    const resolver = createResolver({
      rootDir: ROOT,
      files: r.files.map((f) => ({ path: f.path, idx: f.idx })),
    });
    expect(resolver.resolve('src/pages/index.astro', '../components/ui/Icon').kind).toBe('file'); // Icon.tsx
    expect(resolver.resolve('src/store/i18n.ts', './i18n-jp').kind).toBe('file'); // i18n-jp.ts
    expect(resolver.resolve('src/pages/index.astro', '../layouts/BaseLayout.astro').kind).toBe('file');
  });

  it('resolves case-insensitively (NTFS)', () => {
    const r = built();
    const resolver = createResolver({ rootDir: ROOT, files: r.files.map((f) => ({ path: f.path, idx: f.idx })) });
    const t = resolver.resolve('src/pages/index.astro', '../layouts/baseLayout.astro');
    expect(t.kind).toBe('file');
  });

  it('marks remote specifiers unresolved without touching the disk', () => {
    const r = built();
    const resolver = createResolver({ rootDir: ROOT, files: r.files.map((f) => ({ path: f.path, idx: f.idx })) });
    expect(resolver.resolve('src/lib/fcm.ts', 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js')).toMatchObject({
      kind: 'unresolved',
      reason: 'remote-specifier',
    });
  });

  it('is memoized (same result, no double work)', () => {
    const r = built();
    const resolver = createResolver({ rootDir: ROOT, files: r.files.map((f) => ({ path: f.path, idx: f.idx })) });
    const a = resolver.resolve('src/pages/index.astro', '../components/ui/Icon');
    const b = resolver.resolve('src/pages/index.astro', '../components/ui/Icon');
    expect(a).toBe(b);
  });

  it('keeps packed keys valid', () => {
    expect(fileIdx(7)).toBeDefined();
    const syms = built().symbols.slice(0, 100);
    expect(syms.every((s) => typeof s.key === 'number')).toBe(true);
  });
});