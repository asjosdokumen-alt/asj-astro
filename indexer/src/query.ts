/**
 * query.ts — the read-side query layer over a dump document (`idx dump` /
 * `serve --snapshot`, or a live build serialized with dumpDoc). All positions
 * are one coordinate space with the schema's Range convention: 1-based lines,
 * 0-based chars.
 *
 * resolveAt answers "what symbol is here?" (declaration site first, then the
 * tightest containing reference); refsOf answers "who references this
 * symbol?"; search is a case-insensitive substring over name + qualified.
 */

import type { DumpDoc, DumpFile, DumpImportEdge, DumpRef, DumpSurface, DumpSymbol } from './dump.js';
import type { Range } from '../../docs/code-index-schema.js';
import { EdgeType, SymbolKind } from '../../docs/code-index-schema.js';
import { probeFilePaths } from './resolve.js';
import { computeCycles } from './cycles.js';

export interface QueryIndex {
  doc: DumpDoc;
  fileByIdx: Map<number, DumpFile>;
  fileIdxByLower: Map<string, number>;
  symbolById: Map<string, DumpSymbol>;
  /// numeric key -> symbol: refs and edges carry keys, resolveAt joins on them.
  symbolByKey: Map<number, DumpSymbol>;
  /** simple-name (lowercased) → symbols, declaration order — alternatives + exact search. */
  nameIndex: Map<string, DumpSymbol[]>;
  refsBySymKey: Map<number, DumpRef[]>;
  /** per-file refs sorted by byte start (tightest-containing scan). */
  refsByFile: Map<number, DumpRef[]>;
  /** module graph: out-edges per file (imports/reexports) and file-to-file in-edges. */
  importsByFile: Map<number, DumpImportEdge[]>;
  dependentsByFile: Map<number, DumpImportEdge[]>;
  /** per-file export surface (named entries + star re-export sources). */
  surfaceByFile: Map<number, DumpSurface>;
  /** Lib tier rows per file (joined with the lib declaration file path),
   * sorted by byte start — resolveAt's third candidate class (resolvedVia
   * 'lib'), so def/hover on String / console / document.createElement answer
   * with the lib declaration instead of 'no symbol'. Absent for legacy
   * snapshots without libs/libRefs. */
  libRefsByFile: Map<number, LibRefView[]>;
  /** Lib tier rows keyed by lowercased site name AND lowercased qualified lib
   * name (`console`, `log`, `console.log` …) — the idx refs/impact by-name
   * answer for lib globals/members (no repo symbol defines them). */
  libRefsByName: Map<string, LibRefView[]>;
  symbolsByFile: Map<number, DumpSymbol[]>;
  /** Memo of importTargetsOf results keyed "fileIdx:name" - the doc is
   * immutable and the chase is pure, so results never go stale. */
  chaseMemo?: Map<string, DumpSymbol[]>;
  /** Lazy SCC/circularity answers over doc.importEdges (doc is immutable). */
  cycles?: ReturnType<typeof computeCycles>;
}

/** One lib tier row joined with its declaration file, as the tightest-range
 * scan sees it: the site range plus the def/hover target (lib file path +
 * declaration position inside it). */
export interface LibRefView {
  range: Range;
  name: string;
  /** Site file (for by-name site listings — the file-level index is keyed by
   * fileIdx, so the row itself carries it). */
  fileIdx: number;
  libIdx: number;
  libName: string;
  /** Declaration position inside the lib file (absent for canonical entries
   * with no physical declaration, e.g. the intrinsic undefined/globalThis). */
  decl?: { line: number; char: number };
  /** SymbolKind of the lib declaration. */
  kind?: number;
  /** Short signature/kind text of the lib declaration (first source line). */
  detail?: string;
  /** OccurrenceRole of the site (Property for member rows, Read/Callee/… for
   * value rows) — the impact role breakdown. */
  role?: number;
  /** Path of the declaration file (rootDir/node_modules/<libId>, or absolute
   * when the id is machine-absolute). */
  libPath: string;
  /** The libs[] id (node_modules-relative). */
  libId: string;
}

/** Absolute path of a lib declaration file from its doc id. */
function libPathOf(doc: DumpDoc, id: string): string {
  if (/^([a-zA-Z]:[\\/]|\/)/.test(id)) return id; // already machine-absolute
  const root = doc.rootDir ?? '';
  if (id.startsWith('node_modules/')) return root ? `${root}/${id}` : id;
  return root ? `${root}/node_modules/${id}` : id;
}

export function indexFromDoc(doc: DumpDoc): QueryIndex {
  const fileByIdx = new Map<number, DumpFile>();
  const fileIdxByLower = new Map<string, number>();
  for (const f of doc.files) {
    fileByIdx.set(f.idx, f);
    fileIdxByLower.set(f.path.toLowerCase(), f.idx);
  }
  const symbolById = new Map<string, DumpSymbol>();
  const symbolByKey = new Map<number, DumpSymbol>();
  const nameIndex = new Map<string, DumpSymbol[]>();
  const symbolsByFile = new Map<number, DumpSymbol[]>();
  for (const s of doc.symbols) {
    symbolById.set(s.id, s);
    symbolByKey.set(s.key, s);
    let list = symbolsByFile.get(s.fileIdx);
    if (!list) symbolsByFile.set(s.fileIdx, (list = []));
    list.push(s);
    const key = s.name.toLowerCase();
    let nl = nameIndex.get(key);
    if (!nl) nameIndex.set(key, (nl = []));
    nl.push(s);
  }
  const refsBySymKey = new Map<number, DumpRef[]>();
  const refsByFile = new Map<number, DumpRef[]>();
  for (const ref of doc.refs) {
    let list = refsBySymKey.get(ref.symKey);
    if (!list) refsBySymKey.set(ref.symKey, (list = []));
    list.push(ref);
    let fl = refsByFile.get(ref.fileIdx);
    if (!fl) refsByFile.set(ref.fileIdx, (fl = []));
    fl.push(ref);
  }
  for (const fl of refsByFile.values()) fl.sort((a, b) => a.range.start - b.range.start);
  const libRefsByFile = new Map<number, LibRefView[]>();
  const libRefsByName = new Map<string, LibRefView[]>();
  if (Array.isArray(doc.libRefs) && Array.isArray(doc.libs)) {
    const libByIdx = new Map(doc.libs.map((l) => [l.idx, l]));
    for (const z of doc.libRefs) {
      const lib = libByIdx.get(z.libIdx);
      if (!lib) continue;
      const view: LibRefView = {
        range: z.range,
        name: z.name,
        fileIdx: z.fileIdx,
        libIdx: z.libIdx,
        libName: z.libName,
        ...(z.decl !== undefined ? { decl: z.decl } : {}),
        ...(z.kind !== undefined ? { kind: z.kind } : {}),
        ...(z.detail !== undefined ? { detail: z.detail } : {}),
        ...(z.role !== undefined ? { role: z.role } : {}),
        libPath: libPathOf(doc, lib.id),
        libId: lib.id,
      };
      let list = libRefsByFile.get(z.fileIdx);
      if (!list) libRefsByFile.set(z.fileIdx, (list = []));
      list.push(view);
      const byName = (k: string): void => {
        let nl = libRefsByName.get(k);
        if (!nl) libRefsByName.set(k, (nl = []));
        // A site matching both keys (name === libName) must appear once.
        if (nl.length === 0 || nl[nl.length - 1].range.start !== z.range.start) nl.push(view);
      };
      byName(z.name.toLowerCase());
      byName(z.libName.toLowerCase());
    }
    for (const list of libRefsByFile.values()) list.sort((a, b) => a.range.start - b.range.start);
  }
  const importsByFile = new Map<number, DumpImportEdge[]>();
  const dependentsByFile = new Map<number, DumpImportEdge[]>();
  for (const e of doc.importEdges ?? []) {
    let il = importsByFile.get(e.from);
    if (!il) importsByFile.set(e.from, (il = []));
    il.push(e);
    if (typeof e.to === 'number' && fileByIdx.has(e.to)) {
      let dl = dependentsByFile.get(e.to);
      if (!dl) dependentsByFile.set(e.to, (dl = []));
      dl.push(e);
    }
  }
  const surfaceByFile = new Map<number, DumpSurface>();
  for (const surface of doc.exportSurfaces) surfaceByFile.set(surface.fileIdx, surface);
  return { doc, fileByIdx, fileIdxByLower, symbolById, symbolByKey, nameIndex, refsBySymKey, refsByFile, symbolsByFile, importsByFile, dependentsByFile, surfaceByFile, libRefsByFile, libRefsByName };
}

/** Repo-relative path for a fileIdx, or `#<idx>` when absent (never throws). */
function pathOf(index: QueryIndex, fileIdx: number): string {
  return index.fileByIdx.get(fileIdx)?.path ?? `#${fileIdx}`;
}

/**
 * The one file-needle policy for the query API, shared by /resolve, /deps,
 * /symbols (and, over a build, `idx export` via the same probe): an exact
 * repo path (case-insensitive; O(1) map), then the resolver/CLI extension
 * probing — so `repository`, `contexts/catalog/repository` and `Icon` all
 * resolve — then a numeric file idx. Ambiguous needles pick the first hit
 * in file-list order, deterministically and identically to the CLI.
 */
function resolveFileNeedle(index: QueryIndex, needle: string): number | undefined {
  const exact = index.fileIdxByLower.get(needle.toLowerCase());
  if (exact !== undefined) return exact;
  const probed = probeFilePaths(index.doc.files, needle);
  if (probed) return probed.idx;
  if (/^\d+$/.test(needle)) return index.fileByIdx.get(Number(needle))?.idx;
  return undefined;
}

/// Declaration sites as {uri,l,c} — the shape resolveAt and refsOf both emit.
function declView(index: QueryIndex, sym: DumpSymbol): Array<{ uri: string; l: number; c: number }> {
  const uri = pathOf(index, sym.fileIdx);
  return sym.decls.map((d) => ({ uri, l: d.startLine, c: d.startChar }));
}

/** Def/hover decl list for a resolved symbol: the symbol's own declarations
 * plus, when the answer came through a merged-declaration ref site, the
 * sibling declarations from the other files (each with its own uri) — ONE
 * compiler symbol shown with every declaration site. Deduped by uri:l:c.
 * Returns the input unchanged when the ref is not a merged join. */
function mergedDeclSites(index: QueryIndex, own: Array<{ uri: string; l: number; c: number }>, siblingKeys?: number[]): Array<{ uri: string; l: number; c: number }> {
  if (siblingKeys === undefined || siblingKeys.length === 0) return own;
  const seen = new Set(own.map((d) => `${d.uri}:${d.l}:${d.c}`));
  const out = [...own];
  for (const k of siblingKeys) {
    const s = index.symbolByKey.get(k);
    if (!s) continue;
    for (const d of declView(index, s)) {
      const at = `${d.uri}:${d.l}:${d.c}`;
      if (seen.has(at)) continue;
      seen.add(at);
      out.push(d);
    }
  }
  return out;
}

/** Containment in the shared coordinate space (1-based lines, 0-based chars); end offsets are exclusive. */
function posInRange(line: number, char: number, r: Range): boolean {
  if (line < r.startLine || line > r.endLine) return false;
  if (line === r.startLine && char < r.startChar) return false;
  if (line === r.endLine && char >= r.endChar) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// stats
// ─────────────────────────────────────────────────────────────────────────────

export interface StatsView {
  epoch: number;
  rootDir: string;
  source: string;
  fileCount: number;
  symbolCount: number;
  referenceCount: number;
  unresolvedCount: number;
  edgeCount: number;
  exportSurfaceCount: number;
  importEdgeCount: number;
  memoryBytes: number;
}

export function statsOf(index: QueryIndex, source: string): StatsView {
  return {
    epoch: index.doc.epoch,
    rootDir: index.doc.rootDir,
    source,
    fileCount: index.doc.stats.fileCount,
    symbolCount: index.doc.stats.symbolCount,
    referenceCount: index.doc.stats.referenceCount,
    unresolvedCount: index.doc.stats.unresolvedCount,
    edgeCount: index.doc.symbolEdges.length,
    exportSurfaceCount: index.doc.exportSurfaces.length,
    importEdgeCount: (index.doc.importEdges ?? []).length,
    memoryBytes: index.doc.stats.memoryBytes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// resolve-at-position
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolvedSymbol {
  symId: string;
  name: string;
  qualified: string;
  kind: number;
  file: string;
  fileIdx: number;
  container?: string;
  decls: Array<{ uri: string; l: number; c: number }>;
  detail?: string;
  typeRef?: string;
  resolvedVia: string;
}

export interface ResolveView {
  query: { file: string; line: number; character: number };
  fileFound: boolean;
  resolved: ResolvedSymbol | null;
  alternatives: Array<{ symId: string; name: string; file: string; reason: string; refCount: number }>;
  ambiguous: boolean;
  gen: number;
}

/**
 * What symbol is at (file, 1-based line, 0-based char)? The tightest
 * containing range wins — a declaration site answers with the declared
 * symbol; anywhere inside a bound reference answers with the referenced
 * symbol; anywhere inside a lib-tier row (String, console,
 * document.createElement …) answers with the lib declaration (resolvedVia
 * 'lib', file = the lib .d.ts, decls = the declaration position inside it).
 * Same-named symbols elsewhere are returned ranked by reference count
 * (alternatives are presented, never guessed).
 * A position on an import specifier (an ImportBinding declaration) chases the
 * binding to its definition when the chase is unambiguous - see followImportBinding.
 */
export function resolveAt(index: QueryIndex, file: string, line: number, char: number): ResolveView {
  const query = { file, line, character: char };
  const fileIdx = resolveFileNeedle(index, file);
  if (fileIdx === undefined) return { query, fileFound: false, resolved: null, alternatives: [], ambiguous: false, gen: index.doc.epoch };
  const best = pickTightest(index, fileIdx, (r) => (posInRange(line, char, r) ? char : null));
  if (best.cand === null) return { query, fileFound: true, resolved: null, alternatives: [], ambiguous: false, gen: index.doc.epoch };
  if (best.cand.kind === 'lib') return libResolvedView(index, query, best.cand.lib);
  const picked = followImportBinding(index, { sym: best.cand.sym, via: best.via });
  // A merged-declaration ref site (one compiler symbol, several indexed
  // declarations) answers with every declaration site across the files.
  return resolvedView(index, query, picked.sym, picked.via, best.cand.ref?.merged);
}

// ─────────────────────────────────────────────────────────────────────────────
// refs-of-symbol
// ─────────────────────────────────────────────────────────────────────────────

export interface RefView {
  found: boolean;
  symId: string;
  name: string;
  /** Schema kind of the target symbol (row-9 read-surface rendering — the
   * refs answer names its hover metadata like /resolve does). Absent on the
   * not-found view. */
  kind?: number;
  /** Short signature of the target's declaration (hover metadata; absent on
   * symbols without one and on legacy snapshots). */
  detail?: string;
  file: string;
  decls: Array<{ uri: string; l: number; c: number }>;
  /** Files importing this symbol (specifier decl positions) - ImportBinding
   * rows chased back to this definition; [] when none or not derivable. */
  imports: ImportSite[];
  references: Array<{
    file: string;
    line: number;
    char: number;
    role: number;
    resolvedVia: string;
    usedBeforeDecl: boolean;
    range: Range;
  }>;
}
/**
 * Every bound usage of a symbol across the index, plus the files that import it
 * (import sites with specifier positions) - the complete rename/impact answer.
 */
export function refsOf(index: QueryIndex, symId: string): RefView {
  const sym = index.symbolById.get(symId);
  if (!sym) return { found: false, symId, name: '', file: '', decls: [], references: [], imports: [] };
  const path = index.fileByIdx.get(sym.fileIdx)?.path ?? `#${sym.fileIdx}`;
  const references = (index.refsBySymKey.get(sym.key) ?? [])
    .slice()
    .sort((a, b) => a.fileIdx - b.fileIdx || a.range.start - b.range.start)
    .map((r) => ({
      file: pathOf(index, r.fileIdx),
      line: r.range.startLine,
      char: r.range.startChar,
      role: r.role,
      resolvedVia: r.resolvedVia,
      usedBeforeDecl: r.usedBeforeDecl === true,
      range: r.range,
    }));
  return {
    found: true,
    symId: sym.id,
    name: sym.name,
    kind: sym.kind,
    ...(sym.detail !== undefined ? { detail: sym.detail } : {}),
    file: path,
    decls: declView(index, sym),
    references,
    imports: importSitesOf(index, sym),
  };
}

/** One lib-tier target of a by-name query: a declaration file + qualified
 * name inside it, with every usage site (the `idx refs`/`idx impact` answer
 * for names no repo symbol defines — console, String, console.log). */
export interface LibTarget {
  libIdx: number;
  libName: string;
  libId: string;
  libPath: string;
  decl?: { line: number; char: number };
  kind?: number;
  detail?: string;
  sites: LibRefView[];
}

/** Lib-tier targets whose site name OR qualified lib name equals the needle
 * (case-insensitive): `console` and `String` match the globals, `console.log`
 * matches the Console.log member rows. Grouped per (lib file, qualified
 * name), deterministic order; duplicate sites (a row matching both keys) are
 * deduped. Empty when the name is a repo symbol (repo wins — callers check
 * symbolsDefining first). */
export function libTargetsOf(index: QueryIndex, name: string): LibTarget[] {
  const needle = name.trim().toLowerCase();
  if (needle === '') return [];
  const groups = new Map<string, LibTarget>();
  for (const z of index.libRefsByName.get(needle) ?? []) {
    const k = `${z.libIdx}:${z.libName}`;
    let g = groups.get(k);
    if (!g) {
      g = {
        libIdx: z.libIdx,
        libName: z.libName,
        libId: z.libId,
        libPath: z.libPath,
        sites: [],
        ...(z.decl !== undefined ? { decl: z.decl } : {}),
        ...(z.kind !== undefined ? { kind: z.kind } : {}),
        ...(z.detail !== undefined ? { detail: z.detail } : {}),
      };
      groups.set(k, g);
    }
    if (g.sites.length === 0 || g.sites[g.sites.length - 1].range.start !== z.range.start) g.sites.push(z);
  }
  return [...groups.values()].sort((a, b) => a.libIdx - b.libIdx || a.libName.localeCompare(b.libName));
}

/** The RefView-shaped answer for a lib target (`idx refs console` / `idx
 * impact String`): the lib declaration as the definition, every usage site
 * as a reference (resolvedVia 'lib', role from the site row). No import
 * sites — lib globals are never imported in-repo. */
export function refsOfLib(index: QueryIndex, target: LibTarget): RefView {
  return {
    found: true,
    symId: `lib:${target.libIdx}:${target.libName}`,
    name: target.libName.split('.').pop() ?? target.libName,
    ...(target.kind !== undefined ? { kind: target.kind } : {}),
    ...(target.detail !== undefined ? { detail: target.detail } : {}),
    file: target.libPath,
    decls: target.decl !== undefined ? [{ uri: target.libPath, l: target.decl.line, c: target.decl.char }] : [],
    references: target.sites.map((z) => ({
      file: pathOf(index, z.fileIdx),
      line: z.range.startLine,
      char: z.range.startChar,
      role: z.role ?? 0,
      resolvedVia: 'lib',
      usedBeforeDecl: false,
      range: z.range,
    })),
    imports: [],
  };
}

/** The rename/impact answer assembled from a RefView: the affected file set
 * (definition + every reference/import site, sorted, deduped) and the
 * per-role reference breakdown. Single owner of the files-set policy -
 * consumed by the CLI `idx impact` and the `idx:gate` CI drift gate so a
 * gate and a report can never disagree. */
export interface ImpactReport {
  found: boolean;
  symId: string;
  name: string;
  definition: { file: string; decls: RefView['decls'] };
  references: RefView['references'];
  imports: RefView['imports'];
  files: string[];
  siteCount: number;
  roleBreakdown: Record<string, number>;
  verdict: string;
}

export function impactReport(view: RefView): ImpactReport {
  const files = new Set<string>([view.file, ...view.references.map((r) => r.file), ...view.imports.map((i) => i.file)]);
  const roleBreakdown: Record<string, number> = {};
  for (const r of view.references) roleBreakdown[String(r.role)] = (roleBreakdown[String(r.role)] ?? 0) + 1;
  return {
    found: true,
    symId: view.symId,
    name: view.name,
    definition: { file: view.file, decls: view.decls },
    references: view.references,
    imports: view.imports,
    files: [...files].sort((a, b) => a.localeCompare(b)),
    siteCount: view.references.length,
    roleBreakdown,
    verdict: files.size + ' file(s)',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// search
// ─────────────────────────────────────────────────────────────────────────────
// ----------------------------------------------------------------------------
// exact-name symbol lookup
// ----------------------------------------------------------------------------

/**
 * Symbols whose SIMPLE name - or whose full QUALIFIED name (namespace members
 * like NS.CONST) - equals the needle, case-insensitively, in declaration order.
 * This is the exact-match half of search, exposed because the CLI "idx refs
 * <name>" must never let substring semantics pick the wrong symbol: duplicate
 * names are common enough here that ambiguity has
 * to surface to the caller, not resolve. Returns the full rows so a caller
 * can list or rank them.
 */
export function symbolsByExactName(index: QueryIndex, name: string): DumpSymbol[] {
  const needle = name.trim().toLowerCase();
  if (needle === '') return [];
  const out: DumpSymbol[] = [];
  for (const sym of index.doc.symbols) {
    if (sym.name.toLowerCase() === needle || sym.qualified.toLowerCase() === needle) out.push(sym);
  }
  return out;
}


// ----------------------------------------------------------------------------
// the one range-selection core, import linkage, and the one candidate policy
// ----------------------------------------------------------------------------
// resolveAt (precise) and resolveLine (line-granular) share the single
// tightest-range scan below; importTargetsOf/importSitesOf are the whole
// import-linkage answer over the dump collections (def-at-import chase and
// the import sites on refs answers); rankCandidates/symbolsDefining own
// who-defines-name? for the by-name surfaces. A change to tie-break
// semantics, shadow exclusion, or the name chase lands in exactly one place.
// ----------------------------------------------------------------------------

/** Anchor on `line` for a range intersecting it: the range start column when
 * the range begins on `line`, else column 0 (the range covers the whole
 * line). Null when the range holds no position on that line. */
function anchorOnLine(line: number, r: Range): number | null {
  const c = r.startLine === line ? r.startChar : 0;
  return posInRange(line, c, r) ? c : null;
}

/** One tightest-range result: the winning candidate (declared symbol for a
 * declaration hit, referenced target for a reference hit, lib row for a
 * lib-tier hit), the via that won, and the probe column that matched (echoed
 * in the answer query.character). A symbol candidate picked through a ref
 * row keeps that row — its merged-declaration siblings feed def/hover. */
type RangeCandidate = { kind: 'symbol'; sym: DumpSymbol; ref?: DumpRef } | { kind: 'lib'; lib: LibRefView };

interface RangePick {
  cand: RangeCandidate | null;
  via: string;
  char: number;
}

/** The ONE range-selection scan resolveAt and resolveLine both run over a
 * file declaration, reference, and lib-tier ranges: the tightest accepted
 * range wins, and at an equal span a declaration beats a reference (a
 * position on a name that is both declared and referenced answers with the
 * declaration). probe yields the column to test for a given range -
 * resolveAt fixes it to the query char, resolveLine anchors it on the line -
 * and null when the range is not a candidate. Nothing is guessed here:
 * same-named symbols elsewhere are alternatives, assembled by resolvedView /
 * libResolvedView. */
function pickTightest(index: QueryIndex, fileIdx: number, probe: (r: Range) => number | null): RangePick {
  let pick: RangeCandidate | null = null;
  let via = '';
  let span = Number.POSITIVE_INFINITY;
  let char = 0;
  const consider = (c: RangeCandidate | null, candVia: string, r: Range): void => {
    const hit = probe(r);
    if (hit === null) return;
    const sp = r.end - r.start;
    if (sp < span || (sp === span && via !== 'declaration')) {
      pick = c;
      via = candVia;
      span = sp;
      char = hit;
    }
  };
  for (const s of index.symbolsByFile.get(fileIdx) ?? []) {
    for (const d of s.decls) consider({ kind: 'symbol', sym: s }, 'declaration', d);
  }
  for (const r of index.refsByFile.get(fileIdx) ?? []) {
    const target = index.symbolByKey.get(r.symKey);
    if (target) consider({ kind: 'symbol', sym: target, ref: r }, r.resolvedVia, r.range);
  }
  for (const lib of index.libRefsByFile.get(fileIdx) ?? []) {
    consider({ kind: 'lib', lib }, 'lib', lib.range);
  }
  return { cand: pick, via, char };
}

/** Assemble the ResolveView for a picked symbol: the resolved row plus the
 * same-named alternatives ranked by rankCandidates (presented, never
 * guessed). The one place the /resolve answer body is built. */
function resolvedView(index: QueryIndex, query: { file: string; line: number; character: number }, sym: DumpSymbol, via: string, mergedKeys?: number[]): ResolveView {
  const dot = sym.qualified.lastIndexOf('.');
  const resolved: ResolvedSymbol = {
    symId: sym.id,
    name: sym.name,
    qualified: sym.qualified,
    kind: sym.kind,
    file: pathOf(index, sym.fileIdx),
    fileIdx: sym.fileIdx,
    ...(dot > 0 ? { container: sym.qualified.slice(0, dot) } : {}),
    decls: mergedDeclSites(index, declView(index, sym), mergedKeys),
    ...(sym.detail !== undefined ? { detail: sym.detail } : {}),
    ...(sym.typeRef !== undefined ? { typeRef: sym.typeRef } : {}),
    resolvedVia: via,
  };
  const alternatives = rankCandidates(
      index,
      (index.nameIndex.get(sym.name.toLowerCase()) ?? []).filter((s) => s.id !== sym.id),
    )
    .map((s) => ({
      symId: s.id,
      name: s.name,
      file: pathOf(index, s.fileIdx),
      reason: 'same-name-other-file',
      refCount: index.refsBySymKey.get(s.key)?.length ?? 0,
    }))
    .slice(0, 8);
  return { query, fileFound: true, resolved, alternatives, ambiguous: false, gen: index.doc.epoch };
}

/** The lib-tier ResolveView: resolvedVia 'lib' — the answer's decls point at
 * the declaration inside the lib file (uri = the .d.ts path, l/c = the
 * scanned declaration position), so def/hover on a standard-library global or
 * member lands on the real lib declaration instead of 'no symbol'. symId is
 * a synthetic target id (lib files are not repo symbols); fileIdx is -1 for
 * the same reason. Same-named repo symbols surface as alternatives. */
function libResolvedView(index: QueryIndex, query: { file: string; line: number; character: number }, ref: LibRefView): ResolveView {
  const dot = ref.libName.lastIndexOf('.');
  const resolved: ResolvedSymbol = {
    symId: `lib:${ref.libIdx}:${ref.libName}`,
    name: ref.name,
    qualified: ref.libName,
    kind: ref.kind ?? 0,
    file: ref.libPath,
    fileIdx: -1,
    ...(dot > 0 ? { container: ref.libName.slice(0, dot) } : {}),
    decls: ref.decl !== undefined ? [{ uri: ref.libPath, l: ref.decl.line, c: ref.decl.char }] : [],
    ...(ref.detail !== undefined ? { detail: ref.detail } : {}),
    resolvedVia: 'lib',
  };
  const alternatives = rankCandidates(index, index.nameIndex.get(ref.name.toLowerCase()) ?? [])
    .map((s) => ({
      symId: s.id,
      name: s.name,
      file: pathOf(index, s.fileIdx),
      reason: 'same-name-other-file',
      refCount: index.refsBySymKey.get(s.key)?.length ?? 0,
    }))
    .slice(0, 8);
  return { query, fileFound: true, resolved, alternatives, ambiguous: false, gen: index.doc.epoch };
}

/** What symbol is on this line? - the file:line form of def. Runs the SAME
 * tightest-range scan as resolveAt over ranges intersecting `line`, then
 * answers with resolveAt at the winning range anchor, so line queries and
 * precise queries share one engine and one import chase. Doc-only: anchors
 * are token starts the index already records, so it works over serve
 * --snapshot dumps of other machines trees. query.character reports the
 * anchor column that matched. */
export function resolveLine(index: QueryIndex, file: string, line: number): ResolveView {
  const none = { query: { file, line, character: 0 }, fileFound: true, resolved: null, alternatives: [], ambiguous: false, gen: index.doc.epoch };
  const fileIdx = resolveFileNeedle(index, file);
  if (fileIdx === undefined) return { ...none, fileFound: false };
  const best = pickTightest(index, fileIdx, (r) => anchorOnLine(line, r));
  if (best.cand === null) return none;
  return resolveAt(index, file, line, best.char);
}

/** When the picked range is an ImportBinding declaration (a def query sitting
 * on an import specifier), answer with the binding target when the chase is
 * unambiguous (chaseUniqueTarget - the same exactly-one policy importSitesOf
 * uses). Renamed imports resolve through the edge's preserved source name;
 * default / namespace imports and legacy snapshots without per-edge bindings
 * are not chased and keep the local-binding answer with alternatives. */
function followImportBinding(index: QueryIndex, picked: { sym: DumpSymbol; via: string }): { sym: DumpSymbol; via: string } {
  const { sym, via } = picked;
  if (sym.kind !== SymbolKind.ImportBinding || via !== 'declaration') return picked;
  const target = chaseUniqueTarget(index, sym.fileIdx, sym.name);
  return target ? { sym: target, via: 'import' } : picked;
}
// ----------------------------------------------------------------------------
// import linkage - over the dump importEdges + exportSurfaces + ImportBinding
// rows only, no extra state. Forward: a name bound in a file -> definition
// symbols. Converse: a definition -> importing files with specifier decls.
// ----------------------------------------------------------------------------

/** Chase `name` through a file export surface to the defining symbol: a
 * table entry names it directly (symKey), a re-export entry hops to its
 * source file under the entry targetName, and a star re-export asks each
 * star source in turn. visited breaks re-export/star cycles; one exported
 * name has one entry (TS rejects duplicates), so at most one symbol per file. */
function surfaceTargetOf(index: QueryIndex, fileIdx: number, name: string, visited: Set<number>): DumpSymbol | undefined {
  if (visited.has(fileIdx)) return undefined;
  visited.add(fileIdx);
  const surface = index.surfaceByFile.get(fileIdx);
  if (!surface) return undefined;
  const entry = surface.exports.find((e) => e.name === name);
  if (entry) {
    if (entry.symKey !== undefined) return index.symbolByKey.get(entry.symKey);
    if (entry.kind === 'reExport' && entry.fromFileIdx !== undefined && entry.targetName !== undefined) {
      return surfaceTargetOf(index, entry.fromFileIdx, entry.targetName, visited);
    }
    return undefined;
  }
  for (const s of surface.starSources) {
    const target = surfaceTargetOf(index, s.fromFileIdx, name, visited);
    if (target) return target;
  }
  return undefined;
}

/** The source-export name to chase for a binding with local name `local` on
 * this edge - undefined when the edge does not introduce that binding, or
 * introduces it as a default/namespace import (neither has a named surface
 * entry to chase). Legacy snapshots (no per-edge bindings) fall back to the
 * name-only policy: every edge to an indexed file is a candidate by name. */
function chaseNameOnEdge(edge: DumpImportEdge, local: string): string | undefined {
  if (!edge.bindings) return local;
  const b = edge.bindings.find((x) => x.local === local);
  if (!b || b.shape !== 'named') return undefined;
  return b.imported ?? local;
}

/** The unique definition `name` binds to when imported by file `fileIdx`, or
 * undefined when nothing derives or several do. This exactly-one chase is
 * THE import-ambiguity policy: def-at-import (followImportBinding) and the
 * import-site answer (importSitesOf) both consume it, so a multi-target
 * import can never be claimed as a site while being unchaseable at def. */
function chaseUniqueTarget(index: QueryIndex, fileIdx: number, name: string): DumpSymbol | undefined {
  const targets = importTargetsOf(index, fileIdx, name);
  return targets.length === 1 ? targets[0] : undefined;
}
/** Definitions the dump can prove `name` binds to when imported by file
 * `fileIdx`: only import edges that actually introduce that binding are
 * asked, through the target export surface, whether they export the name
 * (the source export name when the edge preserves a rename). Edges that bind
 * other names - same-file imports that merely touch a module exporting a
 * same-named symbol - never count, and default / namespace bindings are not
 * chased. Deduplicated by key in edge order; module-id targets and star
 * cycles derive nothing. Legacy snapshots without per-edge bindings fall
 * back to name-only per-edge matching. Exactly one answer means
 * import-of-this-name here unambiguously binds to that symbol. */
export function importTargetsOf(index: QueryIndex, fileIdx: number, name: string): DumpSymbol[] {
  const cache = index.chaseMemo ?? (index.chaseMemo = new Map<string, DumpSymbol[]>());
  const memoKey = fileIdx + ':' + name;
  const hit = cache.get(memoKey);
  if (hit) return hit;
  const out: DumpSymbol[] = [];
  const seen = new Set<number>();
  for (const edge of index.importsByFile.get(fileIdx) ?? []) {
    if (typeof edge.to !== 'number' || edge.type === EdgeType.ReExports) continue;
    const targetName = chaseNameOnEdge(edge, name);
    if (targetName === undefined) continue;
    const target = surfaceTargetOf(index, edge.to, targetName, new Set());
    if (target && !seen.has(target.key)) {
      seen.add(target.key);
      out.push(target);
    }
  }
  cache.set(memoKey, out);
  return out;
}



/** One import site of a definition: a file whose import of `sym` (under any
 * local name - same-name or renamed) chases back to exactly this definition,
 * with the specifier decl positions of the binding row(s). */
export interface ImportSite {
  file: string;
  fileIdx: number;
  decls: Array<{ uri: string; l: number; c: number }>;
}

/** The ImportBinding row declaring local name `local` in file `fileIdx`, or
 * undefined when no such row exists (a real import always has one). */
function bindingRowOf(index: QueryIndex, fileIdx: number, local: string): DumpSymbol | undefined {
  return (index.nameIndex.get(local.toLowerCase()) ?? []).find(
    (s) => s.kind === SymbolKind.ImportBinding && s.fileIdx === fileIdx && s.name === local
  );
}

/** Every file that imports `sym` - the rename/impact answer of the read
 * surface, listed alongside refsOf usage references. Candidates come from the
 * import edges, not the name buckets: each binding-bearing edge is asked
 * directly whether its binding of `local` uniquely chases to this definition
 * (chaseUniqueTarget, the same exactly-one policy def-at-import uses), so a
 * renamed binding (`import { greet as hi }`) is a site of `greet` exactly as
 * a same-name one is. Default/namespace bindings have no named surface entry
 * and never chase; ambiguous or not-derivable imports are never claimed, and
 * the shadow itself is no site. Legacy snapshots without per-edge bindings
 * keep the local-name inversion: same-name rows in files whose edges carry
 * no bindings are chased by name only. */
export function importSitesOf(index: QueryIndex, sym: DumpSymbol): ImportSite[] {
  if (sym.kind === SymbolKind.ImportBinding) return [];
  const byFile = new Map<number, ImportSite>();
  const addSite = (row: DumpSymbol, fileIdx: number): void => {
    if (fileIdx === sym.fileIdx) return;
    const target = chaseUniqueTarget(index, fileIdx, row.name);
    if (target === undefined || target.key !== sym.key) return;
    const hit = byFile.get(fileIdx);
    if (hit) hit.decls.push(...declView(index, row));
    else byFile.set(fileIdx, { file: pathOf(index, fileIdx), fileIdx, decls: declView(index, row) });
  };
  const covered = new Set<number>();
  for (const edge of index.doc.importEdges ?? []) {
    if (!edge.bindings || typeof edge.to !== 'number' || edge.type === EdgeType.ReExports) continue;
    covered.add(edge.from);
    for (const b of edge.bindings) {
      if (b.shape !== 'named') continue;
      const row = bindingRowOf(index, edge.from, b.local);
      if (row) addSite(row, edge.from);
    }
  }
  const legacy = new Set<number>();
  for (const edge of index.doc.importEdges ?? []) {
    if (!edge.bindings && typeof edge.to === 'number' && edge.type !== EdgeType.ReExports && !covered.has(edge.from)) legacy.add(edge.from);
  }
  if (legacy.size > 0) {
    for (const cand of index.nameIndex.get(sym.name.toLowerCase()) ?? []) {
      if (cand.kind !== SymbolKind.ImportBinding || cand.name !== sym.name || !legacy.has(cand.fileIdx)) continue;
      addSite(cand, cand.fileIdx);
    }
  }
  for (const hit of byFile.values()) hit.decls.sort((a, b) => a.l - b.l || a.c - b.c);
  return [...byFile.values()].sort((a, b) => a.fileIdx - b.fileIdx);
}

/** True for ImportBinding rows - scope shadows whose decl is an import
 * specifier, never an answer to who-defines-name?. Exported so every by-name
 * surface (idx refs, def alternatives) shares the one predicate. */
export function isImportBindingSymbol(sym: DumpSymbol): boolean {
  return sym.kind === SymbolKind.ImportBinding;
}

/** One candidate ranking for same-named symbols: reference count desc, then
 * file asc - resolveAt alternatives and idx refs share it. */
export function rankCandidates(index: QueryIndex, symbols: DumpSymbol[]): DumpSymbol[] {
  const count = (k: number): number => index.refsBySymKey.get(k)?.length ?? 0;
  const fileOf = (s: DumpSymbol): string => pathOf(index, s.fileIdx);
  return symbols.slice().sort((a, b) => count(b.key) - count(a.key) || fileOf(a).localeCompare(fileOf(b)));
}

/** Symbols that actually DEFINE `name`: exact simple/qualified matches minus
 * ImportBinding shadows (isImportBindingSymbol), ranked by rankCandidates.
 * Empty when the name is only imported (e.g. vitest describe). */
export function symbolsDefining(index: QueryIndex, name: string): DumpSymbol[] {
  return rankCandidates(index, symbolsByExactName(index, name).filter((s) => !isImportBindingSymbol(s)));
}

export interface SearchHit {
  symId: string;
  name: string;
  qualified: string;
  kind: number;
  /** Short signature of the declaration (row-9 read-surface rendering — a
   * hit answers hover with the same signature /resolve shows). Absent on
   * symbols without one and on legacy snapshots. */
  detail?: string;
  file: string;
  /** match class — also the primary ranking key (see search()). */
  match: 'name' | 'qualified' | 'id';
}

interface SearchCand {
  hit: SearchHit;
  /** 0 exact-name · 1 name substring · 2 qualified · 3 id-path. */
  pri: number;
  key: number;
}

/**

/**
 * Case-insensitive substring search over symbol names and qualified names.
 * Ranking: exact-name match, then name substring, then qualified substring,
 * then id-path match; ties break on reference count, then file path. `id`
 * matches let a caller search by path fragment — symIds embed the file path
 * (`sym:db/forms.ts#mapForm`), so a hit resolves straight to the symbol.
 *
 * The array form returns up to `limit` hits; searchPage additionally reports
 * the pre-limit total, so a consumer never mistakes a capped result set for
 * the full answer.
 */
export function search(index: QueryIndex, q: string, limit = 25): SearchHit[] {
  return pageOf(searchCands(index, q), limit).results;
}

export interface SearchPage {
  /** hits before the limit (never the capped length). */
  total: number;
  truncated: boolean;
  results: SearchHit[];
}

/** search() plus the pre-limit total — the HTTP /search response shape. */
export function searchPage(index: QueryIndex, q: string, limit = 25): SearchPage {
  return pageOf(searchCands(index, q), limit);
}

function pageOf(cands: SearchCand[], limit: number): SearchPage {
  const capped = Math.max(0, limit);
  return { total: cands.length, truncated: cands.length > capped, results: cands.slice(0, capped).map((c) => c.hit) };
}

function searchCands(index: QueryIndex, q: string): SearchCand[] {
  const needle = q.trim().toLowerCase();
  if (needle === '') return [];
  const refCount = (k: number): number => index.refsBySymKey.get(k)?.length ?? 0;
  const cands: SearchCand[] = [];
  for (const s of index.doc.symbols) {
    const lowerName = s.name.toLowerCase();
    let pri: number;
    if (lowerName === needle) pri = 0;
    else if (lowerName.includes(needle)) pri = 1;
    else if (s.qualified.toLowerCase().includes(needle)) pri = 2;
    else if (needle.includes('/') && s.id.toLowerCase().includes(needle)) pri = 3;
    else continue;
    const file = pathOf(index, s.fileIdx);
    cands.push({
      hit: {
        symId: s.id,
        name: s.name,
        qualified: s.qualified,
        kind: s.kind,
        ...(s.detail !== undefined ? { detail: s.detail } : {}),
        file,
        match: pri <= 1 ? 'name' : pri === 2 ? 'qualified' : 'id',
      },
      pri,
      key: s.key,
    });
  }
  cands.sort(
    (a, b) =>
      a.pri - b.pri ||
      refCount(b.key) - refCount(a.key) ||
      a.hit.file.localeCompare(b.hit.file) ||
      a.hit.name.localeCompare(b.hit.name),
  );
  return cands;
}

// ─────────────────────────────────────────────────────────────────────────────
// module dependencies
// ─────────────────────────────────────────────────────────────────────────────

export interface DepsEntry {
  /** Target file path, or a module id (`ext:`/`asset:`/`unresolved:`). */
  target: string;
  /** EdgeType constant (imports / importsType / importsDynamic / reExports). */
  type: number;
  specifier: string;
}

export interface DepsView {
  file: string;
  fileFound: boolean;
  direction: 'out' | 'in' | 'both';
  /** Out-edges: what this file imports / re-exports from (one entry per edge). */
  imports: DepsEntry[];
  /** In-edges: files that import this file, deduped per file (revDeps semantics). */
  dependents: Array<{ file: string; specifier: string }>;
  gen: number;
}

/**
 * Module-level impact query: what a file depends on and who depends on it.
 * `direction` picks out-edges (imports), in-edges (dependents), or both.
 * Non-file targets (`ext:`/`asset:`/`unresolved:`) appear in `imports` with
 * their module id; `dependents` contains indexed files only. Legacy snapshots
 * without `importEdges` answer with empty lists rather than failing.
 */
export function depsOf(index: QueryIndex, file: string, direction: 'out' | 'in' | 'both', limit = 100): DepsView {
  const fileIdx = resolveFileNeedle(index, file);
  if (fileIdx === undefined) {
    return { file, fileFound: false, direction, imports: [], dependents: [], gen: index.doc.epoch };
  }
  const path = index.fileByIdx.get(fileIdx)!.path;
  const cap = Math.max(0, limit);
  const imports: DepsEntry[] = [];
  if (direction !== 'in') {
    for (const e of index.importsByFile.get(fileIdx) ?? []) {
      imports.push({ target: typeof e.to === 'number' ? pathOf(index, e.to) : e.to, type: e.type, specifier: e.specifier });
      if (imports.length >= cap) break;
    }
  }
  const dependents: Array<{ file: string; specifier: string }> = [];
  if (direction !== 'out') {
    const seen = new Set<number>();
    for (const e of index.dependentsByFile.get(fileIdx) ?? []) {
      if (seen.has(e.from)) continue;
      seen.add(e.from);
      dependents.push({ file: pathOf(index, e.from), specifier: e.specifier });
      if (dependents.length >= cap) break;
    }
  }
  return { file: path, fileFound: true, direction, imports, dependents, gen: index.doc.epoch };
}

// ─────────────────────────────────────────────────────────────────────────────
// module cycles (/deps/cycles — the row-8 SCC machinery as a read view)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The import edges that carry RUNTIME dependency — the only ones that can form
 * a real module cycle.
 *
 * `import type { X } from './y'` is erased by the TypeScript compiler and emits
 * no require/import in the bundled output, so it cannot participate in a
 * runtime cycle. dependency-cruiser — whose circularity semantics cycles.ts
 * exists to mirror — excludes these edges, and the two disagreed until this
 * filter was added: `_lib/kernel/log.ts` takes `MetricsPayload` from
 * `_lib/kernel/metrics.ts` as a type-only import (deliberately, and annotated
 * as such at the import site) while metrics.ts imports `log` for real, which
 * the unfiltered SCC pass read as a two-node cycle that depcruise does not see.
 *
 * This is shared by BOTH cycle consumers — the /deps/cycles read view and
 * violationsOf()'s `to.circular` rules — so a phantom cycle cannot reappear in
 * one of them while the other is filtered. It is also the reason the filter
 * lives here rather than in cycles.ts: that module is deliberately pure over
 * integer edge lists and knows nothing about dump edge kinds.
 */
function runtimeImportEdges(doc: { importEdges?: DumpImportEdge[] }): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = [];
  for (const e of doc.importEdges ?? []) {
    if (typeof e.to !== 'number') continue; // ext:/asset:/unresolved: ids are never files
    if (e.type === EdgeType.ImportsType) continue; // compile-time only; erased in output
    out.push({ from: e.from, to: e.to });
  }
  return out;
}

export interface CycleMemberView {
  fileIdx: number;
  path: string;
  /** One real cycle path through this member (member → … → member), repo-relative. */
  cycle: string[];
}

export interface CyclesView {
  gen: number;
  /** Present when ?file= was given (resolved path when found). */
  file?: string;
  fileFound?: boolean;
  /** Number of non-trivial SCCs listed (all, or 0/1 under ?file=). */
  total: number;
  components: Array<{ size: number; members: CycleMemberView[] }>;
}

/**
 * The dump's non-trivial module-level cycles (SCC size >= 2), computed by the
 * one SCC owner (cycles.ts) and shaped here — deterministic: components sorted
 * by first member path, members ascending, each member's `cycle` a real path
 * through it walked from that SCC's own edges. Optional ?file= narrows to the
 * cycle containing that file, via the shared resolveFileNeedle policy
 * (fileFound:false for unknown needles, total 0 when the file is acyclic).
 */
export function cyclesOf(index: QueryIndex, file?: string): CyclesView {
  const cycles = (index.cycles ??= computeCycles(runtimeImportEdges(index.doc), index.doc.files.length));
  const pathOfIdx = (x: number): string => pathOf(index, x);
  const comps = cycles
    .cycles()
    .map((c) => ({
      size: c.members.length,
      members: c.members.map((m) => {
        // first in-SCC out-edge to a different member — a strongly connected
        // component of size >= 2 guarantees one exists per member.
        const first = (index.doc.importEdges ?? []).find((e) => e.from === m && typeof e.to === 'number' && e.to !== m && c.members.includes(e.to));
        const back = first ? cycles.path(m, first.to as number).map(pathOfIdx) : [];
        return { fileIdx: m, path: pathOfIdx(m), cycle: [pathOfIdx(m), ...back] };
      }),
    }))
    .sort((a, b) => (a.members[0].path < b.members[0].path ? -1 : a.members[0].path > b.members[0].path ? 1 : 0));
  if (file === undefined) return { gen: index.doc.epoch, total: comps.length, components: comps };
  const needle = resolveFileNeedle(index, file);
  if (needle === undefined) return { gen: index.doc.epoch, file, fileFound: false, total: 0, components: [] };
  const p = index.fileByIdx.get(needle)!.path;
  const hit = comps.find((c) => c.members.some((m) => m.fileIdx === needle));
  if (!hit) return { gen: index.doc.epoch, file: p, fileFound: true, total: 0, components: [] };
  return { gen: index.doc.epoch, file: p, fileFound: true, total: 1, components: [hit] };
}

// ─────────────────────────────────────────────────────────────────────────────
// file symbols (file outline)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A dump symbol row projected for the file outline. Derived from DumpSymbol so
 * the two cannot drift: drops fileIdx (implied by the response) plus the
 * ranking state (modifiers, centrality); `key` is renamed `symKey` — the join
 * vocabulary of the query API. The hover signature fields (typeRef, detail)
 * are carried: an outline entry answers hover with the same signature
 * /resolve shows (row-9 read-surface rendering).
 */
export type FileSymbolEntry = Omit<
  DumpSymbol,
  'key' | 'fileIdx' | 'modifiers' | 'centrality'
> & { symKey: number };

export interface FileSymbolsView {
  query: { file: string };
  file: string;
  fileIdx: number | null;
  fileFound: boolean;
  symbols: FileSymbolEntry[];
  exports: DumpSurface['exports'];
  starSources: DumpSurface['starSources'];
  gen: number;
}

/**
 * File outline: every symbol declared in `file`, as a flat projection of the
 * dump's symbol rows (identity, kind, scope, decl ranges, export flags), plus
 * the file's export-surface entries (named exports + star re-export sources)
 * straight from doc.exportSurfaces. Symbols come in source order (first decl
 * position). Deliberately not a scope tree — the dump carries no hierarchy,
 * so a flat outline keyed on symKey/scopeId/fileIdx is the honest depth.
 *
 * `file` is a path — extension-probed exactly like the CLI and resolver, so
 * `repository` and `contexts/catalog/repository` both resolve — or a numeric
 * file idx. Unknown files answer fileFound:false with empty lists (200),
 * matching /resolve.
 */
export function fileSymbols(index: QueryIndex, file: string): FileSymbolsView {
  const fileIdx = resolveFileNeedle(index, file);
  if (fileIdx === undefined) {
    return { query: { file }, file, fileIdx: null, fileFound: false, symbols: [], exports: [], starSources: [], gen: index.doc.epoch };
  }
  const hit = index.fileByIdx.get(fileIdx)!;
  const byLine = (s: DumpSymbol): number => s.decls[0]?.startLine ?? 0;
  const byChar = (s: DumpSymbol): number => s.decls[0]?.startChar ?? 0;
  const symbols: FileSymbolEntry[] = (index.symbolsByFile.get(hit.idx) ?? [])
    .slice()
    .sort((a, b) => byLine(a) - byLine(b) || byChar(a) - byChar(b))
    .map((s) => {
      const { key, fileIdx: _fi, modifiers: _m, centrality: _c, ...rest } = s;
      return { symKey: key, ...rest };
    });
  const surface = index.surfaceByFile.get(hit.idx);
  return {
    query: { file },
    file: hit.path,
    fileIdx: hit.idx,
    fileFound: true,
    symbols,
    exports: surface?.exports ?? [],
    starSources: surface?.starSources ?? [],
    gen: index.doc.epoch,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Row-5 remainder — §8 symbol/file/edge endpoints (query view layer)
// ────────────────────────────────────────────────────────────────────────

/** One symbol card (design §8.1 GET /sym/:symId): the definition, declaration
 * sites, hover markdown, container, refs count and centrality. The hover is
 * LSP-shaped (`contents.kind: 'markdown'`); its value is the declaration's
 * short signature (`detail` — the schema's "rendered signature" field),
 * fenced as TS, falling back to the qualified name on legacy snapshots
 * without detail. */
export interface SymbolCard {
  found: boolean;
  symId: string;
  name: string;
  qualified: string;
  kind: number;
  container?: string;
  file: string;
  fileIdx: number;
  exported: boolean;
  exportNames: string[];
  decls: Array<{ uri: string; l: number; c: number }>;
  /** Bound reference count (rename/impact weight, design §5.2). */
  refs: number;
  centrality: number;
  hover: { contents: { kind: 'markdown'; value: string } };
  gen: number;
}

function hoverMarkdown(sig: string): SymbolCard['hover'] {
  return { contents: { kind: 'markdown', value: '```ts\n' + sig + '\n```' } };
}

/** Signature for the hover fence: `detail` (first declaration line) when the
 * row has one, else the qualified name — never a fabricated type string. */
function signatureOf(sym: DumpSymbol): string {
  const d = sym.detail?.trim();
  return d !== undefined && d !== '' ? d : sym.qualified;
}

export function symbolCardOf(index: QueryIndex, symId: string): SymbolCard {
  const sym = index.symbolById.get(symId);
  if (!sym) {
    return { found: false, symId, name: '', qualified: '', kind: 0, file: '', fileIdx: -1, exported: false, exportNames: [], decls: [], refs: 0, centrality: 0, hover: hoverMarkdown(symId), gen: index.doc.epoch };
  }
  const dot = sym.qualified.lastIndexOf('.');
  return {
    found: true,
    symId: sym.id,
    name: sym.name,
    qualified: sym.qualified,
    kind: sym.kind,
    ...(dot > 0 ? { container: sym.qualified.slice(0, dot) } : {}),
    file: pathOf(index, sym.fileIdx),
    fileIdx: sym.fileIdx,
    exported: sym.exported,
    exportNames: sym.exportNames,
    decls: declView(index, sym),
    refs: index.refsBySymKey.get(sym.key)?.length ?? 0,
    centrality: sym.centrality,
    hover: hoverMarkdown(signatureOf(sym)),
    gen: index.doc.epoch,
  };
}

/** One file-scoped unresolved answer (design §8.1 GET
 * /files/:path/unresolved): every occurrence-level reference in `file` that
 * failed to bind, with its reason and position, plus the file's unresolved
 * module imports (specifier + reason). Unknown files answer fileFound:false
 * with empty lists (200), matching /symbols. */
export interface FileUnresolvedView {
  query: { file: string };
  file: string;
  fileFound: boolean;
  references: Array<{ name: string; reason: string; line: number; char: number; range: Range }>;
  imports: Array<{ specifier: string; reason: string }>;
  gen: number;
}

export function fileUnresolvedOf(index: QueryIndex, file: string): FileUnresolvedView {
  const fileIdx = resolveFileNeedle(index, file);
  if (fileIdx === undefined) {
    return { query: { file }, file, fileFound: false, references: [], imports: [], gen: index.doc.epoch };
  }
  const references = (index.doc.unresolved ?? [])
    .filter((u) => u.fileIdx === fileIdx)
    .sort((a, b) => a.range.start - b.range.start)
    .map((u) => ({
      name: u.name,
      reason: u.reason,
      line: u.range.startLine,
      char: u.range.startChar,
      range: u.range,
    }));
  const imports = (index.doc.unresolvedImports ?? [])
    .filter((u) => u.fileIdx === fileIdx)
    .map((u) => ({ specifier: u.specifier, reason: u.reason }));
  return {
    query: { file },
    file: pathOf(index, fileIdx),
    fileFound: true,
    references,
    imports,
    gen: index.doc.epoch,
  };
}

/** Shortest module dependency path from file A to file B (design §8.3 GET
 * /deps/path): BFS over the dump's file-to-file import edges (module ids and
 * legacy snapshots without importEdges never join), answering the real
 * `from → … → to` path when one exists. Pure and deterministic. */
export interface DepsPathView {
  query: { from: string; to: string };
  from: string;
  to: string;
  fromFound: boolean;
  toFound: boolean;
  found: boolean;
  path: string[];
  gen: number;
}

export function depsPathOf(index: QueryIndex, from: string, to: string): DepsPathView {
  const fromIdx = resolveFileNeedle(index, from);
  const toIdx = resolveFileNeedle(index, to);
  const base = { query: { from, to }, found: false, path: [] as string[], gen: index.doc.epoch };
  if (fromIdx === undefined || toIdx === undefined) {
    return {
      ...base,
      from: fromIdx !== undefined ? pathOf(index, fromIdx) : from,
      to: toIdx !== undefined ? pathOf(index, toIdx) : to,
      fromFound: fromIdx !== undefined,
      toFound: toIdx !== undefined,
    };
  }
  const fromPath = pathOf(index, fromIdx);
  const toPath = pathOf(index, toIdx);
  if (fromIdx === toIdx) return { ...base, from: fromPath, to: toPath, fromFound: true, toFound: true, found: true, path: [fromPath] };
  const adj = new Map<number, number[]>();
  for (const e of index.doc.importEdges ?? []) {
    if (typeof e.to !== 'number') continue;
    let list = adj.get(e.from);
    if (!list) adj.set(e.from, (list = []));
    list.push(e.to);
  }
  const prev = new Map<number, number>();
  const seen = new Set<number>([fromIdx]);
  const queue = [fromIdx];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === toIdx) break;
    for (const next of adj.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, cur);
      queue.push(next);
    }
  }
  if (!seen.has(toIdx)) return { ...base, from: fromPath, to: toPath, fromFound: true, toFound: true };
  const path = [toIdx];
  let cur = toIdx;
  while (cur !== fromIdx) {
    cur = prev.get(cur)!;
    path.push(cur);
  }
  return { ...base, from: fromPath, to: toPath, fromFound: true, toFound: true, found: true, path: path.reverse().map((idx) => index.fileByIdx.get(idx)?.path ?? `#${idx}`) };
}

/** Module orphans (design §8.3 GET /deps/orphans): every indexed file that no
 * indexed file imports (no file-to-file in-edge). Sorted by path; module ids
 * and legacy snapshots without importEdges never count as importers. */
export interface DepsOrphansView {
  total: number;
  files: string[];
  gen: number;
}

export function depsOrphansOf(index: QueryIndex): DepsOrphansView {
  const imported = new Set<number>();
  for (const e of index.doc.importEdges ?? []) {
    if (typeof e.to === 'number') imported.add(e.to);
  }
  const files = index.doc.files
    .filter((f) => !imported.has(f.idx))
    .map((f) => f.path)
    .sort();
  return { total: files.length, files, gen: index.doc.epoch };
}

// ────────────────────────────────────────────────────────────────────────────────────────
// Architecture boundary rules (roadmap row 8 — the violations half)
// ────────────────────────────────────────────────────────────────────────────────────────
/**
 * Neutral form of one .dependency-cruiser.cjs `forbid` rule. The config file at
 * the repo root is the SINGLE source of truth — indexer code never duplicates
 * the rules; boundary.ts loads and normalizes them into this shape, and this
 * module evaluates them over the dump's module import edges. `to.circular` IS
 * expressible (evaluated over the SCCs, cycles.ts — depcruise@18-identical
 * semantics); features still skipped by the loader, never half-ported:
 * via/viaNot, reachable, from.circular, dependencyTypes beyond the import kinds.
 */
export interface ForbidRulePath {
  /** Regex(es); array = any-match. Absent = no constraint. */
  path?: string | string[];
  pathNot?: string | string[];
  /** depcruise to.circular — the edge participates in a cycle (SCC size >= 2 or self-import). */
  circular?: boolean;
}

export interface ForbidRule {
  name: string;
  severity: 'error' | 'warn';
  comment?: string;
  from: ForbidRulePath;
  to: ForbidRulePath;
  /** depcruise dependencyTypes (e.g. ['import']) the rule applies to; absent = all kinds. */
  dependencyTypes?: string[];
}

export interface BoundaryViolation {
  ruleName: string;
  severity: 'error' | 'warn';
  /** Importer (repo-relative). */
  from: string;
  /** Imported file (repo-relative; file-to-file edges only — module ids never violate path rules). */
  to: string;
  /** Edge kind word: import | type | dynamic | reexport. */
  type: string;
  /** Rule comment, when the config carries one. */
  reason?: string;
  /** Circular rules: the real cycle path to → … → from (repo-relative), same member set as depcruise's. */
  cycle?: string[];
}

export interface ViolationsView {
  gen: number;
  total: number;
  errors: number;
  warnings: number;
  violations: BoundaryViolation[];
}

/** schema EdgeType (3..6, 13, 15) → depcruise dependencyType, the kinds this
 * index expresses. AstroGlob edges are runtime module loads resolved at build
 * time (Vite import.meta.glob family) — the closest depcruise analogue is the
 * dynamic-import kind. */
const EDGE_DEP_TYPE: Record<number, string> = { 3: 'import', 4: 'type-only', 5: 'dynamic-import', 6: 'reexport', 15: 'dynamic-import' };
/** schema EdgeType → short kind word for the violation record. */
const EDGE_KIND: Record<number, string> = { 3: 'import', 4: 'type', 5: 'dynamic', 6: 'reexport', 13: 'renders', 15: 'astro-glob' };

/** Compile one rule side into a matcher: path (any-match) and pathNot (any-match = excluded). */
function ruleSideMatcher(side: ForbidRulePath): (path: string) => boolean {
  const toRes = (raw?: string | string[]): RegExp[] => (raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]).map((re) => new RegExp(re));
  const path = toRes(side.path);
  const pathNot = toRes(side.pathNot);
  return (p: string): boolean => {
    if (path.length > 0 && !path.some((re) => re.test(p))) return false;
    if (pathNot.length > 0 && pathNot.some((re) => re.test(p))) return false;
    return true;
  };
}

/**
 * The ONE dedupe-key policy for violation records (depcruise@18 semantics): a
 * circular:true rule collapses every match whose cycle shares one member set
 * into a single violation; every other rule (circular:false or no circular
 * clause) reports per (rule, from, to) pair. Using the member-set key for the
 * latter silently swallows distinct acyclic edges — keep this policy in one
 * place so it cannot be miswritten.
 */
function violationKey(rule: ForbidRule, from: string, to: string, cycle?: string[]): string {
  const NUL = '\u0000';
  if (rule.to.circular === true) {
    const members = cycle ? [...cycle].sort().join(NUL) : '';
    return rule.name + NUL + members;
  }
  return rule.name + NUL + from + NUL + to;
}

/**
 * Evaluate the repo's own forbid rules over the module graph: one violation per
 * (rule, from file, to file) — depcruise aggregates all dependency kinds of a
 * from→to pair into one hit, so duplicate edges (two import() sites of the
 * same target) must not double-count. Circular rules (to.circular) follow
 * depcruise@18 semantics exactly: an edge is circular when its target can
 * reach its source (same non-trivial SCC, or a self-import), and violations
 * of one rule whose cycle contains the same member set collapse into one
 * (verified against the real tree — two edges of the master-data cycle match
 * but depcruise reports a single cycle violation). Legacy snapshots without
 * importEdges answer zero violations. Pure — no fs, no config loading.
 */
export function violationsOf(index: QueryIndex, rules: ForbidRule[]): ViolationsView {
  const violations: BoundaryViolation[] = [];
  const seen = new Set<string>();
  const filePath = (idx: number): string | null => index.fileByIdx.get(idx)?.path ?? null;
  const hasCycleRules = rules.some((r) => r.to.circular !== undefined);
  const cycles = hasCycleRules ? (index.cycles ??= computeCycles(runtimeImportEdges(index.doc), index.doc.files.length)) : undefined;
  for (const rule of rules) {
    const fromOk = ruleSideMatcher(rule.from);
    const toOk = ruleSideMatcher(rule.to);
    const wantsType = rule.dependencyTypes;
    const isCircularRule = rule.to.circular !== undefined;
    for (const e of index.doc.importEdges ?? []) {
      if (typeof e.to !== 'number') continue; // ext:/asset:/unresolved: module ids never match path rules
      const from = filePath(e.from);
      const to = filePath(e.to);
      if (from === null || to === null) continue;
      if (wantsType !== undefined && !wantsType.includes(EDGE_DEP_TYPE[e.type] ?? 'import')) continue;
      if (!fromOk(from) || !toOk(to)) continue;
      const circular = rule.to.circular;
      if (circular !== undefined && (cycles?.isCircular(e.from, e.to) ?? false) !== circular) continue;
      // Real cycle path to → … → from, only for circular:true matches.
      const cyc = circular === true ? (cycles?.path(e.from, e.to) ?? []).map((idx) => filePath(idx) ?? ('#' + String(idx))) : undefined;
      const key = violationKey(rule, from, to, cyc);
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({ ruleName: rule.name, severity: rule.severity, from, to, type: EDGE_KIND[e.type] ?? 'import', reason: rule.comment, ...(cyc ? { cycle: cyc } : {}) });
    }
  }
  return {
    gen: index.doc.epoch,
    total: violations.length,
    errors: violations.filter((v) => v.severity === 'error').length,
    warnings: violations.filter((v) => v.severity === 'warn').length,
    violations,
  };
}
