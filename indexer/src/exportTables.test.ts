/**
 * exportTables.test.ts — Phase 3 exit criteria:
 *  - every export of all 15 `contexts/<ctx>/index.ts` barrels resolves to the
 *    symbol in the file that declares it (not the barrel),
 *  - `handleSubmitMasterForm as handleSimpanUpdateMaster` and
 *    `_mapForm as mapForm` unwrap correctly,
 *  - fixtures: multi-hop chains, export-star ambiguity + direct shadowing,
 *    cycle termination, export-star not re-exporting `default`, type-only.
 */

import { describe, expect, it } from 'vitest';
import type { SymbolNode } from '../../docs/code-index-schema.js';
import { bindIndex } from './bind.js';
import { buildIndex, type BuildResult } from './build.js';
import { buildExportSurfaces, createExportIndex, exportSymKey, fileIdxAtPath, type ExportIndex } from './exportTables.js';
import { buildModuleGraph } from './graph.js';
import type { ExportRecord, RawImportRecord } from './parse.js';
import { parseFile } from './parse.js';
import { createResolver } from './resolve.js';
import { fileIdx } from './util.js';

const ROOT = process.cwd().replace(/\\/g, '/');

let cached: BuildResult | null = null;
function built(): BuildResult {
  return (cached ??= buildIndex(ROOT));
}

function symByKey(r: BuildResult, key: number): SymbolNode | undefined {
  return r.symbols.find((s) => (s.key as unknown as number) === key);
}

/** Parse inline sources and wire Phase 2 + 3 over them (no disk access). */
function fx(sources: Record<string, string>): { index: ExportIndex; symbols: SymbolNode[]; files: Array<{ path: string; idx: ReturnType<typeof fileIdx> }> } {
  const paths = Object.keys(sources).sort();
  const files = paths.map((p, i) => ({ path: p, idx: fileIdx(i) }));
  const symbols: SymbolNode[] = [];
  const exportsByFile = new Map<ReturnType<typeof fileIdx>, ExportRecord[]>();
  const importsByFile = new Map<ReturnType<typeof fileIdx>, RawImportRecord[]>();
  for (let i = 0; i < paths.length; i++) {
    const parsed = parseFile({ fileIdx: fileIdx(i), path: paths[i], lang: 'ts', content: sources[paths[i]] });
    symbols.push(...parsed.symbols);
    exportsByFile.set(fileIdx(i), parsed.exports);
    importsByFile.set(fileIdx(i), parsed.imports);
  }
  const resolver = createResolver({ rootDir: 'fx', files });
  const surfaces = buildExportSurfaces({ files, symbols, exportsByFile, importsByFile, resolver });
  return { index: createExportIndex(surfaces), symbols, files };
}

/** Parse inline sources and run the full Phase 3 + 4 binder over them. */
function bindFx(sources: Record<string, string>): {
  refs: ReturnType<typeof bindIndex>['refs'];
  edges: ReturnType<typeof bindIndex>['edges'];
  unresolved: ReturnType<typeof bindIndex>['unresolved'];
  symbols: SymbolNode[];
  files: Array<{ path: string; idx: ReturnType<typeof fileIdx> }>;
} {
  const paths = Object.keys(sources).sort();
  const files = paths.map((p, i) => ({ path: p, idx: fileIdx(i) }));
  const symbols: SymbolNode[] = [];
  const scopes: Parameters<typeof bindIndex>[0]['scopes'] = [];
  const occurrences: Parameters<typeof bindIndex>[0]['occurrences'] = [];
  const exportsByFile = new Map<ReturnType<typeof fileIdx>, ExportRecord[]>();
  const importsByFile = new Map<ReturnType<typeof fileIdx>, RawImportRecord[]>();
  const allExports: ExportRecord[] = [];
  const allImports: RawImportRecord[] = [];
  for (let i = 0; i < paths.length; i++) {
    const parsed = parseFile({ fileIdx: fileIdx(i), path: paths[i], lang: 'ts', content: sources[paths[i]] });
    symbols.push(...parsed.symbols);
    scopes.push(...parsed.scopes);
    occurrences.push(...parsed.occurrences);
    allExports.push(...parsed.exports);
    allImports.push(...parsed.imports);
    exportsByFile.set(fileIdx(i), parsed.exports);
    importsByFile.set(fileIdx(i), parsed.imports);
  }
  const resolver = createResolver({ rootDir: 'fx', files });
  const pathByIdx = new Map(files.map((f) => [f.idx, f.path]));
  // The real pipeline's Phase 2 stage: the module graph owns resolution and
  // hands bindIndex its resolved records (parse records are never mutated).
  const graph = buildModuleGraph({
    importsByFile,
    exportsByFile,
    filePathOf: (idx) => pathByIdx.get(idx) ?? '',
    resolver,
  });
  const surfaces = buildExportSurfaces({ files, symbols, exportsByFile, importsByFile, resolver });
  const bound = bindIndex({
    symbols,
    scopes,
    occurrences,
    exportIndex: createExportIndex(surfaces),
    resolvedImports: graph.resolvedImports,
    resolvedReexports: graph.resolvedReexports,
    initTypes: new Map(),
    typeScopes: new Map(),
  });
  return { refs: bound.refs, edges: bound.edges, unresolved: bound.unresolved, symbols, files };
}

describe('fixtures', () => {
  it('resolves a 3-hop re-export chain to the declaring file', () => {
    const r = fx({
      'fx/d.ts': 'export function deep(x: number) { return x; }',
      'fx/c.ts': 'export { deep } from "./d";',
      'fx/b.ts': 'export { deep } from "./c";',
      'fx/a.ts': 'export { deep } from "./b";',
    });
    const a = fileIdxAtPath(r.files, 'fx/a.ts');
    const e = r.index.resolveExport(a, 'deep');
    expect(e?.kind).toBe('direct');
    const k = exportSymKey(e);
    if (k !== null) {
      const s = r.symbols.find((x) => x.key === k)!;
      expect(s.name).toBe('deep');
      expect(s.fileIdx).toBe(fileIdxAtPath(r.files, 'fx/d.ts'));
    }
  });

  it('unwraps a same-file alias export', () => {
    const r = fx({ 'fx/impl.ts': 'function _mapForm(x: string) { return x; }\nexport { _mapForm as mapForm };' });
    const f = fileIdxAtPath(r.files, 'fx/impl.ts');
    const e = r.index.resolveExport(f, 'mapForm');
    expect(e?.kind).toBe('alias');
    const k = exportSymKey(e);
    if (k !== null) {
      const s = r.symbols.find((x) => x.key === k)!;
      expect(s.name).toBe('_mapForm');
    }
  });

  it('chases type-only imports used in type position to the declaring file (wrong-hop fix)', () => {
    // use.ts references `AuthState` in a type position; the import is type-only
    // and re-exported through mid.ts — the binder must resolve the reference to
    // the interface declared in types.ts, not stop at a local import binding.
    const r = bindFx({
      'fx/types.ts': 'export interface AuthState { a: string }',
      'fx/mid.ts': 'import type { AuthState } from "./types";\nexport type { AuthState };',
      'fx/use.ts': 'import type { AuthState } from "./mid";\nexport type Wrap = { s: AuthState };',
    });
    const types = fileIdxAtPath(r.files, 'fx/types.ts');
    const iface = r.symbols.find((s) => s.kind === 4 /* SymbolKind.Interface */ && s.name === 'AuthState')!;
    const use = fileIdxAtPath(r.files, 'fx/use.ts');
    // The TypeRef occurrence of AuthState in use.ts must resolve to the
    // interface declared in types.ts — never to a local import binding.
    const chased = r.refs.find((ref) => ref.fileIdx === use && ref.symKey === iface.key);
    expect(chased).toBeDefined();
    expect(chased!.symKey).toBe(iface.key);
    expect(iface.fileIdx).toBe(types);
  });

  it('resolves a same-file export of an imported name through to the source (wrong-hop fix)', () => {
    // `import { deep } from './d'; export { deep };` — the export table must
    // NOT stop at the ImportBinding; it follows the import hop to d.ts (the
    // compiler's alias chain does the same). §13 differential validation.
    const r = fx({
      'fx/d.ts': 'export function deep(x: number) { return x; }',
      'fx/a.ts': 'import { deep } from "./d";\nexport { deep };',
    });
    const a = fileIdxAtPath(r.files, 'fx/a.ts');
    const d = fileIdxAtPath(r.files, 'fx/d.ts');
    const e = r.index.resolveExport(a, 'deep');
    expect(e?.kind).toBe('direct'); // flattened reExport jump
    const k = exportSymKey(e);
    if (k !== null) {
      const s = r.symbols.find((x) => x.key === k)!;
      expect(s.name).toBe('deep');
      expect(s.fileIdx).toBe(d); // declared in d.ts, not a.ts's import binding
    }
  });

  it('marks two export * sources ambiguous, never guessing', () => {
    const r = fx({
      'fx/b.ts': 'export const shared = "b"; export const onlyB = 1;',
      'fx/c.ts': 'export const shared = "c";',
      'fx/a.ts': 'export * from "./b";\nexport * from "./c";',
    });
    const a = fileIdxAtPath(r.files, 'fx/a.ts');
    const shared = r.index.resolveExport(a, 'shared');
    expect(shared?.kind).toBe('ambiguous');
    if (shared && shared.kind === 'ambiguous') {
      expect(shared.candidates).toHaveLength(2);
    }
    // unambiguous star name still resolves
    const onlyB = r.index.resolveExport(a, 'onlyB');
    expect(onlyB?.kind).toBe('direct');
  });

  it('lets an explicit export shadow export * sources (TS semantics)', () => {
    const r = fx({
      'fx/b.ts': 'export const shared = "b";',
      'fx/d.ts': 'export * from "./b";\nexport const shared = "d";',
    });
    const d = fileIdxAtPath(r.files, 'fx/d.ts');
    const e = r.index.resolveExport(d, 'shared');
    expect(e?.kind).toBe('direct');
    const k = exportSymKey(e);
    if (k !== null) {
      const s = r.symbols.find((x) => x.key === k)!;
      expect(s.decls[0].startLine).toBe(2); // 1-based line: the `export const shared = "d"` declaration
      expect(s.fileIdx).toBe(d);
    }
  });

  it('terminates on export * cycles and still resolves names through them', () => {
    const r = fx({
      'fx/x.ts': 'export * from "./y"; export const xonly = 1;',
      'fx/y.ts': 'export * from "./x"; export const yonly = 2;',
    });
    const x = fileIdxAtPath(r.files, 'fx/x.ts');
    const y = fileIdxAtPath(r.files, 'fx/y.ts');
    expect(r.index.resolveExport(x, 'nope')).toBeNull(); // must terminate
    const yonly = r.index.resolveExport(x, 'yonly');
    expect(yonly?.kind).toBe('direct');
    const k = exportSymKey(yonly);
    if (k !== null) {
      const s = r.symbols.find((z) => z.key === k)!;
      expect(s.fileIdx).toBe(y);
    }
  });

  it('does not re-export another module default via export *', () => {
    const r = fx({
      'fx/b.ts': 'export default class Foo {}\nexport const bar = 1;',
      'fx/a.ts': 'export * from "./b";',
    });
    const a = fileIdxAtPath(r.files, 'fx/a.ts');
    expect(r.index.resolveExport(a, 'default')).toBeNull();
    expect(r.index.resolveExport(a, 'bar')?.kind).toBe('direct');
  });

  it('resolves type-only re-exports to a typeOnly entry', () => {
    const r = fx({
      'fx/d.ts': 'export interface Shape { x: number }',
      'fx/b.ts': 'export type { Shape } from "./d";',
    });
    const b = fileIdxAtPath(r.files, 'fx/b.ts');
    const e = r.index.resolveExport(b, 'Shape');
    expect(e?.kind).toBe('typeOnly');
    const k = exportSymKey(e);
    if (k !== null) {
      const s = r.symbols.find((x) => x.key === k)!;
      expect(s.name).toBe('Shape');
      expect(s.fileIdx).toBe(fileIdxAtPath(r.files, 'fx/d.ts'));
    }
  });

  it('binds anonymous default function declarations', () => {
    const r = fx({ 'fx/m.ts': 'export default function () { return 1; }' });
    const m = fileIdxAtPath(r.files, 'fx/m.ts');
    const e = r.index.resolveExport(m, 'default');
    expect(e?.kind).toBe('default');
    const k = exportSymKey(e);
    if (k !== null) {
      const s = r.symbols.find((x) => x.key === k)!;
      expect(s.name).toBe('<anonymous>');
    }
  });

  it('binds a block-declared var through hoisting when referenced outside its block', () => {
    // `var` hoists to the enclosing function scope: the `return x` after the
    // if-block must bind to the block's `x`, not fall through to unresolved.
    const r = bindFx({
      'fx/h.ts': 'export function pick(c: boolean) { if (c) { var x = 1; } return x; }',
    });
    const x = r.symbols.find((s) => s.name === 'x')!;
    expect(x).toBeDefined();
    expect(r.refs.some((z) => z.symKey === x.key)).toBe(true);
    expect(r.unresolved.filter((u) => u.name === 'x')).toHaveLength(0);
  });

  it('does not leak a block-scoped class outside its block', () => {
    // Classes are never hoisted: `typeof K` after the if-block is a genuine
    // dangling reference (the compiler agrees — block scope), not a bind to
    // the inner class and not a leak to any outer symbol.
    const r = bindFx({
      'fx/k.ts': 'export function g(c: boolean) { if (c) { class K {} } return typeof K; }',
    });
    const u = r.unresolved.find((x) => x.name === 'K');
    expect(u).toBeDefined();
    expect(u!.reason).toBe('global-unknown');
  });

  it('attributes calls inside parameter defaults to the function, not the parameter', () => {
    const r = bindFx({
      'fx/p.ts': 'export function h(a = makeA()) { return a; }\nexport function makeA() { return 1; }',
    });
    const h = r.symbols.find((s) => s.name === 'h')!;
    const makeA = r.symbols.find((s) => s.name === 'makeA')!;
    const a = r.symbols.find((s) => s.name === 'a')!;
    expect(h).toBeDefined();
    expect(makeA).toBeDefined();
    expect(r.edges.some((e) => e.source === h.key && e.target === makeA.key && e.type === 7 /* Calls */)).toBe(true);
    expect(r.edges.some((e) => e.source === a.key)).toBe(false); // never the parameter
  });

  it('returns null for names a file does not export', () => {
    const r = fx({ 'fx/empty.ts': 'const local = 1;' });
    expect(r.index.resolveExport(fileIdxAtPath(r.files, 'fx/empty.ts'), 'local')).toBeNull();
  });
});

describe('real repo — 15 context barrels', () => {
  it('resolves every barrel export to a symbol in the declaring file (Phase 3 exit criterion)', () => {
    const r = built();
    const barrels = r.files.filter((f) => /^netlify\/functions\/contexts\/[^/]+\/index\.ts$/.test(f.path));
    // 14 -> 15 (2026-09-21): +1 — netlify/functions/contexts/contact/index.ts,
    // the barrel for the public contact form's context. It is a NEW context,
    // not a new file in an existing one, so this counter and the same
    // assertion in resolve.test.ts both move by one; they are two independent
    // measurements of the same fact, which is why both are updated rather than
    // one being derived from the other.
    expect(barrels).toHaveLength(15);

    const failures: string[] = [];
    let checked = 0;
    let landedOutside = 0;
    for (const b of barrels) {
      for (const rec of r.exports) {
        if (rec.fileIdx !== b.idx || !rec.from) continue;
        checked++;
        const entry = r.resolveExport(b.idx, rec.exportName);
        if (!entry) failures.push(`${b.path}: ${rec.exportName} → null`);
        else if (entry.kind === 'ambiguous') failures.push(`${b.path}: ${rec.exportName} → ambiguous`);
        else {
          const k = exportSymKey(entry);
          const s = k !== null ? symByKey(r, k as unknown as number) : undefined;
          if (k === null || !s) failures.push(`${b.path}: ${rec.exportName} → dangling symKey`);
          else if (s.fileIdx !== b.idx) landedOutside++;
        }
      }
    }
    expect(failures).toEqual([]);
    expect(checked).toBeGreaterThan(60);
    expect(landedOutside).toBeGreaterThan(60);
  });

  it('master-data findMasterByWa → repository.ts (design §8.1 example)', () => {
    const r = built();
    const barrel = r.files.find((f) => f.path === 'netlify/functions/contexts/master-data/index.ts')!;
    const entry = r.resolveExport(barrel.idx, 'findMasterByWa');
    expect(entry?.kind).toBe('direct');
    const k = exportSymKey(entry);
    if (k !== null) {
      const s = symByKey(r, k as unknown as number)!;
      expect(s.id).toBe('sym:netlify/functions/contexts/master-data/repository.ts#findMasterByWa');
    }
  });

  it('handleSimpanUpdateMaster unwraps through the alias to service.ts', () => {
    const r = built();
    const barrel = r.files.find((f) => f.path === 'netlify/functions/contexts/master-data/index.ts')!;
    const entry = r.resolveExport(barrel.idx, 'handleSimpanUpdateMaster');
    expect(entry?.kind).toBe('direct');
    const k = exportSymKey(entry);
    if (k !== null) {
      const s = symByKey(r, k as unknown as number)!;
      expect(s.name).toBe('handleSubmitMasterForm');
      expect(s.id).toBe('sym:netlify/functions/contexts/master-data/service.ts#handleSubmitMasterForm');
    }
  });

  it('catalog mapForm resolves through the import re-export to the declaring file (§4.3, §13)', () => {
    // repository.ts: `import { …, mapForm as _mapForm } from '../../_lib/db/forms';
    // const mapForm = _mapForm; export { _mapForm as mapForm };` — the compiler
    // alias chain runs through to forms.ts, and so must the export table
    // (Phase 4 differential validation §13: stopping at the import binding is
    // a wrong import hop).
    const r = built();
    const repo = r.files.find((f) => f.path === 'netlify/functions/contexts/catalog/repository.ts')!;
    const forms = r.files.find((f) => f.path === 'netlify/functions/_lib/db/forms.ts')!;
    const entry = r.resolveExport(repo.idx, 'mapForm');
    expect(entry?.kind).toBe('direct'); // flattened reExport jump
    const k = exportSymKey(entry);
    if (k !== null) {
      const s = symByKey(r, k as unknown as number)!;
      expect(s.name).toBe('mapForm');
      expect(s.fileIdx).toBe(forms.idx); // the declaring function in _lib/db/forms.ts
    }
  });

  it('barrel export surfaces are reachable through the build result', () => {
    const r = built();
    const barrel = r.files.find((f) => f.path === 'netlify/functions/contexts/catalog/index.ts')!;
    const surface = r.exportSurfaces.get(barrel.idx)!;
    expect(surface.table.has('loadCandidatesUnik')).toBe(true);
    expect(surface.table.get('loadCandidatesUnik')?.kind).toBe('reExport');
  });
});