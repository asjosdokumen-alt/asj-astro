/**
 * parse.ts — Phase 1: Tier 1 binder (parse-only, no TypeChecker).
 *
 * Walks `ts.createSourceFile` ASTs and emits declarations, a scope tree,
 * role-tagged occurrences, import records, and export records, plus the
 * body-excluded `declHash` and export-table `exportHash` (§6.1).
 *
 * Scope kinds emitted in this phase: module, namespace, class, interface,
 * function, arrow, block, for, catch, switch, objectLiteral, enumBody, plus
 * the AstroTemplate scope (row 8 remainder — template interpolations resolve
 * against the frontmatter module scope).
 * Deferred (documented in CODE_INDEX_DESIGN.md §13): TypeParams scopes, CJS
 * export symbols beyond the export record. Astro.glob expansion ships with
 * this pass: the frontmatter walk records `Astro.glob('…')` string-literal
 * calls (AstroGlobCall) and graph.ts expands each pattern against the file
 * inventory into AstroGlob module edges (§13).
 */

import ts from 'typescript';
import {
  type FileIdx,
  type Hash,
  type Occurrence,
  type Range,
  ImportKind,
  OccurrenceRole,
  ScopeKind,
  type ScopeNode,
  type SymId,
  SymbolKind,
  type SymbolNode,
  type SymKey,
} from '../../docs/code-index-schema.js';
import { buildLineIndex, makeRange, symKey, type Lang } from './util.js';
import { hashString } from './hash.js';

// ─────────────────────────────────────────────────────────────────────────────
// Output types (indexer-local; the schema's ImportRecord/ExportEntry are the
// resolved, storage-level forms produced by Phase 3+).
// ─────────────────────────────────────────────────────────────────────────────

export interface RawImportRecord {
  from: FileIdx;
  specifier: string;
  kind: (typeof ImportKind)[keyof typeof ImportKind];
  importedNames: string[];
  renamed?: Array<{ imported: string; local: string }>;
  /** Phase 4: per-binding shape, so binding knows the name to chase in the target module. */
  bindings?: Array<{ local: string; imported?: string; shape: 'named' | 'default' | 'namespace' }>;
  range: Range;
}

export interface ExportRecord {
  fileIdx: FileIdx;
  exportName: string; // 'default' | '=' (CJS) | '*'
  localName?: string;
  /** Module specifier for re-exports (`export { x } from './y'`). */
  from?: string;
  kind: 'named' | 'type' | 'default' | 'star' | 'cjs';
  /** Source range — lets table-build link anonymous `export default` expressions. */
  range?: Range;
}

/**
 * Tier 2 (parse-side, never serialized): how a variable/field initializer is
 * shaped, for type-guided member resolution (`const svc = new Foo()` →
 * `svc.method()` binds to Foo.method). `k` is the initializer form:
 *   new → `new Foo(...)`; call → `foo(...)`; mcall → `foo.bar(...)`;
 *   id → plain alias; cast → `expr as Foo` (type text).
 */
export type InitType =
  | { k: 'new'; t: string }
  | { k: 'call'; t: string }
  | { k: 'mcall'; base: string; member: string }
  | { k: 'id'; t: string }
  | { k: 'cast'; t: string };

/**
 * One `Astro.glob('…')` call in an astro frontmatter (row-8 remainder —
 * wildcard module dependencies). The string-literal argument is the pattern;
 * graph.ts expands it against the file inventory into one module edge per
 * matched file (an unresolved record when nothing matches). Non-literal
 * arguments are never recorded — Astro requires a static string here.
 */
export interface AstroGlobCall {
  /** The glob pattern exactly as written (relative to this file, or root when leading `/`). */
  pattern: string;
  /** The string-literal argument, for diagnostics/site rendering. */
  range: Range;
}

export interface ParsedFile {
  fileIdx: FileIdx;
  path: string;
  symbols: SymbolNode[];
  scopes: ScopeNode[];
  occurrences: Occurrence[];
  imports: RawImportRecord[];
  exports: ExportRecord[];
  /** Tier 2: initializer shapes per variable/field symbol key (parse-side only). */
  initTypes: Array<{ key: SymKey; types: InitType[] }>;
  /** Tier 2: class/interface scope key → symbol key, for `this.member` resolution. */
  typeScopes: Array<{ scopeKey: number; symKey: SymKey }>;
  /** Astro only: capitalized component tags used in the template (builtins excluded, deduped). */
  templateTags?: string[];
  /** Astro only: `Astro.glob('…')` frontmatter calls (expanded in graph.ts). */
  astroGlobs?: AstroGlobCall[];
  declHash: Hash;
  exportHash: Hash;
  poisoned?: string;
}

export interface ParseFileInput {
  fileIdx: FileIdx;
  path: string;
  lang: Lang;
  content: string;
}

function scriptKindFor(lang: Lang): ts.ScriptKind {
  switch (lang) {
    case 'ts':
    case 'astro':
      return ts.ScriptKind.TS;
    case 'tsx':
      return ts.ScriptKind.TSX;
    case 'js':
    case 'mjs':
    case 'cjs':
      return ts.ScriptKind.JS;
    default:
      return ts.ScriptKind.TS;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Binder context
// ─────────────────────────────────────────────────────────────────────────────

interface ScopeFrame {
  key: number;
  kind: ScopeKind;
  name?: string;
  scopePath: string;
  hoistTarget: boolean;
  record: ScopeNode;
}

interface BinderCtx {
  fileIdx: FileIdx;
  path: string;
  lang: Lang;
  sf: ts.SourceFile;
  /** Real-file byte offset of this virtual text (0 for plain files). */
  offset: number;
  lineIndex: Uint32Array;
  symbols: SymbolNode[];
  scopes: ScopeNode[];
  occurrences: Occurrence[];
  imports: RawImportRecord[];
  exports: ExportRecord[];
  /** Astro frontmatter `Astro.glob('…')` calls (recorded in walkCall). */
  astroGlobs: AstroGlobCall[];
  initTypes: Array<{ key: SymKey; types: InitType[] }>;
  typeScopes: Array<{ scopeKey: number; symKey: SymKey }>;
  scopeStack: ScopeFrame[];
  /** Namespaces/classes/enums/interfaces currently enclosing (for qualified names). */
  containerNames: string[];
  /** Symbols currently enclosing (method's class, member's namespace). */
  symStack: SymKey[];
  declSigParts: string[];
  symCount: number;
  scopeKey: number;
  /** qualified → symbol index, for declaration merging (interface/enum/namespace/overloads). */
  mergeableByName: Map<string, number>;
  /** qualified → occurrence count, for `~n` disambiguation in symIds. */
  symIdCounts: Map<string, number>;
  /** scopePath → count, for `~n` disambiguation in scope ids (sibling anonymous scopes collide). */
  scopePathCounts: Map<string, number>;
}

const KIND_LABEL: Record<number, string> = {
  [ScopeKind.Module]: 'module',
  [ScopeKind.Namespace]: 'namespace',
  [ScopeKind.Class]: 'class',
  [ScopeKind.Interface]: 'interface',
  [ScopeKind.Function]: 'function',
  [ScopeKind.Arrow]: 'arrow',
  [ScopeKind.Block]: 'block',
  [ScopeKind.For]: 'for',
  [ScopeKind.Catch]: 'catch',
  [ScopeKind.Switch]: 'switch',
  [ScopeKind.ObjectLiteral]: 'objectLiteral',
  [ScopeKind.EnumBody]: 'enumBody',
};

function kindLabel(kind: ScopeKind): string {
  return KIND_LABEL[kind] ?? String(kind);
}

function openScope(ctx: BinderCtx, kind: ScopeKind, name: string | undefined, node: ts.Node): ScopeFrame {
  const parent = ctx.scopeStack[ctx.scopeStack.length - 1];
  const key = ctx.scopeKey++;
  const scopePath = parent ? `${parent.scopePath}.${name ?? kindLabel(kind)}` : name ?? kindLabel(kind);
  // Scope ids must be unique (siblings share a scopePath: every arrow/block at
  // one level, and each merged-declaration body reuses the same name), so the
  // 2nd+ scope with a given path gets the same `~n` treatment symIds use.
  const pathCount = (ctx.scopePathCounts.get(scopePath) ?? 0) + 1;
  ctx.scopePathCounts.set(scopePath, pathCount);
  const idPath = pathCount > 1 ? `${scopePath}~${pathCount}` : scopePath;
  const record: ScopeNode = {
    id: `scope:${ctx.path}#${idPath}`,
    key,
    kind,
    parentKey: parent?.key,
    fileIdx: ctx.fileIdx,
    range: makeRange(ctx.lineIndex, ctx.offset + node.getStart(ctx.sf), ctx.offset + node.getEnd()),
    symbolKeys: [],
  };
  if (name !== undefined) record.name = name;
  ctx.scopes.push(record);
  const frame: ScopeFrame = {
    key,
    kind,
    name,
    scopePath,
    hoistTarget: kind === ScopeKind.Function || kind === ScopeKind.Arrow || kind === ScopeKind.Module,
    record,
  };
  ctx.scopeStack.push(frame);
  return frame;
}

function closeScope(ctx: BinderCtx, frame: ScopeFrame): void {
  void frame;
  ctx.scopeStack.pop();
}

function topScope(ctx: BinderCtx): ScopeFrame {
  return ctx.scopeStack[ctx.scopeStack.length - 1];
}

/** Nearest enclosing function/arrow/module frame — where hoisted names land. */
function hoistTarget(ctx: BinderCtx): ScopeFrame {
  for (let i = ctx.scopeStack.length - 1; i >= 0; i--) {
    if (ctx.scopeStack[i].hoistTarget) return ctx.scopeStack[i];
  }
  return topScope(ctx); // unreachable: the module frame is always a hoist target
}

function hasModifier(n: ts.Node, kind: ts.SyntaxKind): boolean {
  const mods = ts.getModifiers(n as ts.HasModifiers);
  return !!mods?.some((m) => m.kind === kind);
}

interface DeclOpts {
  kind: SymbolKind;
  name: string;
  qualified: string;
  node: ts.Node;
  exported?: boolean;
  exportName?: string;
  exportRecordKind?: 'named' | 'type' | 'default';
  mergeable?: boolean;
  hoisted?: boolean;
  modifiers?: Record<string, boolean>;
  typeRef?: string;
  sig?: string;
}

function declareSymbol(ctx: BinderCtx, o: DeclOpts): SymKey {
  const merged = o.mergeable ? ctx.mergeableByName.get(o.qualified) : undefined;
  if (merged !== undefined) {
    const sym = ctx.symbols[merged];
    sym.decls.push(makeRange(ctx.lineIndex, ctx.offset + o.node.getStart(ctx.sf), ctx.offset + o.node.getEnd()));
    if (o.exportName) {
      sym.exported = true;
      sym.exportNames.push(o.exportName);
    }
    if (o.sig) ctx.declSigParts.push(o.sig);
    return sym.key;
  }

  const n = ctx.symCount++;
  const key = symKey(ctx.fileIdx, n);
  const count = (ctx.symIdCounts.get(o.qualified) ?? 0) + 1;
  ctx.symIdCounts.set(o.qualified, count);
  const symId = (`sym:${ctx.path}#${o.qualified}${count > 1 ? `~${count}` : ''}`) as SymId;
  const range = makeRange(ctx.lineIndex, ctx.offset + o.node.getStart(ctx.sf), ctx.offset + o.node.getEnd());

  const sym: SymbolNode = {
    id: symId,
    key,
    name: o.name,
    qualified: o.qualified,
    kind: o.kind,
    fileIdx: ctx.fileIdx,
    scopeId: topScope(ctx).record.id,
    parentKey: ctx.symStack[ctx.symStack.length - 1],
    decls: [{ ...range, source: 'source' }],
    exported: o.exported ?? false,
    exportNames: o.exportName ? [o.exportName] : [],
    modifiers: o.modifiers ?? {},
    centrality: 0,
  };
  if (o.typeRef !== undefined) sym.typeRef = o.typeRef;
  // Short signature for def/hover (§8.5): the declaration's first source
  // line, trimmed and capped — `function findMasterByWa(wa: string): Promise<…> {`.
  const declLine = o.node.getText(ctx.sf).split('\n')[0].trim();
  if (declLine.length > 0) sym.detail = declLine.length > 100 ? declLine.slice(0, 97) + '…' : declLine;

  ctx.symbols.push(sym);
  if (o.mergeable) ctx.mergeableByName.set(o.qualified, ctx.symbols.length - 1);
  // One declaration list per scope, one push per symbol: block-scoped names
  // stay on the scope open at declaration; hoisted names (var + function
  // declarations) land on the nearest function/module scope, which is where a
  // scope-chain lookup can see them from anywhere in that function.
  (o.hoisted ? hoistTarget(ctx) : topScope(ctx)).record.symbolKeys.push(key);
  if (o.sig) ctx.declSigParts.push(o.sig);

  if (o.exported && o.exportName) {
    ctx.exports.push({
      fileIdx: ctx.fileIdx,
      exportName: o.exportName,
      localName: o.name,
      kind: o.exportRecordKind ?? 'named',
    });
  }
  return key;
}

/** Emit the occurrence for the leftmost identifier of an entity name (`NS.A.B` → `NS`). */
function occEntityName(ctx: BinderCtx, name: ts.EntityName, role: OccurrenceRole): void {
  let n: ts.EntityName = name;
  while (ts.isQualifiedName(n)) n = n.left;
  if (ts.isIdentifier(n)) occ(ctx, n, role);
}

function occ(ctx: BinderCtx, node: ts.Node, role: OccurrenceRole): void {
  if (!node) return;
  const start = ctx.offset + node.getStart(ctx.sf);
  const end = ctx.offset + node.getEnd();
  ctx.occurrences.push({
    fileIdx: ctx.fileIdx,
    range: makeRange(ctx.lineIndex, start, end),
    name: node.getText(ctx.sf),
    scopeKey: topScope(ctx).key,
    role,
  });
}

function componentKind(ctx: BinderCtx, name: string | undefined): SymbolKind {
  if (!name || (ctx.lang !== 'tsx' && ctx.lang !== 'astro')) return SymbolKind.Function;
  if (/^use[A-Z]/.test(name)) return SymbolKind.Hook;
  if (/^[A-Z]/.test(name)) return SymbolKind.Component;
  return SymbolKind.Function;
}

// ─────────────────────────────────────────────────────────────────────────────
// Declarations
// ─────────────────────────────────────────────────────────────────────────────

function declareTypeParam(ctx: BinderCtx, tp: ts.TypeParameterDeclaration): void {
  const name = tp.name.getText(ctx.sf);
  declareSymbol(ctx, {
    kind: SymbolKind.Parameter, // no TypeParam kind exists in the schema; binds type positions
    name,
    qualified: name,
    node: tp,
    typeRef: tp.constraint?.getText(ctx.sf),
    sig: `typeParam|${name}`,
  });
}

function declareImportBinding(ctx: BinderCtx, nameNode: ts.Identifier, specifier: string, isTypeOnly = false): void {
  const name = nameNode.text;
  declareSymbol(ctx, {
    kind: SymbolKind.ImportBinding,
    name,
    qualified: name,
    node: nameNode,
    modifiers: isTypeOnly ? { isTypeOnly: true } : undefined,
    sig: `import|${name}|from:${specifier}${isTypeOnly ? '|type' : ''}`,
  });
  occ(ctx, nameNode, OccurrenceRole.ImportSpecifier);
}

function walkFunctionDeclaration(ctx: BinderCtx, n: ts.FunctionDeclaration): void {
  const name = n.name?.getText(ctx.sf) ?? '<anonymous>';
  const qualified = [...ctx.containerNames, name].join('.');
  const isExport = hasModifier(n, ts.SyntaxKind.ExportKeyword);
  const isDefault = hasModifier(n, ts.SyntaxKind.DefaultKeyword);
  const paramSig = n.parameters.map((p) => p.type?.getText(ctx.sf) ?? p.name.getText(ctx.sf)).join(',');
  const retSig = n.type?.getText(ctx.sf) ?? '';
  const kind = componentKind(ctx, name);
  const key = declareSymbol(ctx, {
    kind,
    name,
    qualified,
    node: n,
    exported: isExport || isDefault,
    exportName: isDefault ? 'default' : isExport ? name : undefined,
    exportRecordKind: isDefault ? 'default' : 'named',
    mergeable: kind === SymbolKind.Function,
    hoisted: true,
    typeRef: `(${paramSig}) => ${retSig}`,
    modifiers: {
      async: hasModifier(n, ts.SyntaxKind.AsyncKeyword),
      static: hasModifier(n, ts.SyntaxKind.StaticKeyword),
    },
    sig: `function|${qualified}|${paramSig}|${retSig}`,
  });
  const fr = openScope(ctx, ScopeKind.Function, name, n);
  ctx.symStack.push(key);
  n.typeParameters?.forEach((tp) => declareTypeParam(ctx, tp));
  n.parameters.forEach((p) => walk(p, ctx));
  if (n.body) walk(n.body, ctx);
  ctx.symStack.pop();
  closeScope(ctx, fr);
}

function walkFunctionExpression(ctx: BinderCtx, n: ts.FunctionExpression): void {
  const fr = openScope(ctx, ScopeKind.Function, n.name?.text, n);
  if (n.name) {
    declareSymbol(ctx, {
      kind: SymbolKind.Function,
      name: n.name.text,
      qualified: [...ctx.containerNames, n.name.text].join('.'),
      node: n.name,
      sig: `functionExpr|${n.name.text}`,
    });
  }
  n.typeParameters?.forEach((tp) => declareTypeParam(ctx, tp));
  n.parameters.forEach((p) => walk(p, ctx));
  if (n.body) walk(n.body, ctx);
  closeScope(ctx, fr);
}

function walkMethod(
  ctx: BinderCtx,
  n: ts.MethodDeclaration | ts.MethodSignature | ts.GetAccessorDeclaration | ts.SetAccessorDeclaration,
): void {
  const name = n.name?.getText(ctx.sf) ?? '';
  const qualified = [...ctx.containerNames, name].join('.');
  const isExport = hasModifier(n, ts.SyntaxKind.ExportKeyword);
  const paramSig = n.parameters.map((p) => p.type?.getText(ctx.sf) ?? p.name.getText(ctx.sf)).join(',');
  const retSig = n.type?.getText(ctx.sf) ?? '';
  const key = declareSymbol(ctx, {
    kind: SymbolKind.Method,
    name,
    qualified,
    node: n,
    exported: isExport,
    exportName: isExport ? name : undefined,
    mergeable: true, // overloads
    hoisted: false,
    typeRef: `(${paramSig}) => ${retSig}`,
    modifiers: {
      async: hasModifier(n, ts.SyntaxKind.AsyncKeyword),
      static: hasModifier(n, ts.SyntaxKind.StaticKeyword),
      abstract: hasModifier(n, ts.SyntaxKind.AbstractKeyword),
    },
    sig: `method|${qualified}|${paramSig}|${retSig}`,
  });
  const fr = openScope(ctx, ScopeKind.Function, name, n);
  ctx.symStack.push(key);
  n.typeParameters?.forEach((tp) => declareTypeParam(ctx, tp));
  n.parameters.forEach((p) => walk(p, ctx));
  if ('body' in n && n.body) walk(n.body, ctx);
  if (n.type) walk(n.type, ctx);
  closeScope(ctx, fr);
}

function walkConstructor(ctx: BinderCtx, n: ts.ConstructorDeclaration): void {
  const qualified = [...ctx.containerNames, 'constructor'].join('.');
  const key = declareSymbol(ctx, {
    kind: SymbolKind.Constructor,
    name: 'constructor',
    qualified,
    node: n,
    sig: `constructor|${qualified}|${n.parameters.map((p) => p.type?.getText(ctx.sf) ?? p.name.getText(ctx.sf)).join(',')}`,
  });
  // Parameter properties (`constructor(private repo: Repo)`) declare a class
  // member AND a parameter: the member lands in the class scope (still the
  // top scope here) so `this.repo` resolves through it; the parameter itself
  // walks below. The decl range is the whole parameter so declaration
  // identity matches the compiler's (which starts at the modifier).
  for (const p of n.parameters) {
    const isParamProp =
      ts.isIdentifier(p.name) &&
      p.modifiers?.some(
        (m) =>
          m.kind === ts.SyntaxKind.PublicKeyword ||
          m.kind === ts.SyntaxKind.PrivateKeyword ||
          m.kind === ts.SyntaxKind.ProtectedKeyword ||
          m.kind === ts.SyntaxKind.ReadonlyKeyword,
      );
    if (!isParamProp) continue;
    const name = p.name.text;
    declareSymbol(ctx, {
      kind: SymbolKind.Property,
      name,
      qualified: [...ctx.containerNames, name].join('.'),
      node: p,
      typeRef: p.type?.getText(ctx.sf),
      modifiers: { readonly: !!p.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword) },
      sig: `prop|${[...ctx.containerNames, name].join('.')}|${p.type?.getText(ctx.sf) ?? ''}|class:true|paramProp`,
    });
  }
  const fr = openScope(ctx, ScopeKind.Function, 'constructor', n);
  ctx.symStack.push(key);
  n.parameters.forEach((p) => walk(p, ctx));
  if (n.body) walk(n.body, ctx);
  ctx.symStack.pop();
  closeScope(ctx, fr);
}

function walkClass(ctx: BinderCtx, n: ts.ClassDeclaration | ts.ClassExpression): void {
  const name = n.name?.getText(ctx.sf) ?? '<anonymous>';
  const qualified = [...ctx.containerNames, name].join('.');
  const isExport = hasModifier(n, ts.SyntaxKind.ExportKeyword);
  const isDefault = hasModifier(n, ts.SyntaxKind.DefaultKeyword);
  const heritage = n.heritageClauses?.flatMap((h) => h.types.map((t) => t.getText(ctx.sf))).join(',');
  const isComponent = (ctx.lang === 'tsx' || ctx.lang === 'astro') && /^[A-Z]/.test(name);
  const key = declareSymbol(ctx, {
    kind: isComponent ? SymbolKind.Component : SymbolKind.Class,
    name,
    qualified,
    node: n,
    exported: isExport || isDefault,
    exportName: isDefault ? 'default' : isExport ? name : undefined,
    exportRecordKind: isDefault ? 'default' : 'named',
    mergeable: false,
    hoisted: false,
    typeRef: heritage || undefined,
    // classes are block-scoped with a TDZ: never hoisted out of their block —
    // a reference before the declaration is flagged (§4.1) via symbolKeys only.
    modifiers: { abstract: hasModifier(n, ts.SyntaxKind.AbstractKeyword), tdz: true },
    sig: `class|${qualified}|extends:${heritage}`,
  });
  const fr = openScope(ctx, ScopeKind.Class, name, n);
  ctx.typeScopes.push({ scopeKey: fr.key, symKey: key });
  ctx.symStack.push(key);
  ctx.containerNames.push(name);
  n.typeParameters?.forEach((tp) => declareTypeParam(ctx, tp));
  n.heritageClauses?.forEach((h) => h.types.forEach((t) => walk(t, ctx)));
  n.members.forEach((m) => walk(m, ctx));
  ctx.containerNames.pop();
  ctx.symStack.pop();
  closeScope(ctx, fr);
}

function walkInterface(ctx: BinderCtx, n: ts.InterfaceDeclaration): void {
  const name = n.name.getText(ctx.sf);
  const qualified = [...ctx.containerNames, name].join('.');
  const isExport = hasModifier(n, ts.SyntaxKind.ExportKeyword);
  const heritage = n.heritageClauses?.flatMap((h) => h.types.map((t) => t.getText(ctx.sf))).join(',');
  const key = declareSymbol(ctx, {
    kind: SymbolKind.Interface,
    name,
    qualified,
    node: n,
    exported: isExport,
    exportName: isExport ? name : undefined,
    exportRecordKind: 'type',
    mergeable: true,
    hoisted: false,
    typeRef: heritage || undefined,
    sig: `interface|${qualified}|extends:${heritage}`,
  });
  const fr = openScope(ctx, ScopeKind.Interface, name, n);
  ctx.typeScopes.push({ scopeKey: fr.key, symKey: key });
  ctx.symStack.push(key);
  ctx.containerNames.push(name);
  n.typeParameters?.forEach((tp) => declareTypeParam(ctx, tp));
  n.heritageClauses?.forEach((h) => h.types.forEach((t) => walk(t, ctx)));
  n.members.forEach((m) => walk(m, ctx));
  ctx.containerNames.pop();
  ctx.symStack.pop();
  closeScope(ctx, fr);
}

function walkTypeAlias(ctx: BinderCtx, n: ts.TypeAliasDeclaration): void {
  const name = n.name.getText(ctx.sf);
  const qualified = [...ctx.containerNames, name].join('.');
  const isExport = hasModifier(n, ts.SyntaxKind.ExportKeyword);
  const typeText = n.type.getText(ctx.sf);
  declareSymbol(ctx, {
    kind: SymbolKind.TypeAlias,
    name,
    qualified,
    node: n,
    exported: isExport,
    exportName: isExport ? name : undefined,
    exportRecordKind: 'type',
    mergeable: false,
    hoisted: false,
    typeRef: typeText,
    sig: `typeAlias|${qualified}|${typeText}`,
  });
  n.typeParameters?.forEach((tp) => declareTypeParam(ctx, tp));
  walk(n.type, ctx);
}

function walkEnum(ctx: BinderCtx, n: ts.EnumDeclaration): void {
  const name = n.name.getText(ctx.sf);
  const qualified = [...ctx.containerNames, name].join('.');
  const isExport = hasModifier(n, ts.SyntaxKind.ExportKeyword);
  const key = declareSymbol(ctx, {
    kind: SymbolKind.Enum,
    name,
    qualified,
    node: n,
    exported: isExport,
    exportName: isExport ? name : undefined,
    mergeable: true,
    hoisted: false,
    sig: `enum|${qualified}`,
  });
  const fr = openScope(ctx, ScopeKind.EnumBody, name, n);
  ctx.typeScopes.push({ scopeKey: fr.key, symKey: key });
  ctx.symStack.push(key);
  ctx.symStack.push(key);
  ctx.containerNames.push(name);
  n.members.forEach((m) => walk(m, ctx));
  ctx.containerNames.pop();
  ctx.symStack.pop();
  closeScope(ctx, fr);
}

function walkNamespace(ctx: BinderCtx, n: ts.ModuleDeclaration): void {
  const name = n.name.getText(ctx.sf);
  const qualified = [...ctx.containerNames, name].join('.');
  const isExport = hasModifier(n, ts.SyntaxKind.ExportKeyword);
  const key = declareSymbol(ctx, {
    kind: SymbolKind.Namespace,
    name,
    qualified,
    node: n,
    exported: isExport,
    exportName: isExport ? name : undefined,
    mergeable: true,
    hoisted: false,
    sig: `namespace|${qualified}`,
  });
  const body = n.body;
  if (body && ts.isModuleBlock(body)) {
    const fr = openScope(ctx, ScopeKind.Namespace, name, body);
    ctx.typeScopes.push({ scopeKey: fr.key, symKey: key });
    ctx.symStack.push(key);
    ctx.symStack.push(key);
    ctx.containerNames.push(name);
    ts.forEachChild(body, (c) => walk(c, ctx));
    ctx.containerNames.pop();
    ctx.symStack.pop();
    closeScope(ctx, fr);
  }
}

function walkPropertyDeclaration(ctx: BinderCtx, n: ts.PropertyDeclaration | ts.PropertySignature): void {
  const name = n.name.getText(ctx.sf);
  const qualified = [...ctx.containerNames, name].join('.');
  const isExport = hasModifier(n, ts.SyntaxKind.ExportKeyword);
  const isClass = ts.isClassLike(n.parent);
  const key = declareSymbol(ctx, {
    kind: SymbolKind.Property,
    name,
    qualified,
    node: n,
    exported: isExport,
    exportName: isExport ? name : undefined,
    mergeable: false,
    hoisted: false,
    typeRef: n.type?.getText(ctx.sf),
    modifiers: {
      static: hasModifier(n, ts.SyntaxKind.StaticKeyword),
      readonly: hasModifier(n, ts.SyntaxKind.ReadonlyKeyword),
    },
    sig: `prop|${qualified}|${n.type?.getText(ctx.sf) ?? ''}|class:${isClass}`,
  });
  if ('initializer' in n && n.initializer) {
    const types = classifyInitializer(ctx, n.initializer);
    if (types.length) ctx.initTypes.push({ key, types });
  }
  if (n.type) walk(n.type, ctx);
  if ('initializer' in n && n.initializer) walk(n.initializer, ctx);
}

function declareBinding(
  ctx: BinderCtx,
  name: ts.BindingName,
  opts: { node: ts.Node; kind: SymbolKind; isExport: boolean; hoisted: boolean; tdz?: boolean; typeText?: string; fnInitializer: boolean },
): SymKey | undefined {
  if (ts.isIdentifier(name)) {
    const localName = name.getText(ctx.sf);
    const qualified = [...ctx.containerNames, localName].join('.');
    let kind = opts.kind;
    if ((ctx.lang === 'tsx' || ctx.lang === 'astro') && /^use[A-Z]/.test(localName)) kind = SymbolKind.Hook;
    else if ((ctx.lang === 'tsx' || ctx.lang === 'astro') && /^[A-Z]/.test(localName) && opts.fnInitializer) kind = SymbolKind.Component;
    const key = declareSymbol(ctx, {
      kind,
      name: localName,
      qualified,
      node: opts.node,
      exported: opts.isExport,
      exportName: opts.isExport ? localName : undefined,
      mergeable: false,
      hoisted: opts.hoisted,
      modifiers: opts.tdz ? { tdz: true } : undefined,
      typeRef: opts.typeText,
      sig: `var|${kind}|${qualified}|${opts.typeText ?? ''}${opts.tdz ? '|tdz' : ''}`,
    });
    return key;
  }
  const elements = ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name) ? name.elements : [];
  for (const el of elements) {
    if (!ts.isBindingElement(el)) continue;
    // The decl site of a sub-binding is the BindingElement itself (matching the
    // compiler's symbol declarations), not the whole statement/param node —
    // otherwise every element of `const { a, b } = x` shares one coarse range.
    declareBinding(ctx, el.name, { ...opts, node: el });
    if (el.initializer) walk(el.initializer, ctx);
  }
  return undefined;
}

function walkVariableStatement(ctx: BinderCtx, n: ts.VariableStatement): void {
  const isExport = hasModifier(n, ts.SyntaxKind.ExportKeyword);
  const flags = n.declarationList.flags;
  const isConst = (flags & ts.NodeFlags.Const) !== 0;
  const isLet = !isConst && (flags & ts.NodeFlags.Let) !== 0;
  for (const d of n.declarationList.declarations) {
    const fnInit = !!d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer));
    const key = declareBinding(ctx, d.name, {
      node: d,
      kind: isConst ? SymbolKind.Constant : SymbolKind.Variable,
      isExport,
      hoisted: !isConst && !isLet, // var hoists; let/const are TDZ block-scoped
      tdz: isConst || isLet,
      typeText: d.type?.getText(ctx.sf),
      fnInitializer: fnInit,
    });
    if (key !== undefined && d.initializer) {
      const types = classifyInitializer(ctx, d.initializer);
      if (types.length) ctx.initTypes.push({ key, types });
    }
    if (d.initializer) walk(d.initializer, ctx);
  }
}

function walkParameter(ctx: BinderCtx, n: ts.ParameterDeclaration): void {
  if (!ts.isIdentifier(n.name)) {
    // Destructured parameter: declare each binding name as its own parameter
    // symbol (`function F({ onClose }: Props)` → parameter `onClose`), instead
    // of one symbol whose name is the raw pattern text (§4.3).
    declareBinding(ctx, n.name, {
      node: n,
      kind: SymbolKind.Parameter,
      isExport: false,
      hoisted: false,
      typeText: n.type?.getText(ctx.sf),
      fnInitializer: false,
    });
    if (n.initializer) walk(n.initializer, ctx);
    return;
  }
  const name = n.name.getText(ctx.sf);
  const qualified = [...ctx.containerNames, name].join('.');
  declareSymbol(ctx, {
    kind: SymbolKind.Parameter,
    name,
    qualified,
    node: n,
    typeRef: n.type?.getText(ctx.sf),
    sig: `param|${qualified}|${n.type?.getText(ctx.sf) ?? ''}`,
  });
  if (n.initializer) walk(n.initializer, ctx);
}

// ─────────────────────────────────────────────────────────────────────────────
// Imports / exports
// ─────────────────────────────────────────────────────────────────────────────

function walkImportDeclaration(ctx: BinderCtx, n: ts.ImportDeclaration): void {
  const spec = n.moduleSpecifier.kind === ts.SyntaxKind.StringLiteral ? (n.moduleSpecifier as ts.StringLiteral).text : '';
  const clauseIsTypeOnly = n.importClause?.isTypeOnly ?? false;
  const names: string[] = [];
  const renamed: Array<{ imported: string; local: string }> = [];
  const bindings: NonNullable<RawImportRecord['bindings']> = [];
  const clause = n.importClause;
  if (clause) {
    if (clause.name) {
      names.push(clause.name.text);
      bindings.push({ local: clause.name.text, imported: 'default', shape: 'default' });
    }
    if (clause.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        names.push(clause.namedBindings.name.text);
        bindings.push({ local: clause.namedBindings.name.text, shape: 'namespace' });
      } else {
        for (const s of clause.namedBindings.elements) {
          const local = s.name.text;
          const imported = s.propertyName?.text ?? local;
          names.push(local);
          if (imported !== local) renamed.push({ imported, local });
          bindings.push({ local, imported, shape: 'named' });
        }
      }
    }
  }
  ctx.imports.push({
    from: ctx.fileIdx,
    specifier: spec,
    kind: clauseIsTypeOnly ? ImportKind.Type : names.length ? ImportKind.Static : ImportKind.SideEffect,
    importedNames: names,
    renamed: renamed.length ? renamed : undefined,
    bindings,
    range: makeRange(ctx.lineIndex, ctx.offset + n.getStart(ctx.sf), ctx.offset + n.getEnd()),
  });
  if (clause) {
    if (clause.name) declareImportBinding(ctx, clause.name, spec, clauseIsTypeOnly);
    if (clause.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) declareImportBinding(ctx, clause.namedBindings.name, spec, clauseIsTypeOnly);
      else for (const s of clause.namedBindings.elements) declareImportBinding(ctx, s.name, spec, clauseIsTypeOnly || s.isTypeOnly);
    }
  }
}

function walkImportEquals(ctx: BinderCtx, n: ts.ImportEqualsDeclaration): void {
  const ref = n.moduleReference;
  const spec =
    ref.kind === ts.SyntaxKind.ExternalModuleReference && ref.expression.kind === ts.SyntaxKind.StringLiteral
      ? (ref.expression as ts.StringLiteral).text
      : '';
  ctx.imports.push({
    from: ctx.fileIdx,
    specifier: spec,
    kind: ImportKind.Static,
    importedNames: [n.name.text],
    bindings: [{ local: n.name.text, shape: 'namespace' }],
    range: makeRange(ctx.lineIndex, ctx.offset + n.getStart(ctx.sf), ctx.offset + n.getEnd()),
  });
  declareImportBinding(ctx, n.name, spec);
}

function walkExportDeclaration(ctx: BinderCtx, n: ts.ExportDeclaration): void {
  const spec =
    n.moduleSpecifier && n.moduleSpecifier.kind === ts.SyntaxKind.StringLiteral ? (n.moduleSpecifier as ts.StringLiteral).text : undefined;
  const declRange = makeRange(ctx.lineIndex, ctx.offset + n.getStart(ctx.sf), ctx.offset + n.getEnd());
  if (!n.exportClause) {
    ctx.exports.push({ fileIdx: ctx.fileIdx, exportName: '*', from: spec, kind: 'star', range: declRange });
    return;
  }
  if (ts.isNamespaceExport(n.exportClause)) return; // `export * as ns from`
  const isTypeOnly = n.isTypeOnly ?? false;
  for (const s of n.exportClause.elements) {
    const local = s.propertyName?.text ?? s.name.text;
    const exportName = s.name.text;
    // Type-only specifiers are type references: with no `from` clause they bind
    // locally in type position (e.g. `export { type AuthState }`); re-export
    // specifiers keep the ExportSpecifier role so the chase loop resolves them
    // through the target module's export table.
    occ(ctx, s.propertyName ?? s.name, (isTypeOnly || s.isTypeOnly) && !spec ? OccurrenceRole.TypeRef : OccurrenceRole.ExportSpecifier);
    ctx.exports.push({
      fileIdx: ctx.fileIdx,
      exportName,
      localName: local,
      from: spec,
      kind: isTypeOnly || s.isTypeOnly ? 'type' : 'named',
      range: declRange,
    });
    // Same-file alias export: `export { _mapForm as mapForm }` marks the local
    // symbol as exported under the alias name (design §3.2). Re-exports with a
    // `from` clause resolve through the target file's export table in Phase 3.
    if (!spec && !(isTypeOnly || s.isTypeOnly)) {
      const target = ctx.symbols.find((x) => x.name === local);
      if (target) {
        target.exported = true;
        if (!target.exportNames.includes(exportName)) target.exportNames.push(exportName);
      }
    }
  }
}

function walkExportAssignment(ctx: BinderCtx, n: ts.ExportAssignment): void {
  const exportName = n.isExportEquals ? '=' : 'default';
  const expr = n.expression;
  const range = makeRange(ctx.lineIndex, ctx.offset + n.getStart(ctx.sf), ctx.offset + n.getEnd());
  if (ts.isIdentifier(expr)) {
    occ(ctx, expr, OccurrenceRole.ExportSpecifier);
    ctx.exports.push({ fileIdx: ctx.fileIdx, exportName, localName: expr.text, kind: 'named', range });
    return;
  }
  // `export default <function expression>`: anonymous fn-expressions declare no
  // symbol today, so give the default export a bindable `<anonymous>` symbol.
  if (ts.isFunctionExpression(expr) && !expr.name) {
    declareSymbol(ctx, {
      kind: SymbolKind.Function,
      name: '<anonymous>',
      qualified: [...ctx.containerNames, '<anonymous>'].join('.'),
      node: expr,
      sig: 'functionExpr|anonymous-default',
    });
  }
  ctx.exports.push({ fileIdx: ctx.fileIdx, exportName, kind: 'named', range });
  walk(expr, ctx);
}

// ─────────────────────────────────────────────────────────────────────────────
// Expressions / statements
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tier 2: classify an initializer expression into type sources. Unwraps
 * parens, `as` casts (recording the cast type), `!` non-null, and `await`;
 * then classifies the core: `new Foo()`, `foo()`, `foo.bar()`, a plain
 * identifier alias, or nothing (literals/other → []).
 */
function classifyInitializer(ctx: BinderCtx, n: ts.Expression): InitType[] {
  let expr = n;
  let cast: string | undefined;
  for (;;) {
    if (ts.isParenthesizedExpression(expr)) expr = expr.expression;
    else if (ts.isAsExpression(expr)) {
      if (cast === undefined && expr.type) cast = expr.type.getText(ctx.sf);
      expr = expr.expression;
    } else if (ts.isNonNullExpression(expr)) expr = expr.expression;
    else if (expr.kind === ts.SyntaxKind.AwaitExpression) expr = (expr as ts.AwaitExpression).expression;
    else break;
  }
  const out: InitType[] = [];
  if (cast !== undefined) out.push({ k: 'cast', t: cast });
  if (ts.isNewExpression(expr) && ts.isIdentifier(expr.expression)) {
    out.push({ k: 'new', t: expr.expression.text });
  } else if (ts.isCallExpression(expr)) {
    if (ts.isIdentifier(expr.expression)) out.push({ k: 'call', t: expr.expression.text });
    else if (ts.isPropertyAccessExpression(expr.expression) && ts.isIdentifier(expr.expression.expression)) {
      out.push({ k: 'mcall', base: expr.expression.expression.text, member: expr.expression.name.text });
    }
  } else if (ts.isIdentifier(expr)) {
    out.push({ k: 'id', t: expr.text });
  }
  return out;
}

function walkCall(ctx: BinderCtx, n: ts.CallExpression): void {
  // Astro.glob('../pages/*.astro') — a wildcard module dependency over the
  // indexed files (row-8 remainder): record the pattern here; graph.ts
  // expands it into module edges. Only the frontmatter form counts (the Astro
  // global exists per component), and only a static string literal is a
  // pattern — Astro rejects dynamic arguments at compile time. The generic
  // walk below still runs, so the `Astro` base keeps its normal occurrence
  // (it graduates to astro's AstroGlobal through the lib tier).
  if (
    ctx.lang === 'astro' &&
    n.arguments.length >= 1 &&
    n.arguments[0].kind === ts.SyntaxKind.StringLiteral &&
    ts.isPropertyAccessExpression(n.expression) &&
    ts.isIdentifier(n.expression.expression) &&
    n.expression.expression.text === 'Astro' &&
    n.expression.name.text === 'glob'
  ) {
    const lit = n.arguments[0] as ts.StringLiteral;
    ctx.astroGlobs.push({
      pattern: lit.text,
      range: makeRange(ctx.lineIndex, ctx.offset + lit.getStart(ctx.sf), ctx.offset + lit.getEnd()),
    });
  }
  // Dynamic import(...)
  if (n.expression.kind === ts.SyntaxKind.ImportKeyword && n.arguments.length === 1 && n.arguments[0].kind === ts.SyntaxKind.StringLiteral) {
    const spec = (n.arguments[0] as ts.StringLiteral).text;
    ctx.imports.push({
      from: ctx.fileIdx,
      specifier: spec,
      kind: ImportKind.Dynamic,
      importedNames: [],
      range: makeRange(ctx.lineIndex, ctx.offset + n.getStart(ctx.sf), ctx.offset + n.getEnd()),
    });
    return;
  }
  // CommonJS require('./x')
  if (ts.isIdentifier(n.expression) && n.expression.text === 'require' && n.arguments.length === 1 && n.arguments[0].kind === ts.SyntaxKind.StringLiteral) {
    const spec = (n.arguments[0] as ts.StringLiteral).text;
    ctx.imports.push({
      from: ctx.fileIdx,
      specifier: spec,
      kind: ImportKind.Static,
      importedNames: [],
      range: makeRange(ctx.lineIndex, ctx.offset + n.getStart(ctx.sf), ctx.offset + n.getEnd()),
    });
    return;
  }
  if (ts.isIdentifier(n.expression)) {
    occ(ctx, n.expression, OccurrenceRole.Callee);
  } else {
    walk(n.expression, ctx);
  }
  n.typeArguments?.forEach((t) => walk(t, ctx));
  n.arguments.forEach((a) => walk(a, ctx));
}

function walkBinary(ctx: BinderCtx, n: ts.BinaryExpression): void {
  const op = n.operatorToken.kind;
  const isAssign = op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment;
  if (!isAssign) {
    walk(n.left, ctx);
    walk(n.right, ctx);
    return;
  }
  const left = n.left;
  if (ts.isIdentifier(left)) {
    occ(ctx, left, OccurrenceRole.Write);
  } else if (ts.isPropertyAccessExpression(left)) {
    const head = left.expression;
    if (ts.isIdentifier(head) && head.text === 'exports' && op === ts.SyntaxKind.EqualsToken) {
      // CommonJS export: `exports.handler = ...` — the property name is a
      // member, never a scope binding (Tier 2 resolves it through types); the
      // export record above is what feeds the export surface.
      ctx.exports.push({ fileIdx: ctx.fileIdx, exportName: left.name.text, localName: left.name.text, kind: 'cjs' });
      occ(ctx, head, OccurrenceRole.Read);
      occ(ctx, left.name, OccurrenceRole.Property);
    } else {
      walk(left, ctx);
    }
  } else {
    walk(left, ctx);
  }
  walk(n.right, ctx);
}

function walkJsxOpen(ctx: BinderCtx, n: ts.JsxOpeningElement | ts.JsxSelfClosingElement): void {
  const tag = n.tagName;
  if (ts.isIdentifier(tag)) {
    occ(ctx, tag, OccurrenceRole.JsxName);
  } else if (ts.isPropertyAccessExpression(tag)) {
    walk(tag.expression, ctx);
    occ(ctx, tag.name, OccurrenceRole.Property);
  }
  n.attributes.properties.forEach((a) => walk(a, ctx));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main walker
// ─────────────────────────────────────────────────────────────────────────────

function walk(node: ts.Node, ctx: BinderCtx): void {
  switch (node.kind) {
    case ts.SyntaxKind.SourceFile: {
      const fr = openScope(ctx, ScopeKind.Module, undefined, node);
      ts.forEachChild(node, (c) => walk(c, ctx));
      closeScope(ctx, fr);
      return;
    }
    case ts.SyntaxKind.FunctionDeclaration:
      walkFunctionDeclaration(ctx, node as ts.FunctionDeclaration);
      return;
    case ts.SyntaxKind.FunctionExpression:
      walkFunctionExpression(ctx, node as ts.FunctionExpression);
      return;
    case ts.SyntaxKind.ArrowFunction: {
      const fr = openScope(ctx, ScopeKind.Arrow, undefined, node);
      const n = node as ts.ArrowFunction;
      n.typeParameters?.forEach((tp) => declareTypeParam(ctx, tp));
      n.parameters.forEach((p) => walk(p, ctx));
      if (n.body) walk(n.body, ctx);
      closeScope(ctx, fr);
      return;
    }
    case ts.SyntaxKind.MethodDeclaration:
    case ts.SyntaxKind.MethodSignature:
    case ts.SyntaxKind.GetAccessor:
    case ts.SyntaxKind.SetAccessor:
      walkMethod(ctx, node as ts.MethodDeclaration);
      return;
    case ts.SyntaxKind.Constructor:
      walkConstructor(ctx, node as ts.ConstructorDeclaration);
      return;
    case ts.SyntaxKind.ClassDeclaration:
    case ts.SyntaxKind.ClassExpression:
      walkClass(ctx, node as ts.ClassDeclaration);
      return;
    case ts.SyntaxKind.InterfaceDeclaration:
      walkInterface(ctx, node as ts.InterfaceDeclaration);
      return;
    case ts.SyntaxKind.TypeAliasDeclaration:
      walkTypeAlias(ctx, node as ts.TypeAliasDeclaration);
      return;
    case ts.SyntaxKind.EnumDeclaration:
      walkEnum(ctx, node as ts.EnumDeclaration);
      return;
    case ts.SyntaxKind.EnumMember: {
      const n = node as ts.EnumMember;
      const name = n.name.getText(ctx.sf);
      const qualified = [...ctx.containerNames, name].join('.');
      declareSymbol(ctx, {
        kind: SymbolKind.EnumMember,
        name,
        qualified,
        node: n,
        sig: `enumMember|${qualified}`,
      });
      if (n.initializer) walk(n.initializer, ctx);
      return;
    }
    case ts.SyntaxKind.ModuleDeclaration:
      walkNamespace(ctx, node as ts.ModuleDeclaration);
      return;
    case ts.SyntaxKind.VariableStatement:
      walkVariableStatement(ctx, node as ts.VariableStatement);
      return;
    case ts.SyntaxKind.VariableDeclaration: {
      // Reached from catch (e) clauses and for/for-in/for-of initializers;
      // variable *statements* declare their bindings without recursing here.
      const d = node as ts.VariableDeclaration;
      const parent = d.parent as ts.VariableDeclarationList | ts.CatchClause;
      const flags = 'flags' in parent ? parent.flags : 0;
      const isConst = (flags & ts.NodeFlags.Const) !== 0;
      const isLet = !isConst && (flags & ts.NodeFlags.Let) !== 0;
      const fnInit = !!d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer));
      declareBinding(ctx, d.name, {
        node: d,
        kind: isConst ? SymbolKind.Constant : SymbolKind.Variable,
        isExport: false,
        hoisted: false, // catch/loop bindings never hoist
        tdz: isConst || isLet,
        typeText: d.type?.getText(ctx.sf),
        fnInitializer: fnInit,
      });
      if (d.initializer) walk(d.initializer, ctx);
      return;
    }
    case ts.SyntaxKind.Parameter:
      walkParameter(ctx, node as ts.ParameterDeclaration);
      return;
    case ts.SyntaxKind.ImportDeclaration:
      walkImportDeclaration(ctx, node as ts.ImportDeclaration);
      return;
    case ts.SyntaxKind.ImportEqualsDeclaration:
      walkImportEquals(ctx, node as ts.ImportEqualsDeclaration);
      return;
    case ts.SyntaxKind.ExportDeclaration:
      walkExportDeclaration(ctx, node as ts.ExportDeclaration);
      return;
    case ts.SyntaxKind.ExportAssignment:
      walkExportAssignment(ctx, node as ts.ExportAssignment);
      return;
    case ts.SyntaxKind.PropertyDeclaration:
    case ts.SyntaxKind.PropertySignature:
      walkPropertyDeclaration(ctx, node as ts.PropertyDeclaration);
      return;
    case ts.SyntaxKind.Block: {
      const fr = openScope(ctx, ScopeKind.Block, undefined, node);
      ts.forEachChild(node, (c) => walk(c, ctx));
      closeScope(ctx, fr);
      return;
    }
    case ts.SyntaxKind.ForStatement:
    case ts.SyntaxKind.ForInStatement:
    case ts.SyntaxKind.ForOfStatement: {
      const fr = openScope(ctx, ScopeKind.For, undefined, node);
      ts.forEachChild(node, (c) => walk(c, ctx));
      closeScope(ctx, fr);
      return;
    }
    case ts.SyntaxKind.CatchClause: {
      const fr = openScope(ctx, ScopeKind.Catch, undefined, node);
      ts.forEachChild(node, (c) => walk(c, ctx));
      closeScope(ctx, fr);
      return;
    }
    case ts.SyntaxKind.SwitchStatement: {
      const fr = openScope(ctx, ScopeKind.Switch, undefined, node);
      ts.forEachChild(node, (c) => walk(c, ctx));
      closeScope(ctx, fr);
      return;
    }
    case ts.SyntaxKind.ObjectLiteralExpression: {
      const fr = openScope(ctx, ScopeKind.ObjectLiteral, undefined, node);
      ts.forEachChild(node, (c) => walk(c, ctx));
      closeScope(ctx, fr);
      return;
    }
    case ts.SyntaxKind.PropertyAssignment: {
      const n = node as ts.PropertyAssignment;
      if (ts.isComputedPropertyName(n.name)) walk(n.name, ctx);
      else if (ts.isIdentifier(n.name)) occ(ctx, n.name, OccurrenceRole.ObjectKey);
      walk(n.initializer, ctx);
      return;
    }
    case ts.SyntaxKind.ShorthandPropertyAssignment: {
      occ(ctx, (node as ts.ShorthandPropertyAssignment).name, OccurrenceRole.Read);
      return;
    }
    case ts.SyntaxKind.CallExpression:
      walkCall(ctx, node as ts.CallExpression);
      return;
    case ts.SyntaxKind.NewExpression: {
      const n = node as ts.NewExpression;
      if (n.expression && ts.isIdentifier(n.expression)) occ(ctx, n.expression, OccurrenceRole.Callee);
      else if (n.expression) walk(n.expression, ctx);
      n.typeArguments?.forEach((t) => walk(t, ctx));
      n.arguments?.forEach((a) => walk(a, ctx));
      return;
    }
    case ts.SyntaxKind.PropertyAccessExpression: {
      const n = node as ts.PropertyAccessExpression;
      if (n.expression.kind !== ts.SyntaxKind.ImportKeyword) walk(n.expression, ctx);
      // Member names are Property occurrences; when the head is a plain
      // identifier we record it as the base so the binder can chase
      // `base.member` through a namespace import (masterData.someFn).
      const start = ctx.offset + n.name.getStart(ctx.sf);
      const end = ctx.offset + n.name.getEnd();
      // Tier 2: the full head chain, root first — `this.repo.get()` records
      // base 'this' + baseChain ['this','repo'] on the `get` occurrence so the
      // binder can hop member-by-member through types.
      const mid: string[] = [];
      let head = n.expression;
      while (ts.isPropertyAccessExpression(head)) {
        mid.unshift(head.name.text);
        head = head.expression;
      }
      const base =
        ts.isIdentifier(head) ? head.text
        : head.kind === ts.SyntaxKind.ThisKeyword ? 'this'
        : undefined;
      ctx.occurrences.push({
        fileIdx: ctx.fileIdx,
        range: makeRange(ctx.lineIndex, start, end),
        name: n.name.text,
        scopeKey: topScope(ctx).key,
        role: OccurrenceRole.Property,
        ...(base !== undefined
          ? mid.length > 0
            ? { base, baseChain: [base, ...mid] }
            : { base }
          : {}),
      });
      return;
    }
    case ts.SyntaxKind.MetaProperty:
      // `import.meta` — the `meta` name is a language construct, not a symbol.
      return;
    case ts.SyntaxKind.ElementAccessExpression: {
      const n = node as ts.ElementAccessExpression;
      walk(n.expression, ctx);
      walk(n.argumentExpression, ctx);
      return;
    }
    case ts.SyntaxKind.BinaryExpression:
      walkBinary(ctx, node as ts.BinaryExpression);
      return;
    case ts.SyntaxKind.PostfixUnaryExpression:
    case ts.SyntaxKind.PrefixUnaryExpression: {
      // Only ++ / -- write. `!x`, `-x`, `typeof x`, `~x`, … read their
      // operand — walking it yields the correct inner Read/Callee occurrence
      // instead of a whole-expression pseudo-Write (e.g. `!hasBackend()`).
      const n = node as ts.PostfixUnaryExpression | ts.PrefixUnaryExpression;
      const op = n.operator;
      const isWrite = op === ts.SyntaxKind.PlusPlusToken || op === ts.SyntaxKind.MinusMinusToken;
      if (isWrite && ts.isIdentifier(n.operand)) {
        occ(ctx, n.operand, OccurrenceRole.Write);
      } else {
        walk(n.operand, ctx);
      }
      return;
    }
    case ts.SyntaxKind.DeleteExpression: {
      // `delete obj.key` writes the member, which resolves through types
      // (Tier 2); walking the expression reads the base object.
      walk((node as ts.DeleteExpression).expression, ctx);
      return;
    }
    case ts.SyntaxKind.JsxOpeningElement:
    case ts.SyntaxKind.JsxSelfClosingElement:
      walkJsxOpen(ctx, node as ts.JsxOpeningElement);
      return;
    case ts.SyntaxKind.JsxElement: {
      // Children live on JsxElement, not JsxOpeningElement (TS AST shape).
      const n = node as ts.JsxElement;
      walk(n.openingElement, ctx);
      n.children.forEach((c) => walk(c, ctx));
      return;
    }
    case ts.SyntaxKind.JsxClosingElement:
      return; // tag already seen in the opening element
    case ts.SyntaxKind.JsxAttribute: {
      const n = node as ts.JsxAttribute;
      if (n.initializer) walk(n.initializer, ctx);
      return;
    }
    case ts.SyntaxKind.JsxSpreadAttribute:
      walk((node as ts.JsxSpreadAttribute).expression, ctx);
      return;
    case ts.SyntaxKind.TypeReference: {
      const n = node as ts.TypeReferenceNode;
      // `x as const` parses as a TypeReference whose typeName is the keyword
      // `const` — a language assertion, not a reference to a symbol.
      if (!(ts.isIdentifier(n.typeName) && n.typeName.text === 'const')) {
        occEntityName(ctx, n.typeName, OccurrenceRole.TypeRef);
      }
      n.typeArguments?.forEach((t) => walk(t, ctx));
      return;
    }
    case ts.SyntaxKind.ExpressionWithTypeArguments: {
      const n = node as ts.ExpressionWithTypeArguments;
      if (ts.isIdentifier(n.expression)) occ(ctx, n.expression, OccurrenceRole.TypeRef);
      else walk(n.expression, ctx);
      n.typeArguments?.forEach((t) => walk(t, ctx));
      return;
    }
    case ts.SyntaxKind.TypeQuery: {
      // `typeof X` references the *value* X (TS semantics): a type query binds
      // value symbols, so the operand is a value-position Read.
      const n = node as ts.TypeQueryNode;
      occEntityName(ctx, n.exprName, OccurrenceRole.Read);
      return;
    }
    case ts.SyntaxKind.Decorator: {
      const n = node as ts.Decorator;
      const e = n.expression;
      if (ts.isIdentifier(e)) occ(ctx, e, OccurrenceRole.Decorator);
      else if (ts.isCallExpression(e)) {
        if (ts.isIdentifier(e.expression)) occ(ctx, e.expression, OccurrenceRole.Decorator);
        e.arguments.forEach((a) => walk(a, ctx));
      } else walk(e, ctx);
      return;
    }
    case ts.SyntaxKind.TaggedTemplateExpression: {
      const n = node as ts.TaggedTemplateExpression;
      if (ts.isIdentifier(n.tag)) occ(ctx, n.tag, OccurrenceRole.Callee);
      else walk(n.tag, ctx);
      walk(n.template, ctx);
      return;
    }
    case ts.SyntaxKind.LabeledStatement:
      walk((node as ts.LabeledStatement).statement, ctx);
      return;
    case ts.SyntaxKind.ImportSpecifier:
    case ts.SyntaxKind.ImportClause:
    case ts.SyntaxKind.NamespaceImport:
    case ts.SyntaxKind.ExportSpecifier:
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.BigIntLiteral:
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
    case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.ThisKeyword:
    case ts.SyntaxKind.SuperKeyword:
    case ts.SyntaxKind.RegularExpressionLiteral:
      return;
    case ts.SyntaxKind.Identifier:
      occ(ctx, node, OccurrenceRole.Read);
      return;
    default:
      ts.forEachChild(node, (c) => walk(c, ctx));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

function newCtx(input: ParseFileInput, sf: ts.SourceFile, offset: number, lineIndex: Uint32Array): BinderCtx {
  return {
    fileIdx: input.fileIdx,
    path: input.path,
    lang: input.lang,
    sf,
    offset,
    lineIndex,
    symbols: [],
    scopes: [],
    occurrences: [],
    imports: [],
    exports: [],
    astroGlobs: [],
    initTypes: [],
    typeScopes: [],
    scopeStack: [],
    containerNames: [],
    symStack: [],
    declSigParts: [],
    symCount: 0,
    scopeKey: 0,
    mergeableByName: new Map(),
    symIdCounts: new Map(),
    scopePathCounts: new Map(),
  };
}

function finishHashes(ctx: BinderCtx): { declHash: Hash; exportHash: Hash } {
  const declHash = hashString(ctx.declSigParts.join('\n'));
  const exportSig = [...ctx.exports]
    .sort((a, b) => a.exportName.localeCompare(b.exportName) || a.kind.localeCompare(b.kind) || (a.from ?? '').localeCompare(b.from ?? ''))
    .map((e) => `${e.exportName}|${e.kind}|${e.localName ?? ''}|${e.from ?? ''}`)
    .join('\n');
  return { declHash, exportHash: hashString(exportSig) };
}

/**
 * Astro frontmatter splitter — shared with validate.ts so the compiler receives
 * byte-identical stripped source and the same offset map (frontmatter length).
 */
export function splitAstroFrontmatter(content: string): { text: string; offset: number } | null {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return null;
  const newlineLen = content[m.index! + 3] === '\r' ? 2 : 1;
  return { text: m[1], offset: m.index! + 3 + newlineLen };
}

/**
 * Astro template component scan (roadmap row 8 — astro-markup edges):
 * capitalized tags in the template portion (`<BottomNav />`, `<Foo.Bar>`),
 * deduped, Astro builtins excluded. Resolution against the frontmatter
 * import bindings happens in graph.ts (a tag bound by an import emits a
 * Renders module edge; an unbound tag becomes an unresolved record).
 * Template SCOPE (symbol-level interpolations/props) stays deferred (§13).
 */
const ASTRO_BUILTIN_TAGS = new Set([
  'slot', 'Fragment', 'Markdown', 'Code', 'Prism', 'Debug', 'Picture', 'Image', 'Link', 'Content', 'ViewTransitions',
]);

export function scanAstroTemplateTags(content: string, frontmatterEndOffset: number): string[] {
  const template = content.slice(frontmatterEndOffset);
  const seen = new Set<string>();
  const out: string[] = [];
  const tagRe = /<([A-Z][A-Za-z0-9_]*)(?:\.[A-Za-z0-9_]+)?/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(template)) !== null) {
    const name = m[1];
    if (ASTRO_BUILTIN_TAGS.has(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Astro template expressions (row-8 open remainder — template SCOPE,
// symbol-level interpolations).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A template identifier read at its absolute position in the real file:
 * `lang` in `lang={lang}` inside BaseLayout's template, for example. parseFile
 * turns each read into a Read occurrence whose scope is the file's
 * AstroTemplate scope, so the binder resolves it against the frontmatter
 * module scope exactly like a module-level reference (§2.4: the template is a
 * child scope of the frontmatter module).
 */
export interface AstroTemplateRead {
  /** Absolute offset in the real file of the identifier's first char. */
  start: number;
  /** Absolute offset just past the identifier. */
  end: number;
  name: string;
}

/**
 * Lightweight character scan of the TEMPLATE portion (past the closing `---`
 * fence) for identifier reads inside expression positions — `{expr}` text
 * interpolations and `attr={expr}` attribute values, recursing into JSX
 * embedded in an expression (`{cond && <Card title={t} />}`) and into nested
 * braces — returning every identifier READ at its absolute offset.
 *
 * Conservative by design (a scan, never a guess): markup it does not
 * recognize is skipped whole — raw `<script>`/`<style>` bodies are client-side
 * code and never scanned, HTML comments and quoted attribute values are
 * opaque, and backtick template literals lose their inner `${x}` reads.
 * Identifiers that cannot bind at module scope are never emitted: member names
 * (`a.b` → only `a`), object keys (`{ a: v }` → only `v`), arrow params
 * (`(a) => a.n` — the param list AND body references to the tracked param
 * names are skipped for the rest of the enclosing expression; a same-named
 * outer read later in the SAME expression is lost, a documented Tier-1
 * conservatism), and the JS keywords. Standard-library globals ARE emitted:
 * they bind nothing at module scope and surface as `lib-not-loaded`, exactly
 * like module-level code (the deep tier cannot graduate template positions —
 * the compiler program only receives frontmatter text — so validation excludes
 * them, see validate.ts). ASCII identifiers only.
 *
 * ⚠ EXCEPT the declaration-less intrinsic globals `undefined` and
 * `globalThis`. They are emitted by the same rule as `null`/`true` above, and
 * they CANNOT be graduated: the graduation path (`DECLLESS_LIBS`) needs a
 * checker position in the program, but the program only receives the
 * frontmatter — so every template `undefined` (e.g. `attr={x ? 1 : undefined}`,
 * a ubiquitous Astro idiom for omitting an attribute) lands in the
 * lib-not-loaded bucket as a PERMANENT residual, failing
 * `build.test.ts` / `deep-tier.test.ts` ("prod residual must be empty") with a
 * row like `Foo.astro:285 undefined`. They are literals of the language, not
 * module-scope bindings, so they belong in this skip set alongside
 * `null`/`true`/`false`/`this` — which is exactly why those four are here.
 */
const ASTRO_TEMPLATE_SKIP = new Set([
  'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'debugger', 'default', 'delete', 'do', 'else', 'enum', 'export', 'extends',
  'false', 'finally', 'for', 'function', 'get', 'globalThis', 'if', 'import',
  'in', 'instanceof', 'let', 'new', 'null', 'of', 'return', 'set', 'static',
  'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'undefined',
  'var', 'void', 'while', 'with', 'yield',
]);

function isAstroIdentStart(c: string): boolean {
  return /[A-Za-z_$]/.test(c);
}

function isAstroIdentPart(c: string): boolean {
  return /[A-Za-z0-9_$]/.test(c);
}

/** Top-level param names of an arrow `(…) => …` param list [from, to) — the
 * identifiers the list BINDS (x in `(x)`, `(x = z)` — z is a default VALUE
 * read, not a binding; `(a, b)`) — so body references to them are skipped.
 * Destructured patterns (`({ a })`) are nested and not tracked (documented). */
function astroParamNames(content: string, from: number, to: number): string[] {
  const out: string[] = [];
  let k = from;
  let depth = 0;
  while (k < to) {
    const c = content[k];
    if (c === '"' || c === "'") {
      k = skipAstroQuoted(content, k);
      continue;
    }
    if (c === '`') {
      k = skipAstroTemplate(content, k);
      continue;
    }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (depth === 0 && isAstroIdentStart(c)) {
      const e = readAstroIdent(content, k);
      const name = content.slice(k, e);
      const prev = prevSig(content, k);
      const next = nextSig(content, e);
      // `x` in `(x)`, `(x = z)` — z is a default VALUE (prev '='), not a binding.
      if ((prev === '(' || prev === ',') && next !== ':' && !ASTRO_TEMPLATE_SKIP.has(name)) out.push(name);
      k = e;
      continue;
    }
    k++;
  }
  return out;
}

/** Index just past the ASCII identifier starting at i. */
function readAstroIdent(content: string, i: number): number {
  let j = i + 1;
  while (j < content.length && isAstroIdentPart(content[j])) j++;
  return j;
}

/** Advance past a '…' / "…" string (or quoted attribute value) starting at i. */
function skipAstroQuoted(content: string, i: number): number {
  const q = content[i];
  let j = i + 1;
  while (j < content.length) {
    const c = content[j];
    if (c === '\\') {
      j += 2;
      continue;
    }
    if (c === q) return j + 1;
    j++;
  }
  return j;
}

/** Advance past a `…` template literal — opaque (inner ${x} reads are lost). */
function skipAstroTemplate(content: string, i: number): number {
  let j = i + 1;
  while (j < content.length) {
    const c = content[j];
    if (c === '\\') {
      j += 2;
      continue;
    }
    if (c === '`') return j + 1;
    j++;
  }
  return j;
}

/** Nearest non-whitespace char before `at` ('' at text start). */
function prevSig(content: string, at: number): string {
  let j = at - 1;
  while (j >= 0 && /\s/.test(content[j])) j--;
  return j >= 0 ? content[j] : '';
}

/** Nearest non-whitespace char at/after `at` ('' at text end). */
function nextSig(content: string, at: number): string {
  let j = at;
  while (j < content.length && /\s/.test(content[j])) j++;
  return j < content.length ? content[j] : '';
}

/** Index just past the ')' matching the '(' at i (strings/comments skipped), or -1. */
function matchAstroParen(content: string, i: number): number {
  let depth = 0;
  let j = i;
  while (j < content.length) {
    const c = content[j];
    if (c === '"' || c === "'") {
      j = skipAstroQuoted(content, j);
      continue;
    }
    if (content.startsWith('//', j)) {
      const e = content.indexOf('\n', j + 2);
      j = e < 0 ? content.length : e + 1;
      continue;
    }
    if (content.startsWith('/*', j)) {
      const e = content.indexOf('*/', j + 2);
      j = e < 0 ? content.length : e + 2;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return j + 1;
    }
    j++;
  }
  return -1;
}

/**
 * Identifier reads inside one `{…}` expression whose opening brace is at i;
 * returns the reads and the index just past the MATCHING `}`. Nested braces
 * (object literals), JSX elements, strings/comments/backticks, arrow param
 * lists, member accesses and object keys are handled per the module docs.
 */
function scanAstroExpr(
  content: string,
  i: number,
  shadowed: Set<string> = new Set(),
): { reads: AstroTemplateRead[]; next: number } {
  const reads: AstroTemplateRead[] = [];
  const len = content.length;
  let depth = 1;
  let j = i + 1;
  while (j < len && depth > 0) {
    const c = content[j];
    if (c === '"' || c === "'") {
      j = skipAstroQuoted(content, j);
      continue;
    }
    if (c === '`') {
      j = skipAstroTemplate(content, j);
      continue;
    }
    if (content.startsWith('//', j)) {
      const e = content.indexOf('\n', j + 2);
      j = e < 0 ? len : e + 1;
      continue;
    }
    if (content.startsWith('/*', j)) {
      const e = content.indexOf('*/', j + 2);
      j = e < 0 ? len : e + 2;
      continue;
    }
    if (c === '{') {
      const inner = scanAstroExpr(content, j, shadowed);
      reads.push(...inner.reads);
      j = inner.next;
      continue;
    }
    if (c === '}') {
      depth--;
      j++;
      continue;
    }
    if (c === '<') {
      const jsx = scanAstroJsx(content, j);
      reads.push(...jsx.reads);
      j = jsx.next;
      continue;
    }
    if (c === '(') {
      // Arrow param list? `(a, b) => …` — params are arrow-local names, never
      // module-scope bindings: track their names (shadowed for the rest of this
      // expression) and skip the list — defaults included.
      const close = matchAstroParen(content, j);
      if (close >= 0 && /^\s*=>/.test(content.slice(close))) {
        for (const p of astroParamNames(content, j + 1, close)) shadowed.add(p);
        const m = /^\s*=>/.exec(content.slice(close))!;
        j = close + m[0].length;
        continue;
      }
      j++;
      continue;
    }
    if (isAstroIdentStart(c)) {
      const e = readAstroIdent(content, j);
      const name = content.slice(j, e);
      const prev = prevSig(content, j);
      if (prev !== '.') {
        const next = nextSig(content, e);
        const isKey = next === ':' && (prev === '{' || prev === ',');
        const isBareParam = /^\s*=>/.test(content.slice(e)); // `x => …`
        if (isBareParam) shadowed.add(name);
        else if (!isKey && !shadowed.has(name) && !ASTRO_TEMPLATE_SKIP.has(name)) {
          reads.push({ start: j, end: e, name });
        }
      }
      j = e;
      continue;
    }
    j++;
  }
  return { reads, next: j };
}

/**
 * One JSX element inside an expression, starting at the '<' at i: scans the
 * open tag (quoted attrs opaque, `attr={expr}` values recursed), then children
 * text (`{expr}` interpolations + nested elements) to the matching close tag.
 * Raw `<script>`/`<style>` bodies are skipped whole; a fragment `<> … </>` is
 * scanned to its `</>`.
 */
function scanAstroJsx(content: string, i: number): { reads: AstroTemplateRead[]; next: number } {
  const reads: AstroTemplateRead[] = [];
  const len = content.length;
  if (content.startsWith('<>', i)) return scanAstroJsxChildren(content, i + 2, '', reads);
  let j = i + 1;
  let name = '';
  while (j < len && /[A-Za-z0-9_.:$-]/.test(content[j])) {
    name += content[j];
    j++;
  }
  const rawText = name.toLowerCase() === 'script' || name.toLowerCase() === 'style';
  // Attributes until '>' (a `/>` self-closes the element).
  let selfClosing = false;
  let done = false;
  while (j < len && !done) {
    const c = content[j];
    if (/\s/.test(c)) {
      j++;
      continue;
    }
    if (c === '/' && content[j + 1] === '>') {
      selfClosing = true;
      j += 2;
      done = true;
      break;
    }
    if (c === '>') {
      j++;
      done = true;
      break;
    }
    if (c === '"' || c === "'") {
      j = skipAstroQuoted(content, j);
      continue;
    }
    if (c === '{') {
      const inner = scanAstroExpr(content, j);
      reads.push(...inner.reads);
      j = inner.next;
      continue;
    }
    j++;
  }
  if (selfClosing) return { reads, next: j };
  if (rawText) {
    const close = content.toLowerCase().indexOf(`</${name.toLowerCase()}`, j);
    if (close < 0) return { reads, next: len };
    const gt = content.indexOf('>', close);
    return { reads, next: gt < 0 ? len : gt + 1 };
  }
  return scanAstroJsxChildren(content, j, name, reads);
}

/** Children of the JSX element `name` ('' for fragments): text, `{expr}`,
 * nested elements — until the matching `</name>`. Nested elements recurse
 * whole (scanAstroJsx consumes through their own close tag), so same-name
 * nesting needs no element stack. */
function scanAstroJsxChildren(
  content: string,
  j: number,
  name: string,
  reads: AstroTemplateRead[],
): { reads: AstroTemplateRead[]; next: number } {
  const len = content.length;
  while (j < len) {
    const c = content[j];
    if (content.startsWith('<!--', j)) {
      const e = content.indexOf('-->', j + 4);
      j = e < 0 ? len : e + 3;
      continue;
    }
    if (c === '{') {
      const inner = scanAstroExpr(content, j);
      reads.push(...inner.reads);
      j = inner.next;
      continue;
    }
    if (c === '<') {
      if (content.startsWith('</', j)) {
        let k = j + 2;
        while (k < len && /[A-Za-z0-9_.:$-]/.test(content[k])) k++;
        const closeName = content.slice(j + 2, k);
        const gt = content.indexOf('>', k);
        if (closeName === name) return { reads, next: gt < 0 ? len : gt + 1 };
        j = gt < 0 ? len : gt + 1; // mismatched close: skip past and keep scanning
        continue;
      }
      const inner = scanAstroJsx(content, j);
      reads.push(...inner.reads);
      j = inner.next;
      continue;
    }
    j++;
  }
  return { reads, next: j }; // unterminated element: consume the rest
}

/** Advance past a markup `<tag …>` / `</tag>` at j (quoted values and unquoted
 * text skipped; `attr={expr}` values scanned). Children and raw-text elements
 * are handled by the caller's main loop. */
function scanAstroMarkupTag(content: string, j: number, reads: AstroTemplateRead[]): number {
  const len = content.length;
  let i = j + 1;
  if (content[i] === '/') i++; // closing tag: skip straight to '>'
  while (i < len) {
    const c = content[i];
    if (c === '>') return i + 1;
    if (c === '"' || c === "'") {
      i = skipAstroQuoted(content, i);
      continue;
    }
    if (c === '{') {
      const inner = scanAstroExpr(content, i);
      reads.push(...inner.reads);
      i = inner.next;
      continue;
    }
    i++;
  }
  return i;
}

/**
 * Identifier reads across the template portion of an astro file (starting at
 * the index just past the closing `---` fence): text interpolations, markup
 * attribute expressions, JSX-in-expression regions — raw `<script>`/`<style>`
 * bodies, HTML comments, and quoted attribute values are never scanned.
 */
export function scanAstroTemplateReads(content: string, templateStart: number): AstroTemplateRead[] {
  const reads: AstroTemplateRead[] = [];
  const len = content.length;
  let j = templateStart;
  while (j < len) {
    const c = content[j];
    if (content.startsWith('<!--', j)) {
      const e = content.indexOf('-->', j + 4);
      j = e < 0 ? len : e + 3;
      continue;
    }
    if (c === '{') {
      const inner = scanAstroExpr(content, j);
      reads.push(...inner.reads);
      j = inner.next;
      continue;
    }
    if (c === '<') {
      // Raw-text elements: `<script …>…</script>` / `<style …>…</style>` bodies
      // are client-side code — never scanned for module-scope reads.
      const m = /^<([A-Za-z][A-Za-z0-9-]*)/.exec(content.slice(j));
      if (m && (m[1].toLowerCase() === 'script' || m[1].toLowerCase() === 'style')) {
        const openGt = content.indexOf('>', j);
        if (openGt < 0) break;
        const close = content.toLowerCase().indexOf(`</${m[1].toLowerCase()}`, openGt + 1);
        if (close < 0) break;
        const gt = content.indexOf('>', close);
        j = gt < 0 ? len : gt + 1;
        continue;
      }
      j = scanAstroMarkupTag(content, j, reads);
      continue;
    }
    j++;
  }
  return reads;
}

/**
 * Row-8 remainder (template SCOPE): after the frontmatter walk, create the
 * file's AstroTemplate scope — child of the module scope the walk opened — and
 * emit a Read occurrence per template identifier, so the binder's scope chain
 * resolves `lang` in `lang={lang}` to the frontmatter const. parseFile calls
 * this for every .astro file with a frontmatter fence; files without one have
 * no module scope to resolve against and are left untouched.
 */
function emitAstroTemplateScope(ctx: BinderCtx, content: string, fm: { text: string; offset: number }): void {
  const after = content.slice(fm.offset + fm.text.length);
  const fence = /^\r?\n---(?:\r?\n|$)/.exec(after);
  if (!fence) return;
  const tplStart = fm.offset + fm.text.length + fence[0].length;
  const moduleScope = ctx.scopes[0]; // the SourceFile walk always opens the module scope first
  const key = ctx.scopeKey++;
  const scopePath = 'template';
  const pathCount = (ctx.scopePathCounts.get(scopePath) ?? 0) + 1;
  ctx.scopePathCounts.set(scopePath, pathCount);
  const idPath = pathCount > 1 ? `${scopePath}~${pathCount}` : scopePath;
  const scope: ScopeNode = {
    id: `scope:${ctx.path}#${idPath}`,
    key,
    kind: ScopeKind.AstroTemplate,
    parentKey: moduleScope?.key,
    fileIdx: ctx.fileIdx,
    range: makeRange(ctx.lineIndex, tplStart, content.length),
    name: 'template',
    symbolKeys: [],
  };
  ctx.scopes.push(scope);
  for (const rd of scanAstroTemplateReads(content, tplStart)) {
    ctx.occurrences.push({
      fileIdx: ctx.fileIdx,
      range: makeRange(ctx.lineIndex, rd.start, rd.end),
      name: rd.name,
      scopeKey: key,
      role: OccurrenceRole.Read,
    });
  }
}

export function parseFile(input: ParseFileInput): ParsedFile {
  try {
    let sf: ts.SourceFile;
    let offset = 0;
    let fm: { text: string; offset: number } | null = null;
    if (input.lang === 'astro') {
      fm = splitAstroFrontmatter(input.content);
      if (!fm) {
        const ctx = newCtx(input, ts.createSourceFile(input.path, '', ts.ScriptTarget.Latest, true, ts.ScriptKind.TS), 0, buildLineIndex(input.content));
        const hashes = finishHashes(ctx);
        return { fileIdx: input.fileIdx, path: input.path, symbols: [], scopes: [], occurrences: [], imports: [], exports: [], astroGlobs: [], initTypes: [], typeScopes: [], templateTags: scanAstroTemplateTags(input.content, 0), ...hashes };
      }
      sf = ts.createSourceFile(`${input.path}.ts`, fm.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
      offset = fm.offset;
    } else {
      sf = ts.createSourceFile(input.path, input.content, ts.ScriptTarget.Latest, true, scriptKindFor(input.lang));
    }
    const ctx = newCtx(input, sf, offset, buildLineIndex(input.content));
    walk(sf, ctx);
    // Row-8 remainder: template interpolations resolve in an AstroTemplate
    // scope child of the frontmatter module scope (scope key 0).
    if (fm) emitAstroTemplateScope(ctx, input.content, fm);
    const hashes = finishHashes(ctx);
    return {
      fileIdx: input.fileIdx,
      path: input.path,
      symbols: ctx.symbols,
      scopes: ctx.scopes,
      occurrences: ctx.occurrences,
      imports: ctx.imports,
      exports: ctx.exports,
      initTypes: ctx.initTypes,
      typeScopes: ctx.typeScopes,
      ...(input.lang === 'astro'
        ? {
            templateTags: scanAstroTemplateTags(input.content, offset),
            astroGlobs: ctx.astroGlobs,
          }
        : {}),
      ...hashes,
    };
  } catch (e) {
    return {
      fileIdx: input.fileIdx,
      path: input.path,
      symbols: [],
      scopes: [],
      occurrences: [],
      imports: [],
      exports: [],
      initTypes: [],
      typeScopes: [],
      declHash: hashString(''),
      exportHash: hashString(''),
      poisoned: e instanceof Error ? e.message : String(e),
    };
  }
}