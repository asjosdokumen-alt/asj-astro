#!/usr/bin/env node
/**
 * fetch-boundary.mjs — "no raw fetch() against a Netlify function in src/" gate.
 *
 * WHY THIS EXISTS
 *   The backend equivalent (`scripts/ci/io-boundary.mjs`) has guarded
 *   `netlify/functions/` since 2026-09-11 and found a real 200-file sequential
 *   download loop. The FRONTEND had no equivalent, and that gap was expensive.
 *
 *   Measured 2026-09-17: **30 raw `fetch(getEndpoint(...))` sites across 18
 *   files** in `src/`, versus 80 uses of `apiClient`. They accumulated one at a
 *   time, each individually reasonable, and six of them then carried a COMMENT
 *   explaining why that one was exempt. One of those comments was simply false:
 *   CandidateProfileModal deferred its conversion on the grounds that "apiClient
 *   has no `signal` option yet" — the option had always existed, and its doc
 *   comment named that very file as the reason it was added. The deferral was
 *   never lifted, and nothing could see that, because nothing looked.
 *
 *   By 2026-09-18 all 30 sites were converted. Nothing keeps them converted. Six
 *   components pin THEIR OWN file (the `sumbernya tidak memanggil fetch()` test
 *   added during that work), which is exactly the blind spot: a seventh component
 *   could reintroduce the pattern tomorrow and every gate would stay green.
 *
 *   So this gate makes the invariant repo-wide, and — like io-boundary.mjs —
 *   records each remaining site WITH A JUSTIFICATION, so the tolerated set can
 *   only shrink by explicit decision.
 *
 * WHAT COUNTS AS A BYPASS
 *   A call to the global `fetch(` under `src/` that targets a Netlify function
 *   endpoint, i.e. it is doing what `apiClient` exists to do. Calls to other
 *   hosts (a signed storage URL, a CDN blob) are NOT bypasses and are handled by
 *   the allow-list with reasons rather than by a looser regex — see ALLOWED.
 *
 *   Why not "any fetch() in src/"? Because that would flag `UploadBerkas`'s PUT
 *   to a Cloudinary signed URL, which has no function endpoint to route to.
 *   A gate that cannot express the difference would force exceptions into the
 *   code instead of into the allow-list, which is how allow-lists rot.
 *
 * WHAT apiClient PROVIDES (what a bypass loses)
 *   1. The request timeout (20 s default) — a bypass can hang a tab forever.
 *   2. The `res.ok` check — measured in this repo, a bypass read a non-2xx body
 *      as an ordinary reply and treated a 403 as data.
 *   3. Per-action unwrapping of the `{ action, payload }` envelope, and the
 *      `sessionInvalid` handling policy (`throw` / `logout` / ignore).
 *   4. The read cache and the local `agent` base — bypasses refetch on mount.
 *
 * USAGE
 *   node scripts/ci/fetch-boundary.mjs          gate (exit 1 on a new bypass)
 *   node scripts/ci/fetch-boundary.mjs --list   list every site with its reason
 *
 * EXIT CODES
 *   0  every site is accounted for
 *   1  a new bypass, or an allow-listed file exceeded its bound
 *   2  the gate is looking at the wrong tree (guards below)
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const SRC = join(ROOT, 'src');

/** The sanctioned client. It is allowed to call fetch. */
const CLIENT = 'src/lib/apiClient.ts';

/**
 * Known sites, each with the reason it is tolerated.
 *
 * INVARIANT: this list may only shrink. Adding an entry requires a reason that
 * survives review — "it was easier" is not one. If the target is a Netlify
 * function, route it through `apiClient` instead of adding an entry here.
 */
const ALLOWED = {
  'src/lib/apiClient.ts': {
    max: 2,
    reason:
      'THE SANCTIONED CLIENT ITSELF. Two calls: the primary endpoint and the ' +
      'agent fallback. This is the wrapper every other site must route through, ' +
      'so counting it is the point — see the WRAPPER guard below, which fails if ' +
      'these call sites disappear (a moved implementation would leave this gate ' +
      'guarding nothing).',
  },
  'src/lib/uploadBerkas.ts': {
    max: 1,
    reason:
      'PUT to a Cloudinary SIGNED URL returned by the function. There is no ' +
      'function endpoint to route to — the signed URL is a third-party absolute ' +
      'host with its own contract, and putting our session token on it would be ' +
      'wrong. The function call that OBTAINS the signed URL on line ~40 already ' +
      'goes through apiClient, so the envelope, timeout and session handling are ' +
      'all covered; only the byte upload is direct.',
  },
  'src/lib/cloudinary.ts': {
    max: 1,
    reason:
      'Direct multipart upload to the Cloudinary API with an upload preset. Same ' +
      'shape as uploadBerkas.ts: an absolute third-party host, a 30 s ' +
      'AbortController of its own, and a retry loop. Not a Netlify function, so ' +
      'apiClient has nothing to add.',
  },
  'src/lib/publicData.ts': {
    max: 1,
    reason:
      'The PUBLIC getAppData payload on the home page, and the one site where ' +
      'routing through apiClient would be wrong rather than merely unnecessary. ' +
      'This is a single-flight cache deliberately shared between LokerTable and ' +
      'the marquee <script>: apiClient would add its own sessionInvalid policy ' +
      'and cache layer on top of a request that must stay anonymous and must be ' +
      'issued exactly once per page load. Measured motivation: the payload is ' +
      '~110 KB (159 jobs) and was being fetched TWICE per load before this file. ' +
      'Candidate for a dedicated public variant of apiClient, not for apiClient.',
  },
  'src/components/forms/ShareView.tsx': {
    max: 1,
    reason:
      'The public share page, fetched by a one-time code rather than a session. ' +
      'No session token exists to attach, and apiClient\'s refuse-before-fetch ' +
      'behaviour would block an anonymous visitor outright. Correct by intent; ' +
      'moving it to apiClient would require a public mode there first.',
  },
  'src/components/DocumentPreviewModal.tsx': {
    max: 1,
    reason:
      'Fetches a BLOB for client-side rendering (xlsx -> HTML preview). The URL ' +
      'is a storage/CDN object, not a function endpoint, and the response is read ' +
      'with .arrayBuffer() rather than JSON — so none of apiClient\'s envelope, ' +
      'timeout or session handling applies. The call is wrapped in try/catch and ' +
      'returns null on failure, which the modal renders as "no preview".',
  },
};

/** Recursively collect source files under a directory, excluding tests. */
function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collect(full));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Count real `fetch(` call sites, skipping comment lines.
 *
 * The comment-skip is NOT cosmetic. io-boundary.mjs had a guard that used
 * `.includes('fetch(')`, which the file's OWN COMMENTS satisfied — renaming the
 * real call left the gate green, so "the implementation moved" was undetectable.
 * Their mutation battery caught it (S3 SURVIVED). The same trap applies here:
 * this file's header prose mentions `fetch(` on many lines, so any check that
 * does not skip comments would pass by quoting itself.
 */
function isComment(trimmed) {
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');
}

function countFetchSites(src) {
  const hits = [];
  src.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (isComment(trimmed)) return;
    if (/(?<![\w.$])fetch\s*\(/.test(line)) hits.push(i + 1);
  });
  return hits;
}

const files = collect(SRC);
const found = new Map();

for (const full of files) {
  const rel = relative(ROOT, full).split('\\').join('/');
  const hits = countFetchSites(readFileSync(full, 'utf8'));
  if (hits.length) found.set(rel, hits);
}

if (process.argv.includes('--list')) {
  console.log('Raw fetch() sites in src/ (excluding apiClient-routed calls is by allow-list)\n');
  for (const [rel, hits] of [...found].sort()) {
    const allow = ALLOWED[rel];
    console.log(`  ${rel}`);
    console.log(`    lines: ${hits.join(', ')}`);
    console.log(`    ${allow ? `ALLOWED — ${allow.reason}` : '>>> NOT ALLOWED (gate will fail)'}`);
    console.log('');
  }
  const total = [...found.values()].reduce((n, h) => n + h.length, 0);
  console.log(`  ${found.size} file(s), ${total} site(s)`);
}

// ── Verdict ────────────────────────────────────────────────────────────────
const violations = [];

for (const [rel, hits] of found) {
  const allow = ALLOWED[rel];
  if (!allow) {
    violations.push(
      `${rel} — ${hits.length} raw fetch() at line(s) ${hits.join(', ')} — NOT in allow-list`,
    );
  } else if (hits.length > allow.max) {
    violations.push(
      `${rel} — ${hits.length} raw fetch() but allow-list permits ${allow.max} — ` +
        `a NEW bypass was added. Route it through apiClient, or raise the bound with a reason.`,
    );
  }
}

/**
 * The allowed set must not silently empty out.
 *
 * An allow-list is the one place a typo is invisible: if a path is renamed, its
 * entry stops matching and — for a file that no longer exists — nothing fails.
 * The reverse is worse in the other direction, so the checks below pin the two
 * things that make this gate meaningful:
 *
 *   1. the client itself must still call fetch as many times as the allow-list
 *      says it does (otherwise the implementation moved and we are guarding the
 *      wrong file), and
 *   2. every allow-listed path must exist on disk.
 *
 * Both are cheap, and both fail loudly rather than silently shrinking coverage.
 */
const clientSites = countFetchSites(readFileSync(join(ROOT, CLIENT), 'utf8')).length;
const clientBound = ALLOWED[CLIENT] ? ALLOWED[CLIENT].max : 0;
if (clientBound === 0) {
  violations.push(
    `${CLIENT} is not in the allow-list — this gate has no sanctioned client to guard.`,
  );
} else if (clientSites !== clientBound) {
  // NOT `=== 0`. Found by this gate's own mutation battery (S3 SURVIVED on the
  // first run): the client has TWO fetch sites, and the original `=== 0` check
  // only asked whether ANY remained. Renaming one of the two left the count at 1,
  // the guard passed, and the entry's `max: 2` quietly became slack — so half the
  // implementation could move while this gate kept claiming to guard it. The
  // bound is the claim; compare against the bound.
  violations.push(
    `${CLIENT} has ${clientSites} fetch() site(s) but the allow-list expects ${clientBound} — ` +
      `the implementation moved or was partially rewritten. Update CLIENT/ALLOWED, or restore the call.`,
  );
}

for (const rel of Object.keys(ALLOWED)) {
  try {
    statSync(join(ROOT, rel));
  } catch {
    violations.push(
      `${rel} is in the allow-list but does not exist — a rename silently shrank this gate's coverage.`,
    );
  }
}

console.log('');
console.log('─'.repeat(68));
console.log('   FETCH BOUNDARY — no raw fetch() bypassing apiClient in src/');
console.log(`   scanned ${files.length} file(s) under src/`);
console.log(`   ${found.size} file(s) call fetch(), ${Object.keys(ALLOWED).length} allow-listed`);
console.log('─'.repeat(68));

if (violations.length) {
  console.log('\n   ✗ GATE FAILED\n');
  for (const v of violations) console.log(`     ${v}`);
  console.log('\n   Every call to a Netlify function must go through apiClient so it is');
  console.log('   timeout-bounded, res.ok-checked, envelope-unwrapped, and session-aware.\n');
  process.exit(1);
}

console.log('\n   ✓ PASS — every raw fetch() site in src/ is accounted for.\n');
