/**
 * bind.ts — Phase 4: reference binding (§4.3) + symbol graph (§5.1).
 *
 * Binding an occurrence walks outward, in this exact order:
 *
 *   1. the occurrence's scope, then each ancestor up to module scope — the
 *      first same-named declaration whose kind fits the position wins.
 *      Value positions never bind pure-type symbols (interfaces, type aliases,
 *      type-only imports); type positions bind only type-capable kinds.
 *      A reference before a TDZ declaration (let/const/class) binds to it with
 *      `usedBeforeDecl`, never leaking to an outer symbol (§4.1).
 *   2. an ImportBinding is chased: its import record says which name of which
 *      module it introduced; the module's export table (Phase 3) unwraps
 *      aliases and barrel hops, and the reference lands on the final in-repo
 *      symbol with `resolvedVia: 'import'`. A landed import binding (a file
 *      re-exporting one of its own imports, e.g. `_mapForm as mapForm`) is the
 *      terminal — `refs(_mapForm)` semantics (§4.3). The namespace binding
 *      itself stops locally; namespace MEMBER accesses (`ns.name`, e.g.
 *      `masterData.someFn`) chase the member through the target export surface
 *      (a Property-role reference row, resolvedVia import). Imports resolving
 *      into packages stop at the local binding.
 *   3. otherwise → unresolved bucket with a reason.
 *
 * Property / ObjectKey / lowercase-JSX occurrences name members or intrinsic
 * elements — they resolve through types (Tier 2), never "unresolved".
 *
 * Symbol-level edges are aggregated by (source, target, type): `callee` →
 * `calls`, `jsxName` → `renders`, `typeRef` → `references`, read/write →
 * `reads`/`writes`. Source = the smallest enclosing symbol (the containing
 * function/component/method), or the FileIdx for module-level code.
 */

import {
  type EdgeType,
  EdgeType as EdgeTypeV,
  type FileIdx,
  type Occurrence,
  type Range,
  OccurrenceRole,
  type ScopeNode,
  SymbolKind,
  type SymKey,
  type SymbolNode,
  type UnresolvedReference,
} from '../../docs/code-index-schema.js';
import type { ExportIndex } from './exportTables.js';
import { exportSymKey } from './exportTables.js';
import type { InitType } from './parse.js';
import type { ResolvedImportRecord, ResolvedReexportRecord } from './graph.js';

export interface BoundRef {
  fileIdx: FileIdx;
  range: Range;
  symKey: SymKey;
  role: number;
  resolvedVia: 'scope' | 'import' | 'global' | 'lib' | 'type';
  usedBeforeDecl?: boolean;
  /** Checker-backed (deep tier) — resolved via ts.createProgram, §13. */
  deep?: boolean;
  /** Merged-declaration join (deep tier): the compiler binds one symbol
   * whose declarations span several indexed symbols at this site
   * (interface+interface / namespace+namespace merging across files,
   * intersection/union-typed member access). The target is the site's
   * deterministic primary; `merged` carries the sibling symbol keys whose
   * declarations merge with the target here — def/hover shows every
   * declaration site. Absent on non-merged refs. */
  merged?: SymKey[];
}

export interface SymbolEdge {
  source: SymKey | FileIdx;
  target: SymKey;
  type: EdgeType;
  weight: number;
}

export interface BindResult {
  refs: BoundRef[];
  edges: SymbolEdge[];
  unresolved: UnresolvedReference[];
}

interface BindInput {
  symbols: SymbolNode[];
  scopes: ScopeNode[];
  occurrences: Occurrence[];
  exportIndex: ExportIndex;
  /** Phase 2 (graph output): per-file imports with their resolved target — the import chase source. */
  resolvedImports: Map<FileIdx, ResolvedImportRecord[]>;
  /** Phase 2 (graph output): per-file `export … from` records resolved to their target file. */
  resolvedReexports: Map<FileIdx, ResolvedReexportRecord[]>;
  /** Tier 2 (parse-side): initializer shapes per variable/field symbol key. */
  initTypes: Map<SymKey, InitType[]>;
  /** Tier 2 (parse-side): class/interface/enum/namespace scope key → owning symbol key, per file. */
  typeScopes: Map<FileIdx, Map<number, SymKey>>;
}

/**
 * Known standard-library globals (ES built-ins, DOM, Node, TS utility types).
 * Tier 1 has no lib symbol tables, so these are classified `lib-not-loaded` —
 * distinct from genuine unknowns, which stay `global-unknown` as a real signal.
 * The lib tier (deep-tier.ts) graduates the whole bucket through the checker
 * into lib refs (CJS module vars + the Astro global via canonical framework
 * entries) — deep builds carry zero lib-not-loaded rows.
 */
const LIB_GLOBALS = new Set<string>([
  // ES value + built-in constructors
  'undefined', 'NaN', 'Infinity', 'globalThis', 'eval', 'isFinite', 'isNaN', 'parseFloat', 'parseInt',
  'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'String', 'Number', 'Boolean',
  'Object', 'Array', 'Date', 'RegExp', 'Function', 'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet',
  'Symbol', 'BigInt', 'Math', 'JSON', 'Reflect', 'Proxy', 'Error', 'EvalError', 'RangeError',
  'ReferenceError', 'SyntaxError', 'TypeError', 'URIError', 'AggregateError', 'ArrayBuffer',
  'SharedArrayBuffer', 'Atomics', 'DataView', 'Intl', 'WeakRef', 'FinalizationRegistry',
  'Uint8Array', 'Uint8ClampedArray', 'Uint16Array', 'Uint32Array', 'Int8Array', 'Int16Array',
  'Int32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array', 'Iterable',
  'AsyncIterable', 'Iterator', 'AsyncIterator', 'Generator', 'AsyncGenerator', 'ArrayLike',
  'ReadonlyArray', 'Partial', 'Required', 'Readonly', 'Pick', 'Record', 'Exclude', 'Extract',
  'Omit', 'NonNullable', 'Parameters', 'ReturnType', 'ConstructorParameters', 'InstanceType',
  'ThisType', 'ThisParameterType', 'OmitThisParameter', 'Awaited', 'Uppercase', 'Lowercase',
  'Capitalize', 'Uncapitalize', 'TemplateStringsArray',
  // DOM
  'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
  'fetch', 'Request', 'Response', 'Headers', 'FormData', 'Blob', 'File', 'FileReader', 'URL',
  'URLSearchParams', 'TextEncoder', 'TextDecoder', 'AbortController', 'AbortSignal', 'performance',
  'console', 'alert', 'confirm', 'prompt', 'setTimeout', 'setInterval', 'clearTimeout',
  'clearInterval', 'queueMicrotask', 'structuredClone', 'requestAnimationFrame', 'cancelAnimationFrame',
  'CustomEvent', 'Event', 'EventTarget', 'Node', 'Element', 'HTMLElement', 'HTMLInputElement',
  'DOMException', 'atob', 'btoa', 'Notification', 'HashChangeEvent', 'HeadersInit',
  // Astro framework (src/**/*.astro)
  'Astro',
  'HTMLButtonElement', 'HTMLDivElement', 'HTMLFormElement', 'HTMLSelectElement', 'HTMLTextAreaElement',
  'HTMLAnchorElement', 'HTMLImageElement', 'HTMLSpanElement', 'HTMLUListElement', 'HTMLLIElement',
  'HTMLParagraphElement', 'HTMLTableElement', 'HTMLTableCellElement', 'HTMLCanvasElement',
  'HTMLMediaElement', 'HTMLVideoElement', 'HTMLAudioElement', 'HTMLIFrameElement', 'HTMLLabelElement',
  'HTMLOptionElement', 'HTMLOptGroupElement', 'HTMLTemplateElement', 'HTMLDialogElement', 'SVGElement',
  'MutationObserver', 'IntersectionObserver', 'ResizeObserver', 'CSSStyleDeclaration', 'DOMRect',
  'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'TouchEvent', 'FocusEvent', 'WheelEvent',
  'ClipboardEvent', 'InputEvent', 'DragEvent', 'CompositionEvent', 'MediaQueryList', 'Image',
  'DOMParser', 'XMLHttpRequest', 'Storage', 'NodeList', 'HTMLCollection', 'Document', 'crypto',
  'matchMedia', 'getComputedStyle', 'getSelection', 'scrollTo', 'postMessage', 'queueMicrotask',
  // `declare namespace` DOM global (lib.dom.d.ts:37528) — same shape as Intl/Atomics/Reflect
  // above, and the home of CSS.escape. Omitted until 2026-09-17, which made every CSS.* call
  // read as a genuine `global-unknown` (caught by build.test.ts §prodGenuine on the first
  // caller, e2e/test-headings.mjs).
  'CSS',
  // Node / CommonJS
  'process', 'Buffer', 'require', 'module', 'exports', '__dirname', '__filename', 'global',
  'setImmediate', 'clearImmediate', 'NodeJS', 'BufferEncoding',
]);

/** Type keywords firstTypeIdent must skip (they are not user type names). */
const PRIMITIVE_TYPES = new Set([
  'string', 'number', 'boolean', 'void', 'unknown', 'any', 'never', 'object', 'null', 'undefined',
  'symbol', 'bigint', 'true', 'false', 'this', 'typeof', 'keyof', 'readonly', 'infer', 'is', 'asserts',
]);

/** Roles that name real symbols. Member/intrinsic names skip binding. *//** Roles that name real symbols. Member/intrinsic names skip binding. */
const BINDABLE_ROLES = new Set<number>([
  OccurrenceRole.Read,
  OccurrenceRole.Write,
  OccurrenceRole.Callee,
  OccurrenceRole.TypeRef,
  OccurrenceRole.JsxName,
  OccurrenceRole.Decorator,
  OccurrenceRole.ExportSpecifier,
]);
// ImportSpecifier occurrences are declaration sites (the import binding symbol
// carries the name); binding them would mint self-ref edges and misfire on
// `import type` bindings, so they are recorded but never bound.

const VALUE_KINDS = new Set<number>([
  SymbolKind.Function,
  SymbolKind.Method,
  SymbolKind.Constructor,
  SymbolKind.Property,
  SymbolKind.Variable,
  SymbolKind.Constant,
  SymbolKind.Parameter, // runtime params (type params double here, type positions only)
  SymbolKind.ImportBinding,
  SymbolKind.Namespace,
  SymbolKind.Enum,
  SymbolKind.EnumMember,
  SymbolKind.Class,
  SymbolKind.Component,
  SymbolKind.Hook,
]);

const TYPE_KINDS = new Set<number>([
  SymbolKind.Interface,
  SymbolKind.TypeAlias,
  SymbolKind.Enum,
  SymbolKind.Class,
  SymbolKind.ImportBinding,
  SymbolKind.Parameter, // type parameters
  SymbolKind.Namespace,
]);

/** Edge kind per role (§3.3). */
const ROLE_EDGE: Partial<Record<number, EdgeType>> = {
  [OccurrenceRole.Callee]: EdgeTypeV.Calls,
  [OccurrenceRole.JsxName]: EdgeTypeV.Renders,
  [OccurrenceRole.TypeRef]: EdgeTypeV.References,
  [OccurrenceRole.Read]: EdgeTypeV.Reads,
  [OccurrenceRole.Write]: EdgeTypeV.Writes,
  [OccurrenceRole.Decorator]: EdgeTypeV.References,
  [OccurrenceRole.ImportSpecifier]: EdgeTypeV.References,
  [OccurrenceRole.ExportSpecifier]: EdgeTypeV.References,
};

type ScopeSearch =
  | { kind: 'bound'; sym: SymbolNode; usedBeforeDecl: boolean }
  | { kind: 'typeOnlyValue' } // type-only import used in a value position — TS error, stop
  | { kind: 'none' };

/** Chase an import binding to the exported symbol in the target module. */
type ChaseResult =
  | { kind: 'chased'; key: SymKey }
  | { kind: 'typeOnlyValue' }
  | { kind: 'ambig' }
  | { kind: 'keepLocal' };

export function bindIndex(input: BindInput): BindResult {
  const refs: BoundRef[] = [];
  const edges: SymbolEdge[] = [];
  const unresolved: UnresolvedReference[] = [];

  const symbolsByFile = new Map<FileIdx, SymbolNode[]>();
  const keyToSym = new Map<SymKey, SymbolNode>();
  for (const s of input.symbols) {
    let arr = symbolsByFile.get(s.fileIdx);
    if (!arr) symbolsByFile.set(s.fileIdx, (arr = []));
    arr.push(s);
    keyToSym.set(s.key, s);
  }
  const scopesByFile = new Map<FileIdx, Map<number, ScopeNode>>();
  for (const sc of input.scopes) {
    let m = scopesByFile.get(sc.fileIdx);
    if (!m) scopesByFile.set(sc.fileIdx, (m = new Map()));
    m.set(sc.key, sc);
  }
  const occurrencesByFile = new Map<FileIdx, Occurrence[]>();
  for (const o of input.occurrences) {
    let arr = occurrencesByFile.get(o.fileIdx);
    if (!arr) occurrencesByFile.set(o.fileIdx, (arr = []));
    arr.push(o);
  }

  const recordUnresolved = (fileIdx: FileIdx, o: Occurrence, reason: UnresolvedReference['reason']): void => {
    unresolved.push({ fileIdx, range: o.range, name: o.name, reason });
  };

  // Tier 2: every symbol declared inside a class/interface/enum/namespace
  // scope is a MEMBER of that type symbol (methods, properties, nested
  // classes, enum members, namespace exports). One owner per member.
  // scope.id → scope.key (ids and keys are per-file ordinals).
  const scopeKeyById = new Map<string, number>();
  for (const sc of input.scopes) scopeKeyById.set(sc.fileIdx + ':' + sc.id, sc.key);
  const membersByParent = new Map<SymKey, SymbolNode[]>();
  for (const s of input.symbols) {
    const sk = scopeKeyById.get(s.fileIdx + ':' + s.scopeId);
    const owner = sk !== undefined ? input.typeScopes.get(s.fileIdx)?.get(sk) : undefined;
    if (owner === undefined) continue;
    let arr = membersByParent.get(owner);
    if (!arr) membersByParent.set(owner, (arr = []));
    arr.push(s);
  }

  for (const [fileIdx, occs] of occurrencesByFile) {
    const scopeMap = scopesByFile.get(fileIdx);
    if (!scopeMap) continue;
    const syms = symbolsByFile.get(fileIdx) ?? [];
    const typeSymByScope = input.typeScopes.get(fileIdx) ?? new Map<number, SymKey>();

    // scope key → same-named candidates in declaration (source) order. Parse
    // pushes each declaration exactly once, to the scope where its name is
    // visible (§4.1): block-scoped names on their own block, var/function
    // declarations on the nearest function/module scope. So a plain walk of
    // each scope's single list needs no merging or dedupe — an inner-block
    // `let` is unreachable from outside its block, a hoisted `var` is
    // reachable from anywhere in the function, and a block class never leaks.
    const byNameInScope = new Map<number, Map<string, SymbolNode[]>>();
    for (const scope of scopeMap.values()) {
      const m = new Map<string, SymbolNode[]>();
      for (const key of scope.symbolKeys) {
        const s = keyToSym.get(key);
        if (!s) continue;
        let arr = m.get(s.name);
        if (!arr) m.set(s.name, (arr = []));
        arr.push(s);
      }
      byNameInScope.set(scope.key, m);
    }

    const searchScopeChain = (o: Occurrence, valuePos: boolean): ScopeSearch => {
      let scopeKey: number | undefined = o.scopeKey;
      while (scopeKey !== undefined) {
        const scope = scopeMap.get(scopeKey);
        if (!scope) return { kind: 'none' };
        for (const s of byNameInScope.get(scope.key)?.get(o.name) ?? []) {
          const kindOk = valuePos ? VALUE_KINDS.has(s.kind) : TYPE_KINDS.has(s.kind);
          if (!kindOk) continue;
          // A type-only import in a value position is a TS error: record it and
          // stop — imports live at module scope (the end of the chain), so no
          // outer symbol could legitimately win.
          if (valuePos && s.kind === SymbolKind.ImportBinding && s.modifiers.isTypeOnly) {
            return { kind: 'typeOnlyValue' };
          }
          const usedBeforeDecl = !!s.modifiers.tdz && s.decls[0].start > o.range.start;
          return { kind: 'bound', sym: s, usedBeforeDecl };
        }
        scopeKey = scope.parentKey;
      }
      return { kind: 'none' };
    };

    const chaseImportBinding = (o: Occurrence, localName: string, valuePos: boolean): ChaseResult => {
      for (const rec of input.resolvedImports.get(fileIdx) ?? []) {
        const b = rec.bindings?.find((x) => x.local === localName);
        if (!b || typeof rec.to !== 'number') continue;
        if (b.shape === 'namespace') return { kind: 'keepLocal' }; // ns.x is member access
        const entry = input.exportIndex.resolveExport(rec.to, b.imported ?? b.local);
        if (!entry) return { kind: 'keepLocal' }; // missing export → keep the binding
        if (entry.kind === 'ambiguous') return { kind: 'ambig' };
        const key = exportSymKey(entry);
        if (key === null) return { kind: 'keepLocal' };
        if (entry.kind === 'typeOnly' && valuePos) return { kind: 'typeOnlyValue' };
        return { kind: 'chased', key };
      }
      return { kind: 'keepLocal' };
    };

    // ── Tier 2: type-guided member resolution (obj.method → the member's
    // declaration symbol, resolvedVia 'type'). Policy, in one place:
    //   base = this              → innermost enclosing class scope → member,
    //                              instance first, static fallback (static methods).
    //   base = identifier        → value-scope symbol; namespace/class/enum/alias
    //                              bases resolve directly; annotated symbols
    //                              (const x: Foo, param (x: Foo)) and initializer
    //                              shapes (new/cast/call/mcall/id) resolve the type
    //                              then the member. Import bindings chase first.
    //   member lookup            → own members, then the heritage chain
    //                              (class A extends B), depth ≤ 3. Static policy:
    //                              class-as-value → static only; enum/namespace →
    //                              any; instance (new/annotation) → non-static
    //                              preferred, static fallback.
    // Nothing here guesses: an unresolvable type or missing member stays
    // unindexed (the occurrence is simply not claimed).

    /** First user type identifier in a type text (skips primitives + lib globals). */
    const firstTypeIdent = (text: string): string | undefined => {
      if (text.startsWith('{')) return undefined; // object literal type
      for (const tok of text.split(/[|&,\s]+/)) {
        for (const m of tok.matchAll(/[A-Za-z_$][\w$]*/g)) {
          const t = m[0];
          if (PRIMITIVE_TYPES.has(t) || LIB_GLOBALS.has(t)) continue;
          return t;
        }
      }
      return undefined;
    };

    /** (a: A) => Ret → the return-type text; plain annotations pass through. */
    const returnTypeOf = (typeRef: string): string => {
      const idx = typeRef.lastIndexOf('=>');
      return idx >= 0 ? typeRef.slice(idx + 2) : typeRef;
    };

    /** Scope-chain search for a NAME (not the occurrence's own name). */
    const findByName = (name: string, scopeKey: number, valuePos: boolean): SymbolNode | undefined => {
      const found = searchScopeChain(
        { fileIdx, range: { start: 0, end: 0, startLine: 1, startChar: 0, endLine: 1, endChar: 0 }, name, scopeKey, role: valuePos ? OccurrenceRole.Read : OccurrenceRole.TypeRef },
        valuePos,
      );
      return found.kind === 'bound' ? found.sym : undefined;
    };

    type MemberPolicy = 'any' | 'static' | 'instance';

    /**
     * The member named `name` owned by typeSym — own members first, then the
     * heritage chain (class/interface typeRef is the comma-joined extends
     * list). Policy: 'static'/'instance' filter by modifiers.static; 'any'
     * matches everything (enums, namespaces). Returns the member SYMBOL so
     * chains can keep hopping through its own type.
     */
    const memberSymIn = (typeSym: SymbolNode | undefined, name: string, policy: MemberPolicy, o: Occurrence, depth = 0): SymbolNode | undefined => {
      if (!typeSym || depth > 3) return undefined;
      for (const m of membersByParent.get(typeSym.key) ?? []) {
        if (m.name !== name) continue;
        if (policy === 'static' && !m.modifiers.static) continue;
        if (policy === 'instance' && m.modifiers.static) continue;
        return m;
      }
      const heritage = typeSym.typeRef;
      if (heritage) {
        for (const h of heritage.split(',')) {
          const t = firstTypeIdent(h);
          if (!t) continue;
          const parent = findTypeSym(t, o, false);
          if (parent) {
            const hit = memberSymIn(parent, name, policy, o, depth + 1);
            if (hit) return hit;
          }
        }
      }
      return undefined;
    };

    /**
     * Resolve `name` as a member of what baseSym stands for, returning the
     * member SYMBOL (never a guess — every hop needs a resolvable type or
     * shape). The policy is re-derived per hop: class-as-value → static,
     * enum/namespace → any, instance (annotation / new / cast / factory
     * return) → non-static. Aliases recurse (depth-bounded). Used for both
     * single accesses (`svc.get()`) and multi-hop chains (`svc.repo.get()`).
     */
    const memberOf = (baseSym: SymbolNode | undefined, name: string, o: Occurrence, depth: number): SymbolNode | undefined => {
      if (!baseSym || depth > 3) return undefined;
      if (baseSym.kind === SymbolKind.Class || baseSym.kind === SymbolKind.Component) {
        return memberSymIn(baseSym, name, 'static', o);
      }
      if (baseSym.kind === SymbolKind.Enum || baseSym.kind === SymbolKind.Namespace) {
        return memberSymIn(baseSym, name, 'any', o);
      }
      // Annotated type: const x: Foo / param (x: Foo) → Foo.member
      if (baseSym.typeRef) {
        const t = firstTypeIdent(returnTypeOf(baseSym.typeRef));
        if (t) {
          const typeSym = findTypeSym(t, o, false);
          if (typeSym) {
            const hit = memberSymIn(typeSym, name, 'instance', o);
            if (hit) return hit;
          }
        }
      }
      // Initializer shapes
      for (const it of input.initTypes.get(baseSym.key) ?? []) {
        if (it.k === 'new' || it.k === 'cast') {
          const t = firstTypeIdent(it.t);
          if (!t) continue;
          const typeSym = findTypeSym(t, o, it.k === 'new'); // new → class value; cast → type
          if (!typeSym) continue;
          const hit = memberSymIn(typeSym, name, 'instance', o);
          if (hit) return hit;
        } else if (it.k === 'id') {
          const alias = findByName(it.t, o.scopeKey, true);
          if (!alias) continue;
          const hit = memberOf(alias.kind === SymbolKind.ImportBinding ? chasedSym(o, it.t) : alias, name, o, depth + 1);
          if (hit) return hit;
        } else if (it.k === 'call') {
          // callee's declared return type
          const callee = findByName(it.t, o.scopeKey, true);
          if (!callee) continue;
          const calleeSym = callee.kind === SymbolKind.ImportBinding ? chasedSym(o, it.t) : callee;
          if (!calleeSym || !calleeSym.typeRef) continue;
          const t = firstTypeIdent(returnTypeOf(calleeSym.typeRef));
          if (!t) continue;
          const typeSym = findTypeSym(t, o, false);
          if (!typeSym) continue;
          const hit = memberSymIn(typeSym, name, 'instance', o);
          if (hit) return hit;
        } else if (it.k === 'mcall') {
          // factory.ctor() → the member's declared return type
          const base = findByName(it.base, o.scopeKey, true);
          if (!base) continue;
          const baseSym2 = base.kind === SymbolKind.ImportBinding ? chasedSym(o, it.base) : base;
          if (!baseSym2) continue;
          const member = memberSymIn(baseSym2, it.member, 'any', o);
          if (!member || !member.typeRef) continue;
          const t = firstTypeIdent(returnTypeOf(member.typeRef));
          if (!t) continue;
          const typeSym = findTypeSym(t, o, false);
          if (!typeSym) continue;
          const hit = memberSymIn(typeSym, name, 'instance', o);
          if (hit) return hit;
        }
      }
      return undefined;
    };

    /**
     * The Tier-2 entry: resolve a Property occurrence through its base —
     * single access (`svc.get()`, `Foo.staticBar()`, `Color.Red`) or a
     * multi-hop chain recorded by the parser (`this.repo.get()` carries
     * baseChain ['this','repo']). `this` resolves through the innermost
     * enclosing class scope (instance first, static fallback); identifier
     * heads resolve as values with import chasing.
     */
    const tryTypedMember = (o: Occurrence): BoundRef | undefined => {
      const chain = o.baseChain ?? (o.base !== undefined ? [o.base] : undefined);
      if (!chain || chain.length === 0) return undefined;
      const names = [...chain, o.name];
      let cur: SymbolNode | undefined;
      if (names[0] === 'this') {
        // innermost enclosing class/interface/enum/namespace scope
        let scopeKey: number | undefined = o.scopeKey;
        while (scopeKey !== undefined) {
          const owner = typeSymByScope.get(scopeKey);
          if (owner !== undefined) {
            cur = keyToSym.get(owner);
            break;
          }
          scopeKey = scopeMap.get(scopeKey)?.parentKey;
        }
        if (!cur) return undefined;
        const m = memberSymIn(cur, names[1], 'instance', o) ?? memberSymIn(cur, names[1], 'static', o);
        if (!m) return undefined;
        cur = m;
        for (let i = 2; i < names.length; i++) {
          cur = memberOf(cur, names[i], o, 0);
          if (!cur) return undefined;
        }
      } else {
        const found = searchScopeChain({ ...o, name: names[0] }, true);
        if (found.kind !== 'bound') return undefined;
        let head: SymbolNode | undefined = found.sym;
        if (head.kind === SymbolKind.ImportBinding) {
          head = chasedSym(o, names[0]);
          if (!head) return undefined;
        }
        cur = head;
        for (let i = 1; i < names.length; i++) {
          cur = memberOf(cur, names[i], o, 0);
          if (!cur) return undefined;
        }
      }
      return { fileIdx, range: o.range, symKey: cur.key, role: o.role, resolvedVia: 'type' };
    };

    /** Resolve an import binding to its chased symbol, if unambiguous. */
    const chasedSym = (o: Occurrence, localName: string): SymbolNode | undefined => {
      const chased = chaseImportBinding(o, localName, true);
      return chased.kind === 'chased' ? keyToSym.get(chased.key) : undefined;
    };

    /** Type-name resolution through imports: a type name that is an import
     * binding is chased to the declaring file before member lookup. */
    const findTypeSym = (name: string, o: Occurrence, valuePos: boolean): SymbolNode | undefined => {
      const found = findByName(name, o.scopeKey, valuePos);
      if (!found) return undefined;
      if (found.kind === SymbolKind.ImportBinding) {
        const chased = chaseImportBinding(o, name, valuePos);
        return chased.kind === 'chased' ? keyToSym.get(chased.key) : undefined;
      }
      return found;
    };

    const reexportSpecOcc = (o: Occurrence): boolean =>
      o.role === OccurrenceRole.ExportSpecifier &&
      (input.resolvedReexports
        .get(fileIdx)
        ?.some((r) => r.localName === o.name && r.range !== undefined && o.range.start >= r.range.start && o.range.end <= r.range.end) ??
        false);

    // Namespace-member chase: a Property occurrence whose head (`base`) is a
    // namespace import resolves the member through the target export surface
    // (masterData.someFn -> the exported symbol someFn, barrels hopped by
    // resolveExport). Mirrors chaseImportBinding's policy: ambiguous and
    // type-only targets are not claimed; any other member access stays
    // unindexed (resolved through types, Tier 2).
    const tryNamespaceMember = (o: Occurrence): BoundRef | undefined => {
      if (o.base === undefined || o.baseChain !== undefined) return undefined;
      for (const rec of input.resolvedImports.get(fileIdx) ?? []) {
        const b = rec.bindings?.find((x) => x.local === o.base);
        if (!b || b.shape !== 'namespace' || typeof rec.to !== 'number') continue;
        const entry = input.exportIndex.resolveExport(rec.to, o.name);
        if (!entry || entry.kind === 'ambiguous' || entry.kind === 'typeOnly') return undefined;
        const key = exportSymKey(entry);
        if (key === null) return undefined;
        return { fileIdx, range: o.range, symKey: key, role: o.role, resolvedVia: 'import' };
      }
      return undefined;
    };

    for (const o of occs) {
      if (o.role === OccurrenceRole.Property) {
        const nsRef = tryNamespaceMember(o);
        if (nsRef) refs.push(nsRef);
        else {
          const mRef = tryTypedMember(o);
          if (mRef) refs.push(mRef);
        }
        continue;
      }
      if (!BINDABLE_ROLES.has(o.role)) continue;
      if (reexportSpecOcc(o)) continue; // chased against the target module below
      const name = o.name;
      if (o.role === OccurrenceRole.JsxName && /^[a-z]/.test(name)) continue; // intrinsic elements
      const valuePos = o.role !== OccurrenceRole.TypeRef;

      const found = searchScopeChain(o, valuePos);
      if (found.kind === 'typeOnlyValue') {
        recordUnresolved(fileIdx, o, 'type-only-import-in-value-position');
        continue;
      }
      if (found.kind === 'none') {
        // Tier 1 has no lib tables: names we recognize as standard-library
        // globals are tagged `lib-not-loaded` (the lib tier graduates them);
        // anything else is a genuine unknown worth surfacing.
        recordUnresolved(fileIdx, o, LIB_GLOBALS.has(name) ? 'lib-not-loaded' : 'global-unknown');
        continue;
      }
      const { sym, usedBeforeDecl } = found;

      let target: SymKey = sym.key;
      let via: BoundRef['resolvedVia'] = 'scope';
      // Chase value imports always; chase type-only imports in TYPE positions
      // too — `export { type X }` / `type T = X` resolve through the import to
      // the declaring file (§13: the compiler's alias chain does the same).
      if (sym.kind === SymbolKind.ImportBinding && (!sym.modifiers.isTypeOnly || !valuePos)) {
        const chased = chaseImportBinding(o, name, valuePos);
        if (chased.kind === 'typeOnlyValue') {
          recordUnresolved(fileIdx, o, 'type-only-import-in-value-position');
          continue;
        }
        if (chased.kind === 'ambig') {
          recordUnresolved(fileIdx, o, 'export-star-ambiguous');
          continue;
        }
        if (chased.kind === 'chased') {
          target = chased.key;
          via = 'import';
        }
      }

      refs.push({ fileIdx, range: o.range, symKey: target, role: o.role, resolvedVia: via, ...(usedBeforeDecl ? { usedBeforeDecl: true } : {}) });
    }

    // `export { x } from './y'` sites: the specifier names the *target* module's
    // symbol; chase it (same-file specifiers already bound above).
    for (const o of occs) {
      if (o.role !== OccurrenceRole.ExportSpecifier) continue;
      const rec = input.resolvedReexports
        .get(fileIdx)
        ?.find(
          (r) =>
            r.localName === o.name && r.range !== undefined && o.range.start >= r.range.start && o.range.end <= r.range.end,
        );
      if (!rec) continue; // `to` is always set on resolved re-exports
      const entry = input.exportIndex.resolveExport(rec.to, rec.localName!);
      if (entry?.kind === 'ambiguous') recordUnresolved(fileIdx, o, 'export-star-ambiguous');
      else {
        const key = exportSymKey(entry);
        if (key !== null) refs.push({ fileIdx, range: o.range, symKey: key, role: o.role, resolvedVia: 'import' });
      }
    }
  }

  // Edges: source = smallest enclosing symbol (the caller). Parameter and
  // property declaration ranges *contain* their default/field initializers, so
  // a callee in `function f(a = g())` or a class field initializer must be
  // attributed to the enclosing function/class, never to the param/property.
  const NON_CONTAINERS = new Set<number>([SymbolKind.Parameter, SymbolKind.Property]);
  const containingSym = (fileIdx: FileIdx, pos: number): SymKey | FileIdx => {
    let best: SymbolNode | null = null;
    for (const s of symbolsByFile.get(fileIdx) ?? []) {
      if (NON_CONTAINERS.has(s.kind)) continue;
      const d = s.decls[0];
      if (d.start <= pos && d.end >= pos && (!best || d.end - d.start < best.decls[0].end - best.decls[0].start)) best = s;
    }
    return best ? best.key : fileIdx;
  };
  const edgeAgg = new Map<string, SymbolEdge>();
  for (const ref of refs) {
    const type = ROLE_EDGE[ref.role];
    if (type === undefined) continue;
    const source = containingSym(ref.fileIdx, ref.range.start);
    const k = `${source}|${ref.symKey}|${type}`;
    const hit = edgeAgg.get(k);
    if (hit) hit.weight++;
    else edgeAgg.set(k, { source, target: ref.symKey, type, weight: 1 });
  }
  edges.push(...edgeAgg.values());

  return { refs, edges, unresolved };
}