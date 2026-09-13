# Code Indexing & Symbol Resolution — Design

**Project:** `asj-portal-v2` (`F:\astro`) · **Status:** Phases 0–6 + row 8 shipped on this tree (implementation log: §13); row 6’s §6.2 per-file parse-reuse half shipped (2026-09-04), and the §8 surface beyond the shipped subset, row 6’s remaining dirty-set bind/resolve impact half + WS push, and phase 7 (SQLite) are designed, not built (the astro template scope — symbol-level template interpolations — and Astro.glob expansion — wildcard module-edge expansion — both ship with this pass, §13) · **Date:** 2026-09-04

This document specifies a semantic index ("the index") over the repository: how files are
discovered and parsed, how symbols are stored, how a name written in one file is resolved to the
declaration that lives in another, how the dependency graph is maintained, and what query
interfaces sit on top.

Design targets, in priority order: **correctness of resolution** (match TypeScript semantics),
**incremental latency** (save → queryable < 150 ms p95), then **scale headroom** (100k symbols).

---

## 1. Codebase profile (measured)

Everything below is measured against the working tree, not assumed.

| Fact | Value | Design consequence |
|---|---|---|
| Source files | 143 `.ts`, 46 `.tsx`, 12 `.astro`, 11 `.mjs` | Single TS/Astro pipeline covers 100% of first-class sources |
| Lines of code | 27,784 (`src` + `netlify` + `shared`) | Small enough for a full in-memory graph; design envelope set at 10× |
| Logical roots | `src/` (Astro + Preact client), `netlify/functions/` (serverless), `shared/` | Two resolution universes; cross-root edges must be explicit and policy-checked |
| `tsconfig` `paths` aliases | **none** (verified) | Resolver is pure relative-path + extension probing; alias table kept as a no-op extension point |
| Relative traversal depth | 540 `../` hops across `src` + `netlify` | Specifier resolution must be exact; a naive `path.join` resolver will produce silent misses |
| Barrel files | 15 `index.ts` under `netlify/functions/contexts/*/` | Multi-hop re-export resolution is mandatory, not optional |
| Aliased re-exports | e.g. `export { _mapForm as mapForm }` (`catalog/repository.ts:32`) | Symbol identity ≠ export name; export table needs an alias layer |
| Duplicate top-level names | `findMasterByWa` ×3; `upsertMaster`, `patchMaster`, `normalizeWa`, `normalizeGender`, `isValidWaFormat`, `findCandidateRow`, `WA_MIN_DIGITS`, `WA_MAX_DIGITS`, `JP_MIN_DIGITS`, `JP_MAX_DIGITS`, `ToastMessage`, `Job` ×2 | Global-name lookup is *forbidden*; ambiguity is a first-class query result, not an error |
| Dynamic imports | `src/lib/fcm.ts` (remote `https://` specifiers), `src/store/i18n.ts` → `./i18n-jp`, 4 sites in `netlify/**/service.ts` | Dynamic edges are real edges, marked `kind: dynamic`; remote specifiers become unresolved-external |
| Vite-suffixed specifiers | `import sprite from '../icons/sprite.svg?raw'` | Resolver must strip `?query` before probing extensions |
| Side-effect imports | `@fontsource/inter/latin-400.css` | Emit asset module nodes with zero symbols; do not fail resolution |
| Generated / vendored | `netlify/functions/.netlify-built/` (49 `.js`), `dist/`, `.astro/`, `node_modules/` | Hard-excluded; see §2.1 |
| Existing tooling | `dependency-cruiser` + `.dependency-cruiser.cjs`, wired to `npm run boundary` | The index supersedes the scan and keeps the same violation rules (§6.4) |

**Working conclusion:** this is a TypeScript-only, alias-free, barrel-heavy monorepo with two
roots and real name collisions. The index must be resolution-accurate (scopes + export aliases),
not a grep with a nicer UI.

---

## 2. Architecture

### 2.1 Discovery

A gitignore-aware walker (not `fs.readdir` recursion) producing a deterministic, sorted file list.

```
include:  src/**/*.{ts,tsx,astro}  netlify/functions/**/*.{ts,tsx}  shared/**/*.ts
          *.{mjs,cjs,js} at repo root and in scripts/, e2e/   (secondary tier)
exclude:  node_modules/  dist/  .astro/  .netlify/  .git/
          netlify/functions/.netlify-built/   ← generated, gitignored
          .workbuddy-ai/  .agents/  .freebuff/  migrations/*.sql (tier 3, optional)
```

Rules:
- Exclusion is driven by `.gitignore` first, then an explicit deny list, then a `.idxignore`.
- **Windows note (this repo lives on `F:\`):** path keys are normalized to posix + lowercased for
  map lookups, while the original casing is preserved for display. NTFS is case-insensitive;
  without normalization `./ApiClient` and `./apiClient` become two entries.
- Determinism: files are indexed in sorted order; worker sharding is by sorted chunk, so symbol
  ordinals (and therefore IDs) are stable across runs.

### 2.2 Pipeline

Five stages. Stages 1–2 are per-file and embarrassingly parallel; 3–5 are global and ordered.

```
[1] DISCOVER   walk → FileRecord{path, hash, size, mtime, lang}
                 │
[2] PARSE      per-file AST → declarations, scope tree, occurrences, import records
                 │            (no type checker — parse + bind only)
                 │            ⇢ worker pool, N-1 threads
                 ▼
[3] RESOLVE-MODULES   specifier → FileId | ExternalModuleId | AssetId | Unresolved
                 │            (relative + extension probe + barrel awareness)
                 ▼
[4] BIND       build per-file export tables (incl. `export *`, `export {a as b}`)
                 │            then bind every occurrence → SymbolId via scope chain
                 ▼
[5] COMMIT     atomic generation swap → serve; emit diff over WebSocket
```

### 2.3 Parsing strategy — two tiers, TS Compiler API primary, LSP advisory

**Tier 1 (bulk, parse-only).** `ts.createSourceFile()` + a hand-written binder walk. No
`Program`, no `TypeChecker`. Emits declarations, scopes, identifier occurrences, import records.
This is what runs on every keystroke-scale change. Cost is linear in file size and roughly
1/10th of a checker-backed pass.

**Tier 2 — light type-guided member binding (shipped, 2026-09-04) + checker-backed deep tier (shipped, 2026-09-05) + lib tier (shipped, 2026-09-05).** Shipped: `obj.method` sites resolve to the member's declaration through initializer shapes (`new Foo()`, `as Foo`, aliases, factory calls' declared return types), annotations (`const x: Foo`, params), `this.` in classes, class-as-value static access, enums, namespaces, and the heritage chain, constructor parameter properties (`constructor(private repo: Repo)`), and multi-hop chains (`this.repo.get()`, `svc.helper.run()`) — 252 light member refs + 1,049 checker-backed deep refs bound on this tree, plus **8,123 lib refs** (the `lib-not-loaded` bucket graduates to lib.dom/lib.es/package targets — lib globals through the compiler, CJS module-wrapper vars + the Astro global through canonical framework entries into the installed types; §13). The deep tier (`ts.createProgram` per build, `resolvedVia: 'type'` + `deep: true`) is wired and default-on; def/hover on a lib ref answers with the lib declaration file + line (`resolvedVia: 'lib'`); the row-9 remainder — `detail` strings and cross-file declaration merging — is closed: checker-joined merged decl sites + the detail pass ship with the deep tier, and the read-surface rendering pass puts `detail`/`typeRef`/`kind` on every answer surface (§9.1, §13).
(`src` universe and `netlify` universe share `shared/`), reused incrementally via
`ts.createIncrementalProgram` / `oldProgram`. Used for:
- resolving `export { _mapForm as mapForm }` and multi-hop barrel chains
  (`ts.Symbol` → `checker.getAliasedSymbol()`),
- filling `detail` (type signature strings) and hover markdown,
- resolving references into `node_modules` `.d.ts` files, on demand and memoized,
- union/intersection/mapped-type-aware reference binding that pure AST walking gets wrong.

**LSP is advisory, not the bulk path.** `tsserver` speaks JSON-RPC over stdio; one round trip per
request means 40k references = 40k round trips. It is used for three things only:
1. hover/completion/signature help in interactive single-symbol queries,
2. **differential validation** — sample N symbols, compare our `refs` against
   `textDocument/references`, fail CI on divergence (§11),
3. the future non-TS language path (Python/SQL), where no in-process parser exists.

Everything is LSP 3.17-compliant in *shape* (`Location`, `DocumentSymbol`, `SymbolKind`) so the
index can be swapped behind an LSP facade later without changing clients.

### 2.4 Per-language handling

| Language | Strategy |
|---|---|
| `.ts` / `.tsx` | Tier 1 + Tier 2, full support |
| `.astro` | Split on the `---` fence. Frontmatter → parsed as a TS module (yields `Props` interface, consts, imports). Template → separate `template` scope, child of module scope; component tags (`<BottomNav />`, `<Footer />`) emit `renders` edges; `{expr}` interpolations emit occurrences resolved in the template scope. `Astro.glob('../pages/*.astro')` expands at index time into a set of module edges — a wildcard dependency, not an unresolved string. |
| `.mjs` / `.cjs` / `.js` | `allowJs: true`; parsed at Tier 1, JSDoc mined for `detail`. `scripts/` and `e2e/` indexed at lower priority. |
| `.svg` / `.css` / assets | Asset module nodes, no symbols, edge kind `imports-asset` |
| `migrations/*.sql` | Optional tier 3: table/view/function symbols, so `netlify/functions/_lib/db/**` string literals can be checked against real table names. Deferred. |

---

## 3. Data structures

Canonical TypeScript definitions live in [`docs/code-index-schema.ts`](./code-index-schema.ts);
summarized here.

### 3.1 Identity: logical IDs over byte offsets

The single most important decision in the storage layer.

- **Logical ID (public, stable):** `sym:<posixPath>#<qualifiedName>[~<n>]`
  — e.g. `sym:netlify/functions/contexts/master-data/repository.ts#findMasterByWa`.
  `~n` disambiguates the 2nd+ same-named top-level declaration in one file.
  Inserting an unrelated function above a symbol does **not** change its ID, so caches,
  bookmarks, and client-side state survive edits.
- **Physical key (internal):** `(fileIdx << 20) | declIndex` — a packed int32 used for
  range lookup and CSR adjacency. Regenerated per parse; never leaves the process.

Mapping between them is a single `symIdByKey: Int32Array` + `keyBySymId: Map`.

### 3.2 Nodes

```
FileNode      { id, path, lang, hash:FileHash, declHash, exportHash, lineIndex, mtime }
SymbolNode    { id, name, qualified, kind, fileId, scopeId, decls:DeclRange[],
                exported:boolean, exportNames:string[], async, flags, detail,
                typeRef?, parentSymId?, centrality }
ScopeNode     { id, kind, parentId, fileId, range, name?, hoisted:Set<symKey>, symbols:Set }
ModuleNode    { id:"ext:<pkg>"|"asset:<path>"|"unresolved:<spec>", specifier, importers[] }
```

`SymbolNode.decls[]` is an array because declaration merging is real: `interface Job {}` in two
files merged via namespace, or a function with overloads, is **one** symbol with **many**
declaration ranges. "Exactly one definition node per symbol" holds; "one range per symbol" does not.

Kinds: `module | class | interface | typeAlias | enum | enumMember | function | method |
constructor | property | variable | constant | parameter | importBinding | namespace | component |
hook | exportAlias`.

`SymbolNode.exportNames` is a list, not a string: `export { _mapForm as mapForm }` yields one
symbol whose `name` is `_mapForm` and whose `exportNames` contains `mapForm`.

### 3.3 Occurrences, references, edges

An **occurrence** is a syntactic sighting (pre-resolution). A **reference** is an occurrence that
resolved to something (post-resolution). Keeping both lets the index report *unresolved* names
(`unresolved: {file, range, name, reason}`) instead of silently dropping them — a health signal,
see §10.

```
Occurrence   { fileId, range, name, scopeId, role }
                 role: callee | typeRef | property | jsxName | importSpecifier
                     | exportSpecifier | decorator | write | read | key
Reference    { id, symId, fileId, range, role, resolvedVia:'scope'|'import'|'global'|'lib'|'type' }
Edge         { id, source, target, type, weight }
                 type: contains | declares | imports | importsType | importsDynamic
                     | reExports | calls | reads | writes | extends | implements
                     | instantiates | renders | references
```

Symbol-level edges (`calls`, `extends`, `renders`) are what make the graph worth having. They are
derived in Stage 4 from reference roles: a `callee` role emits a `calls` edge; a JSX name emits
`renders`; `extends`/`implements` clauses emit inheritance edges.

### 3.4 Storage layout

**In-memory (hot).** Structure-of-arrays, not array-of-structures.

```
symKind:   Uint8Array      symNameIdx:  Int32Array     (interned string table)
symFile:   Int32Array      symParent:   Int32Array
symStart:  Int32Array      symEnd:      Int32Array
symFlags:  Uint16Array     symCentrality: Float32Array
refsCSR:   { offsets: Int32Array, targets: Int32Array, roles: Uint8Array }   // adjacency
edgesCSR:  { offsets: Int32Array, targets: Int32Array, types: Uint8Array, weights: Uint16Array }
```

CSR (compressed sparse row) adjacency: `refs of S = targets[offsets[S] .. offsets[S+1]]`.
O(1) fan-out, no pointer chasing, ~8 bytes per edge, and trivially serializable to a binary
snapshot. String interning for names and paths is the single largest memory win — with ~40
distinct file paths × thousands of references, interning cuts this to int32.

**Indices.**

| Index | Type | Serves |
|---|---|---|
| `byName` | `Map<string, Int32Array>` | exact name lookup |
| `nameTrie` | radix trie over interned names | autocomplete, prefix search |
| `trigrams` | inverted `Map<Trigram, Int32Array>` | substring / fuzzy search |
| `byFile` | `Map<fileIdx, Int32Array>` | outlines, file-scoped queries |
| `byExportName` | `Map<fileIdx, Map<string, ExportEntry>>` | Stage 3/4 resolution |
| `revDeps` | `Map<fileIdx, Set<fileIdx>>` | incremental impact analysis |
| `moduleGraph` | `Map<fileIdx, ImportRecord[]>` | dependency queries |
| `lineIndex` | `Uint32Array` per file | offset ↔ line/col (LSP ranges) |

**Persisted (cold start).** SQLite (WAL) tables `meta / files / symbols / refs / edges / unresolved`,
plus an exported `nav.index.jsonl` for tool interop:

```jsonl
{"symId":"sym:netlify/functions/contexts/master-data/repository.ts#findMasterByWa","def":{"uri":"file:///F:/astro/netlify/functions/contexts/master-data/repository.ts","l":42,"c":17}}
{"symId":"sym:...#findMasterByWa","refs":[{"uri":"file:///F:/astro/netlify/functions/contexts/master-data/service.ts","l":88,"c":24}]}
{"symId":"sym:...#findMasterByWa","hover":{"contents":{"kind":"markdown","value":"```ts\nfunction findMasterByWa(wa: string): Promise<MasterRawRow | null>\n```"}}}
```

Snapshot validity is gated on `meta.indexVersion` + `meta.configHash`; mismatch → full rebuild.
Cold-start target: **< 800 ms** from SQLite for this repo, versus ~3 s for a full build.

---

## 4. Symbol resolution workflow

### 4.1 Stage 2 — discovery per file

1. Parse to AST.
2. **Build the scope tree.** Scope kinds: `module | namespace | class | interface | function |
   arrow | block | for | catch | switch | objectLiteral | typeParams | template(astro) |
   enumBody`. Each scope records its parent, its own declarations, and its *hoisted* set.
3. **Emit declarations** with `qualified` names (dot-joined container chain:
   `MyClass.myMethod`, `NS.Inner.Const`).
4. **Emit occurrences** — every identifier, tagged with `role` and enclosing `scopeId`.
   This is deliberately greedy: over-collecting is cheap, and the unresolved bucket is useful.
5. **Emit import records**: raw specifier, clause shape (default / namespace / named / renamed /
   side-effect / `import type` / dynamic), and the local binding names they introduce.

Hoisting semantics matter here and are easy to get wrong: `var` and function declarations hoist
to the nearest **function or module** scope; `let` / `const` / `class` are block-scoped with a
TDZ. The binder records `usedBeforeDecl` when a reference precedes a TDZ declaration rather than
resolving it elsewhere.

### 4.2 Stage 3 — specifier → module

A resolver that mirrors `ts.resolveModuleName` for this project's config, in order:

1. Strip Vite query suffixes: `../icons/sprite.svg?raw` → `../icons/sprite.svg`.
2. If specifier is bare (not `.`/`/`) → package lookup. `node_modules` is **not** walked deeply:
   resolve `<pkg>/types` or `<pkg>` → `ext:<pkg>` module node; parse its `.d.ts` lazily and only
   if something actually resolves into it.
3. If relative → `path.posix.normalize(join(dirname(importer), specifier))`, then probe:
   `.ts`, `.tsx`, `.d.ts`, `.astro`, `.mjs`, `.mts`, `.js`, `.jsx`, then `/index.<ext>`.
4. Non-code extensions (`.css`, `.svg`, `.png`, `.woff2`) → `asset:` node, `role: side-effect`.
5. `https://…` (as in `src/lib/fcm.ts`) → `unresolved:` node with `reason: remote-specifier`.
6. Alias table (`tsconfig.paths`) is consulted before probing — currently empty, but the hook
   exists so adding `@/lib/...` later requires zero pipeline changes.

Every result is memoized on `(importerDir, specifier)`; the cache is invalidated only when a
file in that directory is added or removed.

### 4.3 Stage 4 — export tables and binding

**Export table** per file, `Map<exportName, ExportEntry>`:

```ts
type ExportEntry =
  | { kind: 'direct';    symKey: number; localName: string }
  | { kind: 'alias';     symKey: number; localName: string; exportName: string }  // _mapForm as mapForm
  | { kind: 'default';   symKey: number }
  | { kind: 'star';      fromFileIdx: number; excludes: string[] }
  | { kind: 'typeOnly';  symKey: number; localName: string }
```

`export *` is expanded lazily with a **cycle guard and memo**:
`resolveExport(fileIdx, name, seen: Set<fileIdx>)`. For the 15 barrels in
`netlify/functions/contexts/*/index.ts`, a query for `handleSubmitApply` walks
`contexts/documents/index.ts` → `./service.ts` in one hop, memoized thereafter. If two `star`
entries provide the same name, no winner is guessed: the entry is marked `ambiguous` and both
candidates are retained.

**Binding an occurrence** walks outward, in this exact order:

```
1. current scope's declarations            (respecting TDZ position for let/const/class)
2. … repeat up the parent chain to module  (functions, blocks, class bodies, namespaces)
3. module-scope import bindings            (value bindings for value positions,
                                            type bindings for type positions incl. `import type`)
4. → follow to target file's export table  (unwrap `alias`, recurse through `star`)
5. module-scope declarations of this file
6. global / lib declarations               (`lib.dom.d.ts`, `globals.d.ts`)
7. otherwise → unresolved{reason}
```

Step 3→4 is the cross-file jump, and it is where alias-awareness pays off: a file importing
`{ mapForm }` from `catalog/repository.ts` resolves through the alias to the `_mapForm`
declaration, so `refs(_mapForm)` correctly includes that import site.

**Never** a bare global-name lookup. An unqualified name in file *F* resolves only through *F*'s
scope chain and *F*'s imports. This is what makes `findMasterByWa` ×3 deterministic instead of a
coin flip, and it is exactly TypeScript's own semantics.

### 4.4 Stage 5 — commit

New generation built in a shadow container; on success, atomically swap the pointer and
increment `epoch`. In-flight queries keep reading the old generation until they drain. A crash or
parse failure in any single file is contained: that file is marked `poisoned`, its previous
symbols are retained, and the commit proceeds. The index is never left half-updated.

---

## 5. Cross-file references, imports, dependency graph

### 5.1 Two layers

- **Module graph** — file-to-file. Cheap, always current, built in Stage 3. Powers impact
  analysis, cycle detection, and boundary rules.
- **Symbol graph** — symbol-to-symbol (`calls`, `extends`, `renders`, `reads`). Built in Stage 4.
  Powers "who calls this", dead-code detection, and blast-radius ranking.

They are queried through the same API but stored separately, because the module graph must stay
fresh even while the symbol graph is mid-rebuild.

### 5.2 Edge attributes

```
ImportEdge { from, to, specifier, kind: static|type|dynamic|sideEffect|asset,
             importedNames: string[], weight /* = # symbol refs across this edge */ }
```

`weight` is what turns a dependency graph into something actionable: an import edge with weight 0
is a dead import; an edge with weight 40 is a high-blast-radius dependency worth watching.

### 5.3 Cycles

Tarjan SCC over the module graph → condensation DAG. Cycles are reported at SCC granularity
("these 4 files form a cycle"), not as a hairball of pairwise edges. Cycle membership is cached
and recomputed only for SCCs touched by an incremental update.

### 5.4 Boundary rules (supersedes the `dependency-cruiser` scan)

The existing `.dependency-cruiser.cjs` rules are ported into the index so that violations are
reported from the same data structure as everything else, with one extra rule that matters here:

| Rule | Meaning |
|---|---|
| `no-client→server` | `src/**` must not import `netlify/functions/**` (server-only code, service-role keys) |
| `no-server→client` | `netlify/functions/**` must not import `src/**` (Preact/Astro runtime) |
| `shared-is-pure` | `shared/**` imports nothing from either root — verified true today for `shared/wa-rules.ts` |
| `no-deep-context` | a context may import its own `./service`/`./repository`/`./download` and `_lib/**`, but not another context's internals — go through that context's `index.ts` |
| `no-circular` | block new SCCs among `netlify/functions/contexts/**` |

As shipped (2026-09-03, row 8): violations are exposed as `GET /violations` and
`idx violations`, the `no-circular` rule above is real — added to the config and
evaluated over the module graph’s SCCs with depcruise-identical cycle semantics
(cycles.ts, §13) — and `npm run boundary` now IS the index (`idx:build` + `idx
violations`; the depcruise `--exit-code` flag 18.x removed never gated, so the
swap makes the gate real). depcruise stays available as the oracle script
(`npm run depcruise`).

---

## 6. Incremental updates

*(Phase 6 on this tree: the generation/commit/diff lifecycle is shipped (§13), and
§6.2's hash-split per-file parse reuse shipped 2026-09-04 — `idx watch` generations
carry a content-hash + fileIdx-keyed parse cache (buildIndex `parseCache`), so an
unchanged file skips Stage 2 entirely (zero-copy: downstream stages never mutate
parse records; output proven byte-identical to a cold build). A fully warm rebuild
re-parses 0 of 247 files (parse ~1 ms vs ~470 ms cold; no-deep build ~0.14 s vs
~0.64 s) and a one-file save re-parses one file, not the inventory. The 150 ms path
described here is still not reached end to end: the remaining row-6 half — §6.2's
dirty-set impact analysis (bind/resolve over an impact set instead of the global
passes) — is deliberately not built (those passes are ~0.1 s global on this tree,
below the fan-out threshold), and WS push stays open (§13).)*

### 6.1 Content hashing, three ways

Each `FileNode` stores three hashes, and the distinction is the core optimization:

| Hash | Covers | Invalidates |
|---|---|---|
| `hash` | raw bytes | Stage 2 (reparse) |
| `declHash` | normalized declaration signatures (names, kinds, param types, return types, modifiers) — bodies excluded | downstream re-binding |
| `exportHash` | the file's export table (names → target signatures) | downstream re-resolution |

If only a function body changed, `hash` differs but `declHash` and `exportHash` do not. The
change is **contained**: reparse the file, and touch nothing else. Without this split, every save
to a widely-imported file fans out to its entire reverse-dependency closure.

### 6.2 Update procedure

```
1. watcher event → debounce 120 ms → coalesce into a dirty set
2. rehash dirty files; drop files whose hash is unchanged (editor swap-file noise)
3. Stage 2 on dirty files                       (parallel, worker pool)
4. diff old vs new symbol sets by logical ID → added / removed / modified
5. impact set = { dirty files }
              ∪ { f : f imports a file whose exportHash changed }
              ∪ { f : f is in the reverse-dependency closure of a declHash change }
              ∪ { f : f imports a file that was added or deleted }
6. Stage 3 + 4 on the impact set only           (parallel; memoized resolution reused elsewhere)
7. recompute SCCs and centrality for touched components only
8. atomic commit, epoch++, emit diff
```

Step 5 is evaluated against the **previous** generation's hashes, so it is exact rather than
conservative-by-default. Worst case (a widely-imported barrel's signature changes) degrades
gracefully to a partial rebuild of one resolution universe.

### 6.3 Event handling

- **File changed** — §6.2.
- **File added/deleted** — invalidate the `(dir, specifier)` resolver memo for the containing
  directory before impact analysis, otherwise a new sibling file may be invisible to existing
  importers.
- **Directory rename / branch switch** — rehash everything by default, but if a `.git` base commit
  is recorded in `meta`, use `git diff --name-only <base> HEAD` to compute the dirty set directly.
  This turns a 3 s rebuild into a ~200 ms one after `git checkout`.
- **Config changed** (`tsconfig.json`, `.idxignore`) — `configHash` mismatch → full rebuild.
- **Watcher unavailable** (network drive, WSL path) — fall back to a polling sweep at 2 s; the
  index stays correct, just less prompt.

### 6.4 Consistency

Invariants asserted before every commit (cheap enough to run every time, and fail loudly):

1. every edge endpoint resolves to an existing node,
2. every symbol has exactly one definition node,
3. `refs(s)` and reverse-index counts agree,
4. every `file:` node has a `contains` edge to each of its top-level symbols,
5. no symbol is its own ancestor in the scope tree.

Violation → reject the generation, keep the previous one, emit `index.degraded`.

---

## 7. Naming conflicts and scoping

### 7.1 Conflicts

IDs are file-qualified, so collisions cannot corrupt the graph. Collisions surface at **query**
time, and the policy is ranking, not erroring.

For a bare-name query like `findMasterByWa` (3 definitions in this repo), results are ranked by:

1. same file as the requesting context, if one was supplied,
2. reachable via imports from the requesting file (one hop beats two),
3. same directory, then nearest common ancestor package/context,
4. exported before local,
5. kind match (`function` when a call site was the origin),
6. `centrality` (reference count / PageRank over the symbol graph) as the tiebreaker.

The response always carries an `ambiguous: true` flag with all candidates, so a UI can ask
instead of guessing. Every mutating operation (rename, go-to-definition from an editor) requires
a `contextFile` or an explicit ID — no bare-name mutation is ever allowed.

### 7.2 Shadowing and merging

- **Shadowing** is legal and recorded: the inner symbol wins, and `shadowedBy` is attached to the
  outer one for diagnostics.
- **Declaration merging** (`interface` + `interface`, `namespace` + `namespace`, `enum` + `enum`,
  overloads, `declare global` augmentation) produces **one** symbol with multiple entries in
  `decls[]`. The reverse mapping is kept so a jump to any declaration range lands on the right symbol.
- **Aliased exports** (`export { _mapForm as mapForm }`) are one symbol with two export names —
  not two symbols. Both names are searchable; both are indexed in `byExportName`.
- **`export *` ambiguity** is preserved as `ambiguous` rather than resolved by guesswork.
- **Case-collisions** on Windows (`ApiClient.ts` vs `apiClient.ts`) are flagged:
  lookup keys are lowercased, display paths are not, and a collision emits a warning because
  `git` and TS may disagree with the filesystem here.

### 7.3 Scopes and namespaces

The scope tree is the backbone of resolution. Beyond §4.1:

- **Namespaces** (`namespace X { export const Y }`) produce qualified symbols `X.Y`; a qualified
  reference `X.Y` resolves by walking namespace scopes, not by string matching.
- **Import bindings** live in module scope, are immutable, and carry a value/type/namespace kind.
  `import type { Job }` resolves only in type positions — a value-position use of `Job` is
  reported as `unresolved{reason: type-only-import-in-value-position}` rather than silently bound.
- **`isolatedModules: true`** (set in this repo's `tsconfig`) means type re-exports must be
  spelled `export type { … }`; the index records this so it can flag re-exports that would break
  under bundler-per-file transpilation.
- **Preact components** (`.tsx`): a JSX name is an occurrence with `role: jsxName`; props are
  resolved through the component's parameter type; custom hooks are kind `hook` so
  hook-dependency analysis is possible later.
- **Astro**: frontmatter is module scope; the template is a child scope; `Astro.props` binds to the
  `Props` interface by convention (`export interface Props` in `BaseLayout.astro`, verified);
  `<slot />` emits a `renders` edge to the slot content owner.

---

## 8. Query interfaces

Base URL: designed at `http://127.0.0.1:7878`; the shipped server binds `127.0.0.1`
on `--port` (default 8787, `0` = ephemeral); every versioned read takes `?gen=` (2026-09-04): validated against the current epoch — older generations are retained as bounded diffs, not snapshots, so full historical reads await the /diff durability follow-up (§13).
Lines are **1-based editor lines** and `char` a **0-based column** (LSP-style) — one
coordinate space end to end: dump ranges, `/resolve` params, CLI `def`/`refs`
input and output, and every `l`/`c` in responses. (Char stays 0-based code units,
never bytes or code points.)
**Shipped read surface (2026-09-04):** `/healthz /stats /resolve /refs
/sym/:symId /search /deps /deps/cycles /deps/path /deps/orphans /symbols
/files/:path/unresolved /violations` — contract, positions, and measured
numbers in §13 (Phase 5; /violations, /deps/cycles and the §8 read-surface
pass §13). Everything else in §8.1–8.4 is the designed target surface, not
live — §8.2's role-filtered refs, callers/callees, implementations and
rename-plan, the /symbols symbol search (renamed /symbols/search on ship,
§8.1), the §8.3 `kind`-filtered deps and /graph, and the §8.4 WS push
channel (row 6) — mapping to roadmap phases 6–8 (§11).
**File-needle policy (uniform since 2026-09-03):** every `file` param —
/resolve, /deps, /symbols — and `idx export <file>` share one lookup:
exact repo path (case-insensitive) → extension probing (so `repository` and
`contexts/catalog/repository` both resolve) → numeric file idx. Ambiguous
needles pick the first hit in file-list order, deterministically and
identically across CLI and API (`resolveFileNeedle` in query.ts).
Character offsets are the pipeline's code units (schema `Range`): pass LSP-style
UTF-16 code-unit offsets — never byte offsets or code points.

### 8.1 Symbol lookup

```
GET  /symbols?q=findMasterByWa&kind=function&file=&exported=true&fuzzy=1&limit=50&contextFile=…
     (collision: shipped `GET /symbols?file=` already means “file outline” — when
      this symbol-search endpoint ships it must be renamed, e.g. `/symbols/search`)
GET  /sym/:symId                      → def, decls[], hover, container, refs count, centrality
     (✅ live 2026-09-04 — symbol card incl. LSP-shaped hover markdown, §13)
POST /resolve                         → { file, line, character } → def + all decls
     (deferred — GET /resolve?file&line&char covers it)
GET  /files/:path/symbols             → document outline (nested scope tree)
     (designed-not-built: the dump carries no scope tree; /symbols?file= answers the honest flat outline)
GET  /files/:path/unresolved          → names that failed to bind, with reasons
     (✅ live 2026-09-04 — occurrence-level + import-level unresolveds of one file, §13)
```

`POST /resolve` response, showing the ambiguity case that actually exists in this repo:

```json
{
  "query": { "file": "netlify/functions/contexts/master-data/service.ts", "line": 88, "character": 24 },
  "resolved": {
    "symId": "sym:netlify/functions/contexts/master-data/repository.ts#findMasterByWa",
    "name": "findMasterByWa",
    "kind": "function",
    "container": null,
    "decls": [{ "uri": "file:///F:/astro/netlify/functions/contexts/master-data/repository.ts", "l": 42, "c": 17 }],
    "detail": "function findMasterByWa(wa: string): Promise<MasterRawRow | null>",
    "resolvedVia": "import"
  },
  "alternatives": [
    { "symId": "sym:netlify/functions/contexts/catalog/repository.ts#findMasterByWa", "reason": "same-name-different-file" },
    { "symId": "sym:netlify/functions/contexts/applications/repository.ts#findMasterByWa", "reason": "same-name-different-file" }
  ],
  "gen": 42
}
```

The `resolvedVia: "import"` field is the proof that resolution went through the importer's scope
chain rather than a name search — the two alternatives are shown but never substituted.

### 8.2 References and call graph

```
GET  /sym/:id/refs?role=call|read|write|type&kind=&file=&limit=&offset=
GET  /sym/:id/callers?depth=1        GET /sym/:id/callees?depth=1
GET  /sym/:id/implementations        → subtypes / interface implementors
GET  /rename-plan/:id                → every edit site, grouped by file, with shadowing warnings
```

### 8.3 Dependency graph

Shipped: `GET /deps?file=<path>&direction=out|in|both&limit=`
(module-level; §13 Phase 5), `GET /violations` (row 8), and
`GET /deps/cycles[?file=<needle>]` (row 8) — the dump’s non-trivial
module-level SCCs, each member with a real cycle path through it; the shared
`file` needle policy narrows to the containing cycle (`fileFound:false` for
unknown files, `total: 0` when the file is acyclic, 400 on an empty `file`).
The block below is the designed superset — not live.

```
GET  /deps?from=<file|dir>&to=&direction=in|out|both&kind=static|dynamic|type|all
GET  /deps/path?from=A&to=B          → shortest dependency path (BFS, < 5 ms)   ✅ live 2026-09-04 (§13)
GET  /deps/orphans                   → files nothing imports                    ✅ live 2026-09-04 (§13)
GET  /graph?scope=module|symbol&root=&depth=2&maxNodes=2000   → subgraph for visualization
GET  /stats                          → counts, epoch, memory, build timings
```

### 8.4 WebSocket

*(Phase 6 shipped a polling equivalent: `idx watch` JSONL diffs on stdout and
`GET /gen` + `GET /diff?since=<gen>` on serve are how clients learn about new
generations today; the WS push channel below remains the designed follow-up.)*

```
→ { "op":"subscribe", "topics":["index.updated","index.degraded"] }
← { "op":"index.updated", "gen":43, "changed":["netlify/…/service.ts"],
    "invalidated":["netlify/…/index.ts"], "ms":128 }
← { "op":"index.degraded", "gen":43, "files":[{"path":"…","error":"parse error at 12:4"}] }
```

Diffs are coalesced at 100 ms and capped at 500 changed files per frame (beyond that, a
`index.rebuilt` signal is sent and clients refetch) — prevents a branch switch from melting the pipe.

### 8.5 CLI — as built (2026-09-03)

```
idx build [--json]            full build + summary (default command)
idx stats [--json]            counts + stage timings (wall-clock; never in dumps)
idx unresolved [--json]       unresolved imports + ref-level references, by reason
idx export <file> [name] [--json]
                              file's export surface; with a name, resolve it through
                              barrels/aliases to the defining symbol
idx dump [--pretty]           whole index as one JSON document on stdout
idx serve [--port N] [--snapshot <file>|--state <dir>] [--root <dir>]
         [--refresh-ms N]
                              query API over a live build (POST /rebuild),
                              an `idx dump` snapshot, or an `idx watch` state
                              dir polled for new generations
idx watch [--root <dir>] [--state <dir>] [--poll <ms>]
                             [--watchdog-ms <ms>] [--keep-previous]
                              Phase 6: rebuild on every change (fs.watch, with a
                              periodic watchdog reconcile sweep that catches
                              missed events; --poll forces polling), print one
                              JSON generation-diff line per commit; the state
                              dir holds current.json (+ previous.json) for
                              `idx serve --state`
idx violations [--root <dir>] [--json]
                              evaluate the repo’s own .dependency-cruiser.cjs
                              rules over the module graph (row 8): text or JSON
                              violation list; exit 0 when no error-severity
                              violation exists (warnings print but do not fail).
                              Circular rules (to.circular) are evaluated over the
                              module graph’s SCCs (cycles.ts): each violation
                              prints its real cycle path (from → … → from) and
                              violations sharing one cycle member set collapse to
                              one, exactly like depcruise@18
idx def <file>:<line>[:<char>] [--json] [--snapshot <file>]
                              <file>:<line> answers what the line holds: the
                              tightest indexed declaration or reference on it
                              (line-granular resolveLine - CLI-only: GET
                              /resolve answers one exact position, so HTTP
                              line granularity is a designed follow-up, not
                              built); <file>:<line>:<char> pins one
                              exact position (line 1-based, char 0-based). Member
                              accesses through namespace imports (`masterData.someFn`)
                              are indexed: refs lists them (Property role) and def at
                              them chases to the definition. <file> probes like
                              the other commands (exact path, extensionless
                              suffix, numeric idx). exit 0 when a symbol is
                              found, 1 on empty/not-found lines or bad args
                              An import-specifier position answers the
                              imported definition when the chase is
                              unambiguous (via resolvedVia 'import'). The chase
                              resolves through the importing edge's preserved
                              per-binding data (DumpImportEdge.bindings), so
                              renames bind their true source name and a
                              same-file import of an unrelated name from a
                              module that also exports the queried symbol never
                              poisons the answer. Default and namespace imports
                              are never chased (no named surface entry), and
                              legacy snapshots without per-edge bindings fall
                              back to name-only matching - both keep the local
                              binding with alternatives
idx refs <name> [--json] [--snapshot <file>]
                              every reference site of the symbol whose exact
                              simple or qualified name equals <name> - the
                              same answer as GET /refs (role/file/range per
                              site). one candidate policy: import-binding
                              shadows never count. exit 1 when no symbol
                              matches, several definitions do (ranked), or
                              the name is only imported (import sites are
                              grouped                              by file; external symbols have no refs
                              to list). A defined name also lists its import
                              sites (importing files + specifier decl
                              positions: each binding-bearing import edge
                              is asked directly and chased through the binding's
                              preserved source name, so renamed importers
                              (import { mapForm as _mapForm }) list their
                              specifier exactly like same-name ones; default /
                              namespace imports are never sites. Alongside usage
                              refs - the rename/impact answer. A name no repo
                              symbol defines but the libRefs table carries
                              (`console`, `String`, `console.log`) answers
                              with the LIB target(s): the declaration file +
                              position and every usage site across the repo
                              (exit 0; `idx impact` on a single lib target
                              reports the full impact answer with a per-role
                              breakdown)
idx impact <name> [--gate N] [--json] [--snapshot <file>]
                              the rename/impact answer over the same name
                              resolution as refs: the definition site, every
                              reference + import site, the affected file set
                              (sorted, deduped: definition + all sites), and a
                              per-role breakdown (call/member/re-export/...).
                              --gate N exits 2 when the affected file set
                              exceeds N (a CI rename gate - measured on this
                              tree: requireRole spans 13 files, signToken 5,
                              handleSubmitMasterForm 3); exit 1 for unknown,
                              ambiguous, or import-only names (same as refs).
                              Workflow entry: `npm run idx:impact -- <name>`;
                              the CI drift gate `npm run idx:gate` runs the
                              same impactReport over per-symbol thresholds in
                              indexer/impact-gate.json (threshold policy lives
                              in that file's header) and is part of ci:quality
```

`<file>` takes an exact indexed path or an extensionless path/suffix — the same
extension probing the resolver uses (`Icon` → `src/components/ui/Icon.tsx`).
Errors print to stderr and exit 1; `--json` renders the invoked command's output,
never another command’s. The dump/serve document contract, error contract, and
measured numbers: §13 (Phase 5). CLI commands the §8.5 design listed that are
**not built** (later phases): `idx why`, `idx outline`, `idx verify`.

`idx def --json` and `idx refs --json` carry the same JSON values as the
GET /resolve and GET /refs bodies (the CLI pretty-prints; the HTTP server
sends compact JSON) - value-equal, not byte-equal.

---

## 9. Performance

### 9.1 Budgets (this repo: ~260 files, 27.8k LOC, est. 4–6k symbols, 30–45k references)

| Operation | Target | Mechanism |
|---|---|---|
| Full build (cold) | < 3.0 s | parse-only Tier 1, worker pool, no checker in the bulk path |
| Full build (with Tier 2 types) | < 9 s | incremental `Program`, lazy `.d.ts` |
| Cold start from snapshot | < 800 ms | SQLite WAL + binary CSR load |
| Save → queryable (single file, body-only edit) | < 60 ms | §6.1 hash split contains the change |
| Save → queryable (signature change in a barrel) | < 400 ms | bounded impact set, parallel rebind |
| `POST /resolve` | < 20 ms cached / < 60 ms uncached | CSR adjacency + interned strings |
| `GET /refs` (5k refs) | < 100 ms | CSR slice, no per-ref object allocation |
| `GET /deps/path` | < 5 ms | BFS over Int32 adjacency |
| Memory, 5k symbols | < 120 MB | SoA + interning |
| Memory, 100k symbols (design envelope) | < 500 MB | same, CSR at ~8 B/edge |

### 9.2 Techniques

- **Parse-only hot path.** The `TypeChecker` is 60–70% of `tsc` wall time; Tier 1 skips it entirely.
- **Worker pool**, `N-1` threads, files sharded in sorted order, results transferred as plain
  objects (structured clone) or shared buffers for the CSR arrays. No locks on the read path.
- **Incremental `Program` reuse** for Tier 2 (`oldProgram` / `.tsbuildinfo`).
- **String interning** for names, paths, and container chains.
- **CSR adjacency** for refs and edges — O(1) fan-out, trivially serializable.
- **Trigram inverted index** for substring search; **radix trie** for prefix. Neither touches the
  main symbol table.
- **Lazy `node_modules`**: a `.d.ts` is parsed only when a reference resolves into it, then
  memoized and persisted. Most of the 36,907 files under `node_modules/` are never touched.
- **Bounded caches** keyed on `(fileHash, declHash, exportHash)`, invalidated precisely (§6.1).
- **Traversal caps**: every graph endpoint takes `depth` and `maxNodes`. Unbounded traversal is
  not offered.
- **Backpressure**: query queue with priority classes (interactive > background > bulk), so a
  bulk `idx refs --all` cannot stall editor requests.

### 9.3 Large-codebase scaling path

If the repo grows 10×: (a) shard Tier 1 by directory across processes, (b) keep only hot files'
symbol graphs resident and page the rest from SQLite, (c) precompute LSIF-style artifacts in CI
and let developers download the index instead of building it, (d) cap the symbol graph to
exported symbols plus the files currently open, deferring local symbols.

---

## 10. Observability and failure modes

*(Designed target surface — as shipped, `GET /stats` returns counts/epoch/memory
only and the rest of this list's endpoints are not live yet; see §13 Phase 5.)*

- `GET /stats` exposes counts, epoch, per-stage timings (p50/p95), cache hit rates, and
  unresolved-reference count.
- The **unresolved bucket** is a first-class health metric. A rising count means the resolver
  drifted from the compiler, not that the codebase got worse. Alert at > 2% of occurrences.
- **Differential validation** (CI): sample 200 symbols per run, compare `GET /refs` against
  `tsserver`'s `textDocument/references`, require ≥ 99% agreement on resolved sets.
- **Invariant verification**: `idx verify` asserts §6.4 in CI.
- **Perf gate**: `idx build --full` must stay under 3 s; a regression fails the build.
- Degradation ladder: parse error → file poisoned, previous symbols retained; Tier 2 failure →
  Tier 1 results served with `detail` omitted; snapshot corruption → full rebuild, never a crash.

---

## 11. Implementation roadmap

| Phase | Deliverable | Exit criteria | Status (2026-09-03) |
|---|---|---|---|
| 0 | Schema + hashing + walker | file inventory matches `git ls-files`, deterministic | ✅ shipped — §13 |
| 1 | Tier 1 parser: declarations, scopes, occurrences | outlines correct for hand-checked files | ✅ shipped — §13 |
| 2 | Specifier resolution + module graph | zero unresolved relative specifiers in this repo | ✅ shipped — §13 (2 remote only) |
| 3 | Export tables, barrels, alias unwrapping | `_mapForm as mapForm` + all barrels resolve | ✅ shipped — §13 |
| 4 | Reference binding + symbol graph | differential validation ≥ 99% vs the compiler | ✅ 100% (21,319/21,319) — §13 |
| 5 | Query API + CLI | §8 endpoints live, budgets met | 🟡 subset shipped — `/healthz /stats /resolve /refs /search /deps /deps/cycles /symbols`, `idx dump\|export\|def\|refs\|serve` (§8.5, §13); the row-5 read-surface pass (2026-09-04) adds `/sym/:symId`, `/files/:path/unresolved`, `/deps/path`, `/deps/orphans` and `?gen=` validation (§8, §13); the still-open §8 tail (role-filtered refs, callers/callees/implementations, rename-plan, symbol search-by-filter, /graph) plus WS push (row 6) is the remaining surface |
| 6 | Incremental updates + watcher + WS | save → diff < 150 ms p95 | 🟡 MVP shipped (2026-09-03) — generation lifecycle: `idx watch` (JSONL diffs with per-generation poisoned-file health, state dir w/ current.json + optional previous.json), a staleness watchdog (periodic reconcile under fs.watch, `--watchdog-ms`), serve refresh over `--state` (GET /gen with the poisoned view, GET /diff?since=, POST /rebuild). §6.2 per-file parse reuse shipped (2026-09-04): watch generations carry a content-hash + fileIdx-keyed parse cache across rebuilds (`buildIndex parseCache`), so rebuild cost tracks the dirty set, not the inventory — fully warm rebuild re-parses 0/247 files (parse ~1 ms vs ~470 ms cold; no-deep build ~0.14 s vs ~0.64 s), one-file save re-parses one file; byte-identical-to-cold output pinned by fixture tests (reuse-everything, body edit, swap noise, deletion ordinal shift → full reparse). Row-6 remainder: the dirty-set impact analysis half (bind/resolve over an impact set — deliberately not built: those passes are ~0.1 s global on this tree, below the fan-out threshold) + WS push — §13 |
| 7 | SQLite snapshot + `nav.index.jsonl` | cold start < 800 ms | ⏳ designed-not-built — the JSON dump already cold-starts at ~425 ms, under the 800 ms target, so SQLite/WAL storage waits for a real need (perf gate or consumer), not speculative work (§13) |
| 9 | Tier 2 member binding | `obj.method` call sites resolve to definitions in refs/impact | ✅ shipped (2026-09-04/05) — light type-guided tier over parse-side `initTypes`/`typeScopes` (schema `resolvedVia: 'type'`) + the checker-backed deep tier (deep-tier.ts, default-on in buildIndex, opt-out in watch): 252 light + 1,049 deep member refs + **8,123 lib refs** (8,092 checker-confirmed + 31 canonical framework rows closing the `lib-not-loaded` bucket — CJS wrapper vars → @types/node, Astro → astro types) bound on this tree, differential validation **22,495/22,495, 0 disagreements**; def/hover on lib refs answers with the lib declaration; cross-file declaration merging is recognized by the checker join (a compiler symbol spanning several indexed declarations — interface+interface/namespace+namespace merging, intersection/union member access — binds ONE deterministic symbol per declaration set, never split; every such ref records its sibling declaration keys and def/hover shows ALL declaration sites across the files; fixture-pinned); every lib ref + symbol carries `detail` (short signature — `console: Console`, `log(...data: any[]): void;`) and def renders kind labels, not bare numbers; `idx refs/impact` answers lib names (`console`, `String`, `console.log`) with every usage site from the libRefs table — §13 |
| 8 | Astro template + boundary rules + CI gates | `npm run boundary` runs off the index | ✅ shipped (2026-09-03) — `idx violations` + GET /violations evaluate the repo’s own .dependency-cruiser.cjs rules over TS/TSX module edges incl. circular rules (`to.circular` over the graph’s SCCs, cycles.ts), oracle-equal to depcruise 18 — 0 violations on this tree (0 error, 0 warn) since the 2026-09-04 drift fixes + warning sweep (§13); the §5.4 `no-circular` rule sits in the config and is clean; astro template tags resolve through frontmatter imports into Renders module edges (49 on this tree), unbound tags surface as `template-component` unresolveds; `npm run boundary` runs off the index, green with zero violations since the drift fixes + warning sweep. Template SCOPE shipped (2026-09-04): `{expr}` interpolations (text + `attr={expr}`, recursing into JSX-in-expression) emit Read occurrences in an `AstroTemplate` scope that is a child of the frontmatter module scope, so `lang={lang}` in BaseLayout binds to the destructured frontmatter const — def/hover at a template position answers with the frontmatter declaration and `idx refs` on those consts lists the template sites (5 interpolation reads on this tree; `<script>` bodies stay client-side and unindexed; the compiler program receives frontmatter-stripped .astro sources, so template positions are scope-resolved and excluded from differential validation). Astro.glob expansion shipped (2026-09-04): frontmatter `Astro.glob('../pages/*.astro')` string-literal calls are recorded at parse and expanded against the indexed inventory into AstroGlob module edges (type 15, specifier the raw pattern) — zero usage on this tree, so zero new edges/unresolveds; a pattern matching no indexed file surfaces as an `astro-glob-no-match` unresolved record (§13) |

Phases 0–6 are shipped on this tree (row 6 as an MVP; implementation log: §13). The risky order
**2 → 3 → 4** is done — those phases were validated against the compiler before
the read side shipped, precisely because this repo's 540 `../` hops, 15 barrels,
and aliased re-exports are where a naive indexer silently produces wrong answers.
Remaining work: phase 7 (SQLite — likely never, see row 7), the row-6 remainder (the §6.2 dirty-set bind/resolve impact half + WS push — the per-file parse reuse half shipped 2026-09-04), and the §8 tail (role-filtered refs, callers/callees/implementations, rename-plan, symbol search-by-filter, /graph) — row 9 is fully closed and the row-5 read-surface pass shipped the §8 symbol/file/edge endpoints + `?gen=` (member binding, lib tier, merged-declaration joins, `detail` read-surface rendering, /sym/:symId, /files/:path/unresolved, /deps/path, /deps/orphans, §13).

---

## 12. Open questions

1. Should `src/` and `netlify/functions/` be one resolution universe or two? Two is recommended
   (different `lib` and runtime globals, and it makes the `no-client→server` rule enforceable by
   construction), but `shared/wa-rules.ts` is then indexed into both — acceptable, since its IDs
   stay identical.
2. Do the 49 generated `.js` files under `netlify/functions/.netlify-built/` ever need to be
   indexed? Currently excluded as gitignored build output; assumed no.
3. Is SQL-symbol indexing (9 files in `migrations/`) worth a tier 3? It would let the index verify
   table names embedded in `netlify/functions/_lib/db/**` against the real schema. Deferred, but
   the payoff is catching a class of runtime-only failures.
4. Is a binary columnar snapshot worth it over SQLite, or is < 800 ms cold start good enough?

---

## 13. Implementation log — phases 0–6 + row-8 violations (2026-09-03)

`indexer/` subproject (gitignore-aware walker, Tier 1 binder, specifier resolver,
module graph, `idx build|stats|unresolved` CLI), third vitest project
(`--project indexer`, 45 tests), `typecheck:indexer`, `idx:build`. Run:
`npm run idx:build && npm run idx`.

### Measured (replaces the §9.1 estimates)

| Metric | Design estimate | Measured |
|---|---|---|
| Full build (cold, standalone `idx build`) | < 3.0 s | **~1.0 s** (972 ms) |
| Files | ~260 | **246** (143 ts · 46 tsx · 12 astro · 12 mjs · 4 cjs · 29 js) |
| Symbols | 4–6k | **8,676** (params, type params, enum/interface members, import bindings all counted) |
| Occurrences | 30–45k | **42,681** (role-tagged, pre-resolution) |
| Unresolved imports | — | **2**, both `https://` in `src/lib/fcm.ts` |

### Deviations from the design text (all deliberate, documented here)

1. **Hash**: xxh3 → Node `crypto` sha256 truncated to 128-bit hex. Zero-dep;
   the swap point is isolated in `indexer/src/hash.ts`.
2. **Include rule**: `netlify/functions/**/*.js` **is** indexed — the 29 tracked
   CJS entry points (`auth.js`, `apply.js`, …) are first-class sources that
   `require()` into `_lib/`; excluding them would truncate the module graph.
   `public/sw.js` stays excluded (static asset, not in the include list).
3. **mjs count is 12**, not 11: `e2e/test-supabase-auth.mjs` landed after the §1
   measurement.
4. **Single-threaded** pipeline so far; the worker pool is deferred to later phases (6+); single-threaded
   still meets the 3 s budget.
5. **Type params** are declared with kind `parameter` (the schema has no
   `typeParam` kind) so type positions can bind in Phase 4.

Deferred to later phases: TypeParams scopes, CJS export
*symbols* (export records exist), Tier 2 checker work (cross-file declaration
merging, `detail`/hover strings). Astro template work is no longer deferred —
the template SCOPE (an `AstroTemplate` scope under the frontmatter module
scope binds `{expr}` reads to frontmatter consts/imports) and Astro.glob
expansion (frontmatter glob calls expand into AstroGlob module edges) both
ship with this pass (§2.4, row 8, §13).

### Phase exit criteria — status

| Phase | Criterion | Status |
|---|---|---|
| 0 | inventory matches `git ls-files`, deterministic | ✅ differential test |
| 1 | outlines correct for hand-checked files | ✅ real files: `master-data/index.ts`, `catalog/repository.ts` (alias), `Icon.tsx`, `index.astro`, `BaseLayout.astro` (`?raw` + Props), `fcm.ts` (https/dynamic), `i18n.ts`, `auth.js` (CJS), plus inline binder cases (roles, scopes, merging, hash stability) |
| 2 | zero unresolved relative specifiers | ✅ (2 remote-specifier only) |

### Phase 3 shipped — export tables, barrel chains, alias unwrap

`indexer/src/exportTables.ts`: per-file `ExportSurface` (`table` + lazy
`starSources`), built from parse-level export records + symbols, and
`createExportIndex` exposing `resolveExport(fileIdx, name)` with:

- **multi-hop re-export chains** — `contexts/<ctx>/index.ts → ./service.ts` in
  one jump; recursive with memoization per `(fileIdx, name)`;
- **alias unwrap** — `handleSubmitMasterForm as handleSimpanUpdateMaster`
  resolves through the barrel to `service.ts#handleSubmitMasterForm`;
  `mapForm` on `catalog/repository.ts` resolves to the `_mapForm` import
  binding (`refs(_mapForm)` semantics, §4.3);
- **TS shadowing** — a file's own explicit entry wins over `export *`;
  `export *` never re-exports a target's `default`;
- **ambiguity preserved** — two stars providing one name → `ambiguous` with
  both candidates; identical symKeys deduped;
- **cycle guard** — per-call seen set; cyclic barrels terminate.

**Schema addition (Phase 3):** `ExportEntry` gained a `reExport` kind
(`{ fromFileIdx, targetName, isTypeOnly }`) — the original §4.3 union omitted
named re-exports, which are the barrels' dominant form. `docs/code-index-schema.ts`
is the updated contract. `ExportRecord` gained `range` (links anonymous
`export default` expressions to their `<anonymous>` symbol).

Exit criteria: all 14 barrels' export names (80+) resolve to a symbol in the
declaring file — the test asserts **zero** null/ambiguous/dangling results and
zero landings inside the barrel itself. Verified in `exportTables.test.ts`
(14 tests, fixtures cover chains/ambiguity/cycles/type-only/anonymous-default).
CLI: `idx export <file> [name]` prints a file's surface or resolves one name.

### Phase 4 shipped — reference binding + unresolved bucket (2026-09-03)

`indexer/src/bind.ts`: binds every bindable occurrence to a symbol by walking
the importer's scope chain (module → function → block, hoisting + TDZ rules),
then chases import bindings through the export tables (`chaseImportBinding`:
import → `resolveExport` → alias unwrap → cross-file symbol, memoized), tagging
`resolvedVia: 'scope' | 'import'` and `usedBeforeDecl` where TS semantics flag
it. Value/type positions split on role; the symbol graph (`calls`/`renders`/
`reads`/`references` edges) falls out of role-tagged `BoundRef`s.

**Unresolved bucket with reasons:** `global-unknown` (genuine dangling
reference), `type-only-import-in-value-position`, `export-star-ambiguous`, and
`lib-not-loaded` (Tier 1 has no lib tables — a recognized standard-library
global; the lib tier graduates the whole bucket to lib refs: lib globals
through the checker, CJS module-wrapper vars (`exports`/`module`) and the
Astro framework global through canonical framework entries (§9.1, §13)).

**Parse upgrades** (schema + `parse.ts`): `tdz`/`isTypeOnly` modifiers,
per-binding import shapes (`default`/`named`/`namespace`), `var`/`let` split,
`ExportRecord.to` (re-export edges filled in `graph.ts`), leftmost-qualified
type references, plus binder-gap fixes found by curating the unresolved bucket
against real code: catch-clause params, `for`/`for-of`/`for-in` declarations,
destructured function params (sub-bindings now declared), prefix-unary operands
walked as reads (`!x`, `typeof x` — only `++`/`--` write), `as const` type-ref
phantoms skipped, `import.meta` not a symbol, CJS `exports.x` property writes
tagged `Property` (never scope-bound), and import-specifier sites excluded from
binding (declaration sites — this also killed a class of bogus
`type-only-import-in-value-position` on `import type { … }` lines).

**Measured (246 files, standalone `idx build` ~1.0 s):**

- 9,276 symbols · 21,314 bound references
- unresolved = 2 import-level (the `https://` dynamic imports in `fcm.ts`) +
  2,820 ref-level = **2,815 `lib-not-loaded`** (dominated by `String` ×584,
  `console` ×334, `undefined` ×232, `JSON` ×144…) + **5 genuine**
  `global-unknown` dangling references, all verified in source:
  - `findCandidates` ×3 — `_lib/candidate-helpers.ts:43`,
    `contexts/documents/service.ts:134,166`
  - `sessionToken` ×2 — `contexts/applications/service.ts:241,296` (used by
    `syncBiodataKeMail`/`syncFormMailDariUpload`, which lack the param)

  All five were later bound by the TypeScript debt pass (2026-09-04): the
  `findCandidates` sites were latent `ReferenceError`s (the function exists
  and is exported from `db/candidates.ts` — imports added), and the
  `sessionToken` sites were threaded into their callers. `global-unknown`
  is now **zero**; the bucket stays as real signal for future drift.

Exit criteria: bucket reasons are precise (no noise mislabeled `global-unknown`;
lib globals collapsed into one CLI summary line), all 13 `import type`-line
occurrences bind correctly in type position, `typeof X` type queries bind the
*value* `X` (`BUDGETS`, `candidateProfileSchema`, `counts`…), and the two
stale Phase-2 envelopes in `build.test.ts` were updated to Phase-4 reality.
`bind.test.ts` (fixtures: TDZ, hoisting, type-only, JSX renders, edge weights,
unresolved reasons) — 59 indexer tests total, 294 across all projects.
CLI: `idx build` prints stats; `idx unresolved` lists the 2 import-level
unresolveds, then groups ref-level by reason with a top-10 lib summary.

### Differential validation shipped — Tier-1 vs the compiler binder (2026-09-03)

`indexer/src/validate.ts` (run: `node dist/indexer/src/validate.js`, or with
`--sample` for the fast 25-file iteration set): builds a real `ts.createProgram`
over the full 246-file inventory with the repo's own tsconfig (`allowJs`,
`skipLibCheck`, `noEmit`; no diagnostics requested — the app's pre-existing
type errors are irrelevant to binding), then compares every bindable occurrence
against `checker.getSymbolAtLocation` at the same offset. Implementation notes:

- **`allowNonTsExtensions: true` is mandatory** — without it `createProgram`
  silently drops root files with unknown extensions, i.e. all 12 `.astro`
  files never reach the host;
- **TS normalizes host paths to forward slashes on Windows** — the astro
  override keyed on `path.join` (backslashes) silently never fired; a `norm()`
  helper keys everything consistently;
- **no public `getBindingAtLocation` in TS 5.8** — `getSymbolAtLocation` on the
  identifier is the equivalent for name comparison (reference and declaration
  sites both resolve to the local binding's name);
- **.astro source equivalence**: the program receives the byte-identical
  frontmatter-stripped source parse.ts feeds the binder, offset-mapped by the
  frontmatter length (per-file base offset) — asserted `OK` for all 12 files;
- the full run builds a per-file identifier position index (one walk per file)
  — a per-occurrence walk would be quadratic at ~24k occurrences.

**Full-inventory results (247 files, universe 22,495 — every lib ref is verified before the bindable check and leaves the universe, §13):**

- agreement **22,495/22,495 (100%)** (Tier 2 landed 2026-09-04: the universe
  now includes every bound Property ref — type-guided member binds and
  namespace-member chases are compiler-checked like all other refs);
- disagreements **0** — no bound-but-unbound, no name mismatch, no
  false-positive, no offset mismatch. **No genuine binder bugs were exposed**
  by the full run; the Phase-4 curation paid off, so no fix-tests were needed;
- deliberate deviations, classified not forced to zero:
  - lib refs 8,123 — every compiler-confirm row verified at its offset
    (confirm 8,092 / disagree 0): 5,277 unbound-Property member binds
    (`console.log` → `Console.log`, `document.createElement` →
    `Document.createElement`) + 2,815 value-bucket graduates (`String`,
    `JSON`, `process`, `undefined`…) + **31 canonical framework rows**
    closing the residual bucket (`exports` ×29 + `module` + `Astro`) — CJS
    module-wrapper vars point at @types/node's `var exports`/`var module`
    declarations, `Astro` at astro's `AstroGlobal` interface; the compiler
    binds no same-name declaration for these by construction, so the
    validator classifies them separately (framework rows) while still
    checking the identifier exists at the offset. Every row carries the
    scanned declaration position inside the lib file (def/hover target)
    plus `detail` (the declaration's first source line — `console: Console`,
    `log(...data: any[]): void;`, `var exports: …`) and the site `role`;
    the only rows without a decl position are the intrinsic
    `undefined`/`globalThis` (TS synthesizes their declarations — their
    detail is the checker's type string);
  - non-bindable roles (Property / ImportSpecifier / ObjectKey) 9,741 —
    recorded, never scope-bound by design (§4.3, member access is Tier 2);
    bound Property refs (light-tier + the deep tier's 1,049 checker joins) and
    lib member refs (5,277) are NOT skipped: the former join the universe and
    must agree with the compiler, the latter are compiler-verified before the
    skip (they do — see the agreement and lib-ref lines above);
  - lowercase JSX intrinsics (`<div>` …) 1,878.

Scope note: comparison is **name-level** — it proves the compiler binds *a*
symbol with the same name at the offset, which is blind to same-name shadowing
(binder picking a different declaration of the same name). Declaration-identity
comparison (decl file + offset) is the natural hardening next step.
`validate.test.ts` (3 tests) locks the sample-mode harness at zero
disagreements — 172 indexer tests total (13 files): the 11-test deep-tier
suite pins the lib tier + template scope — real-tree lib refs, determinism,
dump round-trip, a tsconfig'd fixture binding `String`/`JSON`/`console`/
`document.createElement`, the def/hover answer resolving to the lib
declaration file + line, a cross-file declaration-merging fixture
(interface+interface overload members across two files join ONE
deterministic symbol whose ref carries the sibling key and whose def/hover
lists both declaration files), merged-site def showing every declaration
site on the real tree, lib-name refs/impact over the libRefs table,
`detail` on lib refs + symbols, and the astro template-scope suite
(scanner units + an .astro fixture binding template interpolations to
frontmatter consts with def/refs at template positions + the real-tree
BaseLayout reads), and the validator's astro-template exclusion).

### Phase 5 shipped — read side: `idx dump` + `idx serve` + query layer (2026-09-03)

`indexer/src/dump.ts` defines **DumpDoc**, the JSON document contract `idx dump`
emits and `serve --snapshot` consumes: `files` (id/idx/path/lang/three
hashes/size/mtime), `symbols`, bound `refs`, `symbolEdges` (each edge carries an
explicit `sourceKind: 'symbol' | 'file'`), `exportSurfaces`, and **two
unresolved collections** — `unresolved` (ref-level, with reasons and ranges) and
`unresolvedImports` (specifier-level, `{fileIdx, specifier, reason}`).
`unresolvedImports` was added during the architecture pass because
`stats.unresolvedCount` (refs + imports: 2,822 on this tree) could not otherwise
reconcile with the doc's own arrays (2,820 refs + the 2 remote `https://`
imports in `src/lib/fcm.ts`). The doc is byte-deterministic across runs —
`stageMs` is deliberately excluded from its `stats`. `dump.ts` owns both
directions of the contract: `dumpDoc()` serializes, `loadSnapshot()` parses and
structurally validates a dump (missing core arrays → clear error, exit 1).

`indexer/src/query.ts` builds a **QueryIndex** once (`indexFromDoc`): maps by
file path (case-insensitive — NTFS), symbol id, **symbol key** (refs/edges carry
keys, not ids), simple name, refs-by-key, and refs/symbols per file. Queries:
`statsOf`, `resolveAt(file, line, char)` — declaration site first, then the
tightest containing bound reference, and same-named symbols elsewhere are
returned as ranked `alternatives`, never substituted — `refsOf(symId)`,
All three file-taking queries resolve their `file` needle through one
`resolveFileNeedle` (exact path → shared extension probe → numeric idx, §8), so
/resolve and /deps accept the same extensionless/suffix needles as /symbols and
`idx export`; exact stored paths behave exactly as before. `fileSymbols(file)` — a flat file outline, deliberately not a scope tree (the
dump carries no hierarchy): every declared symbol keyed by symKey/scopeId/
fileIdx in source order, plus the file's export entries and star re-export
sources — and `search`/`searchPage` (exact-name → name substring → qualified substring →
id-path match, ties broken by ref count then path; `searchPage` reports the
pre-limit `total`/`truncated`). A resolved view describes the *resolved symbol*:
`file` and `decls[].uri` are the symbol's home file even when the query pointed
at a cross-file reference site.

`DumpDoc.importEdges` carries the module graph (964 edges on this tree — 792
file-to-file, 172 to `ext:`/`asset:`/`unresolved:` module ids; `type` is the
schema EdgeType constant, one edge per import/re-export clause). It is the
first graph-stage output to reach the dump: `depsOf` answers the module-level
impact question — `GET /deps?file=&direction=out|in|both&limit=` returns
`imports` (out-edges with target path or module id, type, specifier) and
`dependents` (file-to-file in-edges, deduped per importer — revDeps
`DumpDoc.importEdges` now also carries `bindings` per edge - the local
binding names the clause introduces with each binding's source (exported)
name and import shape (`named` / `default` / `namespace`), so def-at-import
and the refs import-site chase resolve per importing edge instead of by name
across every edge of the file. The field is additive: snapshots written
before it load unchanged and the chase falls back to the name-only policy
(test-locked).
semantics). Unknown files answer `fileFound: false` with empty lists (200,
matching `/resolve`); bad direction/limit or a missing file are 400.
Snapshots written before `importEdges` still load — `/deps` and
`stats.importEdgeCount` report zero rather than failing (test-locked).

`idx serve [--port N] [--snapshot <file>]` (`indexer/src/serve.ts`) serves GET
`/healthz`, `/stats`, `/resolve?file&line&char`, `/refs?symId`,
`/search?q&limit`, `/deps?file&direction&limit`, `/symbols?file=<path|idx>`
(file outline — declared symbols + export-surface entries) as JSON on `127.0.0.1` (default port 8787, `0` = ephemeral).
Error contract: 400 malformed params, 404 unknown symId or route, 405 non-GET,
CORS headers + OPTIONS 204, `cache-control: no-store`; server-side failures
(bad snapshot path, corrupt JSON, wrong doc shape, port in use, invalid port)
print to stderr and **exit 1**. The build is lazy — with `--snapshot` the
pipeline never runs, so the server starts from the document alone. Positions
match the pipeline's one coordinate space (§8 note): line 1-based, char a
0-based UTF-16 code-unit offset — never bytes or code points.

**Measured on this tree, 2026-09-03** (snapshot numbers drift as the repo grows):

- snapshot cold start — node boot + dump parse + QueryIndex build + listening:
  **~425 ms** (unchanged — `serve --snapshot` never runs the pipeline);
  live-build `serve` to listening: **~7 s** with the default deep tier
  (light ~0.6 s + deep ~5.9 s — the pass now scans bound Property rows too
  for merged-declaration discovery; `idx watch` generations stay light-only);
- 247 files · 9,263 symbols · 22,500 bound refs (21,451 light + 1,049 deep;
  the +5 over the previous pass are the BaseLayout template interpolation
  reads — `lang`/`description`/`sprite`/`showFooter`/`showBottomNav` — bound
  in the file's AstroTemplate scope) · 10,919 symbol edges · 1,005 import
  edges (incl. 49 astro Renders); 2 unresolved total (both import-level — the
  `https://` dynamic imports in `fcm.ts`; the ref-level bucket is exactly
  zero); dump ~10.6 MB compact
  (8,123 lib refs across 54 lib files, each row carrying the scanned decl
  position inside the lib file + `detail` + `role`; all 9,263 symbols carry
  `detail`), byte-identical across runs, zero dangling joins (lib refs carry
  a libIdx into libs[]);
- `idx dump` joins: ref `symKey` / edge `target` → `symbols[].key`; `fileIdx` →
  `files[].idx`; export entries carry `symKey` (or `localName`/`targetName` per
  the schema union).

**CI state (2026-09-03):** the indexer stages of `ci:quality` are green —
`typecheck:indexer` and the full vitest run (frontend + backend + indexer
projects, 79 indexer tests incl. the query/HTTP suites) pass. The overall
`ci:quality` gate is red for pre-existing reasons unrelated to this work: the
app typecheck ratchet baseline (recorded 2026-09-01) predates later committed
app edits (`src/store/i18n.ts` 0→2 errors, registry `service.ts` 28→34), and
the `boundary` script passes `--exit-code`, which dependency-cruiser 18.2.0 —
the version `package.json` declares — removed. **Superseded:** row 8 swapped
`npm run boundary` to the index (`idx violations`, §13) and the 2026-09-04
drift-fix pass cleared its error class — the boundary gate is now green; only
the app typecheck ratchet drift kept the overall gate red. **Superseded 2026-09-04:** the ratchet drift is resolved (§13 entry "app typecheck ratchet closed") — `ci:quality` exits 0 end to end.

Next: **cross-file declaration merging** and `detail` strings — the
`lib.dom`/`lib.es` tables are shipped (lib tier, §13): the `lib-not-loaded`
bucket graduates to lib refs — checker-confirmed for lib globals, canonical
framework entries (@types/node CJS wrapper vars, astro's `AstroGlobal`) for
the wrapper-vars + framework-global rows — and `idx def`/hover on those refs
answers with the lib declaration file + line (`resolvedVia: 'lib'`).

### Phase 6 shipped (MVP, 2026-09-03) — generation lifecycle

`indexer/src/watch.ts` owns generations. Pure layer: `docCounts`, `fileDrift`
(add/change/remove by content hash), `diffDocs` (counts + deltas), `isNoopDiff`
(same files + same counts → no new generation), `pushHistory` (bounded). Generation policy: `generationLine` builds the wire
shape; `commitGenerationLine` is the single writer (epoch = prev+1, a no-op
returns null and commits nothing). State
dir layer: `current.json` written atomically (tmp + rename) with the commit's
epoch; `--keep-previous` rotates the pre-swap doc to `previous.json`. Driver
layer: `startWatch` builds the initial generation (diffed against the state dir,
so edits made while the watcher was down surface as one real diff), then watches
with a 120 ms debounce.

**Watcher primitive and the real staleness backstop (why):** recursive `fs.watch`
on win32/darwin — reliable for create/modify/delete on NTFS. Every rebuild
re-hashes content, so a spurious event costs only an empty generation (never
committed); but rehashing alone only runs *after an event arrives*, so a missed
event would go stale forever. The actual backstop is the pair: rehash-on-event
plus a periodic reconcile sweep that runs while fs.watch is active (default
5000 ms, `--watchdog-ms`), re-discovers the tree through the gitignore matcher,
re-hashes every file, and commits any drift no fs event reported under the
`watchdog` trigger — no-op sweeps stay silent. Polling is the fallback when
recursive watch errors or is unavailable (network share, Linux) — per §6.3,
trigger `poll` — and `--poll <ms>` forces it; the poll tick is the same
reconcile, so `node_modules` churn never triggers builds.

**MVP scope, deliberately:** every generation is a full rebuild (init measured
~570 ms / 246 files / 9,276 symbols / 21,314 refs / 8.5 MB current.json on this
tree). §6.2's dirty-set impact analysis, the hash/declHash/exportHash split for
per-file parse reuse, worker pools, and WS push are recorded as the row-6 open
remainder; the epoch/diff/commit lifecycle this phase ships is the scaffold the
incremental engine will slot into. No-op generations are never committed, so a
save that changes nothing observable costs one wasted rebuild, not a generation.

**Generation policy — one owner:** `commitGenerationLine(prev, next, trigger,
ms)` in watch.ts is the single writer path for `idx watch` rebuilds and live
serve’s POST /rebuild — a real diff commits at epoch = prev.epoch + 1, stamps
next.epoch, and returns the line; a no-op returns null and nothing commits. The
line shape (`generationLine`) is one shared builder, so the watch JSONL, /diff
history, and serve-side refresh events cannot drift apart. Observers that load
persisted docs (`serve --state`) derive their epoch from the doc on disk (a poll
can skip intermediate commits) and reuse the same `generationLine` shape.

**CLI + serve surface:** `idx watch [--root] [--state] [--poll <ms>]
[--watchdog-ms <ms>] [--keep-previous]` prints one JSONL `GenerationDiff` per
committed generation (gen, trigger ∈ init | watch | poll | watchdog | manual,
ms, totals, added/changed/removed, count deltas, and `poisoned` — files the
generation failed to parse, path + error — key order stable). `idx serve` gains
`--state <dir>` (poll `current.json` every `--refresh-ms`; swap on epoch advance),
`--root`, `GET /gen` (current epoch + the same per-generation health
view — `poisonedCount`/`poisoned` — so a generation committed with a broken file
is distinguishable from a healthy one; §10’s fuller degradation ladder is
designed, not built), `GET /diff?since=<gen>` (bounded in-memory history; 400
when `since` is invalid, in the future, or older than retained),
and `POST /rebuild` on live-build serve (202, async full rebuild + swap; 409 on
snapshot/state serve). In-flight requests drain on the generation they started
with; the next request sees the swap (§4.4). Verified live end to end: watch
create/modify/delete → state gen bump → serve /gen + /diff refresh → resolved
responses carry the new gen; a rapid-edit burst settles on strictly monotonic
generations whose last committed doc indexes the final content; idle watchdog
sweeps emit nothing.

**Recorded follow-ups (not built in the MVP):** /diff history is bounded
in-memory only — a serve restart keeps nothing older than the generation it
loaded, so a durable diff log over the state dir is the natural extension; and
serve-holder construction (snapshotHolder / stateHolder / liveHolder) still
lives in cli.ts, which has outgrown dispatcher size — extracting the holders to
serve.ts (or a holder.ts) is a recorded refactor pass, not done here.

### Row 8 (violations half) shipped — architecture rules over the module graph (2026-09-03)

`indexer/src/boundary.ts` treats the repo root's `.dependency-cruiser.cjs` as the
SINGLE source of truth: `loadForbidRules(rootDir)` imports it and normalizes each
`forbid` rule (name, severity, from/to path + pathNot, optional dependencyTypes)
into the neutral `ForbidRule` form, memoized per root; rules the module edge set
cannot express are reported as `skipped` with the reason, never half-ported (on
this tree: all 6 rules port, 0 skipped — the §5.4 `no-circular` included). `query.ts::violationsOf(index, rules)`
is the pure evaluator over the dump's file-to-file `importEdges` (module ids —
ext:/asset:/unresolved: — can never match path rules): each rule side is any-match
regexes with pathNot exclusion, dependencyTypes are honored when they name kinds
the index expresses (import / type-only / dynamic-import / reexport), and one
violation is reported per (rule, from file, to file) — depcruise aggregates a
from→to pair into one hit, so duplicate edges (two import() sites of the same
target) never double-count. Each violation is `{ruleName, severity, from, to,
type, reason}` (reason = the rule comment).

`idx violations [--json]` prints the violations (text: one line per violation +
a summary line; JSON: config, rulesEvaluated, skippedRules, gen, totals, clean,
violations). The gate is severity-aware since the drift-fix pass (2026-09-04):
exit 1 only when an error-severity violation exists — warnings print but never
fail CI — and `clean` mirrors the gate (true iff errors === 0) in both the CLI
JSON and GET /violations. `GET /violations` answers the same over the served
doc's rootDir (404 when that root has no config file), under the shared error
contract; the serve handler is async now, one `.catch` at the server boundary.
Legacy snapshots without importEdges answer zero.

**Oracle comparison (2026-09-03, this tree):** the repo's own depcruise binary
(18.2.0, run WITHOUT the removed `--exit-code` flag: `depcruise netlify/functions
--config .dependency-cruiser.cjs --output-type json`) reports **10 violations
(2 error, 8 warn)** over the shared TS/TSX universe: `kernel-no-context-or-surface`
×2 (`kernel/characterisation.test.ts` → `contexts/{applications,identity}/service.ts`),
`contexts-no-raw-db` ×7 (every contexts `service.ts` → `_lib/db/client.ts`), and
`surfaces-no-old-actions` ×1 (`surfaces/auth.ts` → `_lib/actions-auth.ts`).
`idx violations --json` returns exactly that set — rule/from/to identical,
severities identical, zero asymmetric differences (locked in boundary.test.ts).
**Superseded by the row-8 completion below:** circularity and astro-markup edges
were recorded here as not expressible; both now ship (cycles.ts + the template
tag scan), and `npm run boundary` has been swapped to the index (the depcruise
`--exit-code` flag that 18.x removed never gated; the index gate is real).
Still open and recorded: depcruise dependencyTypes beyond the four import kinds,
`via`/`viaNot`, `reachable`, config files outside the indexed universe, and —
within astro — the markup edge kinds Renders/AstroGlob (index-only edges the
depcruise oracle never sees; the template SCOPE and Astro.glob expansion both
ship with the 2026-09-04 pass, see below).
**Superseded by the drift-fix pass (2026-09-04, §13):** the 11 violations are
gone — the master-data cycle was broken and characterisation.test.ts left
`_lib/kernel` — so the remaining 8 were warnings. **Superseded by the warning
sweep (2026-09-04, §13):** all 7 contexts services now route `_lib/db/client`
helpers through their own repository and `surfaces/auth.ts` delegates
`registerFcmToken` to contexts/identity instead of the legacy
`_lib/actions-auth` dispatcher — `idx violations` and the real depcruise oracle
both report **0/0** and `npm run boundary` exits 0.

### Row 8 completed — circularity + CI gate + astro-markup module edges (2026-09-03)

`indexer/src/cycles.ts` is the single owner of cycle answers: iterative
Kosaraju over the dump’s file-to-file `importEdges` (no recursion), per-edge
`isCircular` flags, and deterministic real cycle paths. Semantics mirror
dependency-cruiser@18 exactly (read from its source, then oracle-verified): an
edge is circular iff its target reaches its source (non-trivial SCC, or a
self-import); violations of one circular rule whose cycles share a member set
collapse into ONE violation (the real master-data cycle matches two
contexts-scoped edges — `index.ts → service.ts` and `service.ts → cv.ts` — and
depcruise reports one; the index matches). `violationsOf` gains the semantics
(additive `ForbidRulePath.to.circular`, evaluated only when a loaded rule has
it; the SCC result is memoized on the QueryIndex), and `BoundaryViolation`
gains the `cycle: string[]` path, rendered as `from → … → from` in the CLI text
like depcruise’s err format and carried in `--json` and GET /violations.

`.dependency-cruiser.cjs` gains the §5.4-designed rule as its 6th entry (still
0 skipped):
`no-circular` — `from: { path: '^netlify/functions/contexts/' }`, `to: {
circular: true }`, severity error. On this tree the rule is now clean: the one
incumbent cycle it caught (the master-data SCC, see the drift-fix log below) was
broken on 2026-09-04, so the rule protects contexts rather than reporting an
incumbent. **CI gate swap:** `npm run boundary` is now `idx:build` + `node
…/cli.js violations` (real gate; the depcruise `--exit-code` flag 18.x removed
never fired) and exits 1 only on error-severity violations, so warnings never
fail CI. `npm run depcruise` remains the oracle script.

### Row-8 drift fixes — npm run boundary green (2026-09-04)

The two error-severity drifts the row-8 oracle recorded were fixed in the tree
(the §5.4 no-circular rule now has zero incumbent violations):

- **Master-data cycle broken by layering, not deletion.** The cycle was
  `contexts/master-data/service.ts` importing `APPLY_WA_COLS` from
  `_lib/ai/cv.ts` while cv imports `buildMasterNested` from the context — a
  data constant living in an AI module. `APPLY_WA_COLS` (a static
  `['no_wa','wa','whatsapp']` list) moved to `_lib/db/client.ts` — the module
  that already owns `pick` and the other row-normalization helpers and that
  every context service already imports (the §5.1 warning that remains) — and
  service.ts imports it from there. cv.ts keeps its own `findMasterByWa`; the
  master-data SCC is gone and `cv.ts` has no remaining importers under
  `netlify/functions/`. Two SCCs remain on this tree (`_lib/db/client.ts`
  ↔ `_lib/kernel/http.ts`, and `src/lib/{apiClient,fcm}` ↔
  `src/store/authReactive.ts`), pinned by member set in query.test.ts.
- **Kernel test relocated, rule semantics unchanged.** The two
  `kernel-no-context-or-surface` errors came from
  `_lib/kernel/characterisation.test.ts` importing contexts — the file is a
  characterisation suite, not a kernel module. It moved to
  `_lib/characterisation.test.ts` (git mv; relative imports rewired; backend
  vitest discovery unchanged — the rule never covered `_lib/**`, so moving
  within `_lib` is what takes it out of the rule's from-scope).
- **Severity-aware gate.** `idx violations` now exits 1 only when an
  error-severity violation exists; warnings print but never fail CI, and
  `clean` in the CLI JSON and GET /violations mirrors the gate (errors === 0).
  This is what makes a gate meaningful once the error class is fixed. (The
  remaining 8 warnings were swept to zero the same day — warning-sweep entry
  below — so the severity distinction now guards future drift.)
- **Oracle (this tree):** depcruise 18.2.0 and `idx violations` both report
  **8 violations (0 error, 8 warn)** — identical sets, locked in
  boundary.test.ts (11→8 pins updated; the kernel hits and the no-circular
  cycle are asserted absent). `npm run boundary` exits 0. **Superseded by the
  warning sweep below:** boundary.test.ts pins moved 8→0.
- One behavioral ripple worth recording: the legacy fallback regression test on
  the real tree (bindings stripped) previously resolved service.ts's
  `findMasterByWa` to the local binding because the drifted cv import edge
  made the name-only chase ambiguous; with that edge gone the name-only fallback
  uniquely chases to `repository.ts#findMasterByWa`, and the test now asserts
  that resolution plus the conservative rename boundary (catalog/repository's
  `_mapForm` stays unlisted in legacy mode).

### Warning sweep — npm run boundary reports 0/0 (2026-09-04)

The 8 warnings the drift-fix pass left visible were routed away with NO rule,
logic, or config changes — every one was the sanctioned pattern (a context
service touching `_lib/db/client` while its own repository exists, or a
surface reaching into a legacy `_lib/actions-*` dispatcher):

- **7× `contexts-no-raw-db`** — each context's service now imports the client
  helpers it needs from its own `./repository`, which imports + re-exports
  them from `_lib/db/client` (the established master-data pattern; re-exports
  added only where a needed helper was not already exposed: documents
  `hasBackend/supabaseUrl`, notifications `normalizeWa`, master-data
  `supabaseUpsert/APPLY_WA_COLS`, catalog `supabaseUrl`, scheduling
  `supabaseJson`; registry and identity already exported what their services
  needed). Static imports merged into the service's existing `./repository`
  import (documents, notifications, master-data — master-data keeps both
  `normalizeWa` and `normalizeWa as nw` bindings); dynamic handler imports
  (catalog ×2, identity ×2, registry, scheduling) point at `./repository`,
  which every service already loads statically, so runtime behavior is
  identical. Services keep importing other `_lib/db/*` modules (jobs,
  candidates, master, forms …) directly — the rule forbids only `client`.
- **1× `surfaces-no-old-actions`** — `surfaces/auth.ts` was the sole
  consumer of `_lib/actions-auth.ts` (a dynamic `registerFcmToken`
  delegation). The function moved into `contexts/identity/service.ts`
  (same logic and deps — normalizeWa, session, supabaseJson via the
  repository — plus a typed `catch (e: unknown)`), is exported through
  `contexts/identity/index.ts`, and auth.ts now calls
  `identity.registerFcmToken`; the definition and export entry were removed
  from `_lib/actions-auth.ts`. **Dispatcher retirement (same day):** the
  module and its 12-test suite are now deleted — the refresh-session + guard
  tests relocated onto `contexts/identity/service.test.ts` and the
  `isValidWaFormat` tests onto `shared/wa-rules.test.ts` (where that function
  always lived), asserting identity's live contract (`success:false` on
  rejection, `kind:'session'` on re-issued tokens) instead of the legacy
  `sessionInvalid` shape; backend coverage preserved at 188/188 across 19
  files, and the module's 21 typecheck errors left the count (464 → 443).
  `actions-job-status.ts` was retired the same day too (dispatcher-retirement
  entry below). `auth.js` → surface registry →
  `identity` is the same call path with one less hop.
- **Oracle (this tree):** depcruise 18.2.0 and `idx violations` both report
  **0 violations (0 error, 0 warn)** — 177 modules, 439 dependencies (the 8
  removed edges show up in the count); boundary.test.ts oracle + HTTP pins
  moved 8→0. `npm run boundary` exits 0 with nothing to print; the
  severity-aware gate semantics (§8.5) stay as shipped, now guarding future
  drift rather than reporting incumbent warnings. **Superseded (module
  counts):** the two dispatcher retirements below left 175 modules / 427
  dependencies on the measured tree.
### getJobStatus poll action wired (2026-09-04)

The background-job polling the ai/ingest/notify surfaces promised ("Gunakan
getJobStatus" after their 202 + jobId responses) is now routable:
`getJobStatus` is a record on both `AI_ACTIONS` (surfaces/ai.ts) and
`NOTIFY_ACTIONS` (surfaces/notify.ts), delegating to the kernel read
`handleGetJobStatus` in _lib/kernel/job-queue.ts; `surfaces/index.ts` maps
the single action key to the AI registry; and the ai-chat.js + notify.js
entry allow-lists accept it — a client polling either entry dispatches to
the same kernel handler, whichever flow enqueued the job. ingest.js was not
touched: it is a NOT_IMPLEMENTED stub that never enqueues. Live smoke
through the real ai-chat.js chain (allow-list extracted verbatim -> wrapper -> dispatcher -> registry -> kernel) confirms
VALIDATION_FAILED on an empty payload reaches handleGetJobStatus and unknown actions still 404. **Superseded
the same day (status-mapping pass below):** the wrapper no longer blanket-200s AppError rejections. Two as-shipped
notes: the app typecheck count dropped 443 → 428 because `AI_ACTIONS` was
retyped from `Record<string, Function>` to the precise handler signature,
clearing the pre-existing TS2322 class over the whole AI section of the map
(45 other map entries keep their pre-existing errors); and the polling
regression test lives in action-registry.test.ts (`getJobStatus` dispatchable,
empty payload rejected with VALIDATION_FAILED before any DB call). Still no
client polls from src/ — the backend surface is ready; wiring the frontend
poll loop is the remaining product step.
### app typecheck ratchet closed — ci:quality green end to end (2026-09-04)

The campaign-long red finally closed. The ratchet's sole blocking item was
`src/store/i18n.ts` (0 → 2 TS1117s, previously clean): commit 1e69b0f
(2026-09-03, the 80+ admin-modal translation block, post-baseline) re-added
keys that already existed earlier in the `id` dictionary — `ui.berkas_progress`
("Progress Berkas" @425 vs "Progres Pemberkasan" @484) and `ui.toast_save_failed`
(@469 vs @540, identical values). Fixed by removing the superseded EARLIER
occurrences, keeping the later ones — which are what the object-literal runtime
delivers today — so the shipped UI copy is byte-for-byte unchanged (CRLF
preserved). `npm run typecheck:ratchet` now exits 0: 487 → 426 (−61), no clean
file carries new debt.

The only remaining per-file growth, registry `service.ts` 28 → 34, is reported
but non-blocking by ratchet design (the file already carries debt and the total
fell): it is committed drift from the parallel post-baseline modal-rebuild
commits (0c039d6, d34bb06, …), NOT the campaign — its one working-tree change
to that file (the boundary import swap `_lib/db/client` → `./repository`) was
proven type-neutral by counting errors with either import (34 = 34). The 34
errors are the file's legacy unknown/`{}` payload-typing debt, same class as its
28-error baseline; retiring them is a debt pass, not a correctness fix, and was
left alone. The `.ci/tsc-baseline.json` baseline stays at 487 — re-baselining to
lock in the reduction is a CI-owner decision, not required for green.

**Verified:** `npm run ci:quality` exits 0 end to end — ratchet PASSED
(−61), `typecheck:indexer` clean, `boundary` clean (oracle agrees), vitest
391/391 across all projects, `idx:gate` 4/4 protected symbols. Supersedes the
stale "ci:quality stays red from pre-existing ratchet drift" notes in the §13
CI-state paragraph and the idx:gate entry below.

### Ratchet re-baselined at zero — typecheck debt is now enforced (2026-09-04)

`.ci/tsc-baseline.json` re-recorded via the ratchet's own
`--update-baseline` from the old 487-error snapshot to the current
zero-error state (`total: 0`, empty `byFile`/`byCode`). Enforcement
effect, proven live: with the zero baseline both failure conditions of
`scripts/ci/typecheck-ratchet.mjs` trigger on any single new error —
`Error count increased: 0 -> 1` AND `Type errors appeared in previously
clean file(s)` — so the ratchet now blocks new debt instead of tolerating
it up to the old ceiling (a one-line injected error failed the gate with
exit 1; removing it restored exit 0). The full `ci:quality` chain stays
green; re-baselining remains a one-command operation if debt is ever
deliberately accepted again.

### TypeScript debt eliminated — tsc --noEmit at zero (2026-09-04)

The debt pass reached **0 errors** tree-wide (started 426; this final sweep
took 61 → 0). Shared-root-cause fixes first: widening `supabaseJson`'s opts
param back to the existing `JsonOpts` shape cleared ~128 errors across 15+
files; then per-file annotations and cast-erased `as` at legacy extraction
points. One new file: `netlify/functions/_lib/archiver.d.ts` (ambient
declaration for the untyped `archiver` package, mirroring the
`src/lib/fcm-modules.d.ts` precedent).

Behavior-preserving discipline held throughout: annotations/casts erase at
compile; the few value-shaping edits (`?? ''`, `?? undefined`, `|| ''`)
sit only at legacy extraction points whose follow-up truthiness checks make
null/''/undefined observably identical; `patchMaster(String(existing.id))`
builds the same PostgREST query string; dead import bindings removed
(`JOB_MAP_COLS` local won; unused `pick as dbPick`).

Two latent `ReferenceError`s fixed as type work: `findCandidates` was
called without an import in `candidate-helpers.ts` and
`documents/service.ts` (fallback paths would throw) — imports added. This
closes the §13 Phase-4 record: all five `global-unknown` dangling refs are
bound, the bucket is at **zero**, and the indexer pins were updated to match
(inventory 247 files / 144 ts via the new .d.ts; `agreeUnresolved` 5 → 0;
discover's `gitLsFiles` now unions tracked + untracked-non-ignored so
new-but-uncommitted source files stay in sync with discovery).

**Verified:** `tsc --noEmit` 0 errors; backend suite 194/194; indexer
150/150; `npm run ci:quality` exits 0 — ratchet reports "debt reduced by
487" (every baseline-dirty file is now clean; re-baselining
`.ci/tsc-baseline.json` remains a CI-owner call, not required for green);
`boundary` clean with the depcruise oracle agreeing; `idx:gate` 4/4; dist
rebuilt; `cli.e2e` and `watch.e2e` green against fresh dist.

### Surface wrapper maps AppError rejections to their HTTP status (2026-09-04)

The wrapper previously serialized every AppError rejection as HTTP 200 with a structured body
(`success:false` + `code`): its status logic keyed on `message`, which `AppError.toJSON()` never
emits. `kernel/errors.ts` already owned the code→status table but kept `codeToStatus` private;
it is now exported and the surface wrapper maps through it: a new pure helper
`outcomeStatusCode(out)` in netlify-wrapper-surface.ts owns the precedence — rateLimited (429)
> code (`codeToStatus`) > message-only legacy failure (400) > 200 — with single-owner policy
(one table in kernel/errors, one precedence function in the wrapper). Net effect: VALIDATION_FAILED
is now HTTP 400, NOT_FOUND 404, RATE_LIMITED 429, 401/403/409/5xx per code; rate-limited and
message-only paths behave exactly as before. The generic netlify-wrapper.ts (legacy always-200
entries: bridge-links, apply, save-master, …) is untouched — a different envelope contract.
Coverage: netlify-wrapper-surface.test.ts pins the precedence matrix unit-wise (including unknown
code → 500 and rateLimited-wins) plus an integration regression through the real ai-chat entry
chain asserting the empty-payload VALIDATION_FAILED now arrives as HTTP 400 (was 200). Client note
for when the poll loop lands: src/lib/apiClient throws a generic error on `!res.ok` without reading
the body, so a future client must parse the error body (or pre-validate jobId) to surface the
domain message; error messaging for non-200 responses is app-side work, not backend.

### Tier 2 member binding shipped (2026-09-04)

Row 9 landed: `obj.method` call sites bind to the member's declaration symbol
(`resolvedVia: 'type'`) instead of staying unindexed. Parse side (never
serialized) classifies variable/field initializers (`initTypes`: new/call/
mcall/id/cast shapes) and maps class/interface/enum/namespace scopes to their
symbol (`typeScopes`), plus `base: 'this'` on member occurrences. The binder
owns the policy in one place: base resolution (this / value symbol / import
chase), type resolution (annotation, initType shapes, factory return types,
firstTypeIdent skips primitives + lib globals), and member lookup with
heritage chain and static policy (class-as-value → static; enum/namespace →
any; instance → non-static preferred, static fallback). Depth-bounded, never
guesses: unresolvable types stay unindexed. Real-tree effect: 252 member refs
bound (L1Cache.store ×17, Job.id, Kandidat.wa, GeminiExtractedData fields,
resilience/kernel/cache internals, modal components) — the `refs`/`impact`
answers for those families are now complete. Differential validation extended:
bound Property refs join the universe, full run **21,442/21,442 (100%),
0 disagreements** (validate.test.ts still green on the sample). New
`tier2.test.ts` (3 tests): synthetic fixture covering new/call/id/annotation/
this/enum/namespace/heritage/static + zero-dangling-join and flagship real-tree
assertions. Dump/query/serve contracts unchanged (additive `resolvedVia`
value only). Follow-up same day: constructor parameter properties
(`constructor(private repo: Repo)`) declare a class member alongside the
parameter, and Property occurrences record the full head chain
(`Occurrence.baseChain`, parse-side only) so `this.repo.get()` and
`svc.helper.run()` hop member-by-member through types — the member chase was
refactored into `memberSymIn` (own + heritage members) and `memberOf`
(per-hop policy re-derivation: class-value → static, enum/namespace → any,
instance → non-static); chains never fire the namespace chase (it resolves the
last name against the module surface, wrong for `NS.a.b`). Real-tree effect:
248 → 252 type refs (the tree's chains are mostly lib-typed — `this.store`→
Map, `event.wa`→string — and correctly stay unindexed); the synthetic
fixture pins param props + 2-hop chains. Full run 21,446/21,446, 0
disagreements. Open remainder (design's deep tier): checker-backed lib
binding, declaration merging, hover strings.

### idx:gate wired into ci:quality (2026-09-04)

The drift gate is now a first-class CI stage: `npm run idx:gate` builds once,
loads per-symbol thresholds from `indexer/impact-gate.json`, and evaluates
`impactReport` (moved into query.ts — the single owner of the affected-file-set
policy, shared with `idx impact`) for each entry; ci:quality ends with
`&& npm run idx:gate`. Threshold policy is documented in the config header:
gate = current measured impact + margin (narrow <5 files: +1..2; wider: ~+25%),
exceed means drift or intentional growth — raise the gate in the config WITH a
note. Ambiguous entries fail loudly (the gate never guesses). Initial protected
symbols (measured this tree): handleSubmitMasterForm 3/4, signToken 5/7,
cacheClear 10/12, requireRole 13/16. cli.e2e scenario 13 pins pass/fail/
ambiguous against the synthetic fixture (the scenario spawns impact-gate.mjs directly — the e2e's runCli wrapper prepends the idx CLI, which would swallow the script as an unknown subcommand and exit 0, masking gate failures). **Superseded 2026-09-04:** the pre-existing app typecheck ratchet drift is resolved (§13 entry "app typecheck ratchet closed") — `ci:quality` exits 0 end to end; this gate was never its cause.

### First consumer: idx impact — the rename/impact gate (2026-09-04)

`idx impact <name>` is the first shipped consumer of the query layer in a real
workflow: a thin command over the refs name resolution (same ambiguity/
import-only policy — no new query logic) that prints the definition site, every
reference + import site, the sorted affected-file set, and a per-role
breakdown, with `--gate N` exiting 2 when the file set exceeds N (CI rename
gate). npm entry: `npm run idx:impact -- <name>` (dist must be built via
idx:build). Measured on this tree: `handleSubmitMasterForm` = 3 files (2
member-call sites in surfaces/master.ts + 2 re-export sites in
master-data/index.ts; grep finds 6 text hits incl. a comment false positive
`// Alias: simpanUpdateMaster maps to handleSubmitMasterForm` that the index
correctly filters); `signToken` = 5 files; `cacheClear` = 10; `requireRole` =
13 (gate demo: `--gate 10` exits 2). Ambiguous names (normalizeWa and
findMasterByWa both have 4 definitions on this tree) exit 1 with ranked
candidates — a rename on a same-named symbol must qualify first, never guess.
Cli.e2e scenario 12 pins the synthetic answer (role breakdown {call:1,
member:1}, 3-file set, gate exit codes, ambiguous/unknown exit 1).

### Read-surface fixes: 1-based editor lines + namespace-member chase (2026-09-04)

Two audit-repro fixes on the shipped read surface (both verified live against the
real tree):

- **One coordinate space, editor lines.** Every line was 0-based end to end (a
  `def`/`refs` answer pointed one line above the code in an editor, and a def
  needle typed from an editor line resolved the line below it). Line numbering
  is now 1-based at the single source (util.ts `lineColAt`), so dump ranges,
  CLI input/output, and serve params/responses all share editor line numbers;
  `char` stays a 0-based column (unchanged, as documented). Tests pinning raw
  line values moved +1; snapshots dumped before this change hold 0-based lines
  and must be regenerated — a coordinate-space migration, not a shape change.
- **Namespace-member accesses are indexed.** Member calls on namespace imports
  (`masterData.handleSubmitMasterForm` in surfaces/master.ts — the pattern every
  surface registry uses) previously produced no reference row: `refs` missed the
  site and `def` at it fell back to the containing object. Parse now records the
  head identifier on Property-role occurrences (`Occurrence.base`, parse-side
  only — dump shape unchanged), and bind chases `base.member` through the
  namespace import’s export surface (the same resolveExport hop the named-import
  chase uses; ambiguous/type-only targets are not claimed; non-namespace member
  accesses stay unindexed, Tier 2). **Superseded 2026-09-04:** Tier 2 shipped
  (row 9) — non-namespace member accesses now bind through types where the
  shape is resolvable; see the "Tier 2 member binding shipped" log entry. `refs` lists those sites (role 5,
  resolvedVia import) and `def` at them jumps to the definition. Real-tree
  effect: 21,118 → 21,189 ref rows; unresolved counts unchanged (2818).
  Regressions: cli.e2e scenario 11 (synthetic `import * as a; a.greet()`
  consumer: refs lists the member site, def --json equals resolveAt) and a
  query.test real-tree repro (surfaces/master.ts member rows at line 8, def
  chases handleSubmitMasterForm).

### Dispatcher retirement complete — no _lib/actions-* source remains (2026-09-04)

Both legacy `_lib/actions-*` dispatcher sources are gone; nothing under
`_lib/actions-*` is imported by live code anymore (the remaining
`actions-mail/master/wa.test.ts` suites target their context homes):

- `_lib/actions-auth.ts` deleted with its 12-test suite after the coverage
  was relocated (entry above): refresh-session + guard tests onto
  `contexts/identity/service.test.ts`, `isValidWaFormat` tests onto
  `shared/wa-rules.test.ts`; backend coverage preserved at 188/188.
- `_lib/actions-job-status.ts` folded into its proper owner:
  `handleGetJobStatus` now lives in `_lib/kernel/job-queue.ts` (the module
  that owns `getJob`/`Job` — the read belongs with the queue it polls),
  and `_lib/handlers.ts` imports it from there. One honest finding: the
  import was the function's ONLY tree reference — `getJobStatus` is not
  routed in any surface registry (`surfaces/index.ts` has no entry), so a
  client polling it today would get NOT_IMPLEMENTED despite the 202-returning
  ai/ingest/notify surfaces telling clients to "use getJobStatus". **Superseded
  the same day:** the poll action is now wired (entry above) — getJobStatus is a
  record on AI_ACTIONS + NOTIFY_ACTIONS mapped in surfaces/index.ts and allowed
  in the ai-chat.js + notify.js entries; the handler sat where the wiring
  imports from, as intended.
- **Measured (this tree):** inventory pins moved 246 → 245 files
  (143 → 142 TS: the two `.ts` modules deleted); the build reports
  245 files · 9,186 symbols · 21,052 bound refs; depcruise cruises 175
  modules / 427 dependencies; boundary stays 0/0 and the oracle agrees.
Astro-markup module edges: `parse.ts::scanAstroTemplateTags` extracts
capitalized component tags from the template portion (deduped; Astro builtins
`slot/Fragment/Markdown/…` excluded; quoted-region skipping is a documented
lightweight-scan limitation), and the graph stage resolves each tag through the
frontmatter import bindings — a bound tag emits a Renders module edge
(`EdgeType 13`, specifier `<Tag>`) riding `importEdges` additively (dump header
notes loaders must not assume types 3..6); an unbound tag is an unresolved
record with the new `template-component` reason (an Astro compile error — a
health signal, not noise). On this tree: **49 Renders edges**, zero unbound
tags; depcruise has NO astro support at all, so these edges are index-only by
construction. The template SCOPE remainder shipped 2026-09-04: a lightweight
synchronous expression scan (conservative by design — raw `<script>`/`<style>`
bodies, HTML comments, quoted attribute values and backtick literals are
opaque; member names, object keys, arrow params and the JS keywords are never
emitted as reads) finds every identifier in `{expr}` text interpolations and
`attr={expr}` attribute values — recursing into JSX inside an expression
(`{cond && <Card note={greeting} />}`) — and parse emits each as a Read
occurrence in a per-file `AstroTemplate` scope (schema `ScopeKind.AstroTemplate`,
child of the frontmatter module scope). The binder's normal scope chain then
resolves `lang` in `lang={lang}` to the destructured frontmatter const exactly
like a module-level reference: def/hover at a template position answers with the
frontmatter declaration and `idx refs` on those consts lists the template usage
sites. The compiler program only receives frontmatter-stripped .astro sources,
so template positions carry no compiler identifier — validation classifies them
(`astro template interpolations` deviation bucket) instead of checking them;
the full run stays 22,495/22,495, 0 disagreements. On this tree: 5 interpolation
reads (BaseLayout), every one scope-bound. Astro.glob expansion ships with the
same pass: walkCall records frontmatter `Astro.glob('…')` string-literal calls
as AstroGlobCall rows (non-literal arguments, other receivers, and non-astro
files are never recorded), and graph.ts expands each pattern against the
indexed inventory — astroGlob.ts compiles the fast-glob subset
`*`/`**`/`?`/`[...]`/`{a,b}` into an anchored matcher resolved from the
importing file's directory (leading-`/` patterns from the repo root,
case-insensitive like the resolver), where a wildcard never escapes that
directory: candidates outside it start with `../` and only match a literal
`..`-prefix in the pattern itself. Every matched file emits one AstroGlob
module edge (type 15, the raw pattern as specifier, no bindings — a glob
imports whole modules, never names, so the binding chase cannot claim a
symbol through one). A pattern that matches no indexed file surfaces as an
`astro-glob-no-match` unresolved record — a dead or out-of-universe dependency
is a real health signal, never a silent no-op. On this tree: zero `Astro.glob`
usage → zero expansion edges, zero new unresolveds; real-tree counts and the
differential run (22,495/22,495, 0 disagreements) are unchanged. Fixture
coverage: astroGlob.test.ts (matcher + full parse→graph fixture) and the
parse/build suites (+4 tests).

**Row-9 read-surface rendering (2026-09-04) — `detail`/kind on every
def/hover answer.** `/resolve` already rendered the full ResolvedSymbol
(`detail`, `kind`, merged decl sites across the files, §13 deep tier); the
remaining read surfaces now render the same hover metadata, so an editor
hovering an outline row, a refs answer, or a search hit sees the signature
`/resolve` shows for the position it covers: `fileSymbols` outline entries
(`GET /symbols`) carry the projection's `detail` and `typeRef` again
(previously dropped by the entry projection — schema `detail` is "rendered
signature for hover"), refs answers (`GET /refs`, `idx refs`/`impact`, and
lib-target refs via refsOfLib) name the target's `kind` + `detail`, and
search hits carry `detail`. Additive optional fields throughout — legacy
snapshots without detail load unchanged, fixture-pinned in query.test.ts
(a synthetic row with and without detail over outline/refs/search) and
real-tree assertions on the FINDBYWA symbol; real-tree counts unchanged.

Test count: query.test.ts 50 → 52 (+2 fixture tests in the new
"row-9 read surfaces" describe).

**Row-5 read-surface pass — the §8 symbol/file/edge endpoints (2026-09-04).**
The designed-but-not-live §8 read surface ships as query views + HTTP
routes: `GET /sym/:symId` answers the symbol card — decls[], LSP-shaped
hover markdown (the `detail` signature fenced as TS, qualified-name fallback
on legacy rows without detail), container, export flags, refs count and
centrality; 404 on unknown ids (`symId`s embed repo paths, so the whole
remainder after `/sym/` is the id). `GET /files/:path/unresolved` answers
one file's unresolveds — occurrence-level rows with reason + position and
module-level imports with specifier + reason (fileFound:false with empty
lists on unknown files, 200, matching /symbols). `GET /deps/path?from&to`
runs BFS over the dump's file-to-file importEdges and answers the real
shortest path (found/unreachable/unknown-file states distinct); `GET
/deps/orphans` lists every indexed file with no in-edge. Every versioned
read now takes `?gen=`, validated against the current epoch: a non-current
gen answers 400 with the retention contract spelled out (bounded history
keeps diffs, not snapshots — full historical reads await the /diff
durability follow-up). Views: symbolCardOf / fileUnresolvedOf / depsPathOf /
depsOrphansOf in query.ts; serve.ts routes them URL-param style per §8.
Test count: query.test.ts 52 → 58 (+6: real-tree card/file/path/orphans,
synthetic unresolved + BFS, HTTP contract incl. ?gen errors). Real-tree
counts unchanged.

The SCC machinery surfaced as a read endpoint the same day:
`GET /deps/cycles[?file=]` (serve.ts) lists the non-trivial module cycles via
the shared cycles.ts memo (query.ts::`cyclesOf` — components sorted by first
member path, members ascending, each `cycle` a real closed loop through the
member), and the violations dedupe-key policy moved into one named helper
(`violationKey`: member-set key for `circular:true`, per-pair otherwise — the
semantics of the circular:false bug fix). Live on this tree: 3 SCCs (master-data
×3, db/client↔kernel/http, src apiClient/fcm/authReactive ×3); oracle and
violation counts unchanged (11).

**Row 6 §6.2 — per-file parse reuse shipped (2026-09-04).**
The parse-reuse half of the §6.2 incremental engine lands on the watch
path. `buildIndex` gains an optional `parseCache` (a `path → ParsedFile +
content hash` map owned by the caller): a file whose (content hash, fileIdx)
match the cache's entry skips Stage 2 entirely. Sound because parse is a pure
function of (fileIdx, path, lang, content) — symbol/scope keys pack the
fileIdx (`(fileIdx << 20) | ordinal`), so identical input reproduces identical
output — and because no downstream stage mutates parse records (bind, graph,
export tables read them; verified by inspection and by the equality tests),
so the zero-copy shared arrays stay pristine across generations. Stale entries
are replaced on (hash, fileIdx) mismatch and pruned when a file leaves the
inventory; a deletion that shifts later ordinals refuses reuse for those files
(their packed keys would be wrong) and falls back to a clean reparse.
`idx watch` carries one cache across every generation (init fills it;
subsequent rebuilds reuse), and `stats.parseReusedFiles` (additive-optional
in the schema's IndexStats) reports the per-generation reuse count. Measured
on this tree (deep tier off, the watch profile): parse 470 ms → **1.3 ms** on
a fully warm rebuild and the no-deep build ~0.64 s → **~0.14 s**; a one-file
save re-parses exactly that file. Output equality is fixture-pinned
(build.test.ts §6.2 describe): warm == cold byte-for-byte across repeated
reuse, a single-file body edit re-parses 1 of 3 files and still equals a cold
build, an identical-bytes rewrite (editor swap noise) reuses all 3, and a
file deletion (ordinal shift) falls back to a full reparse with identical
output. Deliberate non-goal, recorded on the roadmap: the dirty-set impact
analysis half (bind/resolve over an impact set) — those passes are global
~0.1 s on this tree, below the fan-out threshold the design's 150 ms target
was written against — and WS push remain the row-6 open items.

### Corrective pass - line-granular def + one candidate policy (2026-09-03)

- `resolveLine` (query.ts): `idx def <file>:<line>` answers what the line
  holds - the tightest indexed declaration or reference on it, found through
  range anchors the index already records (doc-only, so it works over
  `serve --snapshot` dumps of other machines' trees). The matching column is
  echoed in `query.character`. `file:<line>:<char>` keeps the exact-position
  semantics of GET /resolve unchanged. A line with no indexed symbol exits 1
  with a hint.
- `symbolsDefining` + `rankCandidates` (query.ts): the ImportBinding-shadow
  exclusion and the refCount-then-file ranking now live in exactly one place;
  resolveAt's alternatives and `idx refs` both consume them (behavior-
  preserving for def's alternatives, byte-for-byte).
- `idx refs` import-only names (e.g. vitest's `describe`): instead of a wall
  of identical zero-ref import-binding rows, the answer groups the import
  sites per file (`importedOnly` in JSON) and exits 1 - no definition exists
  in the indexed tree, so there are no refs to list.
- No serve/dump contract change; the query API endpoints and the document
  schema are untouched by this pass.

### FINISH hardening - import linkage (2026-09-03)

- def-at-import: `idx def` on an import specifier (precise or line mode)
  chases the binding to its definition when unambiguous - built purely over
  the dump's importEdges + exportSurfaces + ImportBinding rows
  (`importTargetsOf`, query.ts), with re-export and star-barrel hops chased to
  the defining symbol. At that point the dump dropped per-edge imported
  names, so renames / defaults / namespaces and multi-target imports were NOT
  chased and kept the local-binding answer with same-name alternatives
  (superseded by the per-edge-bindings pass below).
  import shapes, and renames are dropped) and therefore NOT chased: renamed /
  default / namespace imports and multi-target imports keep the local-binding
  answer with same-name alternatives.
- refs include import sites: `refsOf`'s view (GET /refs, `idx refs`) gains an
  `imports` field - importing files with their specifier decl positions - so
  a definition's rename/impact answer is complete; the import-only grouped
  view stays for names never declared in the tree. Additive on the view; the
  dump contract is unchanged.
- One scan, one policy: resolveAt (precise) and resolveLine (line-granular)
  now share a single tightest-range core (`pickTightest`, query.ts) with one
  declaration-beats-reference tie-break; `isImportBindingSymbol` is the one
  shadow predicate, consumed by symbolsDefining and idx refs alike.
- cli.ts renderers collapsed: the def three-way text branch is now one
  `printDefOutcome` helper; `printRefsText` renders usage references and
  import sites from the one RefView.
- resolveLine stays CLI-only: GET /resolve answers exact positions; HTTP line
  granularity is a designed follow-up, not built. Files that only
  `export { x } from …` a definition are re-export sites, not import sites,
  and are not listed (ReExports edges are skipped by the chase).


### Deep tier SHIPPED: checker-backed member tier wired into buildIndex (2026-09-05)

Row 9's "checker-backed program" remainder is now a real tier: `buildIndex`
defaults `{ deep: true }` and after the light chase runs `deepMemberBind`
(deep-tier.ts): for every light-unbound Property occurrence it asks a
`ts.createProgram` over the inventory what the receiver binds to, and emits a
ref **only** when the compiler's declaration maps 1:1 onto an indexed symbol
(exact decl-offset join) and the member name matches — never a guess. Emitted
refs carry `resolvedVia: 'type'` + the additive `deep: true` flag (legacy
snapshots load unchanged; dump round-trip pinned in deep-tier.test.ts).

Real effect on this tree: **1,049 deep refs** (total refs 22,500 = 21,451
light + 1,049 deep, the +5 light being BaseLayout's template-interpolation
reads) — the interface-field read families the light tier could
not reach when the receiver's static type arrives through untraced paths:
`SessionPayload.role` ×26, `FormRawRow.id` ×26, `AuthState.sessionToken` ×19,
`AI_ACTIONS` ×16, `Job.code` ×13, `Kandidat.wa` ×11, `ImportMeta.env` ×10
(src/env.d.ts declares it in-tree). Differential universe extended: full run
**22,495/22,495 (100%), 0 disagreements** — every deep ref joins the universe
and agrees with the compiler (decl identity: match 20,827, merged-declaration
43, alias-vs-chase 1,623, shadowing-disagreement 2 — both pre-existing
Tier-1 reads).

**Lib tier (same pass, §4.3 open remainder — shipped 2026-09-05):** the same
program answers dissolve the `lib-not-loaded` bucket into **lib refs** —
dump rows without a symKey (lib declarations are not repo symbols) carrying
the lib file (`libs[]`: `typescript/lib/lib.es5.d.ts` ×4,020,
`lib.dom.d.ts` ×2,084, `@vitest/expect` ×480, `@types/node` ×446 incl.
the 30 CJS wrapper rows, astro ×8, … 54 files total) and the qualified
name (`Console.log`, `JSON`, `process.env`;
module paths are root-stripped so libNames are portable). Two classes
graduate: (a) light-unbound Property occurrences the compiler binds outside
the repo (`console.log` → `Console.log`, `document.createElement` →
`Document.createElement`) and (b) unresolved `lib-not-loaded` value refs the
compiler binds to a lib/package declaration of the same name — `String`,
`JSON`, `console`, `process`, `undefined`… (undefined/globalThis are
intrinsic globals with no accessible declaration, so they use the tier's
small canonical-lib table). Never a guess: every emitted row is
compiler-verified by validate (lib refs 8,123 — confirm 8,092 / disagree 0 /
framework 31), and the residual bucket is now **exactly zero**: the CJS
module-wrapper vars (`exports` ×29, `module`) graduate through canonical
entries pointing at @types/node's `var exports` / `var module` declarations
and the Astro frontmatter global points at astro's `AstroGlobal` interface
(the compiler binds no same-name declaration for these by construction —
shape-checked: the wrapper write `exports.handler = …` / `module.exports = …`,
and the global only inside .astro frontmatter). Every row records the
declaration position inside the lib file (scanned at build time, never
hardcoded — the def/hover target); the query layer answers positions on lib
refs with `resolvedVia: 'lib'` and decls pointing into the lib .d.ts. The
dump contract is additive (legacy snapshots without libs/libRefs load
unchanged).

**Cross-file declaration merging (same shipping):** when the compiler's
symbol for a light-unbound Property occurrence maps to ≥2 indexed
declarations — true interface+interface / namespace+namespace merging
across files, or intersection/union-typed member access (`SessionPayload &
{ exp: number }`, a row-type union) — the checker join recognizes the
merged declaration as ONE symbol per declaration set: every site whose
compiler target maps to the same key set joins the same deterministic
primary (the container-qualified member — `SessionPayload.exp` over an
anonymous intersection member `exp` — ties to the earliest file). The
primary is always a declaration the compiler actually binds at the site, so
validation stays exact (identity: match 20,827, merged-declaration 43,
shadowing-disagreement 2 — unchanged); a same-name single-declaration bind
is never folded through another site's merge. Every ref at a genuinely
merged site carries its **sibling declaration keys** (additive `merged` on
the ref/dump row, resolved against the site's own declaration set), and
def/hover on such a site shows EVERY declaration site across the files —
43 refs on this tree, e.g. a `evt.type` union-discriminant read in
`kernel/events.ts` answers with all 8 event interfaces' `type` members at
once, `result.exp` (SessionPayload & `{ exp: number }`) with the interface
member AND the anonymous intersection member in the two files. On this
tree the union sites already bound their first constituent, so the delta
is determinism + unification-by-construction + the merged-site decl view; a
fixture (two global-script `interface
MergeMe` declarations with a cross-file overloaded member `m`) pins the
mechanism: one deep ref, one deterministic symbol carrying the sibling
key, name matches, and def/hover lists both declaration files. The tier's
`detail` pass also ships here: every symbol and every lib ref carries a
short signature (the declaration's first source line — def/hover renders
`kind: Variable (12)`, never a bare number), and `idx refs <name>` /
`idx impact <name>` answer lib names (`console` — 334 sites, `String` —
572 sites in 67 files with a call/read role breakdown, `console.log` — the
`Console.log` rows) straight from the libRefs table when no repo symbol
defines the name.

Cost & gating: program creation + pass ≈ **5.9 s** (stageMs.deep — the
merged-declaration discovery scans bound Property rows too) vs ≈ 0.6 s
for the whole light build, so one-shot build/serve run it by default while
`idx watch` opts out (`{ deep: false }`) to keep generation latency; the
tier degrades to zero refs (never throws) when no program can be built — a
tsconfig-less root yields exactly the light surface (pinned). Architecture:
the program machinery moved out of validate.ts into `program.ts` (one owner,
no build → deep-tier → validate cycle); `deepTierReport` now sizes what
remains beyond the shipped tiers (in-tree-unmappable 1,006 and
compiler-none 2,139 on the full run — the latter unreachable even for the
checker).

### ~~Deep-tier prototype~~ superseded by the shipped tier (2026-09-04)

> The entry below was written while the tier was a measurement prototype.
> The joinable bucket it measured (80 on the sample) is now emitted by
> buildIndex itself and the lib-or-package bucket by the lib tier; the
> report's remaining buckets size the compiler-none / unmappable gaps.


`deep-tier.ts` (prototype, NOT wired into the pipeline or dump) answers the
row-9 open remainder on the deterministic 25-file sample: for every Property
occurrence the light Tier-2 chase leaves unbound, it asks the compiler
(`ts.createProgram`) what the receiver binds to and categorizes it:
**1,275 unbound member accesses → 80 in-tree-joinable (6%)** — checker decl maps
1:1 to an indexed symbol, so a deep tier could emit these refs
(`resolvedVia: 'type'`, checker-backed) today; **680 lib-or-package (53%)**
needs lib tables (the design's open remainder); **450 compiler-none (35%)** —
any-typed receivers, framework globals, error code, where even the checker
binds nothing; **65 in-tree-unmappable (5%)** — shorthand props and decl nodes
no indexed symbol carries. Top would-be targets: `FormRawRow.*` fields (~40),
`SessionPayload.role` ×9, `ImportMeta.env` ×5, `AuthState.*` ×12. Self-checks
(exit 1 on violation): every joinable target must carry the compiler's decl
offset and match the member name — 0 violations on the sample. Run:
`node indexer/dist/indexer/src/deep-tier.js`. Also: `validate.ts`'s module-level
`main()` is now guarded so importing it (as deep-tier does) no longer runs the
full validation.

### FINISH hardening - per-edge bindings + strict import sites (2026-09-03)

The audit found two defects in the name-only import chase, both closed on the
real tree:

- Per-edge bindings ride the dump: `DumpImportEdge.bindings` serializes each
  import clause's `{local, imported?, shape}` (graph.ts's ModuleEdge now
  carries them from the parse record). The chase asks only the edges that
  actually introduce the binding - master-data/service.ts's
  `findMasterByWa` now chases to its `./repository` definition even though
  the file also imports `APPLY_WA_COLS` from `_lib/ai/cv.ts`, a module that
  happens to export a same-named `findMasterByWa`. Renames resolve through
  the preserved source name (`import { greet as hi }` chases `greet`, so a
  local name that collides with an unrelated export of the module can never
  mis-answer). Default and namespace bindings stay unchased (recorded above);
  legacy snapshots without the field fall back to the name-only policy.
- One strict site policy: `chaseUniqueTarget` is the exactly-one chase shared
  by def-at-import (followImportBinding) and importSitesOf - a file is an
  import site of a definition only when its import chases to exactly that
  definition. The audit's cv.ts over-report (service.ts claimed as a site of
  cv's `findMasterByWa` when it only imports `APPLY_WA_COLS` from cv) is
  gone; def and GET /refs agree at the same specifier.
- Chase memoization: `QueryIndex.chaseMemo` caches importTargetsOf by
  file+name, so refsOf's by-name candidate loop no longer re-walks every
  edge and star barrel per call (the doc is immutable; results are pure).
- Verified: 127/127 unit tests (7 new - poisoned-multi repro, rename chase,
  collision guard, default/namespace local, legacy fallback, real-tree
  regressions), both e2e suites, and live probes (below).
- Measured on this tree: 1,212 import-binding rows → 770 chase a single
  definition, 2 are ambiguous, and 440 derive nothing (external /
  unresolved module-id targets, default / namespace bindings, or local names
  no binding introduces). Of the 8 renamed imports that chase uniquely, all 8
  now list their importer as an import site (converse fix below).

- Converse keyed like the chase (corrective pass): importSitesOf now
  iterates the binding-bearing import edges and chases each binding's local
  through the same chaseUniqueTarget, so a `{ greet as hi }` importer is a
  site of `greet` - with its specifier decl position - whether the binding
  is used or unused. The audit's finding that renamed importers were
  silently omitted (7 of 8 uniquely-chased renames missing on this tree:
  catalog/repository.ts's `_mapForm -> mapForm`, configuration/service.ts's
  `getRincianPresetsRepo`, registry/service.ts's `getCandidatesPageRepo`,
  cv.ts's `dbFetchMasterByWa`, ...) is closed. Plain same-name sites, the
  never-site default/namespace rule, and the strict exactly-one policy are
  unchanged; refsOf / GET /refs / idx refs keep the same additive view
  shape. Legacy snapshots without per-edge bindings keep the name-only
  local-name inversion for same-name rows - a legacy renamed importer stays
  unlisted, because its local name is not the exported name (documented
  fallback, suite-pinned). Verified: 131/131 unit tests (+4: renamed-site
  used/unused, default/namespace never-sites, legacy same-name site,
  real-tree repro), typecheck, both e2e suites, live probes.

## 14. Module map (as built) — read this before the next pass

Pipeline phases own their state in one direction — later stages never mutate
earlier stages' records (the graph stage returns resolved-import records; it
does not write `.to` onto parse records):

    discover.ts   inventory + gitignore matcher          → FileNode[]
    parse.ts      tokens → symbols/scopes/occurrences    → SymbolNode, ScopeNode,
                                                           RawImportRecord, Occurrence
    resolve.ts    specifier → file/asset/unresolved      → Resolution (+ PROBE_EXTS,
                                                           the one owner of ext probing)
    graph.ts      module graph; owns resolution output   → ModuleGraph + resolvedImports/
                                                           resolvedReexports (its own maps);
                                                           astro template tags → Renders
                                                           edges / template-component unresolveds
    exportTables.ts  per-file export surfaces + lazy     → ExportSurfaces + resolveExport
                    multi-hop barrel/alias resolution
    bind.ts       occurrence → refs/edges/unresolved     → refs, symbolEdges, unresolved
    program.ts    ts.createProgram over the inventory    → program/checker/astroOffset
                  (astro frontmatter-stripped sources;   (the ONE owner; validate.ts and
                   shared by validate + deep tier)        deep-tier.ts consume it)
    deep-tier.ts  checker-backed member tier (deep)      → refs with deep: true, resolvedVia
                  (light-unbound Property occurrences     type — exact decl-offset join +
                   resolved via the compiler; default     name match, never a guess; also
                   ON in buildIndex, off in watch)        the deepTierReport measurement
    build.ts      orchestrates stages → BuildResult      (single owner of the pipeline;
                                                           memoized per CLI process)

Read side (Phase 5, shipped):

    dump.ts      DumpDoc contract — serialize (dumpDoc)
                 AND load/validate (loadSnapshot)        ← both directions live here
    cycles.ts    SCC + circular flags + real cycle paths over
                 module edges (row 8; iterative Kosaraju; the
                 ONE owner of cycle answers — violationsOf's
                 to.circular AND cyclesOf (GET /deps/cycles)
                 consume the same memo)
    query.ts     QueryIndex (maps built once by
                 indexFromDoc: byId/byKey/name/file/
                 refs) + statsOf/resolveAt/refsOf/fileSymbols/search/depsOf/
                 violationsOf (boundary rules over importEdges;
                 circular rules via cycles.ts; pure)
                 over one resolveFileNeedle file lookup (exact → probe → idx)
    boundary.ts  loads + normalizes .dependency-cruiser.cjs →
                 ForbidRule[] (the config is the single source of
                 truth; unportable rules reported skipped, never
                 half-ported)
    serve.ts     node:http server only: URL → params → query
                 functions → JSON; reads a mutable IndexHolder so an
                 in-flight gen swap applies from the next request
                 (GET /gen, GET /diff?since=, GET /violations,
                 POST /rebuild here)
    cli.ts       dispatch + text/JSON renderers + holder wiring
                 (snapshotHolder / stateHolder / liveHolder) + the
                 `idx violations` renderer (text/JSON + exit code)
    watch.ts     Phase 6: diffDocs/fileDrift/docCounts (pure),
                 generationLine + commitGenerationLine (the ONE
                 writer policy: epoch = prev+1, no-op → null, shared
                 line shape), atomic state commits (current.json +
                 previous.json), startWatch driver (fs.watch + watchdog
                 reconcile sweep → poll fallback); the gen counter
                 lives with the writer (watch / liveHolder) — serve
                 --state only observes epochs from the persisted doc

Ownership rules that hold today:

- Parse records carry no resolution state; graph owns `to`/target records.
- A symbol is declared in exactly one scope's `symbolKeys` (block-scoped names
  at their block, var/function at the enclosing function/module scope) — no
  hoistedKeys duplicate list.
- The dump document is deterministic (no stageMs) and self-consistent
  (`stats.*Count` reconcile with its arrays; `unresolvedCount` = refs +
  unresolvedImports, both collections in the doc).
- `export <file> [name]` CLI output is computed once into a ResolutionView and
  rendered as text or JSON (JSON omits text-only `targetName`; key order is
  part of the wire contract). Snapshot I/O lives in dump.ts, not cli.ts.
- ResolvedSymbol describes the resolved symbol: `file`/`decls[].uri` are the
  symbol's home file, never the file the query pointed at.

Status: Phases 0–6 + rows 8–9 shipped on this tree (row 9 includes the checker-backed deep tier and the lib tables: 1,049 deep refs + 8,123 lib refs closing the residual bucket, merged-declaration joins, and the read-surface rendering pass — `detail`/`typeRef`/`kind` answer on /resolve, /symbols outline, /refs and /search; row 8 includes the astro template scope — template interpolations bind to frontmatter consts — and Astro.glob expansion — frontmatter glob calls expand into AstroGlob module edges; row 5's read-surface pass ships the §8 symbol/file/edge endpoints — /sym/:symId with hover markdown, /files/:path/unresolved, /deps/path, /deps/orphans — plus `?gen=` validation; row 7 designed-not-built; row 6's §6.2 per-file parse reuse half ships (2026-09-04) — watch generations skip Stage 2 for unchanged files through a content-hash parse cache, warm rebuild parse ~1 ms vs ~470 ms cold, byte-identical output pinned by fixture tests — leaving the dirty-set bind/resolve impact half + WS push as its remainder), CLI §8.5, measured numbers and CI state §13. Open items beyond the shipped surface: the §8 tail (role-filtered refs, callers/callees/implementations, rename-plan, symbol search, /graph), the row-6 remainder (§6.2's dirty-set bind/resolve impact half + WS push), and §13’s recorded follow-ups (/diff durability, serve-holder extraction).
