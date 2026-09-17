/**
 * count-indexed.test.ts — the measurement tool the ratchet comments promise.
 *
 * WHY THIS FILE EXISTS. `indexer/src/discover.test.ts` and
 * `indexer/src/build.test.ts` both freeze a per-language inventory of the tree,
 * and both used to tell the reader to "read the counts off
 * `indexer/src/count-indexed.test.ts`". That file did not exist anywhere in the
 * repo — a comment pointing at a tool that was never committed. That is how a
 * DERIVED number (247 + 3 = 250) passed for a MEASURED one and left this ratchet
 * red at HEAD without anyone noticing (found 2026-09-18; see the phantom note in
 * both files). A promise in a comment is not a tool.
 *
 * WHAT IT IS, AND IS NOT. This is NOT the gate — the frozen numbers live in
 * discover.test.ts and build.test.ts, and this file must never be turned into a
 * second copy of them (two copies drift). It measures and PRINTS, and asserts
 * the one property that makes those frozen numbers trustworthy: the six named
 * buckets partition the inventory, so nothing can hide outside them.
 *
 * COST: zero ratchet movement. `includePath()` (indexer/src/util.ts) counts
 * src/, netlify/functions/, shared/, scripts/, e2e/ and the repo root only, so
 * nothing under indexer/ is in the inventory. `noConsole` is also "off" for
 * indexer/** in biome.json, so printing here costs no lint diagnostics either.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { discoverFiles, parseGitignore } from './discover.js';

const ROOT = process.cwd().replace(/\\/g, '/');

/** The six buckets the frozen ratchets name, in the order they name them. */
const BUCKETS = ['ts', 'tsx', 'astro', 'mjs', 'cjs', 'js'] as const;

function measure(): { total: number; byLang: Map<string, number> } {
  const files = discoverFiles({
    rootDir: ROOT,
    matcher: parseGitignore(readFileSync(`${ROOT}/.gitignore`, 'utf8')),
  });
  const byLang = new Map<string, number>();
  for (const f of files) byLang.set(f.lang, (byLang.get(f.lang) ?? 0) + 1);
  return { total: files.length, byLang };
}

describe('count-indexed (measurement tool, not a gate)', () => {
  it('prints the per-language inventory the ratchets freeze', () => {
    const { total, byLang } = measure();

    const counts = BUCKETS.map((lang) => [lang, byLang.get(lang) ?? 0] as const);
    const sum = counts.reduce((n, [, c]) => n + c, 0);
    const named = new Set<string>(BUCKETS);
    const unnamed = [...byLang.entries()].filter(([lang]) => !named.has(lang));

    // Printed so the numbers can be READ OFF rather than derived. This output is
    // the entire point of the file.
    console.log(`\n  inventory measured from ${ROOT}`);
    console.log(`  files.length = ${total}`);
    for (const [lang, n] of counts) console.log(`    ${lang} = ${n}`);
    console.log(`  sum of the six buckets = ${sum}`);
    console.log(
      `  ready to paste: ${counts.map(([l, c]) => `${c} ${l}`).join(' + ')} = ${sum}`,
    );
    if (unnamed.length > 0) console.log(`  OUTSIDE the six buckets: ${JSON.stringify(unnamed)}`);
    console.log('');

    // THE checksum. The frozen ratchets assert the individual counts; this is
    // what proves the six buckets actually PARTITION the inventory. If a seventh
    // language ever appears under a counted root, `sum` stops equalling `total`
    // and this fails — which is the signal to add a bucket, not to widen one.
    expect(unnamed).toEqual([]);
    expect(sum).toBe(total);
  });
});
