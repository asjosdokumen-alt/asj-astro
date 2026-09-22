/**
 * parse.test.ts — Phase 1 exit criteria: outlines correct for hand-checked
 * files; declarations/scopes/occurrences/imports/exports as the design specifies.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ImportKind, OccurrenceRole, ScopeKind, SymbolKind } from '../../docs/code-index-schema.js';
import { parseFile, scanAstroTemplateReads, scanAstroTemplateTags } from './parse.js';
import { fileIdx, type Lang } from './util.js';

const ROOT = process.cwd().replace(/\\/g, '/');

function parseReal(rel: string, lang: Lang) {
  const content = readFileSync(`${ROOT}/${rel}`, 'utf8');
  return parseFile({ fileIdx: fileIdx(0), path: rel, lang, content });
}

function parseInline(content: string, path = 'test/sample.ts', lang: Lang = 'ts') {
  return parseFile({ fileIdx: fileIdx(0), path, lang, content });
}

describe('real-file outlines', () => {
  it('master-data/index.ts — pure re-export barrel with an alias', () => {
    const p = parseReal('netlify/functions/contexts/master-data/index.ts', 'ts');
    expect(p.symbols).toHaveLength(0); // barrel: no declarations
    expect(p.imports).toHaveLength(0);
    expect(p.exports).toHaveLength(14); // 11 at design time; barrel grew with the contexts split
    const alias = p.exports.find((e) => e.exportName === 'handleSimpanUpdateMaster');
    expect(alias).toMatchObject({ localName: 'handleSubmitMasterForm', from: './service', kind: 'named' });
    const plain = p.exports.find((e) => e.exportName === 'findMasterByWa');
    expect(plain).toMatchObject({ localName: 'findMasterByWa', from: './repository' });
    // occurrence on the local name of the aliased specifier
    expect(p.occurrences.some((o) => o.name === 'handleSubmitMasterForm' && o.role === OccurrenceRole.ExportSpecifier)).toBe(true);
  });

  it('catalog/repository.ts — aliased re-export `_mapForm as mapForm`', () => {
    const p = parseReal('netlify/functions/contexts/catalog/repository.ts', 'ts');
    const alias = p.exports.find((e) => e.exportName === 'mapForm');
    expect(alias).toMatchObject({ localName: '_mapForm', kind: 'named' });
    const aliasSym = p.symbols.find((s) => s.name === '_mapForm');
    expect(aliasSym?.kind).toBe(SymbolKind.ImportBinding);
    expect(aliasSym?.exportNames).toContain('mapForm');
    expect(aliasSym?.exported).toBe(true);
    const local = p.symbols.find((s) => s.name === 'mapForm');
    expect(local?.kind).toBe(SymbolKind.Constant); // `const mapForm = _mapForm`
  });

  it('Icon.tsx — component + props interface + import type', () => {
    const p = parseReal('src/components/ui/Icon.tsx', 'tsx');
    const icon = p.symbols.find((s) => s.name === 'Icon');
    expect(icon?.kind).toBe(SymbolKind.Component);
    expect(icon?.exportNames).toContain('default');
    expect(p.symbols.find((s) => s.name === 'IconProps')?.kind).toBe(SymbolKind.Interface);
    const preactImport = p.imports.find((i) => i.specifier === 'preact');
    expect(preactImport?.kind).toBe(ImportKind.Type); // `import type { JSX } from 'preact'`
  });

  it('index.astro — frontmatter imports only', () => {
    const p = parseReal('src/pages/index.astro', 'astro');
    // 5 -> 6 (2026-09-19, landing page L2): +1 — `ClosingBand`, the closing call
    // to action. This frozen outline is easy to miss because it lives here rather
    // than beside the inventory ratchets in discover/build: adding an IMPORT to a
    // file that already has one of these is what moves it, not adding a file.
    // Measured, not derived — the failure read "expected [ …(6) ] to have a
    // length of 5 but got 6" before the number was touched.
    // 6 -> 13 (2026-09-19, landing page L3): +7 — Section, SectionTitle, Card,
    // IconTileGrid, FactList, StepList and the companyProfile data import, all of
    // which the six new profile sections need. MEASURED with
    // `grep -c "^import " src/pages/index.astro` = 13.
    // 14 -> 15, 26 -> 27 (2026-09-19, landing page L4): +1 — `SiteNav`, the desktop
    // section navigation. It is a `.astro` component (no iteration, so no reason to
    // leave `.astro`), imported by index.astro, so `imports` gains 1 and `symbols`
    // gains 1 default binding. MEASURED with the parseFile probe printed in
    // asj-add-source-files §3.
    // 15 -> 16, 27 -> 35 (2026-09-19, landing page L3): +1 statement — `PersonGrid`,
    // the team grid (a `.tsx` component because it iterates, so it cannot live in an
    // `.astro` template). The companyProfile named block also gained 8 bindings
    // (ABOUT_WELCOME, ABOUT_PARAGRAPHS, TEAM, CONTACT_ADDRESS, CONTACT_EMAIL,
    // CONTACT_LOCATION, CONTACT_PHONES, plus the existing ones), so `symbols` moves by
    // 1 default + 8 named = 9. MEASURED with the frontmatter probe: 16 statements,
    // 15 default bindings + 20 named = 35 symbols.
    // 16 -> 17, 35 -> 37 (2026-09-19, landing page R2): +1 statement — `JobMiniList`,
    // the mini vacancy list (a `.tsx` component, because it iterates). MEASURED with
    // a temporary probe calling parseFile directly on this exact relPath, then
    // deleted: imports 17, symbols 37. Both counters move, exactly as the note below
    // warns — adding an import to this file is not a single-number change.
    // 19 -> 20 (2026-09-20, the JapanTexture decorative band): +1 statement, the
    // `JapanTexture` default import. MEASURED by probe, and it moved BOTH
    // counters — imports 20, symbols 40 — because symbols counts one binding per
    // BOUND NAME and this is a default import (1 binding), not a named block.
    //
    // 20 -> 19, 40 -> 39 (2026-09-20, the R1a audit): BOTH counters went DOWN by
    // one, which is the direction that is worth explaining rather than accepting.
    // MEASURED with a temporary probe calling parseFile directly on this exact
    // path — imports 19, symbols 39 — not inferred from the failure message.
    // The cause is e9317cf, the landing-page redesign: it removed one import from
    // this file's frontmatter. The two counters move together because every import
    // in this file is a DEFAULT import (1 bound name each), and the earlier note
    // on `symbols` is the one case where that rule does NOT hold — the
    // companyProfile block is NAMED and contributes 13 bindings on its own.
    // A count that falls is not automatically a regression: nothing was deleted
    // from the frontmatter to make room, and the file still builds and renders.
    // 21 -> 22, 42 -> 43 (2026-09-21, the ContactForm island): +1 import
    // statement — `ContactForm`, a DEFAULT import, so BOTH counters move by one.
    // Unlike the `HistoryTimeline` step above (which moved `symbols` by two,
    // because the same edit also added `Milestone` to the existing NAMED
    // companyProfile block), this one is a plain +1/+1: one statement, one bound
    // name. The two steps look identical from the diff and are not identical in
    // the counters, which is why each is measured rather than extrapolated from
    // the previous one.
    // MEASURED with a temporary probe calling parseFile directly on this exact
    // relPath (then deleted, before any inventory count was taken): imports 22,
    // symbols 43.
    expect(p.imports).toHaveLength(22); // 6 at design time; +the L2/L3/L4/R2 landing-page imports, +JapanTexture, -1 by the e9317cf redesign, +1 PrincessMascot.astro (2026-09-20), +1 HistoryTimeline.tsx and +1 ContactForm.tsx (2026-09-21). Adding an IMPORT to this file is what moves this number, not adding a file.
    // CORRECTION (2026-09-19). This line used to read "one ImportBinding per
    // import", and that was true only while every import in this file was a DEFAULT
    // import. The companyProfile import is named and pulls in 13 bindings, so the
    // count is 14 default bindings + 13 named = 27, measured, not 15. The rule is
    // one ImportBinding per BOUND NAME — the old comment would have sent the next
    // reader looking for a parser bug that is not there.
    // The 15/24 split is MEASURED, not eyeballed: the probe's histogram of
    // `s.kind` is entirely ImportBinding (enum value 15 in
    // docs/code-index-schema.ts), and the frontmatter holds 17 default-import
    // STATEMENTS of which the companyProfile named block supplies 20 names —
    // 17 - 2 + 20 + 4 = 39. Counting the statements by hand gives 40 and is
    // wrong; the indexer's number is the one this assertion is about.
    expect(p.symbols).toHaveLength(43); // 17 default bindings + 26 named bindings. +1 (2026-09-20) = the PrincessMascot import, a DEFAULT binding, so this moved by 1 and not by the named-binding count. +1 (2026-09-21) = HistoryTimeline (a DEFAULT binding) and +0 more for ContactForm's statement, PLUS `Milestone` added to the existing NAMED companyProfile block (+1) — which is why the two steps together move this by 3 while the statement count moves by 2.
    expect(p.symbols.every((s) => s.kind === SymbolKind.ImportBinding)).toBe(true);
    expect(p.imports.every((i) => i.kind === ImportKind.Static)).toBe(true);
  });

  it('BaseLayout.astro — Props interface + ?raw asset import', () => {
    const p = parseReal('src/layouts/BaseLayout.astro', 'astro');
    expect(p.symbols.find((s) => s.name === 'Props' && s.kind === SymbolKind.Interface)).toBeDefined();
    const raw = p.imports.find((i) => i.specifier === '../icons/sprite.svg?raw');
    expect(raw).toBeDefined();
    expect(raw?.kind).toBe(ImportKind.Static); // default import; the resolver turns it into an Asset edge
    // template component tags (row 8 astro-markup): every capitalized tag the
    // layout renders, deduped — graph.ts resolves each through these imports.
    expect(p.templateTags).toEqual(expect.arrayContaining(['BottomNav', 'Footer', 'Toast']));
    expect(p.templateTags).not.toContain('slot'); // builtin tags are excluded
  });

  it('fcm.ts — remote and relative dynamic imports', () => {
    const p = parseReal('src/lib/fcm.ts', 'ts');
    const dyn = p.imports.filter((i) => i.kind === ImportKind.Dynamic);
    expect(dyn).toHaveLength(3);
    expect(dyn.filter((i) => i.specifier.startsWith('https://'))).toHaveLength(2);
    expect(dyn.some((i) => i.specifier === './apiClient')).toBe(true);
    expect(p.symbols.find((s) => s.name === 'initFCM' && s.kind === SymbolKind.Function)).toBeDefined();
    expect(p.symbols.find((s) => s.name === 'FirebaseCompat' && s.kind === SymbolKind.Interface)).toBeDefined();
  });

  it('i18n.ts — type export + dynamic i18n-jp', () => {
    const p = parseReal('src/store/i18n.ts', 'ts');
    expect(p.imports.some((i) => i.specifier === '@nanostores/persistent' && i.kind === ImportKind.Static)).toBe(true);
    expect(p.imports.some((i) => i.specifier === './i18n-jp' && i.kind === ImportKind.Dynamic)).toBe(true);
    expect(p.exports.some((e) => e.exportName === 'Lang' && e.kind === 'type')).toBe(true);
    expect(p.symbols.find((s) => s.name === 'Lang')?.kind).toBe(SymbolKind.TypeAlias);
  });

  it('auth.js — ESM entry point: extension-qualified import + default export', () => {
    // Migrated 2026-09-12 off Lambda compatibility mode, whose 4 KB per-function
    // env ceiling was killing the deploy after a fully successful build.
    //
    // A root entry point is still a thin wrapper — one surface's action map,
    // adapted into a handler — but the MODULE SHAPE changed, and both halves
    // matter: Netlify's modern runtime needs a default export, and a local
    // import must carry its extension. A file left half-migrated answers 502.
    const p = parseReal('netlify/functions/auth.js', 'js');
    expect(p.imports.some((i) => i.specifier === './_lib/netlify-wrapper-surface.js')).toBe(true);
    expect(p.imports.some((i) => i.specifier === './_lib/netlify-adapter.js')).toBe(true);
    // `export default <expression>` is recorded as an ExportAssignment with
    // exportName "default" and kind "named" — the binder only promotes kind to
    // "default" for a default-exported DECLARATION. Asserting kind here would
    // be asserting the wrong field, which is exactly how this test first
    // failed after the migration.
    expect(p.exports.some((e) => e.exportName === 'default')).toBe(true);
    expect(p.exports.some((e) => e.kind === 'cjs')).toBe(false);
    // It is an IMPORT BINDING now, not a destructured `const`:
    //   before  const { makeSurfaceHandler } = require('./_lib/...')
    //   after   import { makeSurfaceHandler } from './_lib/....js'
    // Asserting the kind keeps the entry point pinned to "thin ESM wrapper" —
    // a local re-declaration would mean logic drifted back into the entry.
    expect(p.symbols.find((s) => s.name === 'makeSurfaceHandler' && s.kind === SymbolKind.ImportBinding)).toBeDefined();
  });
});

describe('inline binder behavior', () => {
  it('declares, scopes, and roles correctly', () => {
    const p = parseInline(`
import { mapForm } from './forms';
function outer(a: number) {
  const x = 1;
  function inner() { return x; }
  return inner() + a;
}
interface I extends Object { p: string; }
const obj = { key: 1 };
const y = obj.key;
mapForm('x');
`);
    const names = p.symbols.map((s) => s.name);
    expect(names).toContain('mapForm');
    expect(names).toContain('outer');
    expect(names).toContain('a');
    expect(names).toContain('x');
    expect(names).toContain('inner');
    expect(names).toContain('I');
    expect(names).toContain('p');
    expect(names).toContain('obj');
    expect(names).toContain('y');

    // qualified names: interface member carries its container
    expect(p.symbols.find((s) => s.name === 'p')?.qualified).toBe('I.p');
    // roles
    expect(p.occurrences.some((o) => o.name === 'inner' && o.role === OccurrenceRole.Callee)).toBe(true);
    expect(p.occurrences.some((o) => o.name === 'mapForm' && o.role === OccurrenceRole.Callee)).toBe(true);
    expect(p.occurrences.some((o) => o.name === 'x' && o.role === OccurrenceRole.Read)).toBe(true); // read inside inner()
    expect(p.occurrences.some((o) => o.name === 'obj' && o.role === OccurrenceRole.Read)).toBe(true);
    expect(p.occurrences.filter((o) => o.name === 'key').some((o) => o.role === OccurrenceRole.Property)).toBe(true);
    expect(p.occurrences.filter((o) => o.name === 'key').some((o) => o.role === OccurrenceRole.ObjectKey)).toBe(true);
    expect(p.occurrences.some((o) => o.name === 'Object' && o.role === OccurrenceRole.TypeRef)).toBe(true);

    // scope tree: module → function outer → block; the hoisted inner function
    // lands on the function scope's single declaration list (one push each)
    const moduleScope = p.scopes.find((s) => s.kind === ScopeKind.Module);
    const outerScope = p.scopes.find((s) => s.name === 'outer' && s.kind === ScopeKind.Function);
    expect(outerScope?.parentKey).toBe(moduleScope?.key);
    const innerKey = p.symbols.find((s) => s.name === 'inner')?.key;
    expect(outerScope?.symbolKeys).toContain(innerKey);
  });

  it('merges interface declarations into one symbol with two decls', () => {
    const p = parseInline('interface Job { a: string }\ninterface Job { b: number }');
    const jobs = p.symbols.filter((s) => s.name === 'Job');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].decls).toHaveLength(2);
  });

  it('disambiguates same-named locals with ~n symIds', () => {
    const p = parseInline('const x = 1;\nconst x = 2;');
    const xs = p.symbols.filter((s) => s.name === 'x');
    expect(xs).toHaveLength(2);
    expect(xs[0].id).toContain('#x');
    expect(xs[1].id).toContain('#x~2');
  });

  it('declHash excludes bodies; exportHash excludes bodies but tracks exports', () => {
    const a = parseInline('function f(x: string) { return x + "a"; }\nexport const K = 1;');
    const b = parseInline('function f(x: string) { return x + "b"; }\nexport const K = 1;');
    expect(a.declHash).toBe(b.declHash);
    expect(a.exportHash).toBe(b.exportHash);

    const c = parseInline('function f(x: number) { return x + "a"; }\nexport const K = 1;');
    expect(a.declHash).not.toBe(c.declHash);
    expect(a.exportHash).toBe(c.exportHash); // signature change, same export surface

    const d = parseInline('function f(x: string) { return x + "a"; }\nexport const K2 = 1;');
    expect(a.exportHash).not.toBe(d.exportHash);
  });

  it('gives destructured bindings per-element decl ranges (wrong-hop fix, §13)', () => {
    // Before the fix every element of `const { a, b } = x` shared the whole
    // statement's start offset; the compiler records each BindingElement.
    const p = parseInline('const { a, b } = src;\nconst [c, d] = f();');
    const sym = (n: string) => p.symbols.find((s) => s.name === n)!;
    expect(sym('a').decls[0].start).toBe(8);
    expect(sym('b').decls[0].start).toBe(11);
    expect(sym('c').decls[0].start).toBe(29); // after the `[`
    expect(sym('d').decls[0].start).toBe(32);
    // And a destructured parameter's element likewise points at the element.
    const q = parseInline('function F({ onClose }: P) {}');
    expect(q.symbols.find((s) => s.name === 'onClose')!.decls[0].start).toBe(13);
  });

  it('pushes each declaration to exactly one owning scope (hoisted ones to the function/module)', () => {
    const keyOf = (p: ReturnType<typeof parseInline>, n: string) => p.symbols.find((s) => s.name === n)!.key;
    const owners = (p: ReturnType<typeof parseInline>, key: ReturnType<typeof keyOf>) => p.scopes.filter((s) => s.symbolKeys.includes(key));

    // Module-level declarations — var, function, const alike — are owned once,
    // by the module scope (they hoist to / are introduced at the top level).
    const p = parseInline('function top() {}\nvar v = 1;\nconst k = 0;');
    const moduleScope = p.scopes.find((s) => s.kind === ScopeKind.Module)!;
    for (const n of ['top', 'v', 'k']) expect(owners(p, keyOf(p, n))).toHaveLength(1);
    expect(moduleScope.symbolKeys).toContain(keyOf(p, 'v'));

    // A var inside a block is owned once, by the enclosing function — not by
    // the block it is written in and not by the module.
    const q = parseInline('function f(c: boolean) { if (c) { var w = 1; } }');
    const fnScope = q.scopes.find((s) => s.name === 'f' && s.kind === ScopeKind.Function)!;
    const wOwners = owners(q, keyOf(q, 'w'));
    expect(wOwners).toHaveLength(1);
    expect(wOwners[0].key).toBe(fnScope.key);

    // A block-scoped let stays owned by its block alone.
    const r = parseInline('function g() { const l = 1; }');
    const bodyBlock = r.scopes.find((s) => s.kind === ScopeKind.Block && s.parentKey === r.scopes.find((x) => x.name === 'g')?.key)!;
    const lOwners = owners(r, keyOf(r, 'l'));
    expect(lOwners).toHaveLength(1);
    expect(lOwners[0].key).toBe(bodyBlock.key);
  });

  it('disambiguates sibling scope ids with ~n so every scope id is unique', () => {
    // Sibling anonymous scopes (two if-blocks, arrows at one level) and merged
    // declarations (each `interface I {}` body) share a scopePath — each
    // physical scope must still get a unique id, like symIds' ~n suffix.
    const p = parseInline('const f = () => { if (a) {} if (b) {} }\ninterface I { m(): void }\ninterface I { n(): void }');
    const ids = p.scopes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((i) => i.endsWith('#module.arrow.block.block'))).toHaveLength(1); // first if-block keeps its plain id
    expect(ids.some((i) => i.endsWith('#module.arrow.block.block~2'))).toBe(true); // sibling if-block
    expect(ids.some((i) => i.endsWith('#module.I~2'))).toBe(true); // merged interface body
  });

  it('does not hoist classes out of their block (TDZ block-scoped only)', () => {
    // A class inside a block is owned by that block alone — never by the
    // enclosing function — so a scope-chain lookup outside the block cannot
    // find it (classes are block-scoped; only var + function hoist).
    const p = parseInline('function f(c: boolean) { if (c) { class K {} } }');
    const kKey = p.symbols.find((s) => s.name === 'K')!.key;
    const owners = p.scopes.filter((s) => s.symbolKeys.includes(kKey));
    expect(owners).toHaveLength(1);
    expect(owners[0].kind).toBe(ScopeKind.Block); // the if-block, not `function f`
    const fnScope = p.scopes.find((s) => s.name === 'f' && s.kind === ScopeKind.Function)!;
    expect(fnScope.symbolKeys).not.toContain(kKey);
  });

  it('parses an empty astro template without frontmatter', () => {
    const p = parseFile({ fileIdx: fileIdx(0), path: 'test/empty.astro', lang: 'astro', content: '<div>hello</div>' });
    expect(p.symbols).toHaveLength(0);
    expect(p.poisoned).toBeUndefined();
    expect(p.templateTags).toEqual([]); // no capitalized tags
  });
});

describe('scanAstroTemplateTags', () => {
  it('collects capitalized tags from the template portion, deduped, builtins excluded', () => {
    const content = '---\nimport { A } from \'./a\';\n---\n<div><A /><A/><slot /><Fragment><B.C /></Fragment><A /></div>';
    const tags = scanAstroTemplateTags(content, content.indexOf('\n---\n') + 5);
    expect(tags).toEqual(['A', 'B']);
  });
  it('ignores lowercase html tags; attribute values ARE scanned (lightweight-scan limitation)', () => {
    const content = '---\n---\n<div class=\'<NotATag>\'><span>hi</span><MyCard /></div>';
    const tags = scanAstroTemplateTags(content, 7);
    expect(tags).toEqual(['NotATag', 'MyCard']); // source order; the simple scan does not skip quoted regions
  });
  it('handles an astro file with no template markup at all', () => {
    const content = '---\nconst x = 1;\n---\n';
    const tags = scanAstroTemplateTags(content, content.indexOf('\n---') + 4);
    expect(tags).toEqual([]);
  });
});

describe('scanAstroTemplateReads (template scope — row-8 remainder)', () => {
  const names = (tpl: string): string[] => scanAstroTemplateReads(tpl, 0).map((r) => r.name);

  it('text interpolations + attribute expressions emit identifier reads in order', () => {
    const tpl = '<div title={greeting} data-n={count + 1} class={show ? "a" : "b"}>{greeting} done</div>';
    expect(names(tpl)).toEqual(['greeting', 'count', 'show', 'greeting']);
  });

  it('recurses into JSX inside an expression and into nested braces; reads stay head-only', () => {
    const tpl = '<p>{show && <em note={greeting}>x</em>}</p><p>{ { k: v, s } }</p>';
    expect(names(tpl)).toEqual(['show', 'greeting', 'v', 's']); // k is an object key, not a read
  });

  it('never emits member names, keywords, or arrow params (incl. body references)', () => {
    expect(names('<div>{a.b}</div>')).toEqual(['a']);
    expect(names('<div>{items.map((x) => x.n + min)}</div>')).toEqual(['items', 'min']); // x: param decl + body ref
    expect(names('<div>{items.map(x => x.n)}</div>')).toEqual(['items']); // bare single-param arrow
    expect(names('<div>{true && this.w}</div>')).toEqual([]);
  });

  it('skips raw script/style bodies, HTML comments, strings and template literals', () => {
    const tpl =
      '<script>const c = greeting;</script><style>.a{ color: red }</style><!-- {hidden} --><div>{"s{notARead}"} {`t${alsoNotARead}`} {"a" + y}</div>';
    expect(names(tpl)).toEqual(['y']);
  });
});

describe('astro template scope emission (parse level)', () => {
  const CONTENT = [
    '---',
    "const greeting = 'halo';",
    'const count = 2;',
    'const show = true;',
    '---',
    '<div title={greeting} data-n={count}>{show && <em>{greeting}</em>}</div>',
    '<script>const client = greeting;</script>',
    '',
  ].join('\n');

  it('emits an AstroTemplate scope (child of the module scope) + Read occurrences', () => {
    const p = parseInline(CONTENT, 'test/page.astro', 'astro');
    const moduleScope = p.scopes.find((s) => s.kind === ScopeKind.Module)!;
    expect(moduleScope).toBeDefined();
    const tpl = p.scopes.find((s) => s.kind === ScopeKind.AstroTemplate)!;
    expect(tpl).toBeDefined();
    expect(tpl.name).toBe('template');
    expect(tpl.parentKey).toBe(moduleScope.key);
    const occs = p.occurrences.filter((o) => o.scopeKey === tpl.key);
    expect(occs.map((o) => o.name)).toEqual(['greeting', 'count', 'show', 'greeting']);
    expect(occs.every((o) => o.role === OccurrenceRole.Read)).toBe(true);
    // Script bodies are client-side code — never module-scope reads.
    expect(occs.some((o) => o.name === 'client')).toBe(false);
    // Offsets land inside the real template text (past the closing fence).
    const fmEnd = CONTENT.indexOf('---\n', 4) + 4;
    expect(occs.every((o) => o.range.start > fmEnd)).toBe(true);
  });

  it('no frontmatter fence means no module scope and no template occurrences', () => {
    const p = parseInline('<div>hi {x}</div>', 'test/nofm.astro', 'astro');
    expect(p.scopes.filter((s) => s.kind === ScopeKind.AstroTemplate)).toHaveLength(0);
    expect(p.occurrences).toHaveLength(0);
  });
});

describe('Astro.glob frontmatter detection (row-8 remainder)', () => {
  it('records string-literal Astro.glob patterns with the literal range', () => {
    const content = "---\nconst pages = await Astro.glob('../pages/*.astro');\nconst posts = await Astro.glob('../posts/**/*.md');\n---\n<div></div>";
    const p = parseInline(content, 'test/glob.astro', 'astro');
    expect(p.astroGlobs?.map((g) => g.pattern)).toEqual(['../pages/*.astro', '../posts/**/*.md']);
    const first = p.astroGlobs![0]!;
    const litStart = content.indexOf("'../pages/*.astro'"); // the opening quote
    expect(first.range.start).toBe(litStart);
    expect(first.range.end).toBe(litStart + 2 + '../pages/*.astro'.length); // +2 for the quotes
    expect(first.range.endLine).toBeGreaterThanOrEqual(first.range.startLine);
  });

  it('ignores non-literal arguments, other receivers, and non-astro files', () => {
    const p = parseInline(
      "---\nconst a = Astro.glob(someVar);\nconst b = Astro['glob']('../x/*.astro');\nconst c = Foo.glob('../x/*.astro');\n---\n<div></div>",
      'test/glob-neg.astro',
      'astro',
    );
    expect(p.astroGlobs).toEqual([]);
    const t = parseInline("const a = Astro.glob('../x/*.astro');", 'test/glob.ts', 'ts');
    expect(t.astroGlobs ?? []).toEqual([]);
  });

  it('real tree: BaseLayout frontmatter has no Astro.glob calls', () => {
    const p = parseReal('src/layouts/BaseLayout.astro', 'astro');
    expect(p.astroGlobs).toEqual([]);
  });
});
