/**
 * cli.e2e.ts — `idx def` / `idx refs` end-to-end smoke, deliberately OUT of the
 * default vitest run (it spawns the compiled CLI; see watch.e2e.ts). Run after
 * `npm run idx:build`:
 *
 *   node indexer/dist/indexer/src/cli.e2e.js
 *
 * Builds a small fixture tree in a temp dir, dumps its index to a snapshot,
 * then drives the real `idx def`/`idx refs` CLI against that snapshot:
 * declaration site, reference site, extensionless needle, not-found, malformed
 * args, refs with roles, zero-ref symbol, unknown name, ambiguous duplicates.
 * CLI JSON must equal the in-process query layer answer byte for byte. Fails
 * (exit 1) on any mismatch, timeout, or leftover process.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { buildIndex } from './build.js';
import { dumpDoc } from './dump.js';
import { indexFromDoc, refsOf, resolveAt } from './query.js';
import { SymbolKind } from '../../docs/code-index-schema.js';


const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../'); // dist → 4 hops
const CLI = join(REPO_ROOT, 'indexer/dist/indexer/src/cli.js');
const FIXTURE = mkdtempSync(join(tmpdir(), 'idx-def-root-'));
const NL = String.fromCharCode(10);

function w(rel: string, body: string): void {
  const abs = join(FIXTURE, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, body, 'utf8');
}

function runCli(args: string[]): { code: number; stdout: string; stderr: string } {
  const res = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 30000 });
  assert(res.error === undefined, 'spawn failed: ' + String(res.error));
  return { code: res.status ?? 1, stdout: res.stdout, stderr: res.stderr };
}

function runRaw(args: string[]): { code: number; stdout: string; stderr: string } {
  // Direct node spawn (no idx CLI prepended) — for the gate script and any
  // other standalone tool the e2e drives.
  const res = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 60000 });
  assert(res.error === undefined, 'spawn failed: ' + String(res.error));
  return { code: res.status ?? 1, stdout: res.stdout, stderr: res.stderr };
}

// Fixture: two source files under src/ (discover whitelist) + a duplicate name.
w('.gitignore', 'node_modules/' + NL);
w('src/a.ts', [
  'export const VALUE = 1;',
  'export function greet(name: string): string {',
  "  return 'hi ' + name;",
  '}',
  'export function dup(): number {',
  '  return 0;',
  '}',
  '',
].join(NL));
const B_LINES = [
  "import { greet } from './a';",
  "const out: string = greet('world');",
  'console.log(out);',
  'export function dup(): string {',
  "  return 'other';",
  '}',
  '// comment-only line for the line-granular def test',
  '',
];
w('src/b.ts', [
  B_LINES.join(NL),
].join(NL));
// Fixture c.ts: namespace-import consumer — `a.greet` is a member call on a
// namespace import; its site must be indexed (role Property) and def at the
// member must chase to the definition (the surfaces/master.ts pattern).
w('src/c.ts', [
  "import * as a from './a';",
  'export function run(): string {',
  "  return a.greet('ns');",
  '}',
].join(NL));

// In-process index = the oracle the CLI output must match.
const root = buildIndex(FIXTURE);
const doc = dumpDoc(root);
const SNAP = join(FIXTURE, 'snap.json');
writeFileSync(SNAP, JSON.stringify(doc), 'utf8');
const index = indexFromDoc(doc);
const fileA = doc.files.find((f) => f.path.endsWith('src/a.ts'));
const fileB = doc.files.find((f) => f.path.endsWith('src/b.ts'));
assert(fileA && fileB, 'fixture files must be discovered');
const greetSym = index.doc.symbols.find((s) => s.name === 'greet');
assert(greetSym, 'greet must be indexed');
const dupSyms = index.doc.symbols.filter((s) => s.name === 'dup');
assert.equal(dupSyms.length, 2, 'two dup declarations expected');
const greetRefs = refsOf(index, greetSym.id).references;
assert(greetRefs.length >= 1, 'greet must be referenced by b.ts');
const decl = greetSym.decls[0];
const declPath = fileA.path;
const refSite = greetRefs[0];

// 1. def at a declaration site: CLI JSON equals the in-process resolveAt view.
const oracleDecl = resolveAt(index, declPath, decl.startLine, decl.startChar);
const cliDecl = runCli(['def', declPath + ':' + decl.startLine + ':' + decl.startChar, '--snapshot', SNAP, '--json']);
assert.equal(cliDecl.code, 0, 'def at decl site must exit 0: ' + cliDecl.stderr);
assert.equal(cliDecl.stdout.trim(), JSON.stringify(oracleDecl, null, 2), 'def --json must equal resolveAt');

// 2. def with an extensionless needle reaches the same symbol (file probing).
const probeNeedle = 'src/a';
const cliProbe = runCli(['def', probeNeedle + ':' + decl.startLine + ':' + decl.startChar, '--snapshot', SNAP, '--json']);
assert.equal(cliProbe.code, 0, 'def with extensionless needle must exit 0');
const probedBody = JSON.parse(cliProbe.stdout);
const oracleBody = JSON.parse(JSON.stringify(oracleDecl));
probedBody.query.file = oracleBody.query.file; // resolveAt echoes the needle asked; compare the rest
assert.deepEqual(probedBody, oracleBody, 'probed def must equal exact-path def');

// 3. def at a reference site resolves back to the referenced symbol.
const _oracleRef = resolveAt(index, refSite.file, refSite.line, refSite.char);
const cliRef = runCli(['def', refSite.file + ':' + refSite.line + ':' + refSite.char, '--snapshot', SNAP]);
assert.equal(cliRef.code, 0, 'def at ref site must exit 0');
assert(cliRef.stdout.includes(greetSym.id), 'text def must name the resolved symbol');
assert(cliRef.stdout.includes('resolvedVia:'), 'text def must show resolvedVia');

// 3b. line-granular def (char omitted): the call line answers the callee;
//     the comment-only line answers nothing and exits 1 with a hint.
const cliLine = runCli(['def', refSite.file + ':' + refSite.line, '--snapshot', SNAP, '--json']);
assert.equal(cliLine.code, 0, 'line-granular def on the call line must exit 0: ' + cliLine.stderr);
assert.equal(JSON.parse(cliLine.stdout).resolved.symId, greetSym.id, 'line-granular def must resolve the callee, not the local const');
const COMMENT_LINE = B_LINES.length - 1; // 1-based line of the comment (previously length - 2 in 0-based space)
const cliNoneLine = runCli(['def', fileB.path + ':' + COMMENT_LINE, '--snapshot', SNAP]);
assert.equal(cliNoneLine.code, 1, 'line-granular def on a comment line must exit 1');
assert(cliNoneLine.stdout.includes('no symbol on line'), 'line-granular def must print the hint');

// 4. def not-found (empty position) and unknown file: exit 1, clear message.
const cliNone = runCli(['def', declPath + ':99:0', '--snapshot', SNAP]);
assert.equal(cliNone.code, 1, 'def at empty position must exit 1');
assert(cliNone.stdout.includes('no symbol at'), 'def must print not-found');
const cliGhost = runCli(['def', 'src/no-such.ts:0:0', '--snapshot', SNAP]);
assert.equal(cliGhost.code, 1, 'def on unknown file must exit 1');
assert(cliGhost.stdout.includes('file not found'), 'def must print file-not-found');

// 5. malformed args: exit 1 with a usage hint on stderr/stdout.
const cliBad = runCli(['def', 'src/a', '--snapshot', SNAP]);
assert.equal(cliBad.code, 1, 'def without :line must exit 1');
assert(cliBad.stderr.includes('expected <file>:<line>'), 'def must print the parse hint on stderr');

// 6. refs by exact name: exit 0, every site with a numeric role and file/range.
const refsOracle = refsOf(index, greetSym.id);
const cliRefs = runCli(['refs', 'greet', '--snapshot', SNAP, '--json']);
assert.equal(cliRefs.code, 0, 'refs must exit 0: ' + cliRefs.stderr);
assert.equal(cliRefs.stdout.trim(), JSON.stringify(refsOracle, null, 2), 'refs --json must equal refsOf');
assert.equal(typeof refsOracle.references[0].role, 'number', 'role must be the numeric schema constant');
const cliRefsText = runCli(['refs', 'greet', '--snapshot', SNAP]);
assert(cliRefsText.stdout.includes('role '), 'refs text must list role per site');

// 7. found but unreferenced symbol: exit 0 with no references.
const cliNoRefs = runCli(['refs', 'VALUE', '--snapshot', SNAP]);
assert.equal(cliNoRefs.code, 0, 'unreferenced symbol must still exit 0');
assert(cliNoRefs.stdout.includes('no references'), 'refs text must say no references');

// 8. unknown name: exit 1. Ambiguous duplicates: exit 1, both candidates shown.
const cliMiss = runCli(['refs', 'zzz-no-such', '--snapshot', SNAP]);
assert.equal(cliMiss.code, 1, 'unknown name must exit 1');
assert(cliMiss.stdout.includes('symbol not found'), 'refs must say not found');
const cliAmb = runCli(['refs', 'dup', '--snapshot', SNAP, '--json']);
assert.equal(cliAmb.code, 1, 'ambiguous name must exit 1');
const ambBody = JSON.parse(cliAmb.stdout) as { found: boolean; ambiguous: boolean; candidates: unknown[] };
assert.equal(ambBody.found, false);
assert.equal(ambBody.ambiguous, true);
assert.equal(ambBody.candidates.length, 2, 'both dup declarations must be listed');

// 9. def at an import specifier chases to the definition (via resolvedVia import).
const bBinding = doc.symbols.find((s) => s.name === 'greet' && s.kind === SymbolKind.ImportBinding && s.fileIdx === fileB.idx);
assert(bBinding, 'greet must be imported by b.ts (ImportBinding row present)');
const importDecl = bBinding.decls[0];
const oracleImport = resolveAt(index, fileB.path, importDecl.startLine, importDecl.startChar);
assert.equal(oracleImport.resolved?.symId, greetSym.id, 'in-process oracle must chase the import specifier to the definition');
assert.equal(oracleImport.resolved?.resolvedVia, 'import');
const cliImport = runCli(['def', fileB.path + ':' + importDecl.startLine + ':' + importDecl.startChar, '--snapshot', SNAP, '--json']);
assert.equal(cliImport.code, 0, 'def at import specifier must exit 0: ' + cliImport.stderr);
assert.equal(cliImport.stdout.trim(), JSON.stringify(oracleImport, null, 2), 'def --json at an import specifier must equal resolveAt');
const cliImportText = runCli(['def', fileB.path + ':' + importDecl.startLine + ':' + importDecl.startChar, '--snapshot', SNAP]);
assert(cliImportText.stdout.includes(greetSym.id), 'text def at import specifier names the target definition');

// 10. refs on a defined name include its import sites alongside usage refs.
const refsBody = JSON.parse(cliRefs.stdout) as { references: unknown[]; imports: Array<{ file: string; decls: Array<{ l: number; c: number }> }> };
assert.equal(refsBody.imports.length, 1, 'greet definition must list its single import site');
assert(refsBody.imports[0].file.endsWith('src/b.ts'), 'the import site is b.ts');
assert(refsBody.imports[0].decls.length >= 1, 'the site carries the specifier decl position');
const cliRefsText2 = runCli(['refs', 'greet', '--snapshot', SNAP]);
assert(cliRefsText2.stdout.includes('import site(s):'), 'refs text must list import sites');
assert(cliRefsText2.stdout.includes('(import specifier)'), 'import-site lines are labelled');

// 11. namespace-member call sites (import * as a; a.greet(...)) are indexed:
//     refs lists the member site with the Property role, and def at that
//     position chases through the namespace import to the definition.
const fileC = doc.files.find((f) => f.path.endsWith('src/c.ts'));
assert(fileC, 'ns consumer file must be discovered');
const nsRefRow = refsOf(index, greetSym.id).references.find((r) => r.file === fileC.path);
assert(nsRefRow, 'greet must be referenced through the namespace member call in c.ts');
assert.equal(nsRefRow.role, 5, 'namespace member sites carry the Property role');
assert.equal(nsRefRow.line, 3, 'the member site sits on the call line (1-based editor line)');
const oracleNs = resolveAt(index, fileC.path, nsRefRow.line, nsRefRow.char);
assert.equal(oracleNs.resolved?.symId, greetSym.id, 'def at the namespace member must chase to the definition');
assert.equal(oracleNs.resolved?.resolvedVia, 'import');
const cliNs = runCli(['def', fileC.path + ':' + nsRefRow.line + ':' + nsRefRow.char, '--snapshot', SNAP, '--json']);
assert.equal(cliNs.code, 0, 'def at namespace member must exit 0: ' + cliNs.stderr);
assert.equal(cliNs.stdout.trim(), JSON.stringify(oracleNs, null, 2), 'def --json at namespace member must equal resolveAt');
const cliNsRefs = runCli(['refs', 'greet', '--snapshot', SNAP, '--json']);
assert(JSON.parse(cliNsRefs.stdout).references.some((r: { file: string; role: number }) => r.file === fileC.path && r.role === 5), 'refs must list the namespace member site');

// 12. impact (the rename/impact answer over the refs name resolution):
//     definition + every site + the affected file set; --gate N exits 2
//     when the file set exceeds N; ambiguous/unknown names exit 1.
const cliImp = runCli(['impact', 'greet', '--snapshot', SNAP, '--json']);
assert.equal(cliImp.code, 0, 'impact must exit 0: ' + cliImp.stderr);
const impBody = JSON.parse(cliImp.stdout) as { symId: string; siteCount: number; roleBreakdown: Record<string, number>; files: string[] };
assert.equal(impBody.symId, greetSym.id);
assert.equal(impBody.siteCount, 2, 'b.ts call + c.ts namespace-member call');
assert.deepEqual(impBody.roleBreakdown, { '3': 1, '5': 1 }, 'role breakdown pins call + member sites');
assert(impBody.files.some((f) => f.endsWith('src/a.ts')) && impBody.files.some((f) => f.endsWith('src/b.ts')) && impBody.files.some((f) => f.endsWith('src/c.ts')), 'affected file set = a, b, c');
assert.equal(impBody.files.length, 3);
const cliGate = runCli(['impact', 'greet', '--gate', '2', '--snapshot', SNAP]);
assert.equal(cliGate.code, 2, 'gate below the file count must exit 2');
const cliGateOk = runCli(['impact', 'greet', '--gate', '3', '--snapshot', SNAP]);
assert.equal(cliGateOk.code, 0, 'gate at the file count must exit 0');
const cliImpAmb = runCli(['impact', 'dup', '--snapshot', SNAP]);
assert.equal(cliImpAmb.code, 1, 'ambiguous impact must exit 1');
assert(cliImpAmb.stdout.includes('ambiguous'), 'impact must print the candidates');
const cliImpMiss = runCli(['impact', 'zzz-no-such', '--snapshot', SNAP]);
assert.equal(cliImpMiss.code, 1, 'unknown impact must exit 1');

// 13. the CI drift gate (idx:gate): per-symbol config, one build, exit 1
//     on exceed or ambiguity, 0 within gate.
const GATE_SCRIPT = join(REPO_ROOT, 'indexer/scripts/impact-gate.mjs');
const gateCfg = join(FIXTURE, 'gate.json');
writeFileSync(gateCfg, JSON.stringify({ entries: [{ name: 'greet', gate: 2, note: 'synthetic' }] }), 'utf8');
const cliDriftFail = runRaw([GATE_SCRIPT, '--root', FIXTURE, '--config', gateCfg]);
assert.equal(cliDriftFail.code, 1, 'gate below the file count must fail: ' + cliDriftFail.stderr);
assert(cliDriftFail.stdout.includes('FAIL greet'), 'gate must name the failing symbol');
writeFileSync(gateCfg, JSON.stringify({ entries: [{ name: 'greet', gate: 3 }] }), 'utf8');
const cliDriftOk = runRaw([GATE_SCRIPT, '--root', FIXTURE, '--config', gateCfg]);
assert.equal(cliDriftOk.code, 0, 'gate at the file count must pass: ' + cliDriftOk.stderr);
writeFileSync(gateCfg, JSON.stringify({ entries: [{ name: 'dup', gate: 3 }] }), 'utf8');
const cliDriftAmb = runRaw([GATE_SCRIPT, '--root', FIXTURE, '--config', gateCfg]);
assert.equal(cliDriftAmb.code, 1, 'ambiguous gate entry must fail');
assert(cliDriftAmb.stderr.includes('exactly one definition'), 'gate must explain the ambiguity');


rmSync(FIXTURE, { recursive: true, force: true });console.log('cli.e2e: all def/refs assertions passed');
