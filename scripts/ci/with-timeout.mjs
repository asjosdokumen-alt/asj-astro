#!/usr/bin/env node
/**
 * with-timeout.mjs — a wall-clock budget for a command that can hang.
 *
 * WHY THIS EXISTS
 *   Every test in this repo has a PER-TEST timeout (vitest: 15 s) and the battery
 *   runner has a PER-BATTERY one (15 min). Neither bounds the RUN. So a hang
 *   that happens between tests — or at the process level — is unbounded, and
 *   that is the shape that actually bit this repo: `vitest` with the default
 *   `pool: 'forks'` on Windows passed every test and then NEVER EXITED, so the
 *   CI job sat until GitHub cancelled it, producing a run with no useful output.
 *   `pool: 'threads'` fixed that instance. Nothing fixed the CLASS, because a
 *   timeout on the parts is not a timeout on the whole.
 *
 *   The rule this encodes: an overrun is a SYMPTOM, not a slow machine. If a run
 *   exceeds its budget, something is wrong and the right move is to kill it and
 *   say so, loudly and immediately — not to wait.
 *
 * USAGE
 *   node scripts/ci/with-timeout.mjs <minutes> -- <command> [args...]
 *
 * EXIT CODES
 *   the child's own exit code, or 124 when the budget is exceeded (the same code
 *   GNU `timeout` uses, so it is recognisable and greppable).
 *
 * WHAT IT PRINTS
 *   A banner naming the budget, the command, and the measured baseline the
 *   budget was derived from. A gate that does not say what it measured hides its
 *   own hole; this one says it up front.
 *
 * BUDGETS, AND WHERE THEY CAME FROM
 *   Every number here is a MEASURED baseline times a headroom factor — never a
 *   round number chosen to feel safe. Re-measure before changing one.
 *
 *   npm run test              budget   8 min   measured 5 m 12 s
 *                                               (164 files / 1909 tests, exit 0,
 *                                               2026-09-21). The header here used
 *                                               to read "1 m 49 s – 2 m 08 s (4
 *                                               full runs, 2026-09-18)", and that
 *                                               number was STALE by 2.4x: it
 *                                               implied 3.75x headroom when the
 *                                               tree actually has 1.54x. The
 *                                               budget itself is unchanged — it
 *                                               still fits — but the margin is far
 *                                               thinner than the doc claimed, and
 *                                               that matters because the way this
 *                                               fires is a SPURIOUS timeout that
 *                                               vitest renders as `×` marks
 *                                               indistinguishable from real test
 *                                               failures. Observed 2026-09-21: an
 *                                               8-min overrun printed exactly that,
 *                                               and the "failing" tests were green
 *                                               when run alone. The indexer's
 *                                               validate/query suites are the ones
 *                                               that blow the per-test 60 s cap
 *                                               under contention, not the code.
 *                                               Re-measure, do not raise: raising
 *                                               this to hide a red is the thing the
 *                                               paragraph above forbids.
 *   npm run verify:batteries  budget 120 min   measured ~16 min for the first
 *                                               5 of 20 hermetic batteries
 *                                               (~190 s each, so ~63 min
 *                                               extrapolated), and the runner
 *                                               already caps EACH battery at
 *                                               15 min. 120 min therefore only
 *                                               fires if several batteries hit
 *                                               their own cap or the runner
 *                                               itself stalls — not for a run
 *                                               that is merely slow.
 *
 *   EACH e2e gate is capped SEPARATELY, not through one test:e2e budget. Two
 *   reasons: `test:e2e` chains its gates with `&&` at the SHELL level, so a
 *   wrapper around it would only cover the first gate; and the repo's own rule
 *   is one gate, one verdict — a red must name which gate broke. Measured
 *   2026-09-18 against a fresh `npm run build` served by `astro preview` on
 *   127.0.0.1:4321, with all six green:
 *
 *     e2e:public        6 s  ->  3 min
 *     e2e:loker-layout  6 s  ->  3 min
 *     e2e:headings     38 s  ->  5 min   (the long one: 103 checks, 7 routes)
 *     e2e:dialog        9 s  ->  3 min
 *     e2e:drawer       11 s  ->  3 min
 *     e2e:labels       14 s  ->  3 min
 *
 *   They need a running server. Without one they fail fast rather than hang, so
 *   the budget only fires on a genuinely stuck browser.
 */
import { spawn, spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');

if (sep === -1 || sep === 0 || sep === argv.length - 1) {
  console.error(
    'usage: node scripts/ci/with-timeout.mjs <minutes> -- <command> [args...]',
  );
  process.exit(2);
}

const minutes = Number(argv[sep - 1]);
const [cmd, ...args] = argv.slice(sep + 1);

if (!Number.isFinite(minutes) || minutes <= 0) {
  console.error(`with-timeout: not a positive number of minutes: ${argv[sep - 1]}`);
  process.exit(2);
}

const budgetMs = minutes * 60_000;
const isWin = process.platform === 'win32';
const started = Date.now();

// `shell` is deliberately FALSE, and getting here cost two measured attempts.
//
// The commands this wraps are npm-bin shims on Windows (`vitest` is
// `vitest.cmd` in node_modules/.bin), and `spawn` without a shell cannot execute
// a `.cmd`: it fails ENOENT and the wrapper reports exit 127 in ~3 s while
// looking like a hung test. The obvious fix — `shell: true` — is WORSE and
// silent: cmd.exe mangles arguments containing `(`, `)`, `{`, `}` or `,`, so
// `-- node -e "setTimeout(()=>{}, 120000)"` exited 1 instantly instead of being
// killed, i.e. the watchdog stopped watching while still appearing to run.
//
// So the rule is: pass a REAL executable and its args, never a shell string.
// For an npm-bin tool, name its entry point instead of its shim — the shim only
// execs that file anyway. `vitest` -> `node node_modules/vitest/vitest.mjs`.
//
// On POSIX, `detached` makes the child a process-group leader so the WHOLE group
// can be killed. On Windows that would open a new console, so the tree is killed
// with `taskkill /T` instead.
const child = spawn(cmd, args, { stdio: 'inherit', detached: !isWin });

/** Kill the child AND its descendants. A half-killed tree leaves orphans that
 *  hold ports and locks, which is how one hang becomes the next run's mystery. */
function killTree(pid) {
  if (isWin) {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL'); // the whole group
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  const elapsedMin = ((Date.now() - started) / 60_000).toFixed(1);
  console.error('');
  console.error('='.repeat(72));
  console.error(`TIMEOUT — killed after ${elapsedMin} min (budget ${minutes} min)`);
  console.error(`  command : ${cmd} ${args.join(' ')}`);
  console.error('  An overrun is a SYMPTOM, not a slow machine. Check, in order:');
  console.error('   1. a test runner that finished but never exited (pool/teardown hang)');
  console.error('   2. a gate waiting on a server or DB that never came up');
  console.error('   3. a lock left behind by a previously killed run');
  console.error('  Do NOT raise this budget to make the red go away.');
  console.error('='.repeat(72));
  killTree(child.pid);
}, budgetMs);

// Do not orphan the child if this wrapper is interrupted.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    killTree(child.pid);
    process.exit(130);
  });
}

child.on('error', (err) => {
  clearTimeout(timer);
  console.error(`with-timeout: could not start ${cmd}: ${err.message}`);
  if (err.code === 'ENOENT') {
    console.error(
      '  This wrapper runs the command directly, with NO shell. A bare npm-bin\n' +
        '  name such as `vitest` is a .cmd shim on Windows and cannot be spawned\n' +
        '  that way. Name the real entry point instead:\n' +
        '    vitest -> node node_modules/vitest/vitest.mjs\n' +
        '  Do NOT "fix" this by adding shell: true — cmd.exe mangles arguments\n' +
        '  containing ( ) { } or , and the wrapper then fails to kill on overrun.',
    );
  }
  process.exit(127);
});

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  if (timedOut) process.exit(124);
  if (signal) {
    console.error(`with-timeout: ${cmd} was killed by ${signal}`);
    process.exit(128 + 1);
  }
  process.exit(code ?? 0);
});
