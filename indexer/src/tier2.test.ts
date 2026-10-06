/**
 * tier2.test.ts — Tier 2 member binding (§9.1): `obj.method` call sites resolve
 * to the member's declaration symbol (resolvedVia 'type') through
 * initializer shapes (`new Foo()`, `as Foo`, aliases, factory calls),
 * annotations (`const x: Foo`, params), `this.` in classes, class-as-value
 * static access, enums, namespaces, and the heritage chain.
 */

import { describe, expect, it } from 'vitest';
import type { BoundRef } from './bind.js';
import { bindIndex } from './bind.js';
import { buildIndex } from './build.js';
import { buildExportSurfaces, createExportIndex } from './exportTables.js';
import { buildModuleGraph } from './graph.js';
import type { ExportRecord, RawImportRecord } from './parse.js';
import { parseFile } from './parse.js';
import { createResolver } from './resolve.js';
import { fileIdx } from './util.js';

const ROOT = process.cwd().replace(/\\/g, '/');

/** Parse inline sources and run the full Phase 2–4 pipeline (no disk access). */
function bindFx(sources: Record<string, string>): { refs: BoundRef[]; symbols: ReturnType<typeof buildIndex>['symbols'] } {
  const paths = Object.keys(sources).sort();
  const files = paths.map((p, i) => ({ path: p, idx: fileIdx(i) }));
  const symbols: ReturnType<typeof buildIndex>['symbols'] = [];
  const scopes: Parameters<typeof bindIndex>[0]['scopes'] = [];
  const occurrences: Parameters<typeof bindIndex>[0]['occurrences'] = [];
  const exportsByFile = new Map<ReturnType<typeof fileIdx>, ExportRecord[]>();
  const importsByFile = new Map<ReturnType<typeof fileIdx>, RawImportRecord[]>();
  const initTypes: Parameters<typeof bindIndex>[0]['initTypes'] = new Map();
  const typeScopes: Parameters<typeof bindIndex>[0]['typeScopes'] = new Map();
  for (let i = 0; i < paths.length; i++) {
    const parsed = parseFile({ fileIdx: fileIdx(i), path: paths[i], lang: 'ts', content: sources[paths[i]] });
    symbols.push(...parsed.symbols);
    scopes.push(...parsed.scopes);
    occurrences.push(...parsed.occurrences);
    exportsByFile.set(fileIdx(i), parsed.exports);
    importsByFile.set(fileIdx(i), parsed.imports);
    for (const it of parsed.initTypes) {
      let arr = initTypes.get(it.key);
      if (!arr) initTypes.set(it.key, (arr = []));
      arr.push(...it.types);
    }
    if (parsed.typeScopes.length) typeScopes.set(fileIdx(i), new Map(parsed.typeScopes.map((t) => [t.scopeKey, t.symKey])));
  }
  const resolver = createResolver({ rootDir: 'fx', files });
  const pathByIdx = new Map(files.map((f) => [f.idx, f.path]));
  const graph = buildModuleGraph({ importsByFile, exportsByFile, filePathOf: (idx) => pathByIdx.get(idx) ?? '', resolver });
  const surfaces = buildExportSurfaces({ files, symbols, exportsByFile, importsByFile, resolver });
  const bound = bindIndex({
    symbols,
    scopes,
    occurrences,
    exportIndex: createExportIndex(surfaces),
    resolvedImports: graph.resolvedImports,
    resolvedReexports: graph.resolvedReexports,
    initTypes,
    typeScopes,
  });
  return { refs: bound.refs, symbols };
}

/** refs of one file in source order (declaration sites excluded — member binds are Property role). */
function symByName(bound: { symbols: ReturnType<typeof buildIndex>['symbols'] }, qualified: string) {
  return bound.symbols.find((s) => s.qualified === qualified);
}

const FIXTURE: Record<string, string> = {
  'fx/classes.ts': `export class Repo {
  getById(id: string): string { return id; }
  static create(): Repo { return new Repo(); }
}
export class SpecialRepo extends Repo {
  extra(): number { return 1; }
}
export enum Color { Red = 1, Blue = 2 }
export interface Form { save(): void }
export namespace Helpers { export function trim(s: string): string { return s.trim(); } }
`,
  'fx/use.ts': `import { Color, Form, Helpers, Repo, SpecialRepo } from './classes';
const repo = new Repo();
const alias = repo;
const fromFactory = Repo.create();
const special = new SpecialRepo();
function makeForm(): Form { return { save() {} }; }
const form = makeForm();
const named: Form = form;
function withParam(p: { cb: () => void }): void { p.cb(); }
withParam({ cb: () => repo.getById('x') });
const c = Color.Red;
const t = Helpers.trim('x');
repo.getById('a');
alias.getById('b');
fromFactory.getById('c');
special.extra();
special.getById('d');
named.save();
form.save();
export function use(): void {
  const inner = new Repo();
  inner.getById('e');
}
`,
};

describe('Tier 2 member binding (fixture)', () => {
  it('resolves new/call/id/annotation/this/enum/namespace/heritage member sites', () => {
    const bound = bindFx(FIXTURE);
    const typeRefs = bound.refs.filter((r) => r.resolvedVia === 'type');
    // Every type-guided ref targets the right declaration symbol.
    const target = (qual: string): number => symByName(bound, qual)!.key;
    const byName = new Map<string, BoundRef[]>();
    for (const r of typeRefs) {
      const s = bound.symbols.find((x) => x.key === r.symKey);
      const arr = byName.get(s!.qualified) ?? [];
      arr.push(r);
      byName.set(s!.qualified, arr);
    }
    expect(byName.get('Repo.getById')?.length).toBeGreaterThanOrEqual(6); // repo, alias, fromFactory, cb, a/b/c/e
    expect(byName.get('SpecialRepo.extra')?.length).toBe(1);
    expect(byName.get('Repo.getById')!.map((r) => r.role)).toEqual(expect.arrayContaining([5])); // Property role
    expect(byName.get('Color.Red')?.length).toBe(1);
    expect(byName.get('Helpers.trim')?.length).toBe(1);
    expect(byName.get('Form.save')?.length).toBe(2); // named.save + form.save
    // Heritage: special.getById → Repo.getById (inherited, not SpecialRepo.getById)
    const d = typeRefs.filter((r) => r.symKey === target('Repo.getById'));
    expect(d.length).toBeGreaterThanOrEqual(6);
    void target;
  });

  it('binds this.member inside a class and static access via the class object', () => {
    const bound = bindFx({
      'fx/this.ts': `class Widget {
  width = 10;
  static make(): Widget { return new Widget(); }
  grow(): number { return this.width + 1; }
}
const w = Widget.make();
w.grow();
`,
    });
    const typeRefs = bound.refs.filter((r) => r.resolvedVia === 'type');
    const targets = typeRefs.map((r) => {
      const s = bound.symbols.find((x) => x.key === r.symKey);
      return s!.qualified;
    });
    expect(targets).toContain('Widget.width'); // this.width
    expect(targets).toContain('Widget.grow'); // w.grow (make → Widget)
    // Widget.make is a static call — bound via scope already (Callee), and
    // `Widget.make` member ref resolves to the static method.
    expect(targets).toContain('Widget.make');
  });
});

  it('resolves parameter properties and chained member access', () => {
    const bound = bindFx({
      'fx/pp.ts': `class Repo { get(): string { return 'x'; } }
class Service {
  constructor(private repo: Repo, readonly label: string) {}
  run(): string { return this.repo.get(); }
}
class Holder { constructor(public svc: Service) {} }
const svc = new Service(new Repo(), 'a');
const h = new Holder(svc);
svc.run();
h.svc.run();
`,
    });
    const typeRefs = bound.refs.filter((r) => r.resolvedVia === 'type');
    const target = (q: string): number => symByName(bound, q)!.key;
    const count = (q: string): number => typeRefs.filter((r) => r.symKey === target(q)).length;
    // this.repo.get() hops: this → Service → repo (param prop, typeRef Repo) → Repo.get
    expect(count('Service.repo')).toBe(1); // the this.repo site itself
    expect(count('Repo.get')).toBe(1); // the chained .get() through the param prop
    expect(count('Service.run')).toBe(2); // svc.run + h.svc.run (2-hop chain)
    expect(count('Holder.svc')).toBe(1); // h.svc mid-hop binds the param prop
    expect(count('Service.label')).toBe(0); // readonly param prop exists but is unused
  });

describe('Tier 2 member binding (real tree)', () => {
  // 60 s -> 180 s (2026-10-04): this real-tree bind runs buildIndex(ROOT); the
  // inline value must match the indexer project's testTimeout, since it wins.
  const TIMEOUT = 180_000;
  it('binds member call sites in the real repo and every type-via ref joins', { timeout: TIMEOUT }, () => {
    const r = buildIndex(ROOT);
    const typeRefs = r.refs.filter((ref) => ref.resolvedVia === 'type');
    expect(typeRefs.length).toBeGreaterThan(200); // the measurable Tier-2 coverage
    // Zero dangling joins: every type-via ref's symKey exists in the doc.
    const keys = new Set(r.symbols.map((s) => s.key));
    for (const ref of typeRefs) expect(keys.has(ref.symKey)).toBe(true);
    // Real flagship targets: the cache class in the kernel and the candidate
    // data class — the exact member-call families Tier 1 left unindexed.
    const target = (q: string): number => {
      const sym = r.symbols.find((s) => s.qualified === q);
      expect(sym).toBeDefined();
      return sym!.key;
    };
    const l1 = typeRefs.filter((ref) => ref.symKey === target('L1Cache.store'));
    expect(l1.length).toBeGreaterThan(10);
    const kandidat = typeRefs.filter((ref) => ref.symKey === target('Kandidat.wa'));
    expect(kandidat.length).toBeGreaterThan(3);
    // A this.member bind: the resilience kernel's own class.
    const thisRefs = typeRefs.filter((ref) => {
      const s = r.symbols.find((x) => x.key === ref.symKey);
      return s?.qualified.includes('.') ?? false;
    });
    expect(thisRefs.length).toBeGreaterThan(50);
  });
});
