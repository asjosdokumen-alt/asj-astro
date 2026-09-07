/**
 * deep-tier.test.ts — the checker-backed member tier (§9.1, row-9 remainder).
 * buildIndex defaults the tier ON (deep): light-unbound Property occurrences
 * the compiler resolves to an indexed declaration join r.refs with
 * resolvedVia 'type' + deep: true. Pins: real-tree deep refs exist and join
 * honestly (symbol exists, name matches the member, no offset collision with
 * light refs), deterministic across builds, dump round-trip keeps the deep
 * flag; degradation: a tsconfig-less root yields zero deep refs without
 * throwing; watch's opt-out ({ deep: false }) yields none.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildIndex } from './build.js';
import { dumpDoc, loadSnapshot } from './dump.js';
import { impactReport, indexFromDoc, libTargetsOf, refsOf, refsOfLib, resolveAt } from './query.js';
import { OccurrenceRole, ScopeKind, SymbolKind, type Occurrence } from '../../docs/code-index-schema.js';

const ROOT = process.cwd().replace(/\\/g, '/');

function occByName(occurrences: Occurrence[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const o of occurrences) if (o.role === OccurrenceRole.Property) m.set(`${o.fileIdx}:${o.range.start}`, o.name);
  return m;
}

describe('deep tier (checker-backed member bind)', () => {
  it('real tree: deep refs exist, join indexed symbols with matching names, and never collide with light refs', () => {
    const r = buildIndex(ROOT);
    const light = r.refs.filter((z) => !z.deep);
    const deep = r.refs.filter((z) => z.deep);
    expect(deep.length).toBeGreaterThan(50); // sample sized 80 on 25 files; full tree more
    const syms = new Set(r.symbols.map((s) => s.key));
    const occName = occByName(r.occurrences);
    const lightStart = new Set(light.map((z) => `${z.fileIdx}:${z.range.start}`));
    for (const z of deep) {
      expect(syms.has(z.symKey)).toBe(true); // no dangling join
      expect(z.resolvedVia).toBe('type');
      expect(z.role).toBe(OccurrenceRole.Property);
      expect(lightStart.has(`${z.fileIdx}:${z.range.start}`)).toBe(false); // no double-bind
      const sym = r.symbols.find((s) => s.key === z.symKey)!;
      const member = occName.get(`${z.fileIdx}:${z.range.start}`);
      expect(member).toBeDefined();
      expect(sym.name).toBe(member); // never a guess: name must match
    }
    // Lib tier: thousands of checker-confirmed lib refs, the value bucket
    // fully graduated (CJS module-wrapper vars + the Astro global via
    // canonical framework entries), Property rows carrying the member name.
    expect(r.libRefs.length).toBeGreaterThan(1000);
    expect(r.stats.libRefCount).toBe(r.libRefs.length);
    for (const z of r.libRefs) {
      expect(z.libId.length).toBeGreaterThan(0);
      expect(z.libName.length).toBeGreaterThan(0);
      const m = occName.get(`${z.fileIdx}:${z.range.start}`);
      if (m !== undefined) expect(m).toBe(z.name); // member rows match the site
    }
    // Residual bucket closed outside test files — see build.test.ts for the two
    // known test-only indexer gaps (shorthand lib globals, ambient lib types).
    const prodResidual = r.unresolvedRefs.filter(
      (u) => u.reason === 'lib-not-loaded' && !/\.test\.(ts|tsx)$/.test(r.files[u.fileIdx].path),
    );
    expect(
      prodResidual.map((u) => `${r.files[u.fileIdx].path}:${u.range.startLine} ${u.name}`),
    ).toEqual([]);
    // Framework rows graduate to canonical declarations (@types/node CJS
    // wrapper vars, astro's AstroGlobal) with scanned decl positions.
    const fx = r.libRefs.filter((z) => z.framework === true);
    expect(fx.length).toBeGreaterThanOrEqual(2);
    for (const z of fx) expect(z.decl).toBeDefined();
    expect(r.stats.stageMs.deep).toBeGreaterThan(0);
  }, 120000);

  it('deterministic: two builds emit the same deep refs and lib refs', () => {
    const a = buildIndex(ROOT);
    const b = buildIndex(ROOT);
    const keysA = a.refs.filter((z) => z.deep).map((z) => `${z.fileIdx}:${z.range.start}:${z.symKey}`);
    const keysB = b.refs.filter((z) => z.deep).map((z) => `${z.fileIdx}:${z.range.start}:${z.symKey}`);
    expect(keysA).toEqual(keysB);
    const libA = a.libRefs.map((z) => `${z.fileIdx}:${z.range.start}:${z.libId}:${z.libName}`);
    const libB = b.libRefs.map((z) => `${z.fileIdx}:${z.range.start}:${z.libId}:${z.libName}`);
    expect(libA).toEqual(libB);
  }, 120000);

  it('dump round-trip keeps the deep flag and lib refs (additive contract)', () => {
    const r = buildIndex(ROOT);
    const doc = dumpDoc(r);
    expect(doc.refs.some((z) => z.deep === true)).toBe(true);
    expect(doc.libRefs.length).toBe(r.libRefs.length);
    expect(doc.stats.libRefCount).toBe(r.libRefs.length);
    const libIdx = new Set(doc.libs.map((l) => l.idx));
    for (const z of doc.libRefs) expect(libIdx.has(z.libIdx)).toBe(true); // no dangling lib join
    const path = join(tmpdir(), `idx-deep-${process.pid}-${Date.now()}.json`);
    writeFileSync(path, JSON.stringify(doc), 'utf8');
    const loaded = loadSnapshot(path);
    expect(loaded.refs.filter((z) => z.deep === true).length).toBe(doc.refs.filter((z) => z.deep === true).length);
    expect(loaded.libRefs.length).toBe(doc.libRefs.length);
  }, 120000);

  it('def/hover on a lib ref answers with the lib declaration file + line (resolvedVia lib)', () => {
    const r = buildIndex(ROOT);
    const q = indexFromDoc(dumpDoc(r));
    const row = r.libRefs.find((z) => z.decl !== undefined);
    expect(row).toBeDefined();
    const site = r.files[row!.fileIdx as unknown as number];
    const view = resolveAt(q, site.path, row!.range.startLine, row!.range.startChar);
    expect(view.fileFound).toBe(true);
    expect(view.resolved).not.toBeNull();
    expect(view.resolved!.resolvedVia).toBe('lib');
    expect(view.resolved!.decls).toHaveLength(1);
    // The answer points into the declaration file: uri ends with the lib id and
    // the line equals the scanned declaration position inside the lib file.
    const abs = row!.libId.includes('node_modules/') || /^[a-zA-Z]:/.test(row!.libId) ? row!.libId : `node_modules/${row!.libId}`;
    expect(view.resolved!.decls[0].uri.endsWith(abs)).toBe(true);
    expect(view.resolved!.decls[0].l).toBe(row!.decl!.line);
  }, 120000);

  it('lib tier binds lib globals and members on a tsconfig fixture (never a guess)', () => {
    const fx = mkdtempSync(join(tmpdir(), 'idx-lib-fx-'));
    writeFileSync(join(fx, '.gitignore'), 'node_modules/\n', 'utf8');
    writeFileSync(
      join(fx, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', lib: ['ES2022', 'DOM'], strict: true, skipLibCheck: true, types: [] } }),
      'utf8',
    );
    mkdirSync(join(fx, 'src'), { recursive: true });
    writeFileSync(
      join(fx, 'src', 'a.ts'),
      ['const s: string = String(1);', 'const p: unknown = JSON.parse("{}");', 'console.log(s);', 'document.createElement("div");', 'export const x = p;'].join('\n'),
      'utf8',
    );
    const r = buildIndex(fx);
    const names = r.libRefs.map((z) => `${z.name}@${z.libName}`).sort();
    expect(names).toContain('String@String'); // value bucket graduated
    expect(names).toContain('JSON@JSON');
    expect(names).toContain('console@console');
    expect(names.some((n) => n === 'log@Console.log')).toBe(true); // member bind
    expect(names.some((n) => n === 'createElement@Document.createElement')).toBe(true);
    expect(r.unresolvedRefs.filter((u) => u.reason === 'lib-not-loaded')).toHaveLength(0);
    // Declaration-backed rows carry the real decl position inside the lib file
    // (the def/hover target) — the fixture's lib program resolves against the
    // installed typescript libs.
    const stringRow = r.libRefs.find((z) => z.name === 'String');
    expect(stringRow?.decl).toBeDefined();
    expect(stringRow?.decl!.line).toBeGreaterThan(0);
  }, 120000);

  it('cross-file declaration merging: interface+interface members bind ONE deterministic symbol', () => {
    // Two import-free .ts files are global scripts, so `interface MergeMe`
    // declared in each MERGES in the compiler's model; the overloaded method
    // `m` has one declaration in each file. A member access in a third file
    // (where no local MergeMe exists — the light tier cannot bind it) must
    // deep-join ONE indexed symbol from the site's own declaration set,
    // deterministically across builds — never split, never guessed.
    const fx = mkdtempSync(join(tmpdir(), 'idx-merge-fx-'));
    writeFileSync(join(fx, '.gitignore'), 'node_modules/\n', 'utf8');
    writeFileSync(
      join(fx, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', strict: true, skipLibCheck: true, types: [] } }),
      'utf8',
    );
    mkdirSync(join(fx, 'src'), { recursive: true });
    writeFileSync(join(fx, 'src', 'f1.ts'), ['interface MergeMe { shared: string; m(x: string): string }', 'declare const gm: MergeMe;'].join('\n') + '\n', 'utf8');
    writeFileSync(join(fx, 'src', 'f2.ts'), 'interface MergeMe { b: number; m(x: number): string }\n', 'utf8');
    writeFileSync(join(fx, 'src', 'f3.ts'), ['const s: string = gm.m("a");', 'const n: number = gm.b;', 'export const both = [s, n];'].join('\n') + '\n', 'utf8');
    const mk = () => buildIndex(fx);
    const a = mk();
    const b = mk();
    const f3a = a.files.find((f) => f.path === 'src/f3.ts');
    const occName = (r: typeof a) => {
      const m = new Map<string, string>();
      for (const o of r.occurrences) if (o.role === OccurrenceRole.Property) m.set(`${o.fileIdx}:${o.range.start}`, o.name);
      return m;
    };
    const nameAt = occName(a);
    const f3Idx = f3a!.idx as unknown as number;
    const mRefs = a.refs.filter((z) => z.fileIdx === f3Idx && nameAt.get(`${z.fileIdx}:${z.range.start}`) === 'm');
    const bRefs = a.refs.filter((z) => z.fileIdx === f3Idx && nameAt.get(`${z.fileIdx}:${z.range.start}`) === 'b');
    expect(mRefs.length).toBe(1); // the merged overload binds exactly one symbol
    expect(bRefs.length).toBe(1);
    expect(mRefs[0].deep).toBe(true);
    expect(bRefs[0].deep).toBe(true);
    const mSym = a.symbols.find((s) => s.key === mRefs[0].symKey)!;
    expect(mSym.name).toBe('m'); // never a guess: the joined symbol carries the member name
    expect(mSym.qualified).toBe('MergeMe.m');
    // The merged join records its sibling declaration key (the overload in
    // the other file), and def/hover at the site shows BOTH declaration
    // sites — one per file.
    expect(mRefs[0].merged).toHaveLength(1);
    const sibling = a.symbols.find((s) => s.key === mRefs[0].merged![0])!;
    expect(sibling.qualified).toBe('MergeMe.m');
    expect(sibling.fileIdx).not.toBe(mSym.fileIdx);
    const qa = indexFromDoc(dumpDoc(a));
    const va = resolveAt(qa, 'src/f3.ts', mRefs[0].range.startLine, mRefs[0].range.startChar);
    expect(va.resolved!.decls).toHaveLength(2);
    const uris = va.resolved!.decls.map((d) => d.uri).sort();
    expect(uris[0]).toBe('src/f1.ts');
    expect(uris[1]).toBe('src/f2.ts');
    // Deterministic across builds: same site, same target key.
    const mAt = `${mRefs[0].fileIdx}:${mRefs[0].range.start}`;
    const bAt = `${bRefs[0].fileIdx}:${bRefs[0].range.start}`;
    expect(a.refs.find((z) => `${z.fileIdx}:${z.range.start}` === mAt)!.symKey).toBe(b.refs.find((z) => `${z.fileIdx}:${z.range.start}` === mAt)!.symKey);
    expect(a.refs.find((z) => `${z.fileIdx}:${z.range.start}` === bAt)!.symKey).toBe(b.refs.find((z) => `${z.fileIdx}:${z.range.start}` === bAt)!.symKey);
    // Symbol detail: the merged interface + members carry their declaration's
    // first source line as the def/hover signature, and the dump keeps it.
    const f1 = a.symbols.find((s) => s.qualified === 'MergeMe' && s.fileIdx === (a.files.find((f) => f.path === 'src/f1.ts')!.idx as unknown as number))!;
    expect(f1.detail).toContain('interface MergeMe');
    const doc = dumpDoc(a);
    expect(doc.symbols.find((s) => s.id === f1.id)!.detail).toBe(f1.detail);
  }, 120000);

  it('real tree: def/hover at a merged site shows every declaration site across files', () => {
    const r = buildIndex(ROOT);
    const q = indexFromDoc(dumpDoc(r));
    const mergedRefs = r.refs.filter((z) => z.merged !== undefined && z.merged.length > 0);
    expect(mergedRefs.length).toBeGreaterThan(20); // union/intersection member sites on this tree
    // Every sibling key is a real indexed symbol of the same name (never a guess).
    const symOf = (k: number) => r.symbols.find((s) => s.key === k);
    for (const z of mergedRefs.slice(0, 40)) {
      const t = symOf(z.symKey)!;
      expect(t.name.length).toBeGreaterThan(0);
      for (const k of z.merged!) {
        const s = symOf(k);
        expect(s).toBeDefined();
        expect(s!.name).toBe(t.name);
      }
    }
    // Def on a merged site whose declarations span FILES (the
    // SessionPayload & { exp: number } intersection): the answer lists the
    // interface member (session.ts) AND the anonymous intersection member
    // (session.test.ts) — both declaration sites, two files.
    const cross = mergedRefs.find((z) => {
      const tFile = r.files[symOf(z.symKey)!.fileIdx]?.path;
      return z.merged!.some((k) => r.files[symOf(k)!.fileIdx]?.path !== tFile);
    });
    expect(cross).toBeDefined();
    const f = r.files[cross!.fileIdx];
    const v = resolveAt(q, f.path, cross!.range.startLine, cross!.range.startChar);
    expect(v.resolved).not.toBeNull();
    expect(v.resolved!.decls.length).toBeGreaterThanOrEqual(2);
    const declFiles = new Set(v.resolved!.decls.map((d) => d.uri));
    expect(declFiles.size).toBeGreaterThanOrEqual(2);
    expect([...declFiles].some((u) => u.endsWith('session.ts'))).toBe(true);
    expect([...declFiles].some((u) => u.endsWith('session.test.ts'))).toBe(true);
  }, 120000);

  it('lib name refs/impact: every usage site of console/String from the libRefs table, with detail on def/hover', () => {
    const r = buildIndex(ROOT);
    const q = indexFromDoc(dumpDoc(r));
    // idx refs console → the console target with every usage site.
    const targets = libTargetsOf(q, 'console');
    expect(targets.length).toBe(1);
    expect(targets[0].libName).toBe('console');
    expect(targets[0].sites.length).toBeGreaterThan(50);
    for (const z of targets[0].sites) expect(z.name).toBe('console');
    // RefView-shaped answer + impact report over the sites (file set = site files).
    const view = refsOfLib(q, targets[0]);
    const report = impactReport(view);
    expect(report.siteCount).toBe(targets[0].sites.length);
    expect(report.files.length).toBeGreaterThan(3);
    expect(report.symId).toBe(`lib:${targets[0].libIdx}:console`);
    // Qualified match: console.log → the Console.log member rows.
    const logTargets = libTargetsOf(q, 'console.log');
    expect(logTargets.some((t) => t.libName === 'Console.log')).toBe(true);
    // detail flows to def/hover (task: short signature, not a bare numeric kind).
    const withDecl = r.libRefs.find((z) => z.decl !== undefined && z.detail !== undefined)!;
    const site = r.files[withDecl.fileIdx as unknown as number];
    const v = resolveAt(q, site.path, withDecl.range.startLine, withDecl.range.startChar);
    expect(v.resolved!.detail).toBe(withDecl.detail);
    expect(v.resolved!.detail!.length).toBeGreaterThan(3);
    // Value rows too: String's lib declaration signature.
    expect(r.libRefs.filter((z) => z.name === 'String').every((z) => z.detail !== undefined)).toBe(true);
    // Symbols carry the declaration line as detail in the dump (additive).
    const symWithDetail = r.symbols.find((s) => s.detail !== undefined)!;
    expect(symWithDetail.detail!.length).toBeGreaterThan(0);
  }, 120000);

  it('degrades to zero deep refs on a tsconfig-less root (watch opt-out too)', () => {
    const fx = mkdtempSync(join(tmpdir(), 'idx-deep-fx-'));
    writeFileSync(join(fx, '.gitignore'), 'node_modules/\n', 'utf8');
    mkdirSync(join(fx, 'src'), { recursive: true });
    writeFileSync(join(fx, 'src', 'a.ts'), 'export class A { b(): number { return 1; } }\nexport const a = new A();\na.b();\n', 'utf8');
    const mk = (d: boolean) => buildIndex(fx, { deep: d });
    const off = mk(false);
    expect(off.refs.filter((z) => z.deep).length).toBe(0);
    expect(off.stats.stageMs.deep).toBeLessThan(50); // fast no-op (timer still runs)
    const degraded = mk(true); // no tsconfig.json → program fails → tier degrades
    expect(degraded.refs.filter((z) => z.deep).length).toBe(0);
    expect(degraded.refs.length).toBe(off.refs.length);
  });
});

describe('astro template scope (row-8 remainder — symbol-level interpolations)', () => {
  const FX = `---
const greeting = 'halo';
const count = 2;
const show = true;
---
<div title={greeting} data-n={count}>
  <span>{greeting}</span>
  {show && <em note={greeting}>x</em>}
</div>
<script>const client = greeting;</script>`;

  it('fixture: template interpolations bind to frontmatter consts (template = child scope)', () => {
    const fx = mkdtempSync(join(tmpdir(), 'idx-astro-tpl-'));
    writeFileSync(join(fx, '.gitignore'), 'node_modules/\n', 'utf8');
    mkdirSync(join(fx, 'src', 'pages'), { recursive: true });
    writeFileSync(join(fx, 'src', 'pages', 'page.astro'), FX, 'utf8');
    const mk = () => buildIndex(fx);
    const a = mk();
    const f = a.files.find((x) => x.path === 'src/pages/page.astro')!;
    const fi = f.idx as unknown as number;
    const tplScope = a.scopes.find((s) => s.fileIdx === fi && s.kind === ScopeKind.AstroTemplate)!;
    expect(tplScope).toBeDefined();
    const occs = a.occurrences.filter((o) => o.fileIdx === fi && o.scopeKey === tplScope.key);
    expect(occs.map((o) => o.name)).toEqual(['greeting', 'count', 'greeting', 'show', 'greeting']);
    // Every template read is a scope-bound ref onto the frontmatter const, and
    // none of it leaks into the unresolved buckets (script bodies untouched).
    const consts = new Map(a.symbols.filter((s) => s.fileIdx === fi && s.kind === SymbolKind.Constant).map((s) => [s.name, s]));
    expect(consts.has('greeting')).toBe(true);
    for (const o of occs) {
      const ref = a.refs.find((z) => z.fileIdx === fi && z.range.start === o.range.start);
      expect(ref).toBeDefined();
      expect(ref!.resolvedVia).toBe('scope');
      const target = a.symbols.find((s) => s.key === ref!.symKey)!;
      expect(target.fileIdx).toBe(fi);
      expect(target.name).toBe(o.name);
      expect(target.kind).toBe(SymbolKind.Constant);
      expect(target.decls[0].start).toBeLessThan(tplScope.range.start); // declaration in the frontmatter
    }
    expect(a.unresolvedRefs.filter((u) => u.fileIdx === fi)).toHaveLength(0);
    // def/hover at a template position answers with the frontmatter declaration.
    const q = indexFromDoc(dumpDoc(a));
    const greetingOcc = occs.find((o) => o.name === 'greeting')!;
    const v = resolveAt(q, 'src/pages/page.astro', greetingOcc.range.startLine, greetingOcc.range.startChar);
    expect(v.resolved).not.toBeNull();
    expect(v.resolved!.decls).toHaveLength(1);
    expect(v.resolved!.decls[0].uri).toBe('src/pages/page.astro');
    expect(v.resolved!.decls[0].l).toBeLessThan(tplScope.range.startLine); // points into the frontmatter
    // refs of the frontmatter `greeting` const include every template site.
    const refView = refsOf(q, consts.get('greeting')!.id);
    const tplRefs = refView.references.filter((z) => z.file === 'src/pages/page.astro' && z.line >= tplScope.range.startLine);
    expect(tplRefs).toHaveLength(3); // title attr + span text + <em> attr
    // Deterministic across builds.
    const b = mk();
    const key = (r: typeof a) => r.occurrences.filter((o) => o.fileIdx === fi && o.scopeKey === r.scopes.find((s) => s.fileIdx === fi && s.kind === ScopeKind.AstroTemplate)!.key).map((o) => o.range.start + ':' + o.name).sort();
    expect(key(a)).toEqual(key(b));
  }, 120000);

  it('real tree: BaseLayout template reads bind to frontmatter consts and imports', () => {
    const r = buildIndex(ROOT);
    const f = r.files.find((x) => x.path === 'src/layouts/BaseLayout.astro')!;
    const fi = f.idx as unknown as number;
    const tplScope = r.scopes.find((s) => s.fileIdx === fi && s.kind === ScopeKind.AstroTemplate)!;
    expect(tplScope).toBeDefined();
    const occs = r.occurrences.filter((o) => o.fileIdx === fi && o.scopeKey === tplScope.key);
    expect(occs.map((o) => o.name).sort()).toEqual(['description', 'lang', 'showBottomNav', 'showFooter', 'sprite']);
    for (const o of occs) {
      const ref = r.refs.find((z) => z.fileIdx === fi && z.range.start === o.range.start);
      expect(ref).toBeDefined();
      expect(ref!.resolvedVia).toBe('scope');
      const target = r.symbols.find((s) => s.key === ref!.symKey)!;
      expect(target.name).toBe(o.name);
      expect(target.decls[0].start).toBeLessThan(tplScope.range.start); // frontmatter decl, not a template name
    }
    expect(r.unresolvedRefs.filter((u) => u.fileIdx === fi && u.range.start >= tplScope.range.start)).toHaveLength(0);
  }, 120000);
});
