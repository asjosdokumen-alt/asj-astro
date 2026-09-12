#!/usr/bin/env node
/**
 * verify-projections.mjs — fail the build on any wildcard projection.
 *
 * WHY THIS EXISTS
 *   Phase D's gate is "zero `select=*` in the codebase". The reason is measured,
 *   not stylistic: `master_database_candidate` is 169 columns / ~1.14 KB per row,
 *   and the public board reads up to 500 rows per request. `select=*` there is
 *   ~570 KB of JSON per cold read, and it silently re-appears whenever someone
 *   adds a column.
 *
 *   The runtime already refuses to put a wildcard on the wire — `supabaseJson()`
 *   resolves every read through `schema.generated.ts`, so a missing or `*`
 *   projection becomes an explicit column list. What that cannot do is tell you
 *   that a call site *asked* for a wildcard, which is the signal that the author
 *   did not know the row shape. This gate is that signal.
 *
 * WHAT IT CHECKS
 *   In every .ts/.js file under netlify/functions/ (comments excluded):
 *     · `select: '*'`  / `select: "*"`  → fail
 *     · `select: '…*…'` where the whole value is `*` → fail
 *   A named constant (`select: CAND_MAP_COLS`) or a column list
 *   (`select: 'id,no_wa'`) both pass. Use `allColumns('<table>')` when a read
 *   genuinely needs the whole row.
 *
 * USAGE
 *   node scripts/ci/verify-projections.mjs
 *   node scripts/ci/verify-projections.mjs --json report.json
 *
 * EXIT CODES
 *   0  no wildcard projections
 *   1  at least one wildcard projection
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const ROOT = join(REPO, 'netlify', 'functions');
const EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

/** Remove block comments so a documented `select: '*'` in a docblock is not a hit. */
function stripBlockComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/** True when the match sits after a `//` on the same line, i.e. inside a line comment. */
function isCommentedOut(line, index) {
  const slashes = line.indexOf('//');
  return slashes !== -1 && slashes < index;
}

const WILDCARD = /select\s*:\s*(['"`])\s*\*\s*\1/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXT.has(entry.slice(entry.lastIndexOf('.')))) out.push(full);
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const jsonAt = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : '';

  const files = walk(ROOT);
  const hits = [];

  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    const src = stripBlockComments(raw);
    const lines = src.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes('select')) continue;
      WILDCARD.lastIndex = 0;
      let m;
      while ((m = WILDCARD.exec(line)) !== null) {
        if (isCommentedOut(line, m.index)) continue;
        hits.push({ file: relative(REPO, file).replace(/\\/g, '/'), line: i + 1, text: line.trim() });
      }
    }
  }

  if (jsonAt) writeFileSync(jsonAt, JSON.stringify({ scanned: files.length, hits }, null, 2));

  if (hits.length === 0) {
    console.log(`NO WILDCARD PROJECTIONS  ${files.length} files scanned under netlify/functions/`);
    return process.exit(0);
  }

  console.error(`WILDCARD PROJECTIONS FOUND — ${hits.length} site(s)`);
  for (const h of hits) console.error(`  ${h.file}:${h.line}\n      ${h.text}`);
  console.error('');
  console.error('  Replace with a named projection from _lib/db/projections.ts, or');
  console.error("  allColumns('<table>') when the whole row is genuinely required.");
  console.error('  Background: docs/PHASE_D_DATA_LAYER.md');
  return process.exit(1);
}

main();
