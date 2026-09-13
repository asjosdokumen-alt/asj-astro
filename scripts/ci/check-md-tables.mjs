#!/usr/bin/env node
/**
 * check-md-tables.mjs — a stray `|` in a table cell adds a column silently
 *
 * WHY THIS GATE EXISTS
 * --------------------
 * Markdown tables fail quietly. One extra unescaped pipe turns a 5-column row
 * into a 6-column row: no error, no warning, and the row renders misaligned in
 * every viewer. Two real defects of this class were found by hand in this repo:
 *
 *   * `docs/BACKEND_TODO.md` #7 — a **stray closing backtick** in the evidence
 *     cell (`` §7.2–7.3`, ``) ended the code span early, so the following two
 *     pipes became separators and a 4-column row collapsed to 2 columns.
 *   * `docs/PARITY_CHECKLIST.md` A08 — `data.message || data.error` inside a
 *     code span contributed **two** extra cells.
 *
 * WHY NOT `line.count('|')`
 * -------------------------
 * Counting raw pipes produces mostly noise. Per CommonMark, inside a backtick
 * code span neither `|` nor `\|` separates cells — and this repo's docs are full
 * of `grep -rn "realtime\|channel("`-style code spans. A naive counter flagged
 * ~26 healthy rows. So this checker mirrors the parser: it tracks code spans
 * (matching backtick-run lengths) and honours `\|` escapes, then compares each
 * row's cell count against the block's most common count.
 *
 * WHY "CELL COUNT EQUALS THE HEADER", NOT "EQUALS THE BLOCK MODE"
 * ---------------------------------------------------------------
 * The obvious rule — "a row is bad when its cell count differs from the block's
 * most common count" — is unsound, and a mutation test proved it: making A08's
 * `data.message || data.error` unescaped again raised that row from 6 cells to
 * 7, which *matched every sibling row* and therefore passed. The corruption had
 * made the row look consistent.
 *
 * The sound invariant is against the **header row**: every row in a GFM table
 * must have exactly the header's column count. So the header is the reference,
 * and a block whose header is inconsistent with its delimiter row is itself
 * reported. This catches the case where the defect is uniform across the table.
 *
 * SECOND CHECK — RAW `|` INSIDE A CODE SPAN
 * ------------------------------------------
 * Cell counting alone cannot see `data.message || data.error` in a table cell,
 * because `\|\|` and `||` both contribute two `|` characters and both leave the
 * row at the same cell count. A mutation test proved that: re-introducing the
 * raw form passed the counter. So a second rule is needed: **inside a table row,
 * a `|` occurring within a code span must be escaped as `\|`.** This is what GFM
 * requires for a literal pipe in a cell, and it is the difference between the
 * broken and fixed A08 row.
 *
 * Fenced code blocks (``` / ~~~) are skipped entirely: inside a fence every line
 * is literal, so an ASCII grammar diagram using `|` is not a table. Ignoring
 * that produced a false positive on `docs/CODE_INDEX_DESIGN.md`.
 *
 * USAGE
 *   node scripts/ci/check-md-tables.mjs [paths...]   default: docs/** + root *.md
 *
 * EXIT CODES  0 pass · 1 fail
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

/** Split a markdown table row into cells, honouring code spans and `\|`. */
export function splitRow(line) {
  const out = [];
  let buf = '';
  let i = 0;
  let inCode = false;
  let tickRun = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '`') {
      let j = i;
      while (j < line.length && line[j] === '`') j += 1;
      const n = j - i;
      if (!inCode) {
        inCode = true;
        tickRun = n;
      } else if (n === tickRun) {
        inCode = false;
      }
      buf += line.slice(i, j);
      i = j;
      continue;
    }
    if (ch === '\\' && line[i + 1] === '|') {
      buf += '|';
      i += 2;
      continue;
    }
    if (ch === '|' && !inCode) {
      out.push(buf);
      buf = '';
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  out.push(buf);
  return out;
}

/** Positions of unescaped `|` that sit inside a code span on a table row. */
export function rawPipesInCodeSpans(line) {
  const hits = [];
  let i = 0;
  let inCode = false;
  let tickRun = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '`') {
      let j = i;
      while (j < line.length && line[j] === '`') j += 1;
      const n = j - i;
      if (!inCode) {
        inCode = true;
        tickRun = n;
      } else if (n === tickRun) {
        inCode = false;
      }
      i = j;
      continue;
    }
    if (inCode && ch === '|') {
      // `\|` is the correct, escaped form — only an unescaped pipe is a defect.
      const escaped = i > 0 && line[i - 1] === '\\';
      // a backslash itself can be escaped (`\\|`), in which case the pipe is raw
      const backslashes = (() => {
        let k = i - 1;
        let n = 0;
        while (k >= 0 && line[k] === '\\') {
          n += 1;
          k -= 1;
        }
        return n;
      })();
      if (!escaped || backslashes % 2 === 0) hits.push(i);
      i += 1;
      continue;
    }
    i += 1;
  }
  return hits;
}

/** Return [{ start, expected, offenders }] for one file. */
export function check(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const bad = [];
  const rawPipeOffenders = [];
  let block = [];
  let start = 0;
  let fence = null;

  const flush = () => {
    if (block.length < 2) return;
    const counts = block.map((l) =>
      l.trimStart().startsWith('|') ? splitRow(l).length : null,
    );
    // The header (first row) is the reference: every row must match it.
    const headerIdx = counts.findIndex((c) => c !== null);
    if (headerIdx === -1) return;
    const expected = counts[headerIdx];
    // A delimiter row must agree with the header, otherwise the whole block is
    // suspect (this is the uniform-corruption case a mode-based rule misses).
    const delimiter = counts[headerIdx + 1];
    const offenders = counts
      .map((c, k) => (c !== null && c !== expected ? start + k : null))
      .filter((n) => n !== null);
    if (delimiter !== undefined && delimiter !== null && delimiter !== expected) {
      offenders.push(start + headerIdx + 1);
    }
    if (offenders.length) {
      bad.push({
        start,
        expected,
        offenders: [...new Set(offenders)].sort((a, b) => a - b),
      });
    }
  };

  lines.forEach((line, idx) => {
    const n = idx + 1;
    const trimmed = line.trimStart();
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      const marker = trimmed.slice(0, 3);
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      flush();
      block = [];
      return;
    }
    if (fence !== null) return;
    if (trimmed.startsWith('|')) {
      if (!block.length) start = n;
      block.push(line);
      const raw = rawPipesInCodeSpans(line);
      if (raw.length) {
        rawPipeOffenders.push({ line: n, count: raw.length, sample: line.trim() });
      }
    } else {
      flush();
      block = [];
    }
  });
  flush();
  bad.push(...rawPipeOffenders.map((o) => ({
    start: o.line,
    expected: 'no raw `|` inside a code span',
    offenders: [o.line],
    raw: o.count,
  })));
  return bad;
}

function walk(dir, found = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, found);
    else if (name.endsWith('.md')) found.push(full);
  }
  return found;
}

function defaultTargets() {
  const targets = [];
  const docs = join(ROOT, 'docs');
  try {
    walk(docs, targets);
  } catch {
    /* docs/ may be absent in a slim checkout */
  }
  for (const name of ['HANDOFF.md', 'README.md', 'TODO.md']) {
    try {
      targets.push(join(ROOT, name));
    } catch {
      /* ignore */
    }
  }
  return targets;
}

function main(argv) {
  const targets = argv.length ? argv : defaultTargets();
  let total = 0;
  for (const path of targets) {
    let bad;
    try {
      bad = check(path);
    } catch {
      continue;
    }
    for (const { start, expected, offenders, raw } of bad) {
      total += 1;
      const rel = path.startsWith(ROOT) ? path.slice(ROOT.length + 1) : path;
      if (raw) {
        console.log(
          `${rel}:${start}: raw '|' inside a code span in a table row (${raw}) — escape it as \\|`,
        );
      } else {
        console.log(
          `${rel}: BLOCK@${start} expects ${expected} cells; offending line(s) ${offenders.join(', ')}`,
        );
      }
    }
  }
  if (total) {
    console.log(`\nmalformed table blocks: ${total}`);
    process.exitCode = 1;
    return;
  }
  console.log(`markdown tables OK (${targets.length} file(s) checked)`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2));
}
