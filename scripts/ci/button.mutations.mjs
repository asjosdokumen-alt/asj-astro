/**
 * button.mutations.mjs — proves `button.test.ts` can actually FAIL.
 *
 * A test never observed red is a hypothesis, not evidence (asj-session-rules R5).
 * This battery breaks Button.astro in five ways, each corresponding to one
 * documented invariant, and asserts that the matching assertion goes red. It
 * restores the original after every mutation and finally verifies the file is
 * byte-identical to the backup.
 *
 * Each mutation asserts it found EXACTLY ONE match before writing, so a mutation
 * that misses its target fails loudly instead of reporting a false SURVIVED.
 *
 * Usage: node scripts/ci/button.mutations.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = 'src/components/ui/Button.astro';
const original = readFileSync(FILE, 'utf8');

/** Each mutation: {name, from, to, expect} — `expect` is a substring of the failing test. */
const MUTATIONS = [
  {
    name: 'M1 — primary loses its white text (contrast pairing breaks)',
    from: "primary: 'bg-pink-600 hover:bg-pink-700 text-white'",
    to: "primary: 'bg-pink-600 hover:bg-pink-700'",
    expect: 'primary is the pink-600 tier',
  },
  {
    name: 'M2 — hover INVERTS to a lighter tier (the pre-existing defect)',
    from: "primary: 'bg-pink-600 hover:bg-pink-700 text-white'",
    to: "primary: 'bg-pink-600 hover:bg-pink-500 text-white'",
    expect: 'darkens on hover',
  },
  {
    name: 'M3 — a variant paints bg-accent, the LIGHT text accent, as a solid fill',
    from: 'const VARIANT_CLASS = {',
    to: "const VARIANT_CLASS = {\n  __decoy: 'bg-accent text-white',",
    expect: 'no variant paints a bg-accent surface',
  },
  {
    name: 'M4 — touch target drops below the 44px floor',
    from: "md: 'min-h-[44px] px-5 py-2.5 text-body-sm'",
    to: "md: 'px-5 py-2 text-body-sm'",
    expect: '44px touch minimum',
  },
  {
    name: 'M5 — the label disappears while loading',
    // The anchor and button branches carry identical lines, so this mutation is
    // declared `all: true` and applied to BOTH. Matching only one would leave a
    // branch that still satisfies the assertion, and the mutation would appear
    // to survive for a reason that has nothing to do with the invariant.
    all: true,
    from: '<slot />',
    to: '',
    expect: 'keeps the label visible while loading',
  },
  {
    name: 'M6 — an arbitrary radius literal is introduced',
    from: "rounded-control ' +",
    to: "rounded-[2rem] ' +",
    expect: 'never invents a radius literal',
  },
  {
    name: 'M7 — the click handler is dropped from the anchor branch only',
    // Must match the ANCHOR branch alone: both branches end with the handler,
    // so the `</a>` that follows is what makes this unique. Without it the
    // mutation matches twice and is NOT-APPLIED, which would hide a real
    // regression behind a harness complaint.
    all: false,
    from: '      onclick={aOnClick}\n    >\n      {iconName ? <Icon name={iconName} spin={loading} label={iconLabel} /> : null}\n      <slot />\n    </a>',
    to: '    >\n      {iconName ? <Icon name={iconName} spin={loading} label={iconLabel} /> : null}\n      <slot />\n    </a>',
    expect: 'applies the dispatched-event handler on both elements',
  },
];

const RESULTS = [];

for (const m of MUTATIONS) {
  const count = original.split(m.from).length - 1;
  const expected = m.all ? count : 1;
  if (count < 1 || (!m.all && count !== 1)) {
    RESULTS.push({ name: m.name, verdict: `NOT-APPLIED (${count} matches, expected ${expected})` });
    continue;
  }
  const mutated = m.all
    ? original.split(m.from).join(m.to)
    : original.replace(m.from, m.to);
  writeFileSync(FILE, mutated);
  const { status, output } = await runTests();
  writeFileSync(FILE, original);

  const caught = status !== 0 && output.includes(m.expect);
  RESULTS.push({
    name: m.name,
    verdict: caught ? 'KILLED' : status === 0 ? 'SURVIVED' : 'WRONG-FAILURE',
    // On a wrong failure, show the failing test names — a bare "it failed but
    // for another reason" is exactly the ambiguity this battery exists to end.
    detail: caught ? '' : output.split('\n').filter((l) => l.includes('FAIL')).slice(0, 3).join(' | '),
  });
}

// The file must be exactly as it was. A battery that leaves the tree mutated is
// worse than no battery: the next run measures litter.
writeFileSync(FILE, original);
const restored = readFileSync(FILE, 'utf8') === original;

console.log('\nbutton.mutations — verdict per mutation');
console.log('-'.repeat(70));
for (const r of RESULTS) {
  console.log(`  ${r.verdict.padEnd(14)} ${r.name}`);
  if (r.detail) console.log(`                 ${r.detail}`);
}
console.log('-'.repeat(70));
const killed = RESULTS.filter((r) => r.verdict === 'KILLED').length;
console.log(`killed ${killed}/${MUTATIONS.length} · restored=${restored}`);

if (killed !== MUTATIONS.length || !restored) {
  console.log('BATTERY RED — at least one mutation survived or the tree was not restored.');
  process.exit(1);
}
console.log('BATTERY GREEN — every mutation was caught, tree restored.');

async function runTests() {
  const { spawnSync } = await import('node:child_process');
  // Invoke vitest's JS entry point directly with the running node binary.
  //
  // DO NOT use `npx` / `npx.cmd` here. MEASURED on this machine (Node 24,
  // Windows): `spawnSync('npx.cmd', …)` fails with `EINVAL` — Node refuses to
  // spawn a `.cmd` without `shell: true` — and it fails SILENTLY as far as this
  // battery is concerned: stdout and stderr are both empty and `status` is
  // `null`. Every mutation then scores WRONG-FAILURE (not zero, not caught),
  // which reads like a broken test file rather than a broken harness. Routing
  // through a JS entry removes the shell and the platform question with it.
  const vitest = join(process.cwd(), 'node_modules/vitest/vitest.mjs');
  const r = spawnSync(
    process.execPath,
    [vitest, 'run', '--project', 'frontend', 'src/components/ui/button.test.ts'],
    { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } },
  );
  return { status: r.status, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}
