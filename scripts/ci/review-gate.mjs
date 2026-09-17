#!/usr/bin/env node
/**
 * review-gate.mjs — the enforcement point for code review in this repo.
 *
 * WHY THIS EXISTS, AND WHY IT IS LOCAL
 *   The repo already had a review standard, a PR template, CODEOWNERS and six
 *   workflows. None of them can gate a change here, for two measured reasons:
 *
 *   1. **The shipping path has no gate on it.** `deploy-production.yml` triggers
 *      on a tag (`v*`) or a manual dispatch. But the Netlify site is git-linked
 *      (`netlify.toml` carries a `[build]` block, and `.netlify/state.json` holds
 *      the site id), so pushing `main` publishes production directly. The gated
 *      path and the real path are different paths.
 *   2. **There is one reviewer.** All 347 commits come from a single author and
 *      every CODEOWNERS entry points at one handle, so "no self-merge" and
 *      "rotate reviewers" cannot execute at all.
 *
 *   Therefore the only place a review gate can actually bite is BEFORE the push.
 *   This script is that gate. It is not a replacement for CI — it runs the fast
 *   Tier-0 checks locally, and adds the review checks CI cannot express because
 *   they are about a *diff* rather than a tree.
 *
 * WHAT IT CHECKS
 *   R1  secret scan        — credentials in added lines
 *   R2  size budget        — a diff too large to review is not reviewed
 *   R3  risk attestation   — high-risk areas require an explicit, recorded answer
 *   R4  env declaration    — a new env var must be declared in .env.example
 *   R5  migration rollback — a new migration must be reversible or say it is not
 *   R6  lint on new lines  — no new violation of the hard-block rules
 *   R7  Tier-0 gates       — the fast gates CI runs, plus the local-only ones
 *
 *   R3 is the solo-review protocol made mechanical. With no second human, "a
 *   reviewer looked at it" is unfalsifiable — so instead the gate names the
 *   specific question that area demands and refuses to proceed until the operator
 *   answers it with `--ack=<group>`. The answers are echoed into the output, so
 *   the review leaves a trace even though nobody signed it.
 *
 * USAGE
 *   npm run review:gate                      # review everything not yet pushed
 *   npm run review:gate:full                 # + typecheck, boundary, tests, idx
 *   node scripts/ci/review-gate.mjs --range main~3..HEAD
 *   node scripts/ci/review-gate.mjs --ack=kernel --ack=ci
 *   node scripts/ci/review-gate.mjs --allow-large="mechanical rename of 40 call sites"
 *   node scripts/ci/review-gate.mjs --no-gates      # diff checks only, fast
 *
 * EXIT CODES
 *   0 pass   1 review checks failed   2 tooling error (could not measure)
 */

import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { runBiomeCheck } from './lib/biome-run.mjs';

// ─── configuration ───────────────────────────────────────────────────────────

const MAX_LINES_REVIEWABLE = 400; // playbook: review quality collapses above this
const MAX_LINES_HARD = 800; // above this, async line-by-line review is theatre

// Churn in these does not count towards the review budget: they are generated,
// mechanical, or machine-owned, and reviewing them line by line is not a thing a
// human does.
const GENERATED = [
  'package-lock.json',
  'dist/',
  'build-manifest.json',
  'graft/',
  'public/sw.js',
  'public/sw-manifest.json',
];

const LINTABLE = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.astro'];

// Rules that must never appear on a line you added. Deliberately short: this is
// the subset of Biome's output that maps onto an item the reviewer is asked to
// check anyway, so a failure here is always actionable.
const HARD_RULES = new Set([
  'lint/suspicious/noExplicitAny',
  'lint/style/noNonNullAssertion',
  'lint/suspicious/noDebugger',
  'lint/suspicious/noDoubleEquals',
  'lint/correctness/noUnusedImports',
  'lint/correctness/noUnusedVariables',
  'lint/correctness/useExhaustiveDependencies',
  'lint/suspicious/noConsole',
]);

// Test files get a narrower set, for a stated reason rather than convenience.
// `document.getElementById('x')!` is the normal idiom in a jsdom test, and the
// standard scopes its `!` rule to trust boundaries in shipped code — a test is
// neither shipped nor a trust boundary. Blocking it there would be noise, and
// noise is what gets a gate switched off. `any` and `debugger` still block:
// neither belongs in a test either.
const TEST_FILE = /\.test\.[tj]sx?$/;
const HARD_RULES_TEST = new Set([
  'lint/suspicious/noExplicitAny',
  'lint/suspicious/noDebugger',
]);

function hardRulesFor(file) {
  return TEST_FILE.test(file) ? HARD_RULES_TEST : HARD_RULES;
}

// Paths where a mistake is expensive enough that the operator must state, in the
// output, that they checked the specific thing that goes wrong there.
const RISK_GROUPS = [
  {
    id: 'kernel',
    match: (p) => p.startsWith('netlify/functions/_lib/kernel/'),
    label: 'Backend kernel — resilience, cache, job queue, rate limit, DB',
    questions: [
      'Is every mutation of shared state a SINGLE atomic statement (no read-modify-write)?',
      'Is any per-request state stored in module or global scope? (warm instances serve concurrent requests)',
      'Does the worst-case latency still fit the 12 s deadline in kernel/deadline.ts, summing the fallback chain?',
      'Is every timer/listener released on every exit path, including throws?',
    ],
  },
  {
    id: 'auth',
    match: (p) =>
      p.startsWith('netlify/functions/contexts/identity/') ||
      p === 'src/store/authReactive.ts' ||
      p === 'src/store/userStore.ts',
    label: 'Identity and session',
    questions: [
      'Is the identity read from the VERIFIED token, never from the request body?',
      'Is the role derived server-side, never from user-writable metadata?',
      'Does an object-level check enforce ownership, not just role?',
    ],
  },
  {
    id: 'migrations',
    match: (p) => p.startsWith('migrations/') || p.startsWith('netlify/migrations/'),
    label: 'Database migrations — irreversible by nature',
    questions: [
      'Is this migration reversible, or explicitly marked irreversible with a written rollback plan?',
      'Has it been run against a real database, not just read?',
      'Does the code tolerate the database being one migration behind (deploy order)?',
    ],
  },
  {
    id: 'ci',
    match: (p) => p.startsWith('.github/') || p.startsWith('scripts/ci/'),
    label: 'CI and gates — a broken gate silently disables every other check',
    questions: [
      'Has this gate been observed FAILING? If not, it is a hypothesis, not a gate.',
      'Does the mutation battery cover the new code path, and did it actually apply?',
    ],
  },
  {
    id: 'deploy',
    // package.json is deliberately NOT here. Adding a script is routine, and the
    // two things about package.json that genuinely risk the deploy — bundle size
    // and the entry-point shape — already have dedicated gates (bundle:size,
    // verify:entries). A risk group that fires on every dependency edit is a
    // group that gets acknowledged without being read.
    match: (p) =>
      p === 'netlify.toml' ||
      p === 'astro.config.mjs' ||
      /^netlify\/functions\/[^/]+\.ts$/.test(p),
    label: 'Deploy shape — this is the path that publishes production',
    questions: [
      'Does every root entry point export a handler? (a subdirectory deploy resurrects Lambda compatibility mode and the 4 KB env ceiling for the whole site)',
      'Is a router still NOT named <subdir>/index.* ?',
      'Does `npm run verify:entries` pass?',
    ],
  },
  {
    id: 'data',
    match: (p) =>
      p.startsWith('netlify/functions/contexts/') ||
      p.startsWith('netlify/functions/_lib/actions-') ||
      p === 'src/lib/apiClient.ts',
    label: 'Data layer and client transport',
    questions: [
      'Does every read use an explicit column projection (no SELECT *)?',
      'Is the client cache still keyed by session identity and cleared on login/logout?',
      'If the transport changed, were the side effects preserved? (apiClient logs out and redirects on sessionInvalid)',
    ],
  },
];

// ─── credentials ─────────────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  { id: 'netlify-token', re: /\bnfp_[A-Za-z0-9]{15,}/, strong: true },
  { id: 'github-pat-classic', re: /\bghp_[A-Za-z0-9]{20,}/, strong: true },
  { id: 'github-pat-fine', re: /\bgithub_pat_[A-Za-z0-9_]{20,}/, strong: true },
  { id: 'github-oauth', re: /\bgho_[A-Za-z0-9]{20,}/, strong: true },
  { id: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/, strong: true },
  { id: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, strong: true },
  { id: 'openai-key', re: /\bsk-[A-Za-z0-9_-]{20,}/, strong: true },
  {
    id: 'jwt',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    strong: true,
  },
  {
    id: 'assigned-secret',
    re: /\b(?:secret|password|passwd|api[_-]?key|auth[_-]?token|access[_-]?token|service[_-]?role[_-]?key|client[_-]?secret)\b\s*[:=]\s*['"`]([^'"`\s]{16,})['"`]/i,
    strong: false,
  },
];

// A value that reads as a placeholder is not a leak. Without this the generic
// pattern fires on every documented example and the gate gets switched off.
const PLACEHOLDER = /^(?:your|xxx|test|fake|dummy|example|sample|placeholder|changeme|todo|none|null|undefined|<|\*{3,}|-{3,}|\.{3,})/i;

const SCAN_ALLOW = 'secret-scan-allow';

// Files that are documentation or deliberately-shaped examples.
const SCAN_SKIP_FILES = [
  /\.md$/i,
  /\.txt$/i,
  /(^|\/)\.env\.example$/,
  /\.example\.[a-z0-9]+$/i,
  /^scripts\/ci\/review-gate\.mjs$/,
  /^scripts\/ci\/review-gate\.mutations\.sh$/,
];

// ─── env declaration ─────────────────────────────────────────────────────────

const ENV_RE = /\b(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]{2,})\b/g;

const ENV_IGNORE = new Set([
  'NODE_ENV', 'CI', 'TZ', 'LANG', 'MODE', 'DEV', 'PROD', 'SSR', 'VITEST',
  'BASE_URL', 'NODE_OPTIONS', 'PATH', 'HOME', 'PWD', 'USER', 'SHELL', 'LC_ALL',
  'TEMP', 'TMP', 'BUILD', 'TEST',
]);

// The env-declaration rule is about the APPLICATION's runtime configuration, so
// it only applies where the application reads env. Measured false positives from
// the first draft: the mutation batteries pass variables to an inline `node -e`
// via `process.env.MUT_FILE`, and `scripts/ui-audit.mjs` reads
// `process.env.AUDIT_BASE`. Those are local to a tool invocation, not deployment
// configuration, and demanding they appear in `.env.example` would be noise that
// gets the whole check ignored.
const ENV_SCOPE = [
  /^src\//,
  /^netlify\//,
  /^shared\//,
  /^indexer\//,
  /^astro\.config\.mjs$/,
  /^server\.cjs$/,
  /^serve\.cjs$/,
];

// A new migration must be reversible, or say out loud that it is not. "down" is
// deliberately NOT a keyword: the very first migration in this repo contains
// "tanpa downtime", and a substring match on "down" would have called it
// reversible.
const ROLLBACK_RE = /--[^\n]*\b(rollback|revert|undo|irreversible|reversible)\b/i;

const FAST_GATES = [
  'verify:entries',
  'verify:binding',
  'verify:io',
  'verify:classes',
  'verify:md',
  'verify:aliases',
  'lint-ratchet',
  'verify:review-manifest',
];

const FULL_GATES = ['typecheck:ratchet', 'boundary', 'idx:gate', 'test'];

// ─── args ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const a = {
    range: null,
    base: null,
    remote: null,
    full: false,
    gates: true,
    json: false,
    ack: [],
    allowLarge: null,
    ignorePaths: [],
    maxLines: MAX_LINES_REVIEWABLE,
    hardLines: MAX_LINES_HARD,
  };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--range') a.range = argv[++i];
    else if (v.startsWith('--range=')) a.range = v.slice(8);
    else if (v === '--base') a.base = argv[++i];
    else if (v.startsWith('--base=')) a.base = v.slice(7);
    else if (v === '--remote') a.remote = argv[++i];
    else if (v.startsWith('--remote=')) a.remote = v.slice(9);
    else if (v === '--full') a.full = true;
    else if (v === '--no-gates') a.gates = false;
    else if (v === '--json') a.json = true;
    else if (v.startsWith('--ack=')) a.ack.push(v.slice(6));
    else if (v === '--ack') a.ack.push(argv[++i]);
    else if (v.startsWith('--allow-large=')) a.allowLarge = v.slice(14);
    else if (v === '--allow-large') a.allowLarge = argv[++i];
    else if (v.startsWith('--ignore-path=')) a.ignorePaths.push(v.slice(14));
    else if (v === '--ignore-path') a.ignorePaths.push(argv[++i]);
    else if (v.startsWith('--max-lines=')) a.maxLines = Number(v.slice(12));
    else if (v.startsWith('--hard-lines=')) a.hardLines = Number(v.slice(13));
  }
  return a;
}

/** Glob-ish match: exact path, a `dir/` prefix, or `*` wildcards. */
function matchesAny(file, patterns) {
  return patterns.some((pat) => {
    if (pat.endsWith('/')) return file.startsWith(pat);
    if (!pat.includes('*')) return file === pat;
    const re = new RegExp(`^${pat.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    return re.test(file);
  });
}

// ─── git ─────────────────────────────────────────────────────────────────────

function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (allowFail) return null;
    throw new Error(`git ${args.join(' ')} failed: ${err.stderr || err.message}`);
  }
}

function pickRemote(preferred) {
  if (preferred) return preferred;
  const out = git(['remote'], { allowFail: true }) || '';
  const remotes = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (remotes.includes('newrepo')) return 'newrepo';
  if (remotes.includes('origin')) return 'origin';
  return remotes[0] || null;
}

/**
 * Work out what "not yet reviewed" means. The tracking ref in this repo is
 * routinely absent (`[newrepo/main: gone]`), so an upstream lookup alone is not
 * enough — it has to fall back to asking the remote directly.
 */
function resolveBase(a) {
  if (a.range) return { spec: a.range, kind: 'range' };
  if (a.base) return { spec: a.base, kind: 'base' };

  const up = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { allowFail: true });
  if (up?.trim() && !up.includes('@{u}')) return { spec: '@{u}', kind: 'upstream' };

  const branch = (git(['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true }) || '').trim();
  const remote = pickRemote(a.remote);
  if (remote && branch && branch !== 'HEAD') {
    const out = git(['ls-remote', remote, `refs/heads/${branch}`], { allowFail: true });
    if (out?.trim()) {
      const sha = out.trim().split(/\s+/)[0];
      return { spec: sha, kind: 'remote', remote, branch };
    }
  }

  return { spec: 'HEAD~1', kind: 'fallback' };
}

/** @returns {Map<string, {status:string, added:{line:number,text:string}[], addedCount:number, removedCount:number}>} */
function parseDiff(spec) {
  const changes = new Map();

  const ensure = (p) => {
    if (!changes.has(p)) {
      changes.set(p, { status: 'M', added: [], addedCount: 0, removedCount: 0 });
    }
    return changes.get(p);
  };

  // name-status gives the status, including renames (R100 old new).
  const ns = git(['diff', '--name-status', '-M', spec], { allowFail: true }) || '';
  for (const line of ns.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const code = parts[0];
    const file = parts.length > 2 ? parts[2] : parts[1];
    if (!file) continue;
    ensure(file).status = code.charAt(0);
  }

  // numstat gives added/removed counts and marks binaries with '-'.
  const num = git(['diff', '--numstat', '-M', spec], { allowFail: true }) || '';
  for (const line of num.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const added = parts[0] === '-' ? 0 : Number(parts[0]);
    const removed = parts[1] === '-' ? 0 : Number(parts[1]);
    const file = parts.length > 3 ? parts[3] : parts[2];
    const c = ensure(file);
    c.addedCount = added;
    c.removedCount = removed;
  }

  // unified=0 patch, to know WHICH new lines were added (for R1/R4/R6).
  const patch = git(['diff', '--unified=0', '-M', '--no-color', spec], { allowFail: true }) || '';
  let current = null;
  let newLine = 0;
  for (const raw of patch.split(/\r?\n/)) {
    if (raw.startsWith('+++ ')) {
      const p = raw.slice(4).trim();
      current = p === '/dev/null' ? null : p.replace(/^b\//, '');
      continue;
    }
    if (raw.startsWith('--- ') || raw.startsWith('diff --git ')) continue;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (!current) continue;
    if (raw.startsWith('+')) {
      ensure(current).added.push({ line: newLine, text: raw.slice(1) });
      newLine++;
    } else if (raw.startsWith('-')) {
      // removed lines do not advance the new-file line counter
    } else {
      newLine++;
    }
  }

  return changes;
}

// ─── reporting ───────────────────────────────────────────────────────────────

const results = [];

function record(id, title, failures, notes = []) {
  results.push({ id, title, ok: failures.length === 0, failures, notes });
}

function line(msg) {
  process.stdout.write(`${msg}\n`);
}

// ─── R1 · secret scan ────────────────────────────────────────────────────────

function checkSecrets(changes) {
  const hits = [];
  let suppressed = 0;

  for (const [file, c] of changes) {
    if (SCAN_SKIP_FILES.some((re) => re.test(file))) continue;
    const isTest = /\.test\.[tj]sx?$/.test(file);
    for (const { line: n, text } of c.added) {
      if (text.includes(SCAN_ALLOW)) {
        suppressed++;
        continue;
      }
      for (const p of SECRET_PATTERNS) {
        if (p.strong === false && isTest) continue;
        const m = p.re.exec(text);
        if (!m) continue;
        if (!p.strong) {
          const value = m[1] || '';
          if (PLACEHOLDER.test(value)) continue;
          if (new Set(value).size < 4) continue;
        }
        hits.push({ file, line: n, id: p.id, preview: text.trim().slice(0, 100) });
      }
    }
  }

  const failures = hits.map(
    (h) => `${h.file}:${h.line} looks like a ${h.id} — ${h.preview}`
  );
  const notes = [];
  if (suppressed) {
    notes.push(
      `${suppressed} added line(s) carry "${SCAN_ALLOW}" and were skipped — verify each was deliberate`
    );
  }
  if (failures.length) {
    notes.push('If it is a real credential: rotate it first, then remove it. A token that reached git history is already burned.');
  }
  record('R1', 'secret scan (added lines)', failures, notes);
}

// ─── R2 · size budget ────────────────────────────────────────────────────────

function isGenerated(file) {
  return GENERATED.some((g) => (g.endsWith('/') ? file.startsWith(g) : file === g));
}

function checkSize(changes, a) {
  const considered = [];
  let total = 0;
  for (const [file, c] of changes) {
    if (isGenerated(file)) continue;
    const n = c.addedCount + c.removedCount;
    total += n;
    considered.push([file, n]);
  }
  considered.sort((x, y) => y[1] - x[1]);

  const notes = [];
  notes.push(
    `changed lines: ${total} across ${considered.length} file(s) (excluding generated)`
  );
  for (const [f, n] of considered.slice(0, 5)) notes.push(`  ${String(n).padStart(5)}  ${f}`);

  const failures = [];
  if (total > a.hardLines && !a.allowLarge) {
    failures.push(
      `diff is ${total} lines, above the ${a.hardLines}-line hard limit — split it, or pass ` +
        '--allow-large="<reason>" and say why async review is still meaningful here'
    );
  } else if (total > a.maxLines) {
    notes.push(
      `${total} lines is above the ${a.maxLines}-line comfort budget — request a synchronous walkthrough rather than an async read`
    );
  }

  record('R2', 'size budget', failures, notes);
  return total;
}

// ─── R3 · risk attestation ───────────────────────────────────────────────────

function checkRisk(changes, a) {
  const touched = [];
  for (const group of RISK_GROUPS) {
    const files = [...changes.keys()].filter((f) => group.match(f));
    if (files.length) touched.push({ group, files });
  }

  const failures = [];
  const notes = [];
  const acked = new Set(a.ack);

  if (!touched.length) {
    notes.push('no high-risk path touched');
  }

  for (const { group, files } of touched) {
    const ok = acked.has(group.id);
    notes.push(`${ok ? 'ACK' : 'REQUIRED'}  [${group.id}] ${group.label} — ${files.length} file(s)`);
    if (!ok) {
      failures.push(`[${group.id}] ${group.label} was touched but not acknowledged`);
      for (const q of group.questions) notes.push(`        ? ${q}`);
      notes.push(`        answer with: --ack=${group.id}`);
    } else {
      for (const q of group.questions) notes.push(`        acked: ${q}`);
    }
  }

  const unknown = a.ack.filter((x) => !RISK_GROUPS.some((g) => g.id === x));
  if (unknown.length) {
    notes.push(`ignored unknown --ack value(s): ${unknown.join(', ')}`);
  }

  record('R3', 'high-risk attestation (solo review protocol)', failures, notes);
}

// ─── R4 · env declaration ────────────────────────────────────────────────────

function declaredEnv() {
  const set = new Set();
  for (const file of ['.env.example', '.env.local.example']) {
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(raw);
      if (m) set.add(m[1]);
    }
  }
  return set;
}

function checkEnv(changes) {
  const declared = declaredEnv();
  const found = new Map(); // name -> first location
  for (const [file, c] of changes) {
    if (SCAN_SKIP_FILES.some((re) => re.test(file))) continue;
    if (!ENV_SCOPE.some((re) => re.test(file))) continue;
    for (const { line: n, text } of c.added) {
      ENV_RE.lastIndex = 0;
      for (let m = ENV_RE.exec(text); m !== null; m = ENV_RE.exec(text)) {
        const name = m[1];
        if (ENV_IGNORE.has(name)) continue;
        if (declared.has(name)) continue;
        if (!found.has(name)) found.set(name, `${file}:${n}`);
      }
    }
  }

  const failures = [...found.entries()].map(
    ([name, where]) =>
      `${name} (first seen ${where}) is not declared in .env.example — add it there, or the next ` +
      'person cannot run the app and verify:env will not know it exists'
  );
  const notes = [`${declared.size} env var(s) currently declared in .env.example`];
  record('R4', 'env declaration', failures, notes);
}

// ─── R5 · migration rollback ─────────────────────────────────────────────────

function checkMigrations(changes) {
  const failures = [];
  const notes = [];
  let checked = 0;

  for (const [file, c] of changes) {
    if (!/^migrations\/.*\.sql$/i.test(file)) continue;
    // Only NEW migrations. An existing migration cannot retroactively gain a
    // rollback plan, and blocking a comment fix on one would be absurd.
    if (c.status !== 'A') continue;
    checked++;
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (!ROLLBACK_RE.test(text)) {
      failures.push(
        `${file} is a new migration with no rollback marker — add a comment containing ` +
          'ROLLBACK / REVERT / UNDO, or IRREVERSIBLE plus the plan'
      );
    }
  }

  notes.push(
    checked
      ? `${checked} new migration(s) checked`
      : 'no new migration added (existing migrations are not retro-checked)'
  );
  record('R5', 'migration rollback', failures, notes);
}

// ─── R6 · lint on added lines only ───────────────────────────────────────────

const LINT_BASELINE = '.ci/biome-baseline.json';

function loadLintBaseline() {
  try {
    return JSON.parse(fs.readFileSync(LINT_BASELINE, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * WHY THIS IS DEBT-AWARE, AND WHY THAT IS NOT A SOFT GATE
 *
 * The first draft blocked on every hard-rule diagnostic landing on an added
 * line. Run against this repo's real 25-commit backlog it reported 297 findings
 * across 61 files — all of them written before a linter existed. A gate that
 * demands 297 pre-existing style fixes before a legitimate push is a gate that
 * gets switched off, which is how a standard dies.
 *
 * So this check blocks on the case that is genuinely new debt, and reports the
 * rest:
 *
 *   BLOCKS   a hard-rule violation on an added line in a file that was CLEAN in
 *            the baseline, or in a brand-new file. That is a new debt surface.
 *   REPORTS  a hard-rule violation on an added line in a file that already
 *            carried diagnostics. Making a dirty file dirtier is caught by the
 *            tree-level `lint-ratchet` instead, which fails if the total rises.
 *
 * The two gates compose: the ratchet catches "the total went up", this catches
 * "a clean file went dirty" and "a new file shipped with debt". Neither is
 * bypassed by the other, and together they cover the net-zero case (add one
 * violation, fix another) that a pure total would miss.
 */
function checkLintOnNewLines(changes) {
  const targets = [...changes.keys()].filter(
    (f) => LINTABLE.includes(path.extname(f)) && fs.existsSync(f)
  );

  if (!targets.length) {
    record('R6', 'lint on added lines', [], ['no lintable files changed']);
    return;
  }

  let diagnostics;
  try {
    ({ diagnostics } = runBiomeCheck(targets));
  } catch (err) {
    record('R6', 'lint on added lines', [`biome could not run: ${err.message}`]);
    return;
  }

  const baseline = loadLintBaseline();
  const knownDirty = new Set(Object.keys(baseline?.byFile || {}));
  const wasClean = (file) => !knownDirty.has(file);

  const failures = [];
  const reported = [];
  let hardOnAdded = 0;

  for (const d of diagnostics) {
    const c = changes.get(d.file);
    if (!c) continue;
    if (!c.added.some((x) => x.line === d.line)) continue; // untouched lines: frozen by the ratchet
    if (!hardRulesFor(d.file).has(d.category)) continue;
    hardOnAdded++;
    if (c.status === 'A' || wasClean(d.file)) {
      failures.push(
        `${d.file}:${d.line} ${d.category} — ${d.message}` +
          (c.status === 'A' ? '  [new file]' : '  [was clean]')
      );
    } else {
      reported.push(`${d.file}:${d.line} ${d.category}`);
    }
  }

  const notes = [
    `${targets.length} file(s) linted`,
    `${hardOnAdded} hard-rule diagnostic(s) land on lines you added`,
  ];
  if (reported.length) {
    notes.push(
      `${reported.length} of those are in files that were ALREADY dirty — reported, not blocking ` +
        '(lint-ratchet fails if the tree total rises)'
    );
    for (const r of reported.slice(0, 5)) notes.push(`  ${r}`);
    if (reported.length > 5) notes.push(`  ...and ${reported.length - 5} more`);
  }
  record('R6', 'lint on added lines', failures, notes);
}

// ─── R7 · gates ──────────────────────────────────────────────────────────────

function runGates(a) {
  if (!a.gates) {
    record('R7', 'Tier-0 gates', [], ['skipped (--no-gates)']);
    return;
  }

  const list = a.full ? [...FAST_GATES, ...FULL_GATES] : FAST_GATES;
  const failures = [];
  const notes = [];

  for (const g of list) {
    const started = Date.now();
    let ok = true;
    let tail = '';
    try {
      execSync(`npm run ${g} --silent`, {
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch (err) {
      ok = false;
      tail = `${err.stdout || ''}${err.stderr || ''}`.trim().split(/\r?\n/).slice(-6).join('\n');
    }
    const ms = Date.now() - started;
    notes.push(`${ok ? 'PASS' : 'FAIL'}  ${String(ms).padStart(6)}ms  ${g}`);
    if (!ok) {
      failures.push(`gate failed: ${g}`);
      if (tail) failures.push(tail.replace(/^/gm, '      '));
    }
  }

  record('R7', `Tier-0 gates (${a.full ? 'full' : 'fast'})`, failures, notes);
}

// ─── main ────────────────────────────────────────────────────────────────────

function main() {
  const a = parseArgs(process.argv.slice(2));

  let base;
  let changes;
  try {
    base = resolveBase(a);
    changes = parseDiff(base.spec);
  } catch (err) {
    console.error(`REVIEW GATE — TOOLING ERROR\n  ${err.message}`);
    process.exit(2);
  }

  // --ignore-path exists so a change can exclude a file that is not part of the
  // review (a large generated artefact, or an unrelated working-tree edit when
  // measuring a controlled baseline). Exclusions are always echoed, so an
  // ignored path can never be silently dropped from the review.
  const ignored = [];
  if (a.ignorePaths.length) {
    for (const f of [...changes.keys()]) {
      if (matchesAny(f, a.ignorePaths)) {
        changes.delete(f);
        ignored.push(f);
      }
    }
  }

  const commitCount =
    base.kind === 'fallback'
      ? 'unknown'
      : (git(['rev-list', '--count', `${base.spec}..HEAD`], { allowFail: true }) || '').trim() ||
        'unknown';

  line('Review gate');
  line('='.repeat(72));
  if (base.kind === 'remote') {
    line(`  comparing against : ${base.remote}/${base.branch} (${base.spec.slice(0, 10)})`);
  } else if (base.kind === 'upstream') {
    line('  comparing against : upstream (@{u})');
  } else if (base.kind === 'range' || base.kind === 'base') {
    line(`  comparing against : ${base.spec}`);
  } else {
    line('  comparing against : HEAD~1  ⚠ no upstream and no matching remote branch —');
    line('                      the unpushed backlog could NOT be measured. Pass --base <ref>.');
  }
  line(`  commits ahead     : ${commitCount}`);
  line(`  files changed     : ${changes.size}`);
  if (ignored.length) {
    line(`  excluded by --ignore-path: ${ignored.length}`);
    for (const f of ignored.slice(0, 5)) line(`      ${f}`);
    if (ignored.length > 5) line(`      ...and ${ignored.length - 5} more`);
  }

  // `git diff` cannot see untracked files, and `git push` does not send them —
  // so excluding them is correct, but silently excluding them would be a trap.
  const untracked = (
    git(['ls-files', '--others', '--exclude-standard'], { allowFail: true }) || ''
  )
    .split(/\r?\n/)
    .filter(Boolean);
  if (untracked.length) {
    line(`  untracked (not reviewed, and not pushed): ${untracked.length}`);
    for (const u of untracked.slice(0, 5)) line(`      ${u}`);
    if (untracked.length > 5) line(`      ...and ${untracked.length - 5} more`);
  }
  line('='.repeat(72));
  line('');

  if (changes.size === 0) {
    line('Nothing to review — no changes against that base.');
    process.exit(0);
  }

  checkSecrets(changes);
  checkSize(changes, a);
  checkRisk(changes, a);
  checkEnv(changes);
  checkMigrations(changes);
  checkLintOnNewLines(changes);
  runGates(a);

  let failed = 0;
  for (const r of results) {
    line(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id} · ${r.title}`);
    for (const n of r.notes) line(`        ${n}`);
    if (!r.ok) {
      failed++;
      for (const f of r.failures) line(`      ! ${f}`);
    }
    line('');
  }

  line('='.repeat(72));
  if (failed) {
    line(`REVIEW GATE FAILED — ${failed} of ${results.length} check(s) need attention.`);
    line('');
    line('Before pushing main, answer the last question in the standard:');
    line('  "What gate would have caught this?"');
    line('If the answer is "none", this change should add one.');
    process.exit(1);
  }

  line(`REVIEW GATE PASSED — all ${results.length} checks.`);
  line('');
  line('Reminder: pushing main publishes production (Netlify git integration).');
  line('This gate is the last thing between the diff and the deploy.');
  if (a.json) {
    line(JSON.stringify(results.map((r) => ({ id: r.id, ok: r.ok }))));
  }
}

main();
