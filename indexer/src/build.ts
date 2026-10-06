/**
 * build.ts — the Phase 0-2 pipeline: discover → parse → resolve → graph.
 *
 * Single-threaded for now (246 files, ~28k LOC, well under the 3 s full-build
 * budget); the worker pool is a Phase 5/9 scaling item.
 */

import { readFileSync } from 'node:fs';
import type { FileNode, IndexStats, Occurrence, ScopeNode, SymbolNode } from '../../docs/code-index-schema.js';
import { discoverFiles, parseGitignore } from './discover.js';
import type { AstroGlobCall, ExportRecord, ParsedFile, RawImportRecord } from './parse.js';
import { parseFile } from './parse.js';
import { createResolver } from './resolve.js';
import type { ModuleGraph } from './graph.js';
import { buildModuleGraph } from './graph.js';
import { buildExportSurfaces, createExportIndex, type ExportIndex, type ExportSurfaces } from './exportTables.js';
import { bindIndex, type BindResult } from './bind.js';
import { deepMemberBind, type LibRefRow } from './deep-tier.js';
import type { InitType } from './parse.js';
import type { FileIdx, SymKey } from '../../docs/code-index-schema.js';
import { fileIdx } from './util.js';

export interface BuildResult {
  epoch: number;
  rootDir: string;
  files: FileNode[];
  symbols: SymbolNode[];
  scopes: ScopeNode[];
  occurrences: Occurrence[];
  imports: RawImportRecord[];
  exports: ExportRecord[];
  graph: ModuleGraph;
  /** Phase 3: per-file export surfaces (§4.3). */
  exportSurfaces: ExportSurfaces;
  /** Phase 3: lazy multi-hop export resolution (barrels, alias unwrap). */
  resolveExport: ExportIndex['resolveExport'];
  /** Phase 4: bound references (§4.3). */
  refs: BindResult['refs'];
  /** Phase 4: symbol graph edges (calls/renders/reads/writes/references). */
  symbolEdges: BindResult['edges'];
  /** Phase 4: bindable occurrences that failed to resolve, with reasons (§4.3 step 7). */
  unresolvedRefs: BindResult['unresolved'];
  /** Checker-confirmed refs into lib/package declarations (lib tier, §4.3). */
  libRefs: LibRefRow[];
  stats: IndexStats;
}

/**
 * §6.2 per-file parse reuse: one cached Stage-2 output, valid while the file's
 * content hash AND fileIdx are unchanged. parseFile is a pure function of
 * (fileIdx, path, lang, content) and its emitted keys are (fileIdx << 20) |
 * per-file ordinal — identical input therefore reproduces identical output,
 * and no downstream stage mutates parse structures (bind/graph/export tables
 * read them), so zero-copy sharing across generations is safe.
 */
export type ParseCacheEntry = ParsedFile & { hash: string };

/** path → entry. Owned by the caller (idx watch carries one across
 * generations); buildIndex reads it for Stage-2 reuse and mutates it in place
 * (invalidated entries replaced, removed files pruned). */
export type ParseReuseCache = Map<string, ParseCacheEntry>;

export interface BuildOptions {
  /** Checker-backed member tier (§9.1): resolves light-unbound Property
   * occurrences through ts.createProgram (≈2.1 s on this tree). Default
   * true; watch opts out ({ deep: false }) to keep generation latency. */
  deep?: boolean;
  /** §6.2: reuse Stage-2 output for files whose (content hash, fileIdx) match
   * this cache's entry — the dirty-set parse reuse half of the incremental
   * engine. Output is identical to a full build; only unchanged files skip
   * parse. Warm it by passing the same map to consecutive builds. */
  parseCache?: ParseReuseCache;
}

export function buildIndex(rootDirAbs: string, opts: BuildOptions = {}): BuildResult {
  const t0 = performance.now();
  const rootDir = rootDirAbs.replace(/\\/g, '/');

  // Stage 1: discover
  const gitignore = readFileSync(`${rootDir}/.gitignore`, 'utf8');
  const discovered = discoverFiles({ rootDir, matcher: parseGitignore(gitignore) });
  const discoverMs = performance.now() - t0;

  // Assign stable, sorted file indices (deterministic ordinals, design §2.1).
  const files: FileNode[] = discovered.map((d, i) => ({
    id: `file:${d.path}`,
    idx: fileIdx(i),
    path: d.path,
    lookupPath: d.lookupPath,
    lang: d.lang,
    hash: d.hash,
    declHash: d.hash, // replaced by parse below
    exportHash: d.hash, // replaced by parse below
    size: d.size,
    mtime: d.mtime,
    lineIndex: d.lineIndex,
  }));
  const idxByPath = new Map(files.map((f) => [f.path, f.idx]));

  // Stage 2: parse (Tier 1, per file)
  const t2 = performance.now();
  const symbols: SymbolNode[] = [];
  const scopes: ScopeNode[] = [];
  const occurrences: Occurrence[] = [];
  const imports: RawImportRecord[] = [];
  const exports: ExportRecord[] = [];
  const importsByFile = new Map<FileNode['idx'], RawImportRecord[]>();
  const exportsByFile = new Map<FileNode['idx'], ExportRecord[]>();
  const templateTagsByFile = new Map<FileNode['idx'], string[]>();
  const astroGlobsByFile = new Map<FileNode['idx'], AstroGlobCall[]>();
  const initTypes = new Map<SymKey, InitType[]>();
  const typeScopes = new Map<FileIdx, Map<number, SymKey>>();
  let parseReusedFiles = 0;
  for (const d of discovered) {
    const idx = idxByPath.get(d.path)!;
    // §6.2: a cached parse whose content hash AND fileIdx match this discovery
    // is byte-identical to a fresh parseFile (keys pack the fileIdx, parse is
    // a pure function of the content), so Stage 2 is skipped entirely.
    const cached = opts.parseCache?.get(d.path);
    const parsed: ParsedFile =
      cached !== undefined && cached.hash === d.hash && cached.fileIdx === idx
        ? cached
        : parseFile({ fileIdx: idx, path: d.path, lang: d.lang, content: d.content });
    if (cached !== parsed) {
      // New or invalidated (hash or fileIdx moved): (re)parse and refresh the
      // cache so the entry always matches the latest (hash, fileIdx).
      opts.parseCache?.set(d.path, { hash: d.hash, ...parsed });
    } else {
      parseReusedFiles++;
    }
    const f = files[idx as unknown as number];
    f.declHash = parsed.declHash;
    f.exportHash = parsed.exportHash;
    if (parsed.poisoned) f.poisoned = { error: parsed.poisoned };
    symbols.push(...parsed.symbols);
    scopes.push(...parsed.scopes);
    occurrences.push(...parsed.occurrences);
    imports.push(...parsed.imports);
    exports.push(...parsed.exports);
    importsByFile.set(idx, parsed.imports);
    exportsByFile.set(idx, parsed.exports);
    if (parsed.astroGlobs) astroGlobsByFile.set(idx, parsed.astroGlobs);
    if (parsed.templateTags) templateTagsByFile.set(idx, parsed.templateTags);
    for (const it of parsed.initTypes) {
      let arr = initTypes.get(it.key);
      if (!arr) initTypes.set(it.key, (arr = []));
      arr.push(...it.types);
    }
    if (parsed.typeScopes.length) typeScopes.set(idx, new Map(parsed.typeScopes.map((t) => [t.scopeKey, t.symKey])));
    if (parsed.templateTags) templateTagsByFile.set(idx, parsed.templateTags);
  }
  // §6.2: files that left the inventory (deleted, re-ignored, renamed) can
  // never be hit again — drop their entries so the cache tracks the tree.
  if (opts.parseCache !== undefined) {
    for (const k of opts.parseCache.keys()) if (!idxByPath.has(k)) opts.parseCache.delete(k);
  }
  const parseMs = performance.now() - t2;

  // Stages 3: resolve + graph + export tables
  const t3 = performance.now();
  const resolver = createResolver({ rootDir, files: files.map((f) => ({ path: f.path, idx: f.idx })) });
  const graph = buildModuleGraph({
    importsByFile,
    exportsByFile,
    templateTagsByFile,
    astroGlobsByFile,
    files: files.map((f) => ({ path: f.path, idx: f.idx })),
    filePathOf: (idx) => files[idx as unknown as number].path,
    resolver,
  });
  const exportSurfaces = buildExportSurfaces({ files, symbols, exportsByFile, importsByFile, resolver });
  const exportIndex = createExportIndex(exportSurfaces);
  const resolveMs = performance.now() - t3;

  // Stage 4: bind occurrences → references (scope chain + import chase over
  // the graph's resolved records — parse-phase imports/exports stay untouched).
  const t4 = performance.now();
  const bound = bindIndex({ symbols, scopes, occurrences, exportIndex, resolvedImports: graph.resolvedImports, resolvedReexports: graph.resolvedReexports, initTypes, typeScopes });
  const bindMs = performance.now() - t4;

  // Stage 4.5: checker-backed tiers (deep member joins + lib refs, §9.1 /
  // §4.3 open remainder) — appends in-repo refs for light-unbound Property
  // occurrences the compiler resolves to an indexed declaration, and lib
  // refs for the `lib-not-loaded` bucket + lib/package member binds. Both
  // degrade to zero output when no program can be built.
  const t45 = performance.now();
  let libRefs: LibRefRow[] = [];
  if ((opts.deep ?? true) === true) {
    const deep = deepMemberBind({ files, symbols, occurrences, refs: bound.refs, unresolvedRefs: bound.unresolved, rootDir });
    bound.refs.push(...deep.refs);
    libRefs = deep.libRefs;
    // Rows the lib pass graduated are no longer unresolved (the bucket keeps
    // framework globals and binder gaps).
    if (deep.graduated.size > 0) bound.unresolved = bound.unresolved.filter((u) => !deep.graduated.has(`${u.fileIdx}:${u.range.start}`));
    // Merged-declaration joins (§13): light-bound refs at genuinely merged
    // sites (the compiler maps the occurrence to ≥2 indexed declarations —
    // interface/namespace merging or intersection-typed member access) point
    // at the site's deterministic primary and carry the sibling declaration
    // keys, so every site with the same declaration set binds ONE symbol and
    // def/hover can show every merged declaration site. Same-name single-
    // declaration binds are never reassigned (the pass only reports verified
    // sites).
    if (deep.merged.size > 0) {
      for (const ref of bound.refs) {
        const m = deep.merged.get(`${ref.fileIdx}:${ref.range.start}`);
        if (m === undefined) continue;
        ref.symKey = m.symKey;
        ref.merged = m.merged;
      }
    }
  }
  const deepMs = performance.now() - t45;

  const stats: IndexStats = {
    fileCount: files.length,
    symbolCount: symbols.length,
    referenceCount: bound.refs.length,
    libRefCount: libRefs.length,
    unresolvedCount: bound.unresolved.length + graph.unresolved.length,
    stageMs: { discover: discoverMs, parse: parseMs, resolve: resolveMs, bind: bindMs, commit: 0, deep: deepMs },
    ...(opts.parseCache !== undefined ? { parseReusedFiles } : {}),
    memoryBytes:
      files.length * 320 +
      symbols.length * 256 +
      scopes.length * 144 +
      occurrences.length * 72 +
      graph.edges.length * 40 +
      bound.edges.length * 40,
  };

  return {
    epoch: 1,
    rootDir,
    files,
    symbols,
    scopes,
    occurrences,
    imports,
    exports,
    graph,
    exportSurfaces,
    resolveExport: exportIndex.resolveExport,
    refs: bound.refs,
    symbolEdges: bound.edges,
    unresolvedRefs: bound.unresolved,
    libRefs,
    stats,
  };
}