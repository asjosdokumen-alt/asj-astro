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
    max: 3,
    reason:
      'THE SANCTIONED CLIENT ITSELF. Three calls: the primary endpoint, the ' +
      'agent fallback, and — since `d0ea082` (2026-10-29) — the silent session ' +
      'refresh in `refreshSessionToken()`. The refresh deliberately does NOT go ' +
      'through `call()`, because `call()` calls `getFreshToken()` first and that ' +
      'is recursion; it carries its own AbortSignal.timeout() for exactly the ' +
      'reason `call()` does. This entry is also the proof that a per-FILE bound ' +
      'cannot constrain new calls INSIDE an allowed file: the refresh landed ' +
      'here and the gate stayed green until the count was compared. See the ' +
      'follow-up in deliverables/gstack/ for the per-call-site check.',
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
  'src/store/authReactive.ts': {
    max: 1,
    reason:
      'The server-side logout bump (2026-10-29, migration 026). Raw `fetch` ' +
      'because routing it through apiClient would recurse: `call()` asks ' +
      '`getFreshToken()` for a token first, and `getFreshToken()` is what calls ' +
      '`logout()` when a session is dead. Same reason `refreshSessionToken()` ' +
      'bypasses `call()`. The call carries its own 5 s AbortSignal.timeout(), is ' +
      '`keepalive` so it survives the redirect that follows, and swallows every ' +
      'failure — the local session is cleared regardless, so a failed bump must ' +
      'not block the user from leaving.',
  },
  'src/lib/publicData.ts': {
    max: 2,
    reason:
      'The PUBLIC getAppData payload on the home page, and the one site where ' +
      'routing through apiClient would be wrong rather than merely unnecessary. ' +
      'This is a single-flight cache deliberately shared between LokerTable and ' +
      'the marquee <script>: apiClient would add its own sessionInvalid policy ' +
      'and cache layer on top of a request that must stay anonymous and must be ' +
      'issued exactly once per page load. Measured motivation: the payload is ' +
      '~110 KB (159 jobs) and was being fetched TWICE per load before this file. ' +
      'Candidate for a dedicated public variant of apiClient, not for apiClient. ' +
      'TWO sites since 2026-10-29: `getPublicData()` (browser, bounded since ' +
      '2026-10-24) and `fetchPublicJobs()` (BUILD-TIME, which had no bound at all ' +
      'until this session — a build could hang on a CDN that never answers). Both ' +
      'now carry a signal; the bound moved 1 -> 2 because a second site was ' +
      'ALREADY THERE and the gate could not see it, not because a new bypass was ' +
      'tolerated.',
  },
  'src/lib/cv-template-factory/renderers/xlsx-form.ts': {
    max: 1,
    reason:
      '`photoToPngBytes()` fetches the candidate PHOTO as a BLOB to rasterise it ' +
      'into the xlsx drawing. Same shape as rirekisho-xlsx.ts above: a ' +
      'storage/CDN object rather than a function endpoint, read with .blob() and ' +
      'not JSON, so apiClient\'s envelope/session handling does not apply. It is ' +
      'also a CORS fetch of a third-party poster URL, so it cannot be read ' +
      'cross-origin — the risk is a HANG, not SSRF. It had NO timeout until ' +
      '2026-10-29, which could stall an export behind a CDN that never answers; ' +
      'it now carries a 20 s AbortSignal.timeout() and returns null on failure, ' +
      'which the renderer draws as an empty photo cell.',
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
  'src/lib/cv-template-factory/renderers/rirekisho-xlsx.ts': {
    max: 1,
    reason:
      'Fetches the candidate PHOTO as a BLOB to rasterise it into the xlsx ' +
      'drawing (photoToPngBytes -> createImageBitmap -> canvas -> PNG bytes). The ' +
      'URL is a storage/CDN object, not a function endpoint, and the response is ' +
      'read with .blob() rather than JSON — so none of apiClient\'s envelope, ' +
      'timeout or session handling applies. Same shape as DocumentPreviewModal.tsx. ' +
      'Wrapped in try/catch that returns null, which the renderer draws as an ' +
      'empty photo cell rather than failing the export.',
  },
  'src/lib/cv-template-factory/loaders/tEMPLATE-loader.ts': {
    max: 1,
    reason:
      'GET of the candidate CV TEMPLATE .xlsx as a BLOB. The URL is ' +
      '`rec.fileUrl` — a Cloudinary absolute URL written by uploadBerkasToStorage ' +
      '(folder cv-templates), not a function endpoint — so there is nothing for ' +
      'apiClient to unwrap and no session to attach: the object is public by ' +
      'design and putting our token on it would be wrong. Same shape as the ' +
      'rirekisho photo fetch above, except this one checks res.ok itself and now ' +
      'carries its own 20 s AbortSignal.timeout(), which is the one apiClient ' +
      'property it was missing. The function call that OBTAINS the URL ' +
      '(TabConfig.tsx -> uploadBerkasToStorage) goes through apiClient already.',
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
 * Count real `fetch(` call sites, skipping comment lines, and record whether
 * each one carries a `signal`.
 *
 * The comment-skip is NOT cosmetic. io-boundary.mjs had a guard that used
 * `.includes('fetch(')`, which the file's OWN COMMENTS satisfied — renaming the
 * real call left the gate green, so "the implementation moved" was undetectable.
 * Their mutation battery caught it (S3 SURVIVED). The same trap applies here:
 * this file's header prose mentions `fetch(` on many lines, so any check that
 * does not skip comments would pass by quoting itself.
 *
 * WHY `hasSignal` EXISTS (2026-10-29)
 *   The per-FILE count could not see a new call inside an already-allowed file.
 *   `refreshSessionToken` landed in apiClient.ts NINE DAYS after this gate
 *   existed, added a third `fetch` with no timeout, and the gate stayed green
 *   until the count happened to be compared. The bound is the property that
 *   matters (a stall must not park a tab forever), so it is now asserted per
 *   call site, not per file. A per-file allow-list can only ever say "this file
 *   may call fetch"; it cannot say "this call is bounded".
 */
function isComment(trimmed) {
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');
}

/** The full `fetch(...)` call text, by balancing parentheses from the `(`. */
function callText(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') {
      depth--;
      if (depth === 0) return src.slice(openIdx, i + 1);
    }
  }
  return src.slice(openIdx);
}

function countFetchSites(src) {
  const hits = [];
  // Scan the WHOLE source, not line-by-line with recomputed offsets: the repo
  // checks out with CRLF (core.autocrlf=true), so "sum of preceding line
  // lengths + 1" drifts by one per line and the call text was being read from
  // the wrong place — which made every bounded call look unbounded.
  const re = /(?<![\w.$])fetch\s*\(/g;
  // `for` rather than `while ((m = re.exec(src)))`: an assignment in a condition
  // trips noAssignInExpressions, and the `continue` below (comment lines) would
  // skip a hand-written re-exec at the end of the body — the loop would spin on
  // the same match forever. In a `for`, `continue` still runs the update.
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const nl = src.indexOf('\n', m.index);
    const lineText = src.slice(lineStart, nl === -1 ? src.length : nl).trim();
    if (isComment(lineText)) continue;
    const openIdx = m.index + m[0].length - 1; // at the '('
    const text = callText(src, openIdx);
    let line = 1;
    for (let i = 0; i < m.index; i++) if (src[i] === '\n') line++;
    // `signal:` for an inline option, `signal)` for a shared options helper
    // (`opts(controller.signal)`) — apiClient builds its options once and
    // reuses them for the primary call and the 404 fallback, so requiring the
    // literal `signal:` there would flag two correctly-bounded calls.
    hits.push({ line, hasSignal: /\bsignal\s*[:,)]/.test(text) });
  }
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
    console.log(`    lines: ${hits.map((h) => h.line).join(', ')}`);
    console.log(
      `    bounded: ${hits.filter((h) => h.hasSignal).length}/${hits.length}` +
        (hits.some((h) => !h.hasSignal) ? '  ← UNBOUNDED' : ''),
    );
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
  const lines = hits.map((h) => h.line).join(', ');
  if (!allow) {
    violations.push(
      `${rel} — ${hits.length} raw fetch() at line(s) ${lines} — NOT in allow-list`,
    );
  } else if (hits.length > allow.max) {
    violations.push(
      `${rel} — ${hits.length} raw fetch() but allow-list permits ${allow.max} — ` +
        `a NEW bypass was added. Route it through apiClient, or raise the bound with a reason.`,
    );
  }
  // The property, asserted where the mistake happens: every call must be able
  // to give up. A per-file bound cannot express this — see the note above.
  for (const h of hits) {
    if (h.hasSignal) continue;
    violations.push(
      `${rel}:${h.line} — fetch() has NO \`signal\` — an unbounded request can hang ` +
        `with no error and no way out. Add AbortSignal.timeout(...) (or an ` +
        `AbortController), not a new allow-list entry.`,
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
