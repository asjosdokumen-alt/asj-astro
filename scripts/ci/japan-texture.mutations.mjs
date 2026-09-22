#!/usr/bin/env node
/**
 * JapanTexture mutation battery — proves the test file can fail.
 *
 * R5: a check never observed red is a hypothesis. Each mutation below breaks the
 * component in a way the suite claims to catch; a SURVIVED verdict is a hole in
 * the test, not a pass.
 *
 * Run: node scripts/ci/japan-texture.mutations.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const TARGET = join(ROOT, 'src/components/public/JapanTexture.astro');
const SUITE = 'src/components/public/JapanTexture.test.ts';

const original = readFileSync(TARGET, 'utf8');

/**
 * Replace exactly one occurrence. Asserting the count is what stops a mutation
 * whose target text moved (CRLF, reword) from silently applying nothing and
 * being scored as a survivor — or worse, as a kill.
 */
function apply(from, to) {
  const parts = original.split(from);
  if (parts.length !== 2) {
    throw new Error(`NOT-APPLIED (${parts.length - 1} matches): ${JSON.stringify(from.slice(0, 60))}`);
  }
  writeFileSync(TARGET, parts.join(to));
}

function runSuite() {
  try {
    const out = execFileSync('node', ['node_modules/vitest/vitest.mjs', 'run', SUITE], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { failed: false, out };
  } catch (err) {
    return { failed: true, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

const MUTATIONS = [
  {
    id: 'M1',
    what: 'add a heading to the root (would become a second h1 on /)',
    apply: () => apply('<div class={classes}', '<h2 class="sr-only">Kondisi</h2>\n<div class={classes}'),
    expect: /no heading|<h2>/i,
  },
  {
    id: 'M2',
    what: 'drop aria-hidden (texture becomes content)',
    apply: () => apply(' aria-hidden="true"', ''),
    expect: /aria-hidden/i,
  },
  {
    id: 'M3',
    what: 'drop motion-reduce:animate-none from the petal',
    apply: () => apply(' animate-fade-in motion-reduce:animate-none', ' animate-fade-in'),
    expect: /animated|motion/i,
  },
  {
    id: 'M4',
    what: 'hard-code the pattern id, so every motif paints asanoha',
    // The target text is the component's SOURCE, not an evaluated expression, so
    // it is built from character codes: `noTemplateCurlyInString` fires on any
    // `${` in a quoted string, and `useTemplate` fires on the `a + b` form used
    // to dodge it. Either one is new debt under the lint ratchet.
    apply: () => apply(String.fromCharCode(105, 100, 61, 123, 96, 106, 112, 45, 36, 123, 109, 111, 116, 105, 102, 125, 96, 125), 'id="jp-asanoha"'),
    expect: /derived|jp-/i,
  },
  {
    id: 'M5',
    what: 'make normal LIGHTER than faint (weight lookup inverted)',
    apply: () => apply('normal: 0.11', 'normal: 0.02'),
    expect: /heavier|greater/i,
  },
  {
    id: 'M6',
    what: 'sneak score vocabulary in',
    apply: () => apply('data-japan-texture={motif}', 'data-japan-texture={motif}\n  data-skor="0"'),
    expect: /skor|score/i,
  },
  {
    id: 'M7',
    what: 'make the layer swallow clicks',
    apply: () => apply('pointer-events-none', 'pointer-events-auto'),
    expect: /inert|pointer-events/i,
  },
  {
    id: 'M8',
    what: 'move the animation out of the sakura branch (every motif animates)',
    apply: () =>
      apply(
        "  {\n    motif === 'sakura' && (\n      <div\n        class=\"absolute inset-0 animate-fade-in motion-reduce:animate-none\"",
        "  <div class=\"absolute inset-0 animate-fade-in motion-reduce:animate-none\" data-x=\"1\" />\n  {\n    false && (\n      <div\n        class=\"absolute inset-0\"",
      ),
    expect: /sakura/i,
  },
];

let killed = 0;
let survived = 0;
const problems = [];

for (const m of MUTATIONS) {
  try {
    m.apply();
  } catch (err) {
    console.log(`  ${m.id}  NOT-APPLIED   ${m.what}`);
    console.log(`       ${err.message}`);
    problems.push(`${m.id} did not apply`);
    writeFileSync(TARGET, original);
    continue;
  }

  const res = runSuite();
  if (!res.failed) {
    console.log(`  ${m.id}  SURVIVED      ${m.what}   <-- TEST HOLE`);
    survived++;
    problems.push(`${m.id} survived`);
  } else if (/Startup Error|Failed to load custom Reporter/.test(res.out)) {
    // A harness that dies at startup exits non-zero for EVERY mutation, which
    // would score as 8 kills. That is precisely what happened on the first run
    // of this file: vitest 4 removed `--reporter=basic`, so the CLI aborted
    // before loading a single test and all 8 mutations reported WRONG-FAILURE
    // with no assertion text. Treat a startup failure as a harness defect.
    console.log(`  ${m.id}  HARNESS-ERROR ${m.what}`);
    problems.push(`${m.id}: vitest did not start`);
  } else if (m.expect.test(res.out)) {
    console.log(`  ${m.id}  KILLED        ${m.what}`);
    killed++;
  } else {
    // Red for the wrong reason is not a kill — that is a different failure than
    // the one the mutation was designed to provoke.
    console.log(`  ${m.id}  WRONG-FAILURE ${m.what}`);
    const reason = (res.out.match(/AssertionError:[^\n]*/) ?? ['(no assertion)'])[0];
    console.log(`       ${reason}`);
    problems.push(`${m.id} failed for an unrelated reason`);
  }

  writeFileSync(TARGET, original);
}

// Control: the restored file MUST be green. Without this, a mutation left behind
// by a crash reads as a finding on the next run — the R14 trap.
const control = runSuite();
const okGreen = !control.failed;
console.log(`\n  CONTROL  OK-GREEN   restored file passes: ${okGreen}`);
if (!okGreen) problems.push('the restored file does not pass — a mutation was left behind');

console.log(
  `\n  ${killed} killed · ${survived} survived · ${MUTATIONS.length - killed - survived} other · ${okGreen ? '1 ok-green' : '0 ok-green'}`,
);

const exact = readFileSync(TARGET, 'utf8') === original;
console.log(`  restore verified byte-for-byte: ${exact}`);
if (!exact) problems.push('restore is not byte-for-byte');

if (problems.length) {
  console.log('\nFAILED:');
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\nALL MUTATIONS KILLED.');
