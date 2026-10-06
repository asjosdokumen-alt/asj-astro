#!/usr/bin/env node
/**
 * cli.ts — `idx` commands (design §8.5).
 *
 *   idx build [--json]        full build + summary (default)
 *   idx stats [--json]        counts + stage timings
 *   idx unresolved [--json]   unresolved imports + references
 *   idx export <file> [name] [--json]
 *                             file's export surface; with a name, resolve it
 *                             through barrels/aliases to the defining symbol
 *   idx dump [--pretty]      whole index as JSON on stdout: files, symbols,
 *                             bound refs, symbol edges, export surfaces
 *                             (plus unresolved refs); compact by default
 *   idx serve [--port N] [--snapshot <file>|--state <dir>] [--root <dir>]
 *                             [--refresh-ms N]   *                             Phase 5/6 query API (GET /stats /resolve /refs
   *                             /sym/:symId /search /deps /deps/cycles /deps/path
   *                             /deps/orphans /symbols /files/:path/unresolved
   *                             /violations /gen /diff?since=; POST /rebuild —
   *                             versioned reads take ?gen=, validated to the
   *                             current epoch). Serves a live build (rebuild
 *                             on POST /rebuild), an `idx dump` snapshot,
 *                             or an `idx watch` state dir polled every
 *                             --refresh-ms for new generations.
 *   idx watch [--root <dir>] [--state <dir>] [--poll <ms>]
 *                             [--watchdog-ms <ms>] [--keep-previous]
 *                             Phase 6: rebuild on every change and print one
 *                             JSON generation-diff line per commit; the state
 *                             dir keeps current.json (+ previous.json with
 *                             --keep-previous) for `idx serve --state`
 *   idx violations [--root <dir>] [--json]
 *                             evaluate the repo's own .dependency-cruiser.cjs
 *                             rules over the module graph (row 8): exit 0 when no error-severity
 *                             violation; warnings print but do not fail the gate
 *                             circular rules (to.circular) are evaluated over
 *                             the module graph’s SCCs (cycles.ts, row 8); each
 *                             violation prints its real cycle path (from → …
 *                             → from) with depcruise@18-identical member-set
 *                             dedupe
 *   idx def <file>:<line>[:<char>] [--json] [--snapshot <file>]
 *                             <file>:<line> answers what the line holds: the
 *                             tightest indexed declaration or reference on it
 *                             (resolveLine - CLI-only: GET /resolve answers one exact position;
 *                             HTTP line granularity is a designed follow-up, not built).
 *                             <file>:<line>:<char> pins one exact position
 *                             (line 1-based, char 0-based) instead. <file> takes
 *                             the same probing
 *                             as the other commands (exact path, extensionless
 *                             suffix, numeric idx). exit 0 when a symbol is
 *                             found, 1 on not-found, empty lines, or
 *                             malformed args
 *                             Def-at-import: a position on an import
 *                             specifier answers the imported definition when
 *                             the chase is unambiguous (same engine, via
 *                             resolvedVia 'import'). Renamed, default and
 *                             namespace imports cannot be chased from the
 *                             dump (per-edge imported names are dropped) and
 *                             keep the local binding with alternatives.
 *   idx refs <name> [--json]  [--snapshot <file>]
 *                             every reference site of the symbol whose exact
 *                             simple or qualified name equals <name> - the
 *                             same answer as GET /refs. never substring
 *                             matches; import-binding shadows never count as
 *                             candidates. exit 1 when no symbol matches, when
 *                             several definitions do (ranked candidates are
 *                             listed), or when the name is only imported   *                             (never declared: the import sites are grouped
   *                             by file)
   *                             A defined name also lists its import sites
   *                             (importing files + specifier positions)
   *                             alongside usage references - the complete
   *                             rename/impact answer. A name no repo symbol
   *                             defines but the libRefs table carries
   *                             (console, String, console.log) answers with
   *                             the LIB target(s) - declaration file + every
   *                             usage site (state "lib", exit 0).
 *   idx impact <name> [--gate N] [--json] [--snapshot <file>]
 *                             the rename/impact answer over the same name
 *                             resolution as refs: the definition site,
 *                             every reference + import site, the affected
 *                             file set (sorted, deduped), and a per-role
 *                             breakdown (call/member/read/...). --gate N
 *                             exits 2 when the affected file set exceeds N
 *                             (a CI rename gate); exit 1 for unknown,
 *                             ambiguous, or import-only names (same as refs).
 *
 * `<file>` (CLI and the serve API's `file` params) may be an exact path or an
 * extensionless path/suffix — the same extension probing the resolver uses
 * (`Icon` → `src/components/ui/Icon.tsx`; query API: /resolve, /deps, /symbols).
 * `/resolve`, `/deps`, `/symbols`, `idx export` and `idx def` share one
 * lookup (exact path, then extension probing, then numeric idx -
 * `resolveFileNeedle`); `idx refs <name>` is exact name matching and never
 * takes a file needle.
 * `--json` renders the invoked command's output as JSON, never another
 * command's output. Ranges/offsets follow docs/code-index-schema.ts; enum
 * fields (`kind`, `role`, `type`) are the numeric constants from that schema.
 * `idx dump` joins: ref.symKey / edge.target → symbols[].key,
 * ref.fileIdx / edge.source (when sourceKind "file") → files[].idx,
 * exportSurfaces[].fileIdx → files[].idx.
 *
 * Run the compiled output: `npm run idx` (builds first via idx:build).
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SymbolKind, type FileNode, type IndexStats, type SymbolNode } from '../../docs/code-index-schema.js';
import { buildIndex } from './build.js';
import type { BuildResult } from './build.js';
import { loadForbidRules, type LoadedRules } from './boundary.js';
import { dumpDoc, loadSnapshot } from './dump.js';
import { exportSymKey } from './exportTables.js';
import { impactReport, indexFromDoc, isImportBindingSymbol, libTargetsOf, refsOf, refsOfLib, resolveAt, resolveLine, symbolsByExactName, symbolsDefining, violationsOf, type ImpactReport, type LibTarget, type QueryIndex, type RefView, type ResolveView, type ViolationsView } from './query.js';
import { probeFilePaths } from './resolve.js';
import { serveIndex, type IndexHolder } from './serve.js';
import { commitGenerationLine, defaultStateDir, diffDocs, generationLine, isNoopDiff, loadStateDoc, pushHistory, startWatch } from './watch.js';

// Compiled location: indexer/dist/indexer/src/cli.js → 4 hops to the repo root.
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

/** `--root <dir>` override (watch/serve only; other commands keep the repo root). */
function rootOverride(): string | undefined {
  const v = flagValue('--root');
  return v === undefined ? undefined : resolve(v);
}

function intFlag(name: string): number | undefined {
  const v = flagValue(name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer, got: ${v}`);
  return n;
}

const args = process.argv.slice(2);
const json = args.includes('--json');
const pretty = args.includes('--pretty');
const positional = args.filter((a) => !a.startsWith('--'));
const cmd = positional[0] ?? 'build';

/** Value of a `--flag value` pair, or undefined when the flag is absent. */
function flagValue(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function printStats(stats: IndexStats): void {
  console.log(`indexed ${stats.fileCount} files · ${fmt(stats.symbolCount)} symbols · ${fmt(stats.referenceCount)} refs · ${stats.unresolvedCount} unresolved`);
  const s = stats.stageMs;
  console.log(
    `discover ${Math.round(s.discover)}ms · parse ${Math.round(s.parse)}ms · resolve ${Math.round(s.resolve)}ms · bind ${Math.round(s.bind)}ms · total ${Math.round(s.discover + s.parse + s.resolve + s.bind)}ms`,
  );
}

function printUnresolved(r: BuildResult): void {
  const imports = r.graph.unresolved;
  const refs = r.unresolvedRefs;
  if (imports.length === 0 && refs.length === 0) {
    console.log('no unresolved imports or references');
    return;
  }
  if (imports.length > 0) {
    console.log(`unresolved imports (${imports.length}):`);
    for (const u of imports) {
      const path = r.files[u.from as unknown as number]?.path ?? `#${u.from}`;
      console.log(`  ${path} → ${u.specifier} (${u.reason})`);
    }
  }
  if (refs.length > 0) {
    // Aggregate occurrence-level unresolved by name for a readable summary.
    // Known standard-library globals are tagged `lib-not-loaded` (Tier 1 has
    // no lib tables; the lib tier graduates the whole bucket — lib globals
    // via the compiler, CJS module vars + framework globals via canonical
    // entries — so the bucket is empty in deep builds; the collapse keeps
    // genuine unknowns visible if any remain).
    const byName = new Map<string, { reason: string; count: number; sample: string }>();
    for (const u of refs) {
      const hit = byName.get(u.name);
      if (hit) hit.count++;
      else {
        const path = r.files[u.fileIdx as unknown as number]?.path ?? '';
        byName.set(u.name, { reason: u.reason, count: 1, sample: path });
      }
    }
    const libCount = refs.filter((u) => u.reason === 'lib-not-loaded').length;
    const genuine = refs.filter((u) => u.reason !== 'lib-not-loaded');
    const libNames = [...byName.entries()]
      .filter(([, v]) => v.reason === 'lib-not-loaded')
      .sort((a, b) => b[1].count - a[1].count)
      .map(([n, v]) => `${n} ×${v.count}`)
      .slice(0, 12)
      .join(', ');
    console.log(`unresolved references (${refs.length}; ${genuine.length} genuine, ${libCount} lib-not-loaded):`);
    if (genuine.length > 0) {
      const sorted = [...byName.entries()]
        .filter(([, v]) => v.reason !== 'lib-not-loaded')
        .sort((a, b) => b[1].count - a[1].count);
      for (const [name, v] of sorted.slice(0, 25)) console.log(`  ${name} ×${v.count} (${v.reason}) — e.g. ${v.sample}`);
      if (sorted.length > 25) console.log(`  … and ${sorted.length - 25} more names`);
    } else {
      console.log('  no genuine unknowns');
    }
    if (libNames.length > 0) console.log(`  (lib) ${libNames}${byName.size > libNames.length ? ' …' : ''}`);
  }
}

function pathOf(r: BuildResult, idx: number): string {
  return r.files[idx as unknown as number]?.path ?? `#${idx}`;
}

/** Locate an indexed file from a CLI needle — shared extension-probing lookup (§13). */
function findFile(r: BuildResult, needle: string): FileNode | undefined {
  return probeFilePaths(r.files, needle);
}

/** JSON shape for `export <file>` without a name. */

// ── `export <file> [name]`: one semantic view, rendered as text or JSON ──────
// The resolution outcome is computed once (resolveExport + symbol lookups);
// the two renderers below only format it. JSON intentionally omits `targetName`
// (a text-only detail of re-export clauses) — property order is part of the
// wire contract for byte-stable diffs.

interface SurfaceView {
  file: string;
  exports: string[];
  starSources: number;
}

type ResolutionView =
  | { state: 'missing'; file: string; name: string }
  | {
      state: 'ambiguous';
      file: string;
      name: string;
      candidates: Array<{ symId: string | null; symKey: number; fromFile: string }>;
    }
  | {
      state: 'resolved';
      file: string;
      name: string;
      kind: string;
      symId: string | null;
      symKey: number | null;
      localName?: string;
      exportName?: string;
      targetName?: string;
    };

function symByKey(r: BuildResult, key: number): SymbolNode | undefined {
  return r.symbols.find((s) => s.key === key);
}

/** `export <file>` surface (sorted names + star re-export count). */
function surfaceView(r: BuildResult, f: FileNode): SurfaceView {
  const surface = r.exportSurfaces.get(f.idx);
  return {
    file: f.path,
    exports: surface ? [...surface.table.keys()].sort() : [],
    starSources: surface?.starSources.length ?? 0,
  };
}

/** `export <file> <name>` — never throws; `missing` when the name is not exported. */
function resolveView(r: BuildResult, f: FileNode, name: string): ResolutionView {
  const entry = r.resolveExport(f.idx, name);
  const base = { file: f.path, name };
  if (!entry) return { state: 'missing', ...base };
  if (entry.kind === 'ambiguous') {
    return {
      state: 'ambiguous',
      ...base,
      candidates: entry.candidates.map((c) => ({ symId: symByKey(r, c.symKey)?.id ?? null, symKey: c.symKey, fromFile: pathOf(r, c.fromFileIdx) })),
    };
  }
  const symKey = exportSymKey(entry);
  const resolved: Extract<ResolutionView, { state: 'resolved' }> = {
    state: 'resolved',
    ...base,
    kind: entry.kind,
    symId: symKey !== null ? (symByKey(r, symKey)?.id ?? null) : null,
    symKey,
  };
  if ('localName' in entry) resolved.localName = entry.localName;
  if ('exportName' in entry) resolved.exportName = entry.exportName;
  if ('targetName' in entry) resolved.targetName = entry.targetName;
  return resolved;
}

function printSurfaceText(v: SurfaceView): void {
  console.log(`${v.file}: ${v.exports.length} exports${v.starSources ? ` · ${v.starSources} export *` : ''}`);
  for (const n of v.exports) console.log(`  ${n}`);
}

function printResolveText(v: ResolutionView): void {
  if (v.state === 'missing') {
    console.log(`${v.file}: ${v.name} is not exported`);
    return;
  }
  if (v.state === 'ambiguous') {
    console.log(`${v.file}: ${v.name} → ambiguous (${v.candidates.length} candidates)`);
    for (const c of v.candidates) console.log(`  ${c.symId ?? `key ${c.symKey}`}  (via ${c.fromFile})`);
    return;
  }
  const via =
    v.kind === 'alias' && v.localName !== undefined
      ? ` (alias of ${v.localName})`
      : v.kind === 'reExport' && v.targetName !== undefined
        ? ` (re-export of ${v.targetName})`
        : '';
  const target = v.symId ?? (v.symKey !== null ? `key ${v.symKey}` : 'unresolved');
  console.log(`${v.file}: ${v.name} → ${target}${via}`);
}

function surfaceJson(v: SurfaceView): Record<string, unknown> {
  return { file: v.file, exports: v.exports, starSources: v.starSources };
}

function resolutionJson(v: ResolutionView): Record<string, unknown> {
  const base = { file: v.file, name: v.name };
  if (v.state === 'missing') return { ...base, resolved: null };
  if (v.state === 'ambiguous') {
    return { ...base, resolved: { kind: 'ambiguous', candidates: v.candidates.map((c) => ({ symId: c.symId, key: c.symKey, fromFile: c.fromFile })) } };
  }
  const resolved: Record<string, unknown> = { kind: v.kind, symId: v.symId, key: v.symKey };
  if (v.localName !== undefined) resolved.localName = v.localName;
  if (v.exportName !== undefined) resolved.exportName = v.exportName;
  return { ...base, resolved };
}
/** Parse a file:line[:char] def needle. The file part may itself contain
 * colons (Windows drive letters, file:// URIs), so split from the end.
 * Line is a 1-based editor line, char a 0-based column (schema convention).
 * An omitted char means line-granular mode (resolveLine). Throws a usage hint
 */
function parseDefPosition(arg: string): { file: string; line: number; char?: number } {
  const m = /:([0-9]+)(?::([0-9]+))?$/.exec(arg);
  if (!m || arg.slice(0, m.index) === '') {
    throw new Error("expected <file>:<line>[:<char>] (line 1-based, char 0-based), got: " + arg);
  }
  const base = { file: arg.slice(0, m.index), line: Number(m[1]) };
  return m[2] === undefined ? base : { ...base, char: Number(m[2]) };
}

/** Text rendering for a def outcome: the file-not-found and no-symbol states
 * keep their one-line hints (the line-mode hint only owns the empty-line
 * case); a resolved view gets the full print. */
function printDefOutcome(v: ResolveView, lineMode: boolean): void {
  if (v.fileFound && v.resolved === null && lineMode) {
    console.log('no symbol on line ' + v.query.file + ':' + v.query.line + ' (no indexed declaration or reference on the line; file:line:char pins an exact position)');
    return;
  }
  printDefText(v);
}
function printDefText(v: ResolveView): void {
  const q = v.query;
  const pos = q.file + ':' + q.line + ':' + q.character;
  if (!v.fileFound) {
    console.log('file not found: ' + q.file);
    return;
  }
  if (v.resolved === null) {
    console.log('no symbol at ' + pos + ' (line/char are 0-based; pass file:line:char for a precise position)');
    return;
  }
  const r = v.resolved;
  console.log(pos + ' -> ' + r.name + ' (' + r.qualified + ') -- ' + r.symId);
  console.log('  resolvedVia: ' + r.resolvedVia + ' | kind: ' + (KIND_LABEL[r.kind] ?? r.kind) + ' (' + r.kind + ') | in ' + r.file);
  for (const d of r.decls) console.log('  declared at ' + d.uri + ':' + d.l + ':' + d.c);
  if (r.detail !== undefined) console.log('  detail: ' + r.detail);
  if (v.alternatives.length > 0) {
    console.log('  alternatives (same name elsewhere; never substituted):');
    for (const a of v.alternatives) console.log('    ' + a.symId + '  ' + a.file + ' (' + a.reason + ', ' + a.refCount + ' refs)');
  }
}

function printRefsText(v: RefView): void {
  console.log(v.symId + '  (declared in ' + v.file + ')');
  for (const d of v.decls) console.log('  declared at ' + d.uri + ':' + d.l + ':' + d.c);
  if (v.references.length === 0) console.log('  no references');
  else {
    console.log('  ' + v.references.length + ' reference(s):');
    for (const r of v.references) console.log('    ' + r.file + ':' + r.line + ':' + r.char + '  role ' + r.role + '  via ' + r.resolvedVia);
  }
  if (v.imports.length > 0) {
    console.log('  ' + v.imports.length + ' import site(s):');
    for (const i of v.imports) {
      for (const d of i.decls) console.log('    ' + d.uri + ':' + d.l + ':' + d.c + '  (import specifier)');
    }
  }
}
type RefsByNameView =
  | { state: "resolved"; view: RefView }
  | { state: "not-found"; name: string }
  | { state: "import-only"; name: string; total: number; files: Array<{ file: string; sites: number }> }
  | {
      state: "ambiguous";
      name: string;
      candidates: Array<{ symId: string; name: string; qualified: string; file: string; references: number }>;
    }
  | { state: "lib"; name: string; targets: LibTarget[] };

/** One by-name refs answer. Definitions come ranked from the query layer
 * (symbolsDefining owns the shadow exclusion + comparator); when nothing
 * defines the name but imports exist, the grouped import-only answer. */
function refsByNameView(index: QueryIndex, name: string): RefsByNameView {
  const defs = symbolsDefining(index, name);
  if (defs.length === 1) return { state: "resolved", view: refsOf(index, defs[0].id) };
  if (defs.length > 1) {
    return {
      state: "ambiguous",
      name,
      candidates: defs.map((sym) => ({
        symId: sym.id,
        name: sym.name,
        qualified: sym.qualified,
        file: index.fileByIdx.get(sym.fileIdx)?.path ?? '#' + sym.fileIdx,
        references: refsOf(index, sym.id).references.length,
      })),
    };
  }
  const shadows = symbolsByExactName(index, name).filter(isImportBindingSymbol);
  if (shadows.length === 0) {
    // No repo definition and no import shadow: a lib name (console, String,
    // console.log) answers with every usage site from the libRefs table.
    const targets = libTargetsOf(index, name);
    if (targets.length > 0) return { state: 'lib', name, targets };
    return { state: 'not-found', name };
  }
  const byFile = new Map<string, number>();
  for (const sym of shadows) {

    const file = index.fileByIdx.get(sym.fileIdx)?.path ?? '#' + sym.fileIdx;
    byFile.set(file, (byFile.get(file) ?? 0) + 1);
  }
  const files = [...byFile.entries()]
    .map(([file, sites]) => ({ file, sites }))
    .sort((a, b) => a.file.localeCompare(b.file));
  return { state: "import-only", name, total: shadows.length, files };
}

function refsByNameJson(index: QueryIndex, v: RefsByNameView): unknown {
  switch (v.state) {
    case "resolved":
      return v.view;
    case "not-found":
      return { found: false, name: v.name };
    case "ambiguous":
      return { found: false, ambiguous: true, name: v.name, candidates: v.candidates };
    case "import-only":
      return { found: false, importedOnly: true, name: v.name, total: v.total, files: v.files };
    case "lib":
      return {
        found: true,
        lib: true,
        name: v.name,
        targets: v.targets.map((t) => ({
          libName: t.libName,
          libId: t.libId,
          libPath: t.libPath,
          ...(t.decl !== undefined ? { decl: t.decl } : {}),
          ...(t.kind !== undefined ? { kind: t.kind } : {}),
          ...(t.detail !== undefined ? { detail: t.detail } : {}),
          siteCount: t.sites.length,
          sites: t.sites.map((z) => ({
            file: index.fileByIdx.get(z.fileIdx)?.path ?? '#' + z.fileIdx,
            line: z.range.startLine,
            char: z.range.startChar,
            role: z.role ?? 0,
          })),
        })),
      };
  }
}

const ROLE_LABEL: Record<number, string> = {
  1: 'read', 2: 'write', 3: 'call', 4: 'type', 5: 'member', 6: 'jsx',
  7: 'import', 8: 're-export', 9: 'decorator',
};

/** SymbolKind names — def/hover renders `kind: Property (11)`, never a bare number. */
const KIND_LABEL: Record<number, string> = Object.fromEntries(
  Object.entries(SymbolKind).map(([k, v]) => [v, k]),
) as Record<number, string>;

function printImpactText(r: ImpactReport): void {
  console.log('impact: ' + r.name);
  console.log('  definition: ' + r.definition.file + ':' + (r.definition.decls[0]?.l ?? 0));
  const roles = Object.keys(r.roleBreakdown)
    .sort()
    .map((k) => (ROLE_LABEL[Number(k)] ?? k) + '=' + r.roleBreakdown[k])
    .join(', ');
  console.log('  ' + r.siteCount + ' reference site(s) in ' + r.files.length + ' file(s)' + (roles ? '  [' + roles + ']' : ''));
  if (r.imports.length) {
    console.log('  import sites: ' + r.imports.map((i) => i.file + ':' + i.decls.map((d) => d.l).join(',')).join('  '));
  }
  console.log('  files: ' + r.files.join(', '));
}

function printRefsByNameText(index: QueryIndex, v: RefsByNameView): void {
  switch (v.state) {
    case "resolved":
      printRefsText(v.view);
      return;
    case "not-found":
      console.log('symbol not found: ' + v.name);
      return;
    case "ambiguous": {
      console.log('symbol ' + v.name + ' is ambiguous: ' + v.candidates.length + ' symbols define it; pass a qualified name or symId');
      for (const c of v.candidates) console.log('  ' + c.symId + '  ' + c.file + ' (' + c.references + ' refs)');
      return;
    }
    case "import-only": {
      console.log('symbol ' + v.name + ' is never declared in the indexed tree - only imported (' + v.total + ' site(s) across ' + v.files.length + ' file(s)); external symbols have no refs to list');
      for (const f of v.files) console.log('  ' + f.file + (f.sites > 1 ? ' (' + f.sites + ' sites)' : ''));
      return;
    }
    case "lib": {
      console.log('lib symbol ' + v.name + ': ' + v.targets.length + ' target(s), every usage site across the repo:');
      for (const t of v.targets) {
        const kind = KIND_LABEL[t.kind ?? 0] ?? t.kind ?? '?';
        console.log(
          '  ' + t.libName + '  (' + kind + (t.detail !== undefined ? ' · ' + t.detail : '') + ')' + (t.decl !== undefined ? ' — declared at ' + t.libPath + ':' + t.decl.line + ':' + t.decl.char : '') + ' · ' + t.sites.length + ' site(s)',
        );
        for (const z of t.sites) {
          const f = index.fileByIdx.get(z.fileIdx)?.path ?? '#' + z.fileIdx;
          console.log('    ' + f + ':' + z.range.startLine + ':' + z.range.startChar + '  role ' + (ROLE_LABEL[z.role ?? 0] ?? z.role ?? 0));
        }
      }
      return;
    }
  }
}

function snapshotHolder(path: string): IndexHolder {
  return { index: indexFromDoc(loadSnapshot(path)), source: `snapshot:${path}`, history: [] };
}

/**
 * Serve an `idx watch` state dir: load the newest generation, then poll
 * current.json every refreshMs and atomically swap the holder's index when
 * the epoch advances (marker-file refresh; WS push is the §11 row 6 follow-up).
 */
function stateHolder(stateDir: string, refreshMs: number): IndexHolder {
  const doc = loadStateDoc(stateDir);
  if (!doc) {
    throw new Error(`no generation yet at ${stateDir}/current.json — start 'idx watch --state ${stateDir}' first`);
  }
  const holder: IndexHolder = { index: indexFromDoc(doc), source: `state:${stateDir}`, history: [] };
  const tick = (): void => {
    const next = loadStateDoc(stateDir);
    if (!next || next.epoch <= holder.index.doc.epoch) return;
    const t0 = Date.now();
    // Observer path: the gen comes from the persisted doc (a poll can skip
    // intermediate commits); the diff line shape is shared (generationLine).
    const base = diffDocs(holder.index.doc, next);
    if (isNoopDiff(base)) return;
    const line = generationLine(next.epoch, 'poll', Date.now() - t0, base);
    pushHistory(holder.history, line);
    holder.index = indexFromDoc(next);
    console.error(`[idx serve] gen ${next.epoch}: +${line.added.length} ~${line.changed.length} -${line.removed.length} (${line.symbolDelta >= 0 ? '+' : ''}${line.symbolDelta} symbols)`);
  };
  const timer = setInterval(tick, refreshMs);
  timer.unref();
  return holder;
}

/** Live-build serve: POST /rebuild schedules an async full rebuild + swap. */
function liveHolder(_root: string, build: () => BuildResult): IndexHolder {
  const initial = dumpDoc(build());
  const holder: IndexHolder = { index: indexFromDoc(initial), source: 'build', history: [] };
  let current = initial;
  let rebuilding = false;
  holder.requestRebuild = (): void => {
    if (rebuilding) return;
    rebuilding = true;
    setImmediate(() => {
      try {
        const t0 = Date.now();
        const doc = dumpDoc(build());
        const line = commitGenerationLine(current, doc, 'manual', Date.now() - t0);
        if (!line) {
          console.error('[idx serve] rebuild: no change');
          return;
        }
        pushHistory(holder.history, line);
        current = doc; // commitGenerationLine stamped doc.epoch
        holder.index = indexFromDoc(doc);
        console.error(`[idx serve] rebuilt → gen ${line.gen}: +${line.added.length} ~${line.changed.length} -${line.removed.length} (${line.symbolDelta >= 0 ? '+' : ''}${line.symbolDelta} symbols)`);
      } catch (err) {
        console.error(`[idx serve] rebuild failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        rebuilding = false;
      }
    });
  };
  return holder;
}

function printViolationsText(view: ViolationsView, skipped: LoadedRules['skipped']): void {
  if (view.violations.length === 0) {
    console.log('no boundary violations — architecture rules hold');
    if (skipped.length > 0) console.log(`(skipped: ${skipped.map((s) => `${s.name} (${s.reason})`).join('; ')})`);
    return;
  }
  for (const v of view.violations) {
    const note = v.reason ? ` — ${v.reason}` : '';
    const target = v.cycle ? v.cycle.join(' → ') : v.to;
    console.log(`[${v.severity}] ${v.ruleName}: ${v.from} → ${target} (${v.type})${note}`);
  }
  console.log(`${view.total} boundary violation(s): ${view.errors} error(s), ${view.warnings} warning(s)`);
  if (skipped.length > 0) console.log(`(skipped: ${skipped.map((s) => `${s.name} (${s.reason})`).join('; ')})`);
}

async function main(): Promise<void> {
  // Build lazily: `serve --snapshot` never needs the pipeline.
  let result: BuildResult | null = null;
  const built = (): BuildResult => (result ??= buildIndex(rootDir));
  // def/refs fast path: --snapshot <file> reads a dump doc without building.
  const readIndex = (): QueryIndex => {
    const snapshotPath = flagValue('--snapshot');
    return snapshotPath !== undefined ? indexFromDoc(loadSnapshot(snapshotPath)) : indexFromDoc(dumpDoc(built()));
  };

  switch (cmd) {
    case 'stats': {
      const r = built();
      if (json) console.log(JSON.stringify({ stats: r.stats }, null, 2));
      else printStats(r.stats);
      break;
    }
    case 'unresolved': {
      const r = built();
      if (json) {
        console.log(
          JSON.stringify(
            {
              imports: r.graph.unresolved.map((u) => ({ file: pathOf(r, u.from), specifier: u.specifier, reason: u.reason })),
              references: r.unresolvedRefs.map((u) => ({ file: pathOf(r, u.fileIdx), name: u.name, reason: u.reason, range: u.range })),
            },
            null,
            2,
          ),
        );
      } else {
        printUnresolved(r);
      }
      break;
    }
    case 'export': {
      const r = built();
      const needle = positional[1] ?? '';
      const f = findFile(r, needle);
      if (!f) {
        console.error(`file not found: ${needle}`);
        process.exitCode = 1;
        return;
      }
      const name = positional[2];
      if (name === undefined) {
        const view = surfaceView(r, f);
        if (json) console.log(JSON.stringify(surfaceJson(view), null, 2));
        else printSurfaceText(view);
      } else {
        const view = resolveView(r, f, name);
        if (json) console.log(JSON.stringify(resolutionJson(view), null, 2));
        else printResolveText(view);
      }
      break;
    }
    case 'def': {
      const arg = positional[1];
      if (arg === undefined) {
        console.error('usage: idx def <file>:<line>[:<char>] [--json] [--snapshot <file>]');
        process.exitCode = 1;
        return;
      }
      let pos: { file: string; line: number; char?: number };
      try {
        pos = parseDefPosition(arg);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
        return;
      }
      const index = readIndex();
      const lineMode = pos.char === undefined;
      const view = pos.char === undefined ? resolveLine(index, pos.file, pos.line) : resolveAt(index, pos.file, pos.line, pos.char);
      if (json) console.log(JSON.stringify(view, null, 2));
      else printDefOutcome(view, lineMode);
      if (!view.fileFound || view.resolved === null) process.exitCode = 1;
      break;
    }
    case 'refs': {
      const name = positional[1];
      if (name === undefined) {
        console.error('usage: idx refs <name> [--json] [--snapshot <file>]');
        process.exitCode = 1;
        return;
      }
      const index = readIndex();
      const view = refsByNameView(index, name);
      if (json) console.log(JSON.stringify(refsByNameJson(index, view), null, 2));
      else printRefsByNameText(index, view);
      if (view.state !== 'resolved') process.exitCode = 1;
      break;
    }
    case 'impact': {
      const name = positional[1];
      if (name === undefined) {
        console.error('usage: idx impact <name> [--gate N] [--json] [--snapshot <file>]');
        process.exitCode = 1;
        return;
      }
      const gate = intFlag('--gate');
      const index = readIndex();
      const view = refsByNameView(index, name);
      if (view.state !== 'resolved') {
        // A single lib target (console, String) is a resolved impact answer:
        // the lib declaration as definition, every usage site as references.
        if (view.state === 'lib' && view.targets.length === 1) {
          const report = impactReport(refsOfLib(index, view.targets[0]));
          if (json) console.log(JSON.stringify(report, null, 2));
          else printImpactText(report);
          if (gate !== undefined && report.files.length > gate) process.exitCode = 2;
          break;
        }
        if (json) console.log(JSON.stringify(refsByNameJson(index, view), null, 2));
        else printRefsByNameText(index, view);
        process.exitCode = 1;
        break;
      }
      const report = impactReport(view.view);
      if (json) console.log(JSON.stringify(report, null, 2));
      else printImpactText(report);
      if (gate !== undefined && report.files.length > gate) process.exitCode = 2;
      break;
    }
    case 'dump': {
      console.log(JSON.stringify(dumpDoc(built()), null, json || pretty ? 2 : 0));
      break;
    }
    case 'serve': {
      const snapshotPath = flagValue('--snapshot');
      const stateDir = flagValue('--state');
      const root = rootOverride() ?? rootDir;
      if (snapshotPath !== undefined && stateDir !== undefined) {
        throw new Error('--snapshot and --state are mutually exclusive');
      }
      const portRaw = flagValue('--port');
      const port = portRaw === undefined ? 8787 : Number(portRaw);
      if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error(`invalid port: ${portRaw} (expected 0–65535)`);
      }
      const refreshMs = intFlag('--refresh-ms') ?? 1000;
      if (snapshotPath !== undefined) {
        await serveIndex(snapshotHolder(snapshotPath), port);
      } else if (stateDir !== undefined) {
        await serveIndex(stateHolder(stateDir, refreshMs), port);
      } else {
        await serveIndex(liveHolder(root, root === rootDir ? built : () => buildIndex(root)), port);
      }
      break;
    }
    case 'watch': {
      const root = rootOverride() ?? rootDir;
      const stateDir = flagValue('--state') ?? defaultStateDir(root);
      const pollMs = intFlag('--poll');
      const watchdogMs = intFlag('--watchdog-ms');
      const keepPrevious = args.includes('--keep-previous');
      const log = (m: string): void => console.error(`[idx watch] ${m}`);
      const handle = await startWatch({ rootDir: root, stateDir, pollMs, watchdogMs, keepPrevious, log }, (d) => console.log(JSON.stringify(d)));
      log(`watching ${root} → ${stateDir} (JSONL diffs on stdout; ctrl-c to stop)`);
      await new Promise<void>((done) => {
        const stop = (): void => {
          handle.stop();
          done();
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
      });
      break;
    }
    case 'violations': {
      const root = rootOverride() ?? rootDir;
      const r = root === rootDir ? built() : buildIndex(root);
      const loaded = await loadForbidRules(root);
      const view = violationsOf(indexFromDoc(dumpDoc(r)), loaded.rules);
      const body = {
        config: loaded.config,
        root,
        rulesEvaluated: loaded.rules.length,
        skippedRules: loaded.skipped,
        gen: view.gen,
        total: view.total,
        errors: view.errors,
        warnings: view.warnings,
        clean: view.errors === 0, // gate semantics: warnings print, only errors fail
        violations: view.violations,
      };
      if (json) console.log(JSON.stringify(body, null, 2));
      else printViolationsText(view, loaded.skipped);
      if (view.errors > 0) process.exitCode = 1; // warnings print but do not fail the gate
      break;
    }
    case 'build':
    default: {
      const r = built();
      if (json) console.log(JSON.stringify({ stats: r.stats, unresolved: r.graph.unresolved }, null, 2));
      else {
        printStats(r.stats);
        printUnresolved(r);
      }
      break;
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
