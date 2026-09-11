/**
 * query.test.ts — Phase 5 query API: resolve-at-position, refs-of-symbol,
 * search, and stats over a dump document, plus HTTP smoke tests against the
 * real repo index. All coordinates are 0-based (schema Range convention).
 */

import { get as httpGet, request as httpRequest } from 'node:http';
import { describe, expect, it } from 'vitest';
import { buildIndex, type BuildResult } from './build.js';
import { dumpDoc, type DumpDoc } from './dump.js';
import { cyclesOf, depsOf, depsOrphansOf, depsPathOf, fileSymbols, fileUnresolvedOf, importSitesOf, importTargetsOf, indexFromDoc, isImportBindingSymbol, refsOf, resolveAt, resolveLine, search, searchPage, statsOf, symbolCardOf, symbolsByExactName, symbolsDefining, type QueryIndex } from './query.js';
import { EdgeType, SymbolKind } from '../../docs/code-index-schema.js';
import { bind, createIndexServer } from './serve.js';

const ROOT = process.cwd(); // buildIndex normalizes backslashes

let cached: { doc: DumpDoc; index: QueryIndex } | null = null;
function qindex(): QueryIndex {
  return (cached ??= buildQuery())!.index;
}
function buildQuery(): { doc: DumpDoc; index: QueryIndex } {
  const r = buildIndex(ROOT);
  const doc = dumpDoc(r);
  return { doc, index: indexFromDoc(doc) };
}

const FINDBYWA = 'sym:netlify/functions/contexts/master-data/repository.ts#findMasterByWa';
/** Syntactic sugar for the tiny synthetic docs below: decl() builds a 0-based
 * DeclRange, f() a file row, mkDoc() an index from symbols/refs with the
 * boilerplate collections (unresolved, symbolEdges, importEdges,
 * exportSurfaces) defaulted empty - each test overrides only what it needs. */
const decl = (line: number, startChar: number, name: string): Record<string, number> => ({
  startLine: line,
  startChar,
  endLine: line,
  endChar: startChar + name.length,
  start: line * 200 + startChar,
  end: line * 200 + startChar + name.length,
});
const f = (idx: number, path: string): Record<string, unknown> => ({ idx, path, hash: 'h' + idx, lang: 'ts' });
function mkDoc(symbols: Array<Record<string, unknown>>, refs: Array<Record<string, unknown>> = [], extra: Record<string, unknown> = {}): QueryIndex {
  const files = (extra.files as unknown[] | undefined) ?? [f(0, 'a.ts')];
  const doc = {
    epoch: 1,
    rootDir: '/r',
    stats: { fileCount: files.length, symbolCount: symbols.length, referenceCount: refs.length, unresolvedCount: 0, memoryBytes: 0 },
    files,
    symbols,
    refs,
    unresolved: [],
    unresolvedImports: [],
    symbolEdges: [],
    importEdges: [],
    exportSurfaces: [],
    ...extra,
  } as unknown as DumpDoc;
  return indexFromDoc(doc);
}

describe('query layer over the real index', () => {
  it('stats match the build', () => {
    const index = qindex();
    const s = statsOf(index, 'test');
    expect(s.fileCount).toBe(index.doc.files.length);
    expect(s.symbolCount).toBe(index.doc.symbols.length);
    expect(s.referenceCount).toBe(index.doc.refs.length);
    expect(s.unresolvedCount).toBe(index.doc.unresolved.length + index.doc.unresolvedImports.length);
    expect(s.exportSurfaceCount).toBe(index.doc.exportSurfaces.length);
    expect(s.edgeCount).toBe(index.doc.symbolEdges.length);
    expect(s.importEdgeCount).toBe((index.doc.importEdges ?? []).length);
    expect(s.memoryBytes).toBeGreaterThan(0);
  });

  it('resolves a declaration site to its own symbol', () => {
    const index = qindex();
    const sym = index.symbolById.get(FINDBYWA)!;
    expect(sym).toBeDefined();
    const d = sym.decls[0];
    const view = resolveAt(index, sym.fileIdx >= 0 ? index.fileByIdx.get(sym.fileIdx)!.path : '', d.startLine, d.startChar);
    expect(view.fileFound).toBe(true);
    expect(view.resolved?.symId).toBe(FINDBYWA);
    expect(view.resolved?.resolvedVia).toBe('declaration');
    expect(view.resolved?.decls.length).toBeGreaterThan(0);
  });

  it('resolves a reference site back to the referenced symbol', () => {
    const index = qindex();
    const refs = refsOf(index, FINDBYWA);
    expect(refs.found).toBe(true);
    expect(refs.references.length).toBeGreaterThan(0);
    const hit = refs.references[0];
    const view = resolveAt(index, hit.file, hit.line, hit.char);
    expect(view.resolved?.symId).toBe(FINDBYWA);
    // The view describes the resolved symbol: its own home file (the ref above
    // lives in a different file, so this exercises the cross-file case).
    const home = index.fileByIdx.get(index.symbolById.get(FINDBYWA)!.fileIdx)!.path;
    expect(view.resolved?.file).toBe(home);
    expect(view.resolved?.decls.every((d) => d.uri === home)).toBe(true);
  });

  it('returns null for empty positions and unknown files', () => {
    const index = qindex();
    const nowhere = resolveAt(index, 'src/lib/supabase.ts', 0, 0);
    expect(nowhere.fileFound).toBe(true);
    expect(nowhere.resolved).toBeNull();
    const ghost = resolveAt(index, 'src/does-not-exist.ts', 0, 0);
    expect(ghost.fileFound).toBe(false);
    expect(ghost.resolved).toBeNull();
  });

  it('refsOf reports cross-file references', () => {
    const index = qindex();
    const view = refsOf(index, FINDBYWA);
    const files = new Set(view.references.map((r) => r.file));
    expect(files.size).toBeGreaterThan(1); // barrel re-exports + callers
    expect(view.references.every((r) => r.range.start <= r.range.end)).toBe(true);
    // row-9 read surface: the target's kind + short signature ride the view
    const row = index.symbolById.get(FINDBYWA)!;
    expect(view.kind).toBe(row.kind);
    expect(view.detail).toBe(row.detail);
    expect(row.detail).toBeTruthy(); // a real declaration signature on this tree
  });

  it('refsOf returns not-found for unknown symIds', () => {
    expect(refsOf(qindex(), 'sym:nope#nope').found).toBe(false);
  });

  it('search matches case-insensitively and ranks exact names first', () => {
    const index = qindex();
    const hits = search(index, 'findmasterbywa');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].match).toBe('name'); // exact-name matches outrank substring hits
    expect(hits.map((h) => h.symId)).toContain(FINDBYWA);
    const hit = hits.find((h) => h.symId === FINDBYWA)!;
    expect(hit.detail).toBe(index.symbolById.get(FINDBYWA)!.detail); // hover signature rides the hit
    const capped = search(index, 'toast', 5);
    expect(capped.length).toBeLessThanOrEqual(5);
    expect(search(index, 'zzzz-no-such-symbol-zzzz')).toHaveLength(0);
  });

  it('searchPage reports the pre-limit total, not the capped length', () => {
    const index = qindex();
    const few = searchPage(index, 'findmasterbywa', 2);
    expect(few.results).toHaveLength(2);
    expect(few.truncated).toBe(true);
    expect(few.total).toBeGreaterThanOrEqual(3);
    const all = searchPage(index, 'findmasterbywa');
    expect(all.total).toBe(all.results.length);
    expect(all.truncated).toBe(false);
    expect(all.total).toBe(few.total);
  });

  it('resolve offers same-named alternatives ranked by reference count', () => {
    const index = qindex();
    const sym = index.doc.symbols.find((s) => s.name === 'Job')!; // src types Job vs db Job
    const view = resolveAt(index, index.fileByIdx.get(sym.fileIdx)!.path, sym.decls[0].startLine, sym.decls[0].startChar);
    expect(view.resolved?.name).toBe('Job');
    expect(view.alternatives.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < view.alternatives.length; i++) {
      expect(view.alternatives[i - 1].refCount).toBeGreaterThanOrEqual(view.alternatives[i].refCount);
    }
  });

  it('symbol card answers the §8.1 /sym/:symId shape (hover markdown, refs, centrality)', () => {
    const index = qindex();
    const row = index.symbolById.get(FINDBYWA)!;
    const card = symbolCardOf(index, FINDBYWA);
    expect(card.found).toBe(true);
    expect(card.name).toBe('findMasterByWa');
    expect(card.kind).toBe(row.kind);
    expect(card.file).toBe(index.fileByIdx.get(row.fileIdx)!.path);
    expect(card.decls).toEqual(refsOf(index, FINDBYWA).decls);
    expect(card.refs).toBe(refsOf(index, FINDBYWA).references.length);
    expect(card.centrality).toBe(row.centrality);
    expect(card.exported).toBe(row.exported);
    expect(card.hover.contents.kind).toBe('markdown');
    expect(card.hover.contents.value).toMatch(/^```ts\n[\s\S]*findMasterByWa[\s\S]*\n```$/);
    expect(symbolCardOf(index, 'sym:nope#nope').found).toBe(false);
  });

  it('file-scoped unresolved lists the file refs + imports with reasons (§8.1)', () => {
    const index = qindex();
    const view = fileUnresolvedOf(index, 'src/lib/fcm.ts');
    expect(view.fileFound).toBe(true);
    expect(view.file).toBe('src/lib/fcm.ts');
    // fcm.ts: the two https dynamic imports are the known import-level unresolveds.
    expect(view.imports.length).toBeGreaterThanOrEqual(2);
    expect(view.imports.every((u) => u.reason === 'remote-specifier' && u.specifier.startsWith('https://'))).toBe(true);
    const clean = fileUnresolvedOf(index, 'netlify/functions/contexts/master-data/repository.ts');
    expect(clean.fileFound).toBe(true);
    expect(clean.references).toHaveLength(0);
    const ghost = fileUnresolvedOf(index, 'no/such/file.ts');
    expect(ghost.fileFound).toBe(false);
    expect(ghost.references).toEqual([]);
    expect(ghost.imports).toEqual([]);
  });

  it('deps/path answers the shortest module path; unreachable and unknown files answer cleanly (§8.3)', () => {
    const index = qindex();
    const barrel = 'netlify/functions/contexts/master-data/index.ts';
    const repo = 'netlify/functions/contexts/master-data/repository.ts';
    const direct = depsPathOf(index, barrel, repo);
    expect(direct.found).toBe(true);
    expect(direct.path[0]).toBe(barrel);
    expect(direct.path[direct.path.length - 1]).toBe(repo);
    // src and netlify/functions are separate universes: an honest not-found.
    const unreachable = depsPathOf(index, 'src/pages/index.astro', repo);
    expect(unreachable.found).toBe(false);
    expect(unreachable.path).toEqual([]);
    const ghost = depsPathOf(index, 'no/such/file.ts', repo);
    expect(ghost.fromFound).toBe(false);
    expect(ghost.found).toBe(false);
    const same = depsPathOf(index, repo, repo);
    expect(same.found).toBe(true);
    expect(same.path).toEqual([repo]);
  });

  it('deps/orphans lists every file with no in-edges, self-consistent with importEdges (§8.3)', () => {
    const index = qindex();
    const orphans = depsOrphansOf(index);
    const imported = new Set<number>();
    for (const e of index.doc.importEdges ?? []) if (typeof e.to === 'number') imported.add(e.to);
    const expected = index.doc.files
      .filter((f) => !imported.has(f.idx))
      .map((f) => f.path)
      .sort();
    expect(orphans.files).toEqual(expected);
    expect(orphans.total).toBe(expected.length);
    expect(orphans.gen).toBe(index.doc.epoch);
    expect(orphans.files).toContain('src/pages/index.astro'); // an entry page nothing imports
  });
});

describe('module dependency queries', () => {
  it('depsOf reports imports and dependents with direction filtering', () => {
    const index = qindex();
    const barrel = 'netlify/functions/contexts/master-data/index.ts';
    const both = depsOf(index, barrel, 'both');
    expect(both.fileFound).toBe(true);
    expect(both.imports.some((d) => d.target.endsWith('/repository.ts') && d.specifier === './repository')).toBe(true);
    const out = depsOf(index, barrel, 'out');
    expect(out.imports.length).toBeGreaterThan(0);
    expect(out.dependents).toHaveLength(0);
    const inn = depsOf(index, 'netlify/functions/contexts/master-data/repository.ts', 'in');
    expect(inn.dependents.map((d) => d.file)).toContain(barrel);
    expect(inn.imports).toHaveLength(0);
    const ghost = depsOf(index, 'no/such/file.ts', 'both');
    expect(ghost.fileFound).toBe(false);
    expect(ghost.imports).toHaveLength(0);
    expect(ghost.dependents).toHaveLength(0);
  });

  it('indexFromDoc tolerates legacy snapshots without importEdges', () => {
    const doc = dumpDoc(buildIndex(ROOT));
    const legacy = { ...doc, importEdges: undefined } as unknown as DumpDoc;
    const index = indexFromDoc(legacy);
    expect(depsOf(index, 'netlify/functions/contexts/master-data/index.ts', 'both').imports).toHaveLength(0);
    expect(statsOf(index, 'test').importEdgeCount).toBe(0);
    expect(search(index, 'findMasterByWa').length).toBeGreaterThan(0);
  });
});

describe('module cycles (/deps/cycles)', () => {
  // Post-layering-fix inventory: the master-data cycle was broken by moving
  // APPLY_WA_COLS into _lib/db/client.ts; the two SCCs below remain.
  const DB_HTTP = [
    'netlify/functions/_lib/db/client.ts',
    'netlify/functions/_lib/kernel/http.ts',
  ];
  const SRC_API = [
    'src/lib/apiClient.ts',
    'src/lib/fcm.ts',
    'src/store/authReactive.ts',
  ];

  it('lists non-trivial SCCs with real per-member cycle paths, deterministic order', () => {
    const files = [f(0, 'pkg/a.ts'), f(1, 'pkg/b.ts'), f(2, 'pkg/c.ts'), f(3, 'pkg/d.ts'), f(4, 'pkg/e.ts'), f(5, 'pkg/leaf.ts')];
    const index = mkDoc([], [], {
      files,
      importEdges: [
        { from: 0, to: 1, type: 3, specifier: './b' },
        { from: 1, to: 2, type: 3, specifier: './c' },
        { from: 2, to: 0, type: 3, specifier: './a' },
        { from: 3, to: 4, type: 3, specifier: './e' },
        { from: 4, to: 3, type: 3, specifier: './d' },
        { from: 5, to: 0, type: 3, specifier: './a' }, // leaf imports into a cycle, acyclic itself
      ],
    });
    const view = cyclesOf(index);
    expect(view.total).toBe(2);
    expect(view.components.map((c) => c.members.map((m) => m.path).sort())).toEqual(
      [['pkg/a.ts', 'pkg/b.ts', 'pkg/c.ts'], ['pkg/d.ts', 'pkg/e.ts']],
    );
    expect(view.components[0].members[0].path).toBe('pkg/a.ts'); // ordered by first member path
    // each member cycle is a real closed loop through that member
    for (const c of view.components) {
      for (const m of c.members) {
        expect(m.cycle.length).toBe(c.size + 1);
        expect(m.cycle[0]).toBe(m.path);
        expect(m.cycle[m.cycle.length - 1]).toBe(m.path);
      }
    }
  });

  it('ignores a type-only import: import type cannot close a runtime cycle', () => {
    // EdgeType 3 = Imports, 4 = ImportsType. A cycle needs a RUNTIME edge in
    // both directions; `import type` is erased by the compiler, so a→b type-only
    // plus b→a real is NOT a cycle. This is the exact shape that Phase C
    // introduced between kernel/log.ts and kernel/metrics.ts and that
    // dependency-cruiser does not report; it must not reappear as an SCC here.
    const files = [f(0, 'pkg/log.ts'), f(1, 'pkg/metrics.ts')];
    const index = mkDoc([], [], {
      files,
      importEdges: [
        { from: 0, to: 1, type: 4, specifier: './metrics' }, // import type — erased
        { from: 1, to: 0, type: 3, specifier: './log' }, // real runtime edge
      ],
    });
    expect(cyclesOf(index).total).toBe(0);

    // Sanity: the same pair with a REAL import in the other direction is a
    // cycle, so the assertion above is testing the type filter and not a
    // broken fixture.
    const realBoth = mkDoc([], [], {
      files,
      importEdges: [
        { from: 0, to: 1, type: 3, specifier: './metrics' },
        { from: 1, to: 0, type: 3, specifier: './log' },
      ],
    });
    expect(cyclesOf(realBoth).total).toBe(1);
  });

  it('?file narrows to the containing cycle (needle probing, acyclic and unknown files)', () => {
    const files = [f(0, 'pkg/a.ts'), f(1, 'pkg/b.ts'), f(2, 'pkg/c.ts'), f(3, 'pkg/leaf.ts')];
    const index = mkDoc([], [], {
      files,
      importEdges: [
        { from: 0, to: 1, type: 3, specifier: './b' },
        { from: 1, to: 2, type: 3, specifier: './c' },
        { from: 2, to: 0, type: 3, specifier: './a' },
        { from: 3, to: 0, type: 3, specifier: './a' },
      ],
    });
    const hit = cyclesOf(index, 'pkg/b'); // extensionless suffix needle
    expect(hit.fileFound).toBe(true);
    expect(hit.total).toBe(1);
    expect(hit.file).toBe('pkg/b.ts');
    expect(hit.components[0].members.map((m) => m.path).sort()).toEqual(['pkg/a.ts', 'pkg/b.ts', 'pkg/c.ts'].sort());
    const acyclic = cyclesOf(index, 'pkg/leaf.ts');
    expect(acyclic.fileFound).toBe(true);
    expect(acyclic.total).toBe(0);
    expect(acyclic.components).toEqual([]);
    const ghost = cyclesOf(index, 'no/such/file.ts');
    expect(ghost.fileFound).toBe(false);
    expect(ghost.total).toBe(0);
  });

  it('real repo: the two remaining SCCs present; master-data cycle gone after the layering fix', () => {
    const index = qindex();
    const view = cyclesOf(index);
    // exactly the two SCCs below on this tree — the master-data cycle (cv.ts
    // <-> service.ts) was broken by moving APPLY_WA_COLS into _lib/db/client.ts.
    //
    // 2026-09-12: a THIRD SCC (kernel/log.ts <-> kernel/metrics.ts) appeared
    // once Phase C gave log.ts an `import type { MetricsPayload }` from
    // metrics.ts. That was not a real cycle: a type-only import is erased by the
    // compiler and emits nothing at runtime, and dependency-cruiser — whose
    // semantics cycles.ts exists to mirror — reports 0 circular violations here.
    // The fix belongs in runtimeImportEdges() (query.ts), which now drops
    // EdgeType.ImportsType before the SCC pass; both this view and
    // violationsOf()'s `to.circular` rules read cycles through it, so a phantom
    // cycle cannot reappear in one consumer while the other is filtered.
    // The count below therefore stays 2 and now means the same thing to the
    // indexer that it means to depcruise.
    expect(view.total).toBe(2);
    expect(view.components.some((c) => c.members.some((m) => m.path.includes('/contexts/master-data/')))).toBe(false);
    const paths = (c: { members: Array<{ path: string }> }): string[] => c.members.map((m) => m.path).sort();
    const dbHttp = view.components.find((c) => c.members.some((m) => m.path.endsWith('/_lib/kernel/http.ts')));
    expect(dbHttp).toBeDefined();
    expect(paths(dbHttp!)).toEqual([...DB_HTTP].sort());
    const srcApi = view.components.find((c) => c.members.some((m) => m.path.endsWith('src/store/authReactive.ts')));
    expect(srcApi).toBeDefined();
    expect(paths(srcApi!)).toEqual([...SRC_API].sort());
    // iteration order is not pinned beyond determinism: member sets and the
    // closed-loop property are the contract (depcruise itself is order-dependent).
    for (const c of [dbHttp!, srcApi!]) {
      for (const m of c.members) {
        expect(m.cycle[0]).toBe(m.path);
        expect(m.cycle[m.cycle.length - 1]).toBe(m.path);
        expect(m.cycle.length).toBe(c.size + 1); // closed loop: size edges + return to the member
      }
    }
    // acyclic context files still answer total 0; the old master-data needle is a normal file now
    const mdFile = cyclesOf(index, 'contexts/master-data/service');
    expect(mdFile.fileFound).toBe(true);
    expect(mdFile.total).toBe(0);
  });
});

describe('file outline queries', () => {
  const REPO = 'netlify/functions/contexts/master-data/repository.ts';

  it('fileSymbols projects declared symbols + export surface with zero dangling joins', () => {
    const index = qindex();
    const view = fileSymbols(index, REPO);
    expect(view.fileFound).toBe(true);
    expect(view.file).toBe(REPO);
    const fileIdx = index.fileIdxByLower.get(REPO)!;
    expect(view.fileIdx).toBe(fileIdx);
    expect(view.symbols.length).toBeGreaterThan(0);
    // every returned identity resolves against the doc row it projects
    for (const e of view.symbols) {
      const row = index.symbolByKey.get(e.symKey);
      expect(row).toBeDefined();
      expect(row!.id).toBe(e.id);
      expect(row!.fileIdx).toBe(fileIdx);
      expect(row!.scopeId).toBe(e.scopeId);
      expect(e.scopeId.startsWith(`scope:${view.file}#`)).toBe(true);
      expect(row!.parentKey).toBe(e.parentKey);
      expect(e.decls).toEqual(row!.decls);
      // Row-9 read-surface rendering: outline entries carry the hover
      // signature fields (detail/typeRef) exactly as the dump row does.
      expect(e.detail).toBe(row!.detail);
      expect(e.typeRef).toBe(row!.typeRef);
    }
    // The flagship symbol of this file carries both (a real signature).
    const fm = view.symbols.find((e) => e.id === FINDBYWA);
    expect(fm?.detail).toBeTruthy();
    expect(fm?.typeRef).toBeTruthy();
    // symbols are the file's full dump rows, flat, in source order
    expect(view.symbols.map((e) => e.symKey)).toEqual(index.symbolsByFile.get(fileIdx)!.map((s) => s.key));
    const starts = view.symbols.map((e) => e.decls[0].startLine);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    // export surface passes through unchanged (empty when the file has none)
    const surface = index.surfaceByFile.get(fileIdx);
    expect(view.exports).toEqual(surface?.exports ?? []);
    expect(view.starSources).toEqual(surface?.starSources ?? []);
    for (const e of view.exports) {
      if (e.symKey !== undefined) expect(index.symbolByKey.get(e.symKey)).toBeDefined();
      if (e.fromFileIdx !== undefined) expect(index.fileByIdx.get(e.fromFileIdx)).toBeDefined();
    }
  });

  it('resolves extensionless suffixes and numeric file idxs to the same outline', () => {
    const index = qindex();
    const exact = fileSymbols(index, REPO);
    const probed = fileSymbols(index, 'contexts/master-data/repository');
    expect(probed.fileFound).toBe(true);
    expect(probed.file).toBe(REPO);
    expect(probed.fileIdx).toBe(exact.fileIdx);
    expect(probed.symbols.map((e) => e.symKey)).toEqual(exact.symbols.map((e) => e.symKey));
    const byIdx = fileSymbols(index, String(index.fileIdxByLower.get(REPO)!));
    expect(byIdx.file).toBe(REPO);
    expect(byIdx.symbols).toEqual(exact.symbols);
    const ghost = fileSymbols(index, 'no/such/file.ts');
    expect(ghost.fileFound).toBe(false);
    expect(ghost.fileIdx).toBeNull();
    expect(ghost.symbols).toHaveLength(0);
    expect(ghost.exports).toHaveLength(0);
  });

  it('resolve and deps accept the same extensionless needles as /symbols', () => {
    const index = qindex();
    const sym = index.symbolById.get(FINDBYWA)!;
    const d = sym.decls[0];
    const byPath = resolveAt(index, REPO, d.startLine, d.startChar);
    const bySuffix = resolveAt(index, 'contexts/master-data/repository', d.startLine, d.startChar);
    expect(bySuffix.fileFound).toBe(true);
    expect(bySuffix.resolved?.symId).toBe(byPath.resolved?.symId);
    const depsExact = depsOf(index, REPO, 'in');
    const depsProbed = depsOf(index, 'contexts/master-data/repository', 'in');
    expect(depsProbed.fileFound).toBe(true);
    expect(depsProbed.file).toBe(REPO);
    expect(depsProbed.dependents).toEqual(depsExact.dependents);
  });

  it('fileSymbols passes non-empty starSources through (synthetic surface)', () => {
    const doc = dumpDoc(buildIndex(ROOT));
    const surf = doc.exportSurfaces.find((x) => x.exports.length > 0)!;
    const other = doc.files[(surf.fileIdx + 1) % doc.files.length].idx;
    const starSources = [{ fromFileIdx: surf.fileIdx, excludes: [] }, { fromFileIdx: other, excludes: ['Private'] }];
    const patched: DumpDoc = {
      ...doc,
      exportSurfaces: doc.exportSurfaces.map((x) =>
        x.fileIdx === surf.fileIdx ? { ...x, starSources } : x),
    };
    const view = fileSymbols(indexFromDoc(patched), String(surf.fileIdx));
    expect(view.fileFound).toBe(true);
    expect(view.starSources).toEqual(starSources);
    expect(view.exports.length).toBeGreaterThan(0);
  });
});

describe('row-9 read surfaces — detail/kind carried on outline, refs, search (fixture)', () => {
  const signed = (withMeta: boolean): Record<string, unknown> => ({
    id: 'sym:a#greet',
    key: 7,
    name: 'greet',
    qualified: 'greet',
    kind: SymbolKind.Function,
    fileIdx: 0,
    scopeId: 'scope:a.ts#module',
    decls: [decl(0, 0, 'greet')],
    exported: true,
    exportNames: ['greet'],
    modifiers: {},
    centrality: 0,
    ...(withMeta ? { detail: 'export function greet(wa: string): void {', typeRef: '(wa: string) => void' } : {}),
  });

  it('outline entries, refs targets, and search hits render the symbol hover metadata', () => {
    const index = mkDoc([signed(true)]);
    // file outline: detail + typeRef survive the projection (hover signature)
    const [entry] = fileSymbols(index, 'a.ts').symbols;
    expect(entry).toBeDefined();
    expect(entry.symKey).toBe(7);
    expect(entry.kind).toBe(SymbolKind.Function);
    expect(entry.detail).toBe('export function greet(wa: string): void {');
    expect(entry.typeRef).toBe('(wa: string) => void');
    // search hits carry the same signature
    const [hit] = search(index, 'greet');
    expect(hit.kind).toBe(SymbolKind.Function);
    expect(hit.detail).toBe('export function greet(wa: string): void {');
    // refs answers name the target's kind + detail
    const view = refsOf(index, 'sym:a#greet');
    expect(view.kind).toBe(SymbolKind.Function);
    expect(view.detail).toBe('export function greet(wa: string): void {');
  });

  it('legacy rows without detail keep the additive fields absent', () => {
    const index = mkDoc([signed(false)]);
    const [entry] = fileSymbols(index, 'a.ts').symbols;
    expect(entry.detail).toBeUndefined();
    expect(entry.typeRef).toBeUndefined();
    expect(search(index, 'greet')[0].detail).toBeUndefined();
    const view = refsOf(index, 'sym:a#greet');
    expect(view.kind).toBe(SymbolKind.Function); // kind is always on the row
    expect(view.detail).toBeUndefined();
  });
});

describe('row-5 §8 remainder read views — synthetic (unresolved rows + BFS)', () => {
  it('file unresolved lists occurrence rows with reasons/ranges; deps/path BFS hops module edges', () => {
    const index = mkDoc([], [], {
      files: [f(0, 'a.ts'), f(1, 'b.ts'), f(2, 'c.ts')],
      unresolved: [
        { fileIdx: 0, name: 'missingThing', reason: 'global-unknown', range: { startLine: 3, startChar: 4, endLine: 3, endChar: 15, start: 60, end: 71 } },
      ],
      unresolvedImports: [{ fileIdx: 0, specifier: 'https://x', reason: 'remote-specifier' }],
      importEdges: [
        { from: 0, to: 1, type: EdgeType.Imports, specifier: './b' },
        { from: 1, to: 2, type: EdgeType.Imports, specifier: './c' },
      ],
    });
    const uv = fileUnresolvedOf(index, 'a.ts');
    expect(uv.fileFound).toBe(true);
    expect(uv.references).toHaveLength(1);
    expect(uv.references[0]).toMatchObject({ name: 'missingThing', reason: 'global-unknown', line: 3, char: 4 });
    expect(uv.imports).toEqual([{ specifier: 'https://x', reason: 'remote-specifier' }]);
    const path = depsPathOf(index, 'a.ts', 'c.ts');
    expect(path.found).toBe(true);
    expect(path.path).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(path.gen).toBe(1);
  });
});

describe('HTTP surface (Phase 5 endpoints)', () => {
  function requestJson(port: number, path: string, method: string): Promise<{ status: number; body: Record<string, unknown> }> {
    return new Promise((resolveP, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path, method }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolveP({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : {} }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  function getJson(port: number, path: string): Promise<{ status: number; body: Record<string, unknown> }> {
    return new Promise((resolveP, reject) => {
      const req = httpGet({ host: '127.0.0.1', port, path }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolveP({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : {} }));
      });
      req.on('error', reject);
    });
  }

  it('serves every endpoint over HTTP with correct status codes (incl. /symbols)', async () => {
    const server = createIndexServer({ index: qindex(), source: 'test', history: [] });
    const port = await bind(server, 0);
    try {
      const stats = await getJson(port, '/stats');
      expect(stats.status).toBe(200);
      expect((stats.body as { fileCount: number }).fileCount).toBe(qindex().doc.files.length);

      const search = await getJson(port, `/search?q=${encodeURIComponent('findMasterByWa')}`);
      expect(search.status).toBe(200);
      const results = (search.body as { results: Array<{ symId: string; match: string; detail?: string }> }).results;
      expect(results[0].match).toBe('name');
      expect(results.some((r) => r.symId === FINDBYWA)).toBe(true);
      const hit = results.find((r) => r.symId === FINDBYWA)!;
      expect(hit.detail).toBeTruthy(); // row-9 read surface: hover signature rides the hit

      const refs = await getJson(port, `/refs?symId=${encodeURIComponent(FINDBYWA)}`);
      expect(refs.status).toBe(200);
      const refsBody = refs.body as { references: unknown[]; kind?: number; detail?: string };
      expect(refsBody.references.length).toBeGreaterThan(0);
      expect(typeof refsBody.kind).toBe('number');
      expect(refsBody.detail).toBeTruthy();

      const missing = await getJson(port, `/refs?symId=${encodeURIComponent('sym:nope')}`);
      expect(missing.status).toBe(404);

      const bad = await getJson(port, '/resolve?file=a.ts&line=x&char=0');
      expect(bad.status).toBe(400);

      const ghost = await getJson(port, '/nope');
      expect(ghost.status).toBe(404);

      const deps = await getJson(port, `/deps?file=${encodeURIComponent('netlify/functions/contexts/master-data/repository.ts')}&direction=in`);
      expect(deps.status).toBe(200);
      const dv = deps.body as { fileFound: boolean; dependents: Array<{ file: string }> };
      expect(dv.fileFound).toBe(true);
      expect(dv.dependents.some((d) => d.file.endsWith('/master-data/index.ts'))).toBe(true);

      const badDir = await getJson(port, '/deps?file=a.ts&direction=sideways');
      expect(badDir.status).toBe(400);
      const noFile = await getJson(port, '/deps');
      expect(noFile.status).toBe(400);

      const outline = await getJson(port, `/symbols?file=${encodeURIComponent('contexts/master-data/repository')}`);
      expect(outline.status).toBe(200);
      const ov = outline.body as { fileFound: boolean; symbols: Array<{ id: string }> };
      expect(ov.fileFound).toBe(true);
      expect(ov.symbols.some((s) => s.id === FINDBYWA)).toBe(true);
      const oe = (outline.body as { symbols: Array<{ id: string; detail?: string; typeRef?: string }> }).symbols.find((s) => s.id === FINDBYWA);
      expect(oe?.detail).toBeTruthy(); // row-9 read surface: outline entries carry the hover signature
      expect(oe?.typeRef).toBeTruthy();

      const noParam = await getJson(port, '/symbols');
      expect(noParam.status).toBe(400);
      const ghostFile = await getJson(port, '/symbols?file=no/such/file.ts');
      expect(ghostFile.status).toBe(200);
      expect((ghostFile.body as { fileFound: boolean }).fileFound).toBe(false);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  });

  it('serves /gen and /diff and gates POST /rebuild', async () => {
    const server = createIndexServer({ index: qindex(), source: 'test', history: [] });
    const port = await bind(server, 0);
    try {
      const gen = await getJson(port, '/gen');
      expect(gen.status).toBe(200);
      expect((gen.body as { gen: number }).gen).toBe(qindex().doc.epoch);

      const diff0 = await getJson(port, '/diff?since=0');
      expect(diff0.status).toBe(200);
      expect((diff0.body as { events: unknown[] }).events).toHaveLength(0);
      const upToDate = await getJson(port, `/diff?since=${qindex().doc.epoch}`);
      expect(upToDate.status).toBe(200);
      const badSince = await getJson(port, '/diff?since=abc');
      expect(badSince.status).toBe(400);
      const futureSince = await getJson(port, `/diff?since=${qindex().doc.epoch + 5}`);
      expect(futureSince.status).toBe(400);

      // snapshot/state holders have no rebuild source → 409; GET /rebuild → 405
      const post = await requestJson(port, '/rebuild', 'POST');
      expect(post.status).toBe(409);
      const getRebuild = await getJson(port, '/rebuild');
      expect(getRebuild.status).toBe(405);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  });

  it('serves /deps/cycles (remaining SCCs; master-data cycle gone) with the ?file filter and error contract', async () => {
    const server = createIndexServer({ index: qindex(), source: 'test', history: [] });
    const port = await bind(server, 0);
    try {
      const all = await getJson(port, '/deps/cycles');
      expect(all.status).toBe(200);
      const allBody = all.body as { total: number; components: Array<{ size: number; members: Array<{ fileIdx: number; path: string; cycle: string[] }> }> };
      // db/client<->kernel/http + src apiClient/fcm/authReactive. A third
      // candidate (kernel/log <-> kernel/metrics, via a type-only import) is
      // filtered by runtimeImportEdges() — see the note on the sibling
      // assertions above.
      expect(allBody.total).toBe(2);
      expect(allBody.components.some((c) => c.members.some((m) => m.path.includes('/contexts/master-data/')))).toBe(false);
      const dbHttp = allBody.components.find((c) => c.members.some((m) => m.path.endsWith('/_lib/kernel/http.ts')));
      expect(dbHttp?.members.map((m) => m.path).sort()).toEqual(['netlify/functions/_lib/db/client.ts', 'netlify/functions/_lib/kernel/http.ts'].sort());
      expect(dbHttp?.members.every((m) => m.fileIdx >= 0 && m.cycle[0] === m.path && m.cycle[m.cycle.length - 1] === m.path)).toBe(true);
      // the old master-data cycle is gone: its files answer as acyclic, not a cycle
      const filtered = await getJson(port, '/deps/cycles?file=' + encodeURIComponent('contexts/master-data/service'));
      expect(filtered.status).toBe(200);
      const fv = filtered.body as { fileFound: boolean; total: number; components: Array<{ members: Array<{ path: string }> }> };
      expect(fv.fileFound).toBe(true);
      expect(fv.total).toBe(0);
      expect(fv.components).toEqual([]);
      const ghost = await getJson(port, '/deps/cycles?file=no/such/file.ts');
      expect(ghost.status).toBe(200);
      expect((ghost.body as { fileFound: boolean }).fileFound).toBe(false);
      const acyclic = await getJson(port, '/deps/cycles?file=netlify/functions/surfaces/auth.ts');
      expect((acyclic.body as { fileFound: boolean; total: number }).fileFound).toBe(true);
      expect((acyclic.body as { fileFound: boolean; total: number }).total).toBe(0);
      const empty = await getJson(port, '/deps/cycles?file=');
      expect(empty.status).toBe(400);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  });

  it('/gen carries the per-generation health view (poisoned files)', async () => {
    const doc = dumpDoc(buildIndex(ROOT));
    const first = doc.files[0];
    (doc.files as unknown as Array<Record<string, unknown>>)[0] = { ...first, poisoned: { error: 'boom at 3:1' } };
    const server = createIndexServer({ index: indexFromDoc(doc), source: 'test', history: [] });
    const port = await bind(server, 0);
    try {
      const gen = await getJson(port, '/gen');
      expect(gen.status).toBe(200);
      const body = gen.body as { gen: number; poisonedCount: number; poisoned: Array<{ path: string; error: string }> };
      expect(body.gen).toBe(doc.epoch);
      expect(body.poisonedCount).toBe(1);
      expect(body.poisoned).toEqual([{ path: first.path, error: 'boom at 3:1' }]);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  });
});

describe('HTTP row-5 §8 endpoints (/sym, /files/:path/unresolved, /deps/path, /deps/orphans, ?gen=)', () => {
  function getJson(port: number, path: string): Promise<{ status: number; body: Record<string, unknown> }> {
    return new Promise((resolveP, reject) => {
      const req = httpGet({ host: '127.0.0.1', port, path }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolveP({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : {} }));
      });
      req.on('error', reject);
    });
  }

  it('serves the §8 remainder endpoints with their contract', async () => {
    const server = createIndexServer({ index: qindex(), source: 'test', history: [] });
    const port = await bind(server, 0);
    try {
      const sym = await getJson(port, `/sym/${encodeURIComponent(FINDBYWA)}`);
      expect(sym.status).toBe(200);
      const sv = sym.body as { found: boolean; name: string; refs: number; hover: { contents: { kind: string; value: string } } };
      expect(sv.found).toBe(true);
      expect(sv.name).toBe('findMasterByWa');
      expect(sv.refs).toBeGreaterThan(0);
      expect(sv.hover.contents.kind).toBe('markdown');
      expect(sv.hover.contents.value).toContain('findMasterByWa');
      const missingSym = await getJson(port, '/sym/sym:nope');
      expect(missingSym.status).toBe(404);

      const un = await getJson(port, `/files/${encodeURIComponent('src/lib/fcm.ts')}/unresolved`);
      expect(un.status).toBe(200);
      expect((un.body as { fileFound: boolean; imports: unknown[] }).fileFound).toBe(true);
      expect((un.body as { imports: unknown[] }).imports.length).toBeGreaterThanOrEqual(2);
      const ghostFile = await getJson(port, `/files/${encodeURIComponent('no/such.ts')}/unresolved`);
      expect(ghostFile.status).toBe(200);
      expect((ghostFile.body as { fileFound: boolean }).fileFound).toBe(false);

      const dp = await getJson(port, `/deps/path?from=${encodeURIComponent('contexts/master-data/index')}&to=${encodeURIComponent('contexts/master-data/repository')}`);
      expect(dp.status).toBe(200);
      const dpv = dp.body as { found: boolean; path: string[] };
      expect(dpv.found).toBe(true);
      expect(dpv.path[0].endsWith('master-data/index.ts')).toBe(true);
      expect(dpv.path[dpv.path.length - 1].endsWith('master-data/repository.ts')).toBe(true);
      const noFrom = await getJson(port, '/deps/path?to=a.ts');
      expect(noFrom.status).toBe(400);

      const orphans = await getJson(port, '/deps/orphans');
      expect(orphans.status).toBe(200);
      const ov = orphans.body as { total: number; files: string[] };
      expect(ov.total).toBe(ov.files.length);
      expect(ov.files).toContain('src/pages/index.astro');

      // ?gen= is validated on the versioned reads: the current generation
      // passes; any other gen explains the diff-only retention (400).
      const gen = qindex().doc.epoch;
      const ok = await getJson(port, `/resolve?file=${encodeURIComponent('src/lib/fcm.ts')}&line=0&char=0&gen=${gen}`);
      expect(ok.status).toBe(200);
      const future = await getJson(port, `/resolve?file=${encodeURIComponent('src/lib/fcm.ts')}&line=0&char=0&gen=${gen + 5}`);
      expect(future.status).toBe(400);
      const oldGen = await getJson(port, `/deps/orphans?gen=0`);
      expect(oldGen.status).toBe(400);
      const badGen = await getJson(port, `/sym/${encodeURIComponent(FINDBYWA)}?gen=abc`);
      expect(badGen.status).toBe(400);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  });
});

describe('exact-name lookup (idx refs <name> support)', () => {
  it('matches simple names exactly - never by substring', () => {
    const index = qindex();
    const hits = symbolsByExactName(index, 'findMasterByWa');
    expect(hits.length).toBeGreaterThanOrEqual(3);
    for (const sym of hits) expect(sym.name).toBe('findMasterByWa');
  });

  it('is case-insensitive and trims the needle', () => {
    const index = qindex();
    const plain = symbolsByExactName(index, 'findMasterByWa');
    const padded = symbolsByExactName(index, '  FINDMASTERBYWA ');
    expect(padded).toEqual(plain);
  });

  it('matches qualified member names and empty/unmatched needles', () => {
    const doc = {
      epoch: 1,
      rootDir: '/r',
      files: [],
      symbols: [
        { id: 'sym:a.ts#X', key: 0, name: 'X', qualified: 'NS.X', kind: 8, fileIdx: 0, decls: [], exported: false, exportNames: [], modifiers: {}, centrality: 0 },
        { id: 'sym:a.ts#CONST', key: 1, name: 'CONST', qualified: 'NS.CONST', kind: 1, fileIdx: 0, decls: [], exported: true, exportNames: ['CONST'], modifiers: {}, centrality: 0 },
      ],
      refs: [],
      symbolEdges: [],
      importEdges: [],
      exportSurfaces: [],
    } as unknown as DumpDoc;
    const index = indexFromDoc(doc);
    expect(symbolsByExactName(index, 'ns.x').map((s) => s.name)).toEqual(['X']);
    expect(symbolsByExactName(index, 'NS.CONST').map((s) => s.name)).toEqual(['CONST']);
    expect(symbolsByExactName(index, 'CONST').map((s) => s.name)).toEqual(['CONST']);
    expect(symbolsByExactName(index, '')).toEqual([]);
    expect(symbolsByExactName(index, 'zz-no-such-symbol-zz')).toEqual([]);
  });

  it('surfaces every duplicate as its own row (callers rank, never guess)', () => {
    const index = qindex();
    const hits = symbolsByExactName(index, 'findMasterByWa');
    const ids = new Set(hits.map((s) => s.id));
    expect(ids.size).toBe(hits.length);
  });
});

describe('line-granular resolveLine (idx def <file>:<line>)', () => {
  it('picks the tightest declaration on a line, whatever its column', () => {
    const index = mkDoc(
      [
        { id: 'sym:a#outer', key: 1, name: 'outer', qualified: 'outer', kind: 8, fileIdx: 0, decls: [{ startLine: 0, startChar: 0, endLine: 2, endChar: 5, start: 0, end: 100 }] },
        { id: 'sym:a#inner', key: 2, name: 'inner', qualified: 'inner', kind: 8, fileIdx: 0, decls: [{ startLine: 0, startChar: 6, endLine: 0, endChar: 16, start: 10, end: 20 }] },
        { id: 'sym:a#colA', key: 3, name: 'colA', qualified: 'colA', kind: 8, fileIdx: 0, decls: [{ startLine: 1, startChar: 4, endLine: 1, endChar: 9, start: 30, end: 35 }] },
        { id: 'sym:a#colB', key: 4, name: 'colB', qualified: 'colB', kind: 8, fileIdx: 0, decls: [{ startLine: 2, startChar: 2, endLine: 2, endChar: 6, start: 40, end: 44 }] },
        { id: 'sym:a#localFn', key: 5, name: 'localFn', qualified: 'localFn', kind: 8, fileIdx: 0, decls: [{ startLine: 3, startChar: 16, endLine: 3, endChar: 26, start: 65, end: 75 }] },
        { id: 'sym:b#calleeFn', key: 9, name: 'calleeFn', qualified: 'calleeFn', kind: 8, fileIdx: 1, decls: [{ startLine: 0, startChar: 0, endLine: 0, endChar: 8, start: 0, end: 8 }] },
      ],
      [
        { fileIdx: 0, symKey: 9, role: 1, resolvedVia: 'import', range: { startLine: 3, startChar: 8, endLine: 3, endChar: 12, start: 60, end: 64 } },
      ],
      { files: [f(0, 'a.ts'), f(1, 'b.ts')] },
    );
    const l0 = resolveLine(index, 'a.ts', 0);
    expect(l0.resolved?.name).toBe('inner'); // tighter than the enclosing decl
    const l1 = resolveLine(index, 'a.ts', 1);
    expect(l1.resolved?.name).toBe('colA'); // indented declaration at col 4
    expect(l1.query.character).toBe(4);
    const l2 = resolveLine(index, 'a.ts', 2);
    expect(l2.resolved?.name).toBe('colB'); // indented declaration at col 2
    const l3 = resolveLine(index, 'a.ts', 3);
    expect(l3.resolved?.name).toBe('calleeFn'); // the call ref beats the local decl on its own line
    expect(l3.query.character).toBe(8);
  });

  it('answers null on comment/string-only lines, blank lines, and unknown files', () => {
    const index = mkDoc([{ id: 'sym:a#x', key: 1, name: 'x', qualified: 'x', kind: 8, fileIdx: 0, decls: [decl(0, 0, 'x')] }]);
    const blank = resolveLine(index, 'a.ts', 4); // nothing below line 0
    expect(blank.resolved).toBeNull();
    expect(blank.fileFound).toBe(true);
    const ghost = resolveLine(index, 'nope.ts', 0);
    expect(ghost.fileFound).toBe(false);
    const probe = resolveLine(index, 'a', 0); // extensionless needle shares probing
    expect(probe.resolved?.name).toBe('x');
  });

  it('precise resolveAt semantics are unchanged by the refactor', () => {
    const index = mkDoc([
      { id: 'sym:a#outer', key: 1, name: 'outer', qualified: 'outer', kind: 8, fileIdx: 0, decls: [{ startLine: 0, startChar: 0, endLine: 2, endChar: 5, start: 0, end: 100 }] },
      { id: 'sym:a#inner', key: 2, name: 'inner', qualified: 'inner', kind: 8, fileIdx: 0, decls: [{ startLine: 0, startChar: 6, endLine: 0, endChar: 16, start: 10, end: 20 }] },
    ]);
    expect(resolveAt(index, 'a.ts', 0, 3).resolved?.name).toBe('outer');
    expect(resolveAt(index, 'a.ts', 0, 9).resolved?.name).toBe('inner');
    expect(resolveAt(index, 'a.ts', 1, 0).resolved?.name).toBe('outer');
    expect(resolveAt(index, 'a.ts', 3, 0).resolved).toBeNull();
  });
});

describe('symbolsDefining (single-owner candidate policy)', () => {
  it('excludes import-binding shadows and ranks by ref count then file', () => {
    const index = qindex();
    const defs = symbolsDefining(index, 'findMasterByWa');
    expect(defs.length).toBeGreaterThanOrEqual(3);
    expect(defs.every((s) => s.kind !== 15)).toBe(true);
    // ranked: ref counts never increase down the list
    const counts = defs.map((s) => refsOf(index, s.id).references.length);
    for (let i = 1; i < counts.length; i++) expect(counts[i] <= counts[i - 1]).toBe(true);
  });

  it('returns [] for names that are only imported (never declared)', () => {
    const index = qindex();
    expect(symbolsByExactName(index, 'describe').length).toBeGreaterThan(0);
    expect(symbolsDefining(index, 'describe')).toEqual([]);
    expect(symbolsDefining(index, 'zz-no-such-name-zz')).toEqual([]);
  });

  it('ranks a single unique definition first (the common refs case)', () => {
    const index = qindex();
    const byName = new Map<string, number>();
    for (const s of index.doc.symbols) byName.set(s.name, (byName.get(s.name) ?? 0) + 1);
    const single = [...byName.entries()]
      .filter(([name, n]) => n === 1)
      .map(([name]) => name)
      .find((name) => symbolsDefining(index, name).length === 1);
    expect(single).toBeDefined();
    const answer = symbolsDefining(index, single as string);
    expect(answer.length).toBe(1);
    expect(answer[0].kind).not.toBe(15);
  });
});


describe('import linkage (def-at-import + refs import sites)', () => {
  const defRow = (id: string, key: number, fileIdx: number, name: string, c: number): Record<string, unknown> => ({
    id,
    key,
    name,
    qualified: name,
    kind: SymbolKind.Function,
    fileIdx,
    decls: [decl(0, c, name)],
    exported: true,
    exportNames: [name],
    modifiers: {},
    centrality: 0,
  });
  const bindingRow = (id: string, key: number, fileIdx: number, name: string, c: number): Record<string, unknown> => ({
    id,
    key,
    name,
    qualified: name,
    kind: SymbolKind.ImportBinding,
    fileIdx,
    decls: [decl(0, c, name)],
    exported: false,
    exportNames: [],
    modifiers: {},
    centrality: 0,
  });
  const edge = (from: number, to: number, type: number, spec: string): Record<string, unknown> => ({ from, to, type, specifier: spec });
  const be = (from: number, to: number, bindings: Array<Record<string, unknown>>, spec = './x'): Record<string, unknown> => ({ from, to, type: EdgeType.Imports, specifier: spec, bindings });
  const surface = (fileIdx: number, exports: Array<Record<string, unknown>>, stars: Array<Record<string, unknown>> = []): Record<string, unknown> => ({ fileIdx, exports, starSources: stars });

  it('def at an import specifier chases to the definition when unambiguous', () => {
    const a = defRow('sym:a#greet', 1, 0, 'greet', 0);
    const binding = bindingRow('sym:b#greet', 2, 1, 'greet', 9);
    const index = mkDoc([a, binding], [], {
      files: [f(0, 'a.ts'), f(1, 'b.ts')],
      importEdges: [edge(1, 0, EdgeType.Imports, './a')],
      exportSurfaces: [surface(0, [{ name: 'greet', kind: 'direct', symKey: 1 }])],
    });
    expect(importTargetsOf(index, 1, 'greet').map((s) => s.id)).toEqual(['sym:a#greet']);
    const view = resolveAt(index, 'b.ts', 0, 12);
    expect(view.resolved?.symId).toBe('sym:a#greet');
    expect(view.resolved?.resolvedVia).toBe('import');
    // line mode on the same import line answers the same chase
    const lineView = resolveLine(index, 'b.ts', 0);
    expect(lineView.resolved?.symId).toBe('sym:a#greet');
    expect(lineView.query.character).toBe(9);
  });

  it('legacy edges (no per-edge bindings): a renamed local name falls back to the binding', () => {
    const a = defRow('sym:a#greet', 1, 0, 'greet', 0);
    const hi = bindingRow('sym:b#hi', 2, 1, 'hi', 9);
    const index = mkDoc([a, hi], [], {
      files: [f(0, 'a.ts'), f(1, 'b.ts')],
      importEdges: [edge(1, 0, EdgeType.Imports, './a')],
      exportSurfaces: [surface(0, [{ name: 'greet', kind: 'direct', symKey: 1 }])],
    });
    expect(importTargetsOf(index, 1, 'hi')).toEqual([]); // a exports greet, not hi
    const view = resolveAt(index, 'b.ts', 0, 10);
    expect(view.resolved?.symId).toBe('sym:b#hi'); // unchanged local-binding answer
    expect(view.resolved?.resolvedVia).toBe('declaration');
  });

  it('a multi-target import is ambiguous: candidates stay, no chase', () => {
    const a1 = defRow('sym:a1#greet', 1, 0, 'greet', 0);
    const a2 = defRow('sym:a2#greet', 2, 1, 'greet', 0);
    const binding = bindingRow('sym:b#greet', 3, 2, 'greet', 9);
    const index = mkDoc([a1, a2, binding], [], {
      files: [f(0, 'a1.ts'), f(1, 'a2.ts'), f(2, 'b.ts')],
      importEdges: [edge(2, 0, EdgeType.Imports, './a1'), edge(2, 1, EdgeType.Imports, './a2')],
      exportSurfaces: [
        surface(0, [{ name: 'greet', kind: 'direct', symKey: 1 }]),
        surface(1, [{ name: 'greet', kind: 'direct', symKey: 2 }]),
      ],
    });
    const targets = importTargetsOf(index, 2, 'greet');
    expect(targets.map((s) => s.id).sort()).toEqual(['sym:a1#greet', 'sym:a2#greet']);
    const view = resolveAt(index, 'b.ts', 0, 12);
    expect(view.resolved?.symId).toBe('sym:b#greet');
  });

  it('chases through re-export and star barrels to the defining symbol', () => {
    const a = defRow('sym:a#greet', 1, 0, 'greet', 0);
    const bindD = bindingRow('sym:d#greet', 2, 3, 'greet', 9);
    const index = mkDoc([a, bindD], [], {
      files: [f(0, 'a.ts'), f(1, 'barrel.ts'), f(2, 'stars.ts'), f(3, 'd.ts')],
      importEdges: [edge(3, 1, EdgeType.Imports, './barrel'), edge(3, 2, EdgeType.Imports, './stars')],
      exportSurfaces: [
        surface(0, [{ name: 'greet', kind: 'direct', symKey: 1 }]),
        surface(1, [{ name: 'greet', kind: 'reExport', fromFileIdx: 0, targetName: 'greet' }]),
        surface(2, [], [{ fromFileIdx: 0, excludes: [] }]),
      ],
    });
    // both barrels reach the same definition - deduped, so still unambiguous
    expect(importTargetsOf(index, 3, 'greet').map((s) => s.id)).toEqual(['sym:a#greet']);
    const view = resolveAt(index, 'd.ts', 0, 12);
    expect(view.resolved?.symId).toBe('sym:a#greet');
  });

  it('importSitesOf lists every importing file with specifier positions', () => {
    const a = defRow('sym:a#greet', 1, 0, 'greet', 0);
    const b = bindingRow('sym:b#greet', 2, 1, 'greet', 9);
    const c = bindingRow('sym:c#greet', 3, 2, 'greet', 9);
    const index = mkDoc([a, b, c], [], {
      files: [f(0, 'a.ts'), f(1, 'b.ts'), f(2, 'c.ts')],
      importEdges: [edge(1, 0, EdgeType.Imports, './a'), edge(2, 0, EdgeType.Imports, './a')],
      exportSurfaces: [surface(0, [{ name: 'greet', kind: 'direct', symKey: 1 }])],
    });
    const sites = importSitesOf(index, index.symbolById.get('sym:a#greet')!);
    expect(sites.map((s) => s.file)).toEqual(['b.ts', 'c.ts']);
    expect(sites.every((s) => s.decls.length === 1 && s.decls[0].c === 9)).toBe(true);
    // refsOf carries them on the view - the rename/impact answer
    const view = refsOf(index, 'sym:a#greet');
    expect(view.imports.map((s) => s.file)).toEqual(['b.ts', 'c.ts']);
    expect(refsOf(index, 'sym:nope').imports).toEqual([]);
  });

  it('isImportBindingSymbol is the one shadow predicate symbolsDefining shares', () => {
    const a = defRow('sym:a#greet', 1, 0, 'greet', 0);
    const b = bindingRow('sym:b#greet', 2, 1, 'greet', 9);
    const index = mkDoc([a, b], [], {
      files: [f(0, 'a.ts'), f(1, 'b.ts')],
      importEdges: [edge(1, 0, EdgeType.Imports, './a')],
      exportSurfaces: [surface(0, [{ name: 'greet', kind: 'direct', symKey: 1 }])],
    });
    expect(isImportBindingSymbol(index.symbolById.get('sym:b#greet')!)).toBe(true);
    expect(isImportBindingSymbol(index.symbolById.get('sym:a#greet')!)).toBe(false);
    const defs = symbolsDefining(index, 'greet');
    expect(defs.map((s) => s.id)).toEqual(['sym:a#greet']);
  });
  it('per-edge bindings pick the importing edge - unrelated same-file imports cannot poison the chase', () => {
    const apply = defRow('sym:cv#APPLY_WA_COLS', 1, 0, 'APPLY_WA_COLS', 0);
    const cvFmbw = defRow('sym:cv#findMasterByWa', 2, 0, 'findMasterByWa', 30);
    const repoFmbw = defRow('sym:repo#findMasterByWa', 3, 1, 'findMasterByWa', 0);
    const svcBinding = bindingRow('sym:svc#findMasterByWa', 4, 2, 'findMasterByWa', 9);
    const index = mkDoc([apply, cvFmbw, repoFmbw, svcBinding], [], {
      files: [f(0, 'cv.ts'), f(1, 'repo.ts'), f(2, 'svc.ts')],
      importEdges: [
        be(2, 0, [{ local: 'APPLY_WA_COLS', imported: 'APPLY_WA_COLS', shape: 'named' }], './cv'),
        be(2, 1, [{ local: 'findMasterByWa', imported: 'findMasterByWa', shape: 'named' }], './repo'),
      ],
      exportSurfaces: [
        surface(0, [{ name: 'APPLY_WA_COLS', kind: 'direct', symKey: 1 }, { name: 'findMasterByWa', kind: 'direct', symKey: 2 }]),
        surface(1, [{ name: 'findMasterByWa', kind: 'direct', symKey: 3 }]),
      ],
    });
    // the cv edge binds only APPLY_WA_COLS, so cv's same-named export never counts
    expect(importTargetsOf(index, 2, 'findMasterByWa').map((s) => s.id)).toEqual(['sym:repo#findMasterByWa']);
    const view = resolveAt(index, 'svc.ts', 0, 12);
    expect(view.resolved?.symId).toBe('sym:repo#findMasterByWa');
    expect(view.resolved?.resolvedVia).toBe('import');
    expect(importSitesOf(index, index.symbolById.get('sym:repo#findMasterByWa')!).map((s) => s.file)).toEqual(['svc.ts']);
    expect(importSitesOf(index, index.symbolById.get('sym:cv#findMasterByWa')!)).toEqual([]); // audit over-report gone
  });

  it('renamed imports chase the preserved source export name', () => {
    const greet = defRow('sym:a#greet', 1, 0, 'greet', 0);
    const hi = bindingRow('sym:b#hi', 2, 1, 'hi', 9);
    const index = mkDoc([greet, hi], [], {
      files: [f(0, 'a.ts'), f(1, 'b.ts')],
      importEdges: [be(1, 0, [{ local: 'hi', imported: 'greet', shape: 'named' }])],
      exportSurfaces: [surface(0, [{ name: 'greet', kind: 'direct', symKey: 1 }])],
    });
    expect(importTargetsOf(index, 1, 'hi').map((s) => s.id)).toEqual(['sym:a#greet']);
    const view = resolveAt(index, 'b.ts', 0, 10);
    expect(view.resolved?.symId).toBe('sym:a#greet');
    expect(view.resolved?.resolvedVia).toBe('import');
  });

  it('a renamed local colliding with an unrelated export of the module chases the real name', () => {
    const greet = defRow('sym:a#greet', 1, 0, 'greet', 0);
    const hiDef = defRow('sym:a#hi', 2, 1, 'hi', 30);
    const hiBinding = bindingRow('sym:b#hi', 3, 1, 'hi', 9);
    const index = mkDoc([greet, hiDef, hiBinding], [], {
      files: [f(0, 'a.ts'), f(1, 'b.ts')],
      importEdges: [be(1, 0, [{ local: 'hi', imported: 'greet', shape: 'named' }])],
      exportSurfaces: [surface(0, [{ name: 'greet', kind: 'direct', symKey: 1 }, { name: 'hi', kind: 'direct', symKey: 2 }])],
    });
    expect(importTargetsOf(index, 1, 'hi').map((s) => s.id)).toEqual(['sym:a#greet']); // never a#hi
    const view = resolveAt(index, 'b.ts', 0, 10);
    expect(view.resolved?.symId).toBe('sym:a#greet');
  });

  it('default and namespace bindings are never chased - the local binding stands', () => {
    const main = defRow('sym:a#main', 1, 0, 'main', 0);
    const defB = bindingRow('sym:b#main', 2, 1, 'main', 9);
    const indexD = mkDoc([main, defB], [], {
      files: [f(0, 'a.ts'), f(1, 'b.ts')],
      importEdges: [be(1, 0, [{ local: 'main', imported: 'default', shape: 'default' }])],
      exportSurfaces: [surface(0, [{ name: 'main', kind: 'direct', symKey: 1 }])],
    });
    expect(importTargetsOf(indexD, 1, 'main')).toEqual([]); // surface HAS the name; shape blocks it
    const viewD = resolveAt(indexD, 'b.ts', 0, 11);
    expect(viewD.resolved?.symId).toBe('sym:b#main');
    const ns = defRow('sym:a#ns', 3, 0, 'ns', 0);
    const nsB = bindingRow('sym:b#ns', 4, 1, 'ns', 9);
    const indexN = mkDoc([ns, nsB], [], {
      files: [f(0, 'a.ts'), f(1, 'b.ts')],
      importEdges: [be(1, 0, [{ local: 'ns', shape: 'namespace' }])],
      exportSurfaces: [surface(0, [{ name: 'ns', kind: 'direct', symKey: 3 }])],
    });
    expect(importTargetsOf(indexN, 1, 'ns')).toEqual([]);
    const viewN = resolveAt(indexN, 'b.ts', 0, 10);
    expect(viewN.resolved?.symId).toBe('sym:b#ns');
  });

  it('legacy snapshots without bindings fall back to name-only and stay conservative', () => {
    const cvFmbw = defRow('sym:cv#findMasterByWa', 2, 0, 'findMasterByWa', 30);
    const repoFmbw = defRow('sym:repo#findMasterByWa', 3, 1, 'findMasterByWa', 0);
    const svcBinding = bindingRow('sym:svc#findMasterByWa', 4, 2, 'findMasterByWa', 9);
    const index = mkDoc([cvFmbw, repoFmbw, svcBinding], [], {
      files: [f(0, 'cv.ts'), f(1, 'repo.ts'), f(2, 'svc.ts')],
      importEdges: [edge(2, 0, EdgeType.Imports, './cv'), edge(2, 1, EdgeType.Imports, './repo')],
      exportSurfaces: [
        surface(0, [{ name: 'findMasterByWa', kind: 'direct', symKey: 2 }]),
        surface(1, [{ name: 'findMasterByWa', kind: 'direct', symKey: 3 }]),
      ],
    });
    expect(importTargetsOf(index, 2, 'findMasterByWa').map((s) => s.id).sort()).toEqual(['sym:cv#findMasterByWa', 'sym:repo#findMasterByWa']);
    const view = resolveAt(index, 'svc.ts', 0, 12);
    expect(view.resolved?.symId).toBe('sym:svc#findMasterByWa'); // ambiguous: local binding stays
    expect(view.resolved?.resolvedVia).toBe('declaration');
    // strict site policy: neither def claims an ambiguous importer
    expect(importSitesOf(index, index.symbolById.get('sym:cv#findMasterByWa')!)).toEqual([]);
    expect(importSitesOf(index, index.symbolById.get('sym:repo#findMasterByWa')!)).toEqual([]);
  });
  it('a renamed importer is a site of the definition - used and unused', () => {
    const greet = defRow('sym:a#greet', 1, 0, 'greet', 0);
    const hiB = bindingRow('sym:b#hi', 2, 1, 'hi', 9); // unused rename
    const hiC = bindingRow('sym:c#hi', 3, 2, 'hi', 9); // used rename (has a ref below)
    const plainD = bindingRow('sym:d#greet', 4, 3, 'greet', 9); // plain same-name import
    const index = mkDoc(
      [greet, hiB, hiC, plainD],
      [{ fileIdx: 2, symKey: 1, role: 1, resolvedVia: 'import', range: { startLine: 2, startChar: 4, endLine: 2, endChar: 6, start: 404, end: 406 } }],
      {
        files: [f(0, 'a.ts'), f(1, 'b.ts'), f(2, 'c.ts'), f(3, 'd.ts')],
        importEdges: [
          be(1, 0, [{ local: 'hi', imported: 'greet', shape: 'named' }], './a'),
          be(2, 0, [{ local: 'hi', imported: 'greet', shape: 'named' }], './a'),
          be(3, 0, [{ local: 'greet', imported: 'greet', shape: 'named' }], './a'),
        ],
        exportSurfaces: [surface(0, [{ name: 'greet', kind: 'direct', symKey: 1 }])],
      },
    );
    const aGreet = index.symbolById.get('sym:a#greet')!;
    const sites = importSitesOf(index, aGreet);
    expect(sites.map((s) => s.file)).toEqual(['b.ts', 'c.ts', 'd.ts']); // renamed (used AND unused) + plain
    expect(sites.every((s) => s.decls.length === 1 && s.decls[0].c === 9)).toBe(true); // specifier decl positions
    const view = refsOf(index, 'sym:a#greet');
    expect(view.imports.map((s) => s.file)).toEqual(['b.ts', 'c.ts', 'd.ts']);
    expect(view.references.some((r) => r.file === 'c.ts')).toBe(true); // the use site still lists as a ref
  });

  it('default and namespace importers are never sites', () => {
    const main = defRow('sym:a#main', 1, 0, 'main', 0);
    const nsDef = defRow('sym:a#ns', 2, 0, 'ns', 30);
    const defB = bindingRow('sym:b#main', 3, 1, 'main', 9); // default import, local coincidentally 'main'
    const nsC = bindingRow('sym:c#ns', 4, 2, 'ns', 9); // namespace import
    const index = mkDoc([main, nsDef, defB, nsC], [], {
      files: [f(0, 'a.ts'), f(1, 'b.ts'), f(2, 'c.ts')],
      importEdges: [
        be(1, 0, [{ local: 'main', imported: 'default', shape: 'default' }], './a'),
        be(2, 0, [{ local: 'ns', shape: 'namespace' }], './a'),
      ],
      exportSurfaces: [surface(0, [{ name: 'main', kind: 'direct', symKey: 1 }, { name: 'ns', kind: 'direct', symKey: 2 }])],
    });
    expect(importSitesOf(index, index.symbolById.get('sym:a#main')!)).toEqual([]);
    expect(importSitesOf(index, index.symbolById.get('sym:a#ns')!)).toEqual([]);
  });

  it('legacy edges (no bindings): a same-name importer is still a site via the name-only inversion', () => {
    const greet = defRow('sym:a#greet', 1, 0, 'greet', 0);
    const b = bindingRow('sym:b#greet', 2, 1, 'greet', 9);
    const index = mkDoc([greet, b], [], {
      files: [f(0, 'a.ts'), f(1, 'b.ts')],
      importEdges: [edge(1, 0, EdgeType.Imports, './a')], // no bindings = legacy snapshot
      exportSurfaces: [surface(0, [{ name: 'greet', kind: 'direct', symKey: 1 }])],
    });
    expect(importSitesOf(index, index.symbolById.get('sym:a#greet')!).map((s) => s.file)).toEqual(['b.ts']);
    // legacy cannot claim a renamed importer (its local name is not the exported name)
    const hi = bindingRow('sym:c#hi', 3, 2, 'hi', 9);
    const legacy = mkDoc([greet, hi], [], {
      files: [f(0, 'a.ts'), f(1, 'c.ts')],
      importEdges: [edge(1, 0, EdgeType.Imports, './a')],
      exportSurfaces: [surface(0, [{ name: 'greet', kind: 'direct', symKey: 1 }])],
    });
    expect(importSitesOf(legacy, legacy.symbolById.get('sym:a#greet')!)).toEqual([]);
  });
});



describe('real-tree import linkage regressions (audit repros)', () => {
  it('service.ts findMasterByWa chases the repository def; cv def claims no false site', () => {
    const index = qindex();
    const svc = index.doc.files.find((f) => f.path.endsWith('contexts/master-data/service.ts'));
    expect(svc).toBeDefined();
    const svcIdx = svc!.idx;
    const binding = index.doc.symbols.find((s) => s.kind === SymbolKind.ImportBinding && s.name === 'findMasterByWa' && s.fileIdx === svcIdx);
    expect(binding).toBeDefined();
    const targets = importTargetsOf(index, svcIdx, 'findMasterByWa');
    expect(targets).toHaveLength(1);
    expect(targets[0].id).toBe('sym:netlify/functions/contexts/master-data/repository.ts#findMasterByWa');
    const d = binding!.decls[0];
    const view = resolveAt(index, svc!.path, d.startLine, d.startChar);
    expect(view.resolved?.symId).toBe('sym:netlify/functions/contexts/master-data/repository.ts#findMasterByWa');
    expect(view.resolved?.resolvedVia).toBe('import');
    const repoDef = index.symbolById.get('sym:netlify/functions/contexts/master-data/repository.ts#findMasterByWa')!;
    expect(importSitesOf(index, repoDef).map((s) => s.file)).toContain(svc!.path);
    const cvDef = index.doc.symbols.find((s) => s.id === 'sym:netlify/functions/_lib/ai/cv.ts#findMasterByWa')!;
    expect(importSitesOf(index, cvDef).map((s) => s.file)).not.toContain(svc!.path);
  });

  it('a legacy snapshot (bindings stripped) keeps the conservative fallback on the real tree', () => {
    const index = qindex();
    const svc = index.doc.files.find((f) => f.path.endsWith('contexts/master-data/service.ts'))!;
    const clone = JSON.parse(JSON.stringify(index.doc)) as typeof index.doc;
    for (const e of clone.importEdges) delete (e as { bindings?: unknown }).bindings;
    const legacy = indexFromDoc(clone);
    const binding = legacy.doc.symbols.find((s) => s.kind === SymbolKind.ImportBinding && s.name === 'findMasterByWa' && s.fileIdx === svc.idx)!;
    const d = binding.decls[0];
    const view = resolveAt(legacy, svc.path, d.startLine, d.startChar);
    // The pre-drift-fix ambiguity (service also importing cv.ts, which exports a
    // same-named findMasterByWa) is gone: the only remaining edge exporting that
    // name is service -> repository, so even the name-only legacy fallback chases it.
    expect(view.resolved?.symId).toBe('sym:netlify/functions/contexts/master-data/repository.ts#findMasterByWa');
    expect(view.resolved?.resolvedVia).toBe('import');
    // Conservative rename boundary on the real tree: legacy cannot claim a renamed
    // importer (catalog/repository.ts binds mapForm as _mapForm) without bindings.
    const formsDef = legacy.doc.symbols.find((x) => x.id === 'sym:netlify/functions/_lib/db/forms.ts#mapForm')!;
    const catalogRepo = legacy.doc.files.find((x) => x.path.endsWith('contexts/catalog/repository.ts'))!;
    expect(importSitesOf(legacy, formsDef).map((s) => s.file)).not.toContain(catalogRepo.path);
    const cvDef = legacy.doc.symbols.find((s) => s.id === 'sym:netlify/functions/_lib/ai/cv.ts#findMasterByWa')!;
    expect(importSitesOf(legacy, cvDef).map((s) => s.file)).not.toContain(svc.path); // strict: no over-claim
  });

  it('renamed importers appear in their definition import sites (audit repro: 7-of-8 missing)', () => {
    const index = qindex();
    const formsDef = index.doc.symbols.find((x) => x.id === 'sym:netlify/functions/_lib/db/forms.ts#mapForm');
    expect(formsDef).toBeDefined();
    const catalogRepo = index.doc.files.find((x) => x.path.endsWith('contexts/catalog/repository.ts'))!;
    const sites = importSitesOf(index, formsDef!);
    const catSite = sites.find((x) => x.fileIdx === catalogRepo.idx);
    expect(catSite).toBeDefined(); // _mapForm -> mapForm now lists its specifier
    const bind = index.doc.symbols.find((x) => x.kind === SymbolKind.ImportBinding && x.fileIdx === catalogRepo.idx && x.name === '_mapForm');
    expect(bind).toBeDefined();
    expect(catSite!.decls[0].l).toBe(bind!.decls[0].startLine); // decl position is the specifier's
    const confSvc = index.doc.files.find((x) => x.path.endsWith('contexts/configuration/service.ts'))!;
    const presetsDef = index.doc.symbols.find((x) => x.id === 'sym:netlify/functions/contexts/configuration/repository.ts#getRincianPresets')!;
    expect(importSitesOf(index, presetsDef).map((x) => x.fileIdx)).toContain(confSvc.idx); // getRincianPresetsRepo
  });

  it('namespace-member call sites (masterData.fn) appear in refs and def chases (audit repro: surfaces/master.ts)', () => {
    const index = qindex();
    const def = index.doc.symbols.find((s) => s.id === 'sym:netlify/functions/contexts/master-data/service.ts#handleSubmitMasterForm');
    expect(def).toBeDefined();
    const memberSites = refsOf(index, def!.id).references.filter((r) => r.file.endsWith('surfaces/master.ts'));
    expect(memberSites.length).toBeGreaterThan(0);
    for (const site of memberSites) expect(site.role).toBe(5); // Property: member access on a namespace import
    const submit = memberSites.find((r) => r.line === 8); // submitMasterForm: (p, s) => masterData.handleSubmitMasterForm(...)
    expect(submit).toBeDefined();
    const view = resolveAt(index, submit!.file, submit!.line, submit!.char);
    expect(view.resolved?.symId).toBe(def!.id);
    expect(view.resolved?.resolvedVia).toBe('import');
  });
});
