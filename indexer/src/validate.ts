/**
 * validate.ts — differential validation of the Tier-1 binder against the
 * compiler's own binding resolution (ts.createProgram + checker.getBindingAtLocation).
 *
 * Universe: every bindable occurrence (BINDABLE_ROLES minus lowercase-JSX
 * intrinsics) in a deterministic sample of ~25 files spread across src/,
 * netlify/functions/, shared/. For each:
 *   - indexer bound      → the compiler must bind the SAME name at that offset;
 *   - indexer unresolved → the compiler must NOT bind it (genuinely unresolvable).
 *
 * Deliberate deviations are classified, not forced to zero:
 *   - lib-not-loaded refs (standard-library globals; Tier 2's job, §9.1);
 *   - non-bindable roles (ImportSpecifier / ObjectKey / UNBOUND Property) —
 *     recorded, never scope-bound by design; BOUND Property refs (Tier 2
 *     member binds + namespace-member chases, resolvedVia 'type'/'import')
 *     join the universe and must agree with the compiler;
 *   - lowercase JSX intrinsics (`<div>` …) — intrinsic elements, not symbols;
 *   - .astro files — compiler gets the SAME frontmatter-stripped source as
 *     parse.ts, with a per-file base offset so positions line up.
 *
 * The repo's 469 pre-existing type errors are irrelevant: no diagnostics are
 * requested, only binding resolution.
 *
 * Run: node dist/indexer/src/validate.js
 * Output: categorized report to stdout + full JSON to indexer/validate-report.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import ts from 'typescript';
import { buildProgram, identifierIndex, norm } from './program.js';
import { buildIndex, type BuildResult } from './build.js';
import { splitAstroFrontmatter } from './parse.js';
import {
  OccurrenceRole,
  ScopeKind,
  type FileIdx,
  type FileNode,
  type Occurrence,
  type SymbolNode,
  type SymKey,
  type UnresolvedReference,
} from '../../docs/code-index-schema.js';

const ROOT = process.cwd().replace(/\\/g, '/');
const REPORT_PATH = 'indexer/validate-report.json';

/** TS normalizes host paths to forward slashes on every OS (§13). */

/** Deterministic sample: 12 src + 12 netlify/functions + 1 shared. */
export const SAMPLE: readonly string[] = [
  'src/components/ui/Icon.tsx',
  'src/components/admin/TabMail.tsx',
  'src/components/AuthGuard.tsx',
  'src/store/i18n.ts',
  'src/store/userStore.ts',
  'src/store/authReactive.ts',
  'src/lib/schemas.ts',
  'src/lib/fcm.ts',
  'src/lib/supabase.ts',
  'src/lib/cloudinary.ts',
  'src/layouts/BaseLayout.astro',
  'src/pages/index.astro',
  'netlify/functions/auth.js',
  'netlify/functions/ping.js',
  'netlify/functions/sweep-queue.ts',
  'netlify/functions/contexts/master-data/index.ts',
  'netlify/functions/contexts/master-data/service.ts',
  'netlify/functions/contexts/master-data/repository.ts',
  'netlify/functions/contexts/catalog/repository.ts',
  'netlify/functions/contexts/applications/service.ts',
  'netlify/functions/contexts/documents/service.ts',
  'netlify/functions/_lib/candidate-helpers.ts',
  'netlify/functions/_lib/kernel/http.ts',
  'netlify/functions/_lib/db/candidates.ts',
  'shared/wa-rules.ts',
];

/** Mirror of bind.ts BINDABLE_ROLES (minus ImportSpecifier). */
const BINDABLE_ROLES = new Set<number>([
  OccurrenceRole.Read,
  OccurrenceRole.Write,
  OccurrenceRole.Callee,
  OccurrenceRole.TypeRef,
  OccurrenceRole.JsxName,
  OccurrenceRole.Decorator,
  OccurrenceRole.ExportSpecifier,
]);

const ROLE_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(OccurrenceRole).map(([k, v]) => [v, k]),
) as Record<number, string>;

interface DiffRow {
  path: string;
  line: number;
  name: string;
  role: string;
  reason: string;
  indexer: string;
  compiler: string;
}

/** Declaration-identity categories (§13 differential validation). */
type IdentityCategory = 'match' | 'alias-vs-chase' | 'merged-declaration' | 'shadowing-disagreement' | 'unmappable';

const _IDENTITY_CATEGORIES: readonly IdentityCategory[] = [
  'match',
  'alias-vs-chase',
  'merged-declaration',
  'shadowing-disagreement',
  'unmappable',
];

interface Report {
  rootDir: string;
  sample: readonly string[];
  program: { rootNames: number; options: Record<string, unknown> };
  universe: number;
  counts: Record<string, number>;
  identity: Record<IdentityCategory, number>;
  perFile: { path: string; universe: number; agreeBound: number; agreeUnresolved: number; lib: number; skipped: number; disagree: number }[];
  disagreements: DiffRow[];
  identityExamples: DiffRow[];
}


/**
 * Name the compiler binds at an identifier, or undefined if nothing binds it.
 * getSymbolAtLocation covers both reference sites (resolved symbol, named by
 * the LOCAL binding, e.g. `mapForm` for `import { _mapForm as mapForm }`) and
 * declaration sites (declared symbol) — TS 5.8 exposes no public
 * getBindingAtLocation, and this is the equivalent for name comparison.
 */
export function compilerNameAt(checker: ts.TypeChecker, id: ts.Identifier): string | undefined {
  return checker.getSymbolAtLocation(id)?.name;
}

/**
 * Declaration-identity comparison (§13): the compiler's resolved declaration
 * must be the SAME declaration (file + start offset) the indexer's symbol
 * carries. Handles TS's alias symbols (imports), declaration merging, and
 * unmappable targets (lib / node_modules) without forcing 1:1.
 */
function makeIdentityComparator(
  r: BuildResult,
  _program: ts.Program,
  checker: ts.TypeChecker,
  astroOffset: Map<string, number>,
): {
  keyToSym: Map<SymKey, SymbolNode>;
  classify: (o: Occurrence, refTarget: SymKey, id: ts.Identifier) => IdentityCategory;
  example: (o: Occurrence, refTarget: SymKey, id: ts.Identifier) => string;
} {
  const keyToSym = new Map<SymKey, SymbolNode>(r.symbols.map((s) => [s.key, s]));
  const byPath = new Map(r.files.map((f) => [f.path, f]));
  const pathByIdx = new Map(r.files.map((f) => [f.idx, f.path]));
  const fmOff = (fileName: string): number => astroOffset.get(norm(fileName)) ?? 0;

  const toRel = (fileName: string): string | undefined => {
    const n = norm(fileName);
    const rel = n.startsWith(norm(ROOT)) ? n.slice(norm(ROOT).length + 1) : n;
    return byPath.has(rel) ? rel : undefined;
  };

  /** Whole-node start of a compiler declaration, mapped to indexer coords. */
  const mapDecl = (d: ts.Declaration): { file: string; start: number } | undefined => {
    const rel = toRel(d.getSourceFile().fileName);
    if (!rel) return undefined;
    let start = d.getStart();
    // Alias decls (import specifiers / export specifiers / clauses) start at
    // the local NAME identifier in the indexer (parse records nameNode);
    // namespace imports span `* as ns`, so always use the name identifier.
    if (ts.isImportSpecifier(d) || ts.isExportSpecifier(d) || ts.isNamespaceImport(d) || ts.isImportClause(d)) {
      start = d.name?.getStart() ?? d.getStart();
    }
    return { file: rel, start: start + fmOff(d.getSourceFile().fileName) };
  };

  const symDeclSet = (s: SymbolNode): Set<string> => new Set(s.decls.map((d) => `${pathByIdx.get(s.fileIdx)}:${d.start}`));

  /**
   * getSymbolAtLocation quirk: a shorthand property `{ x }` reports the
   * *property* symbol (declaration = the shorthand itself), not the value it
   * names; getShorthandAssignmentValueSymbol recovers the real declaration.
   */
  const valueDecls = (s: ts.Symbol): ts.Declaration[] => {
    const out: ts.Declaration[] = [];
    for (const d of s.declarations ?? []) {
      if (ts.isShorthandPropertyAssignment(d)) {
        const vs = checker.getShorthandAssignmentValueSymbol(d);
        if (vs) out.push(...(vs.declarations ?? []));
        else out.push(d);
      } else out.push(d);
    }
    return out;
  };

  const classify = (_o: Occurrence, refTarget: SymKey, id: ts.Identifier): IdentityCategory => {
    const target = keyToSym.get(refTarget);
    if (!target) return 'unmappable';
    const identSet = symDeclSet(target);
    if (identSet.size === 0) return 'unmappable';

    const sym = checker.getSymbolAtLocation(id);
    if (!sym) return 'shadowing-disagreement';
    const isAlias = (sym.flags & ts.SymbolFlags.Alias) !== 0;
    let aliasSym = sym;
    if (isAlias) {
      // Follow alias chains to the ultimate target (imports of re-exports).
      while ((aliasSym.flags & ts.SymbolFlags.Alias) !== 0) {
        const next = checker.getAliasedSymbol(aliasSym);
        if (next === aliasSym) break;
        aliasSym = next;
      }
    }
    const targetSym = isAlias ? aliasSym : sym;

    const targetDecls = valueDecls(targetSym).map(mapDecl).filter((d): d is { file: string; start: number } => !!d);
    const localDecls = isAlias ? valueDecls(sym).map(mapDecl).filter((d): d is { file: string; start: number } => !!d) : [];

    const inSet = (d: { file: string; start: number }): boolean => identSet.has(`${d.file}:${d.start}`);
    const hit = targetDecls.filter(inSet);
    if (hit.length > 0) {
      return identSet.size === 1 && targetDecls.length === 1 ? 'match' : 'merged-declaration';
    }
    // The compiler models this as an alias (ES import specifiers, namespace
    // imports, AND CommonJS `const x = require(...)`) whose own declaration is
    // the local binding the indexer kept — bare packages / missing exports /
    // ns.* member access keep the local symbol by design (Tier 1).
    if (isAlias && localDecls.some(inSet)) return 'alias-vs-chase';
    // A namespace import re-exported (`import * as demo; export { demo }`)
    // aliases to the target MODULE symbol — the indexer has no per-file module
    // symbol, so the ImportBinding is its stand-in. TS's symbol model can't map
    // 1:1 here; classified honestly instead of as a disagreement.
    if (isAlias && (aliasSym.flags & (ts.SymbolFlags.ValueModule | ts.SymbolFlags.NamespaceModule)) !== 0 && target.kind === 15) {
      return 'alias-vs-chase';
    }
    if (targetDecls.length + localDecls.length > 0) return 'shadowing-disagreement';
    return 'unmappable';
  };

  const example = (_o: Occurrence, refTarget: SymKey, id: ts.Identifier): string => {
    const target = keyToSym.get(refTarget);
    const s = checker.getSymbolAtLocation(id);
    const t = s && (s.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(s) : s;
    const td = (t ? valueDecls(t) : []).map((d) => `${toRel(d.getSourceFile().fileName) ?? '<unmappable>'}:${d.getStart()}`);
    const tidx = (target?.fileIdx ?? -1) as FileIdx;
    return `${target?.name ?? '?'} → indexer ${pathByIdx.get(tidx)} decls ${target?.decls.map((d) => d.start).join(',')} · compiler ${td.join(',')}`;
  };

  return { keyToSym, classify, example };
}

/**
 * Run differential validation over a set of target files and return the report.
 * Default targets: the full inventory; `opts.sampleOnly` opts back into the
 * deterministic 25-file sample for quick iterations. Exported for tests.
 */
export function runValidation(rootDir: string, opts: { sampleOnly?: boolean } = {}): Report {
  const sampleOnly = opts.sampleOnly ?? false;
  const r = buildIndex(rootDir);
  const targets: readonly string[] = sampleOnly ? SAMPLE : r.files.map((f) => f.path);
  const byPath = new Map(r.files.map((f) => [f.path, f]));

  // Group indexer outputs by file for the sample scan.
  const occByFile = new Map<number, Occurrence[]>();
  for (const o of r.occurrences) {
    const list = occByFile.get(o.fileIdx) ?? [];
    list.push(o);
    occByFile.set(o.fileIdx, list);
  }
  const boundStart = new Set<string>();
  for (const ref of r.refs) boundStart.add(`${ref.fileIdx}:${ref.range.start}`);
  const unByFile = new Map<number, UnresolvedReference[]>();
  for (const u of r.unresolvedRefs) {
    const list = unByFile.get(u.fileIdx) ?? [];
    list.push(u);
    unByFile.set(u.fileIdx, list);
  }

  const { program, checker, astroOffset } = buildProgram(r.files, rootDir);

  // Sanity: for every .astro file the program source must be byte-identical
  // to the frontmatter text parse.ts feeds the binder (same offsets, §13).
  const astroSourceOk: string[] = [];
  for (const rel of targets.filter((s) => s.endsWith('.astro'))) {
    const content = readFileSync(join(rootDir, rel), 'utf8');
    const fm = splitAstroFrontmatter(content);
    const sf = program.getSourceFile(norm(join(rootDir, rel)));
    const same = !!sf && (fm ? sf.text === fm.text : sf.text === '');
    astroSourceOk.push(`${rel}: ${same ? 'OK' : 'MISMATCH'}`);
  }

  const counts: Record<string, number> = {
    agreeBound: 0,
    agreeUnresolved: 0,
    libNotLoaded: 0,
    libCompilerBinds: 0,
    libCompilerNone: 0,
    libRefs: 0,
    libRefAgree: 0,
    libRefDisagree: 0,
    libRefFramework: 0,
    skippedNonBindable: 0,
    skippedJsxIntrinsic: 0,
    skippedAstroTemplate: 0,
    offsetMismatch: 0,
    disagreeBoundNoCompiler: 0,
    disagreeNameMismatch: 0,
    disagreeFalsePositive: 0,
  };
  const identity: Record<IdentityCategory, number> = { match: 0, 'alias-vs-chase': 0, 'merged-declaration': 0, 'shadowing-disagreement': 0, unmappable: 0 };
  const disagreements: DiffRow[] = [];
  const identityExamples: DiffRow[] = [];
  const perFile: Report['perFile'] = [];
  let universe = 0;
  const identityOf = makeIdentityComparator(r, program, checker, astroOffset);
  const refTargetByOcc = new Map<string, SymKey>();
  for (const ref of r.refs) refTargetByOcc.set(`${ref.fileIdx}:${ref.range.start}`, ref.symKey);
  // Lib tier rows: not repo-bound refs, so they must not reach the unresolved
  // branch (which would read them as indexer-unresolved vs compiler-bound).
  const libRefByStart = new Map(r.libRefs.map((z) => [`${z.fileIdx}:${z.range.start}`, z]));
  const libRefStart = new Set(libRefByStart.keys());

  // Astro template interpolations (parse.ts emitAstroTemplateScope) bind
  // against the frontmatter module scope by construction — the template is a
  // child scope of the module (§2.4). The compiler program only receives the
  // frontmatter-stripped source for .astro files, so a template position
  // carries no compiler identifier; these occurrences are scope-resolved and
  // excluded from the differential checks like the other deliberate
  // exclusions below.
  const astroTplScopes = new Set<string>();
  for (const sc of r.scopes) {
    if (sc.kind === ScopeKind.AstroTemplate) astroTplScopes.add(`${sc.fileIdx}:${sc.key}`);
  }

  const lineOf = (f: FileNode, start: number): number => {
    // Binary search the line index for the greatest line whose offset <= start.
    const li = f.lineIndex;
    let lo = 0;
    let hi = li.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (li[mid] <= start) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  for (const rel of targets) {
    const f = byPath.get(rel);
    if (!f) {
      console.warn(`  [warn] target file not indexed: ${rel}`);
      continue;
    }
    const sf = program.getSourceFile(norm(join(rootDir, rel)));
    if (!sf) {
      console.warn(`  [warn] target file has no program source: ${rel}`);
      continue;
    }
    const fmOff = astroOffset.get(norm(join(rootDir, rel))) ?? 0;
    const idents = identifierIndex(sf);
    const unByStart = new Map((unByFile.get(f.idx) ?? []).map((u) => [u.range.start, u]));

    const fileAgg = { path: rel, universe: 0, agreeBound: 0, agreeUnresolved: 0, lib: 0, skipped: 0, disagree: 0 };
    perFile.push(fileAgg);

    for (const o of occByFile.get(f.idx) ?? []) {
      const at = `${f.idx}:${o.range.start}`;
      if (libRefStart.has(at)) {
        // Lib tier rows are verified BEFORE the skip branches: member rows
        // (Property) are non-bindable roles, value rows are bindable ones —
        // every emitted lib ref must have the compiler bind the SAME name at
        // the offset (never a guess).
        const pos = o.range.start - fmOff;
        const id = idents.get(pos);
        const compilerName = id ? compilerNameAt(checker, id) : undefined;
        counts.libRefs++;
        fileAgg.lib++;
        const libRow = libRefByStart.get(at);
        if (libRow?.framework === true) {
          // Canonical framework/intrinsic row (CJS wrapper vars, Astro global):
          // the compiler binds no same-name declaration by construction, so the
          // same-name check below would never agree. Still verify the identifier
          // EXISTS at the mapped offset — a missing identifier is a real
          // position-mapping bug, not a framework deviation.
          if (id === undefined) {
            counts.offsetMismatch++;
            disagreements.push({ path: rel, line: lineOf(f, o.range.start), name: o.name, role: ROLE_NAME[o.role], reason: 'lib-framework', indexer: `lib-framework:${o.name}`, compiler: '<no-identifier-at-offset>' });
          } else counts.libRefFramework++;
          continue;
        }
        if (id !== undefined && compilerName === o.name) counts.libRefAgree++;
        else {
          counts.libRefDisagree++;
          disagreements.push({ path: rel, line: lineOf(f, o.range.start), name: o.name, role: ROLE_NAME[o.role], reason: 'lib-ref', indexer: `lib-ref:${o.name}`, compiler: compilerName ?? '<none>' });
        }
        continue;
      }
      if (astroTplScopes.has(`${f.idx}:${o.scopeKey}`)) {
        counts.skippedAstroTemplate++;
        fileAgg.skipped++;
        continue;
      }
      // Tier 2: member accesses the binder resolved through types (or a
      // namespace import) are Property-role refs — check THOSE against the
      // compiler too (the member name must bind at the same offset).
      if (!BINDABLE_ROLES.has(o.role) && !(o.role === OccurrenceRole.Property && boundStart.has(at))) {
        counts.skippedNonBindable++;
        fileAgg.skipped++;
        continue;
      }
      if (o.role === OccurrenceRole.JsxName && /^[a-z]/.test(o.name)) {
        counts.skippedJsxIntrinsic++;
        fileAgg.skipped++;
        continue;
      }
      universe++;
      fileAgg.universe++;
      const isBound = boundStart.has(at);
      const pos = o.range.start - fmOff;
      const id = idents.get(pos);
      const compilerName = id ? compilerNameAt(checker, id) : undefined;

      if (isBound) {
        if (id === undefined) {
          // No identifier at the mapped offset — the position mapping is broken.
          counts.offsetMismatch++;
          disagreements.push({ path: rel, line: lineOf(f, o.range.start), name: o.name, role: ROLE_NAME[o.role], reason: '', indexer: 'bound', compiler: '<no-identifier-at-offset>' });
        } else if (compilerName === undefined) {
          counts.disagreeBoundNoCompiler++;
          disagreements.push({ path: rel, line: lineOf(f, o.range.start), name: o.name, role: ROLE_NAME[o.role], reason: '', indexer: 'bound', compiler: '<none>' });
        } else if (compilerName !== o.name) {
          counts.disagreeNameMismatch++;
          disagreements.push({ path: rel, line: lineOf(f, o.range.start), name: o.name, role: ROLE_NAME[o.role], reason: '', indexer: `bound:${o.name}`, compiler: compilerName });
        } else {
          counts.agreeBound++;
          fileAgg.agreeBound++;
          // Declaration-identity: same name is necessary, but the binder must
          // also resolve to the SAME declaration (file + offset).
          const refTarget = refTargetByOcc.get(`${f.idx}:${o.range.start}`);
          const cat = refTarget !== undefined ? identityOf.classify(o, refTarget, id) : 'unmappable';
          identity[cat]++;
          if (cat !== 'match' && cat !== 'merged-declaration') {
            // Shadowing rows are the actionable signal — keep more of them than
            // the expected alias-vs-chase / unmappable deviations.
            const shadowing = cat === 'shadowing-disagreement';
            const cap = shadowing ? 300 : 50;
            if (identityExamples.filter((e) => (e.reason === 'shadowing-disagreement') === shadowing).length < cap) {
              identityExamples.push({ path: rel, line: lineOf(f, o.range.start), name: o.name, role: ROLE_NAME[o.role], reason: cat, indexer: 'bound', compiler: identityOf.example(o, refTarget!, id) });
            }
          }
        }
      } else {
        const un = unByStart.get(o.range.start);
        if (un?.reason === 'lib-not-loaded') {
          // Informational, not a disagreement: the indexer deliberately leaves
          // standard-library globals to Tier 2. Still query the compiler — it
          // verifies the identifier EXISTS at the mapped offset (exercises the
          // .astro offset map) and cross-checks the lib classification.
          counts.libNotLoaded++;
          fileAgg.lib++;
          if (id === undefined) {
            counts.offsetMismatch++;
            disagreements.push({ path: rel, line: lineOf(f, o.range.start), name: o.name, role: ROLE_NAME[o.role], reason: 'lib-not-loaded', indexer: 'lib-not-loaded', compiler: '<no-identifier-at-offset>' });
          } else if (compilerName === undefined) counts.libCompilerNone++;
          else counts.libCompilerBinds++;
          continue;
        }
        if (compilerName === undefined) {
          counts.agreeUnresolved++;
          fileAgg.agreeUnresolved++;
        } else {
          counts.disagreeFalsePositive++;
          fileAgg.disagree++;
          disagreements.push({ path: rel, line: lineOf(f, o.range.start), name: o.name, role: ROLE_NAME[o.role], reason: un?.reason ?? '?', indexer: `unresolved:${un?.reason ?? '?'}`, compiler: compilerName });
        }
      }
    }
  }

  const report: Report = {
    rootDir,
    sample: targets,
    program: { rootNames: r.files.length, options: {} },
    universe,
    counts,
    identity,
    perFile,
    disagreements,
    identityExamples,
  };

  // libRefs never entered the universe (verified before the bindable check),
  // so only the residual lib-not-loaded rows are subtracted.
  const total = universe - counts.libNotLoaded;
  const agree = counts.agreeBound + counts.agreeUnresolved;
  const disagree = counts.disagreeBoundNoCompiler + counts.disagreeNameMismatch + counts.disagreeFalsePositive + counts.offsetMismatch;

  const lines: string[] = [];
  lines.push('=== differential validation report (Tier-1 binder vs compiler) ===');
  lines.push(`root: ${rootDir}`);
  lines.push(`targets: ${targets.length} files (${r.files.length} rootNames)${sampleOnly ? ' (--sample)' : ' (full inventory)'} · universe: ${universe} bindable occurrences`);
  lines.push(`astro source equivalence: ${astroSourceOk.join(', ')}`);
  lines.push('');
  lines.push('agreement:');
  lines.push(`  bound (same name at offset):           ${counts.agreeBound}`);
  lines.push(`  unresolved (both unresolvable):        ${counts.agreeUnresolved}`);
  lines.push('deliberate deviations (excluded):');
  lines.push(`  lib refs (emitted):                     ${counts.libRefs} (compiler-confirm ${counts.libRefAgree} / disagree ${counts.libRefDisagree} / framework ${counts.libRefFramework})`);
  lines.push(`  residual lib-not-loaded:                ${counts.libNotLoaded}`);
  if (counts.libNotLoaded > 0) {
    lines.push(`    ↳ compiler also binds:                ${counts.libCompilerBinds}`);
    lines.push(`    ↳ compiler binds nothing (framework): ${counts.libCompilerNone}`);
  }
  lines.push(`  non-bindable roles:                    ${counts.skippedNonBindable}`);
  lines.push(`  lowercase JSX intrinsics:              ${counts.skippedJsxIntrinsic}`);
  lines.push(`  astro template interpolations:         ${counts.skippedAstroTemplate}`);
  lines.push('disagreements:');
  lines.push(`  indexer bound, compiler none:          ${counts.disagreeBoundNoCompiler}`);
  lines.push(`  indexer bound, name mismatch:          ${counts.disagreeNameMismatch}`);
  lines.push(`  indexer unresolved, compiler binds:    ${counts.disagreeFalsePositive}`);
  lines.push(`  → agreement ${agree}/${total} (${total ? Math.round((100 * agree) / total) : 0}%) · ${disagree} disagreements`);
  lines.push('');
  lines.push('declaration identity (same name must also be the same declaration):');
  lines.push(`  match:                       ${identity.match}`);
  lines.push(`  merged-declaration:          ${identity['merged-declaration']}`);
  lines.push(`  alias-vs-chase:              ${identity['alias-vs-chase']} (indexer stopped at import binding — bare packages/ns)`);
  lines.push(`  shadowing-disagreement:      ${identity['shadowing-disagreement']} ← genuine resolution bug`);
  lines.push(`  unmappable:                  ${identity.unmappable}`);
  lines.push('');
  lines.push('per-file universe (path: universe/agreeBound+agreeUnresolved/lib/skipped):');
  for (const pf of perFile) {
    lines.push(`  ${pf.path}: ${pf.universe} (${pf.agreeBound + pf.agreeUnresolved})/${pf.lib}/${pf.skipped}${pf.disagree ? ` DISAGREE×${pf.disagree}` : ''}`);
  }
  lines.push('');
  lines.push(`first ${Math.min(20, disagreements.length)} disagreement lines:`);
  for (const d of disagreements.slice(0, 20)) {
    lines.push(`  ${d.path}:${d.line} ${d.name} [${d.role}] ${d.indexer} → compiler ${d.compiler}`);
  }
  lines.push('');
  lines.push('non-match identity examples (path:line name [role] reason :: indexer→compiler decls):');
  const nonMatch = identityExamples.filter((e) => e.reason === 'shadowing-disagreement' || e.reason === 'unmappable' || e.reason === 'alias-vs-chase');
  for (const d of nonMatch.slice(0, 20)) {
    lines.push(`  ${d.path}:${d.line} ${d.name} [${d.role}] ${d.reason} :: ${d.compiler}`);
  }

  const out = lines.join('\n');
  console.log(out);
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nfull report: ${REPORT_PATH}`);
  return report;
}

function main(): void {
  runValidation(ROOT, { sampleOnly: process.argv.includes('--sample') });
}

// Run only when executed directly (dist or src), not when imported (deep-tier.ts).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
