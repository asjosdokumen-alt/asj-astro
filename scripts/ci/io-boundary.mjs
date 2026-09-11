#!/usr/bin/env node
/**
 * io-boundary.mjs — "all outbound I/O goes through kernel/http.ts" gate.
 *
 * WHY THIS EXISTS
 *   Two documents state the rule as an architectural invariant:
 *
 *     docs/BACKEND_ARCHITECTURE_2026-09-01.md:319
 *       "All external I/O goes through kernel ports. No `fetch()` outside
 *        `kernel/http.ts`."
 *     docs/CODE_REVIEW_CHECKLIST.md:73
 *       "- [ ] No raw `fetch` — all I/O through `kernel/http.ts`"
 *
 *   But rules that live only in prose and a checkbox are not enforced, and a
 *   raw `fetch()` bypasses four things at once:
 *
 *     1. kernel/deadline.ts clamping — the call is not bounded by the request
 *        deadline, so it can hold its function slot past the point where the
 *        rest of the request has given up.
 *     2. The circuit breaker — a failing dependency is never marked down, so
 *        every request keeps paying the failure cost.
 *     3. The bulkhead — no per-dependency concurrency limit.
 *     4. kernel/metrics.ts + traceparent propagation — the call is invisible.
 *
 *   At the time this gate was written there were 7 such sites. Rather than
 *   silently "fixing" them all (some are intentional and reasoned), the gate
 *   records each one WITH A JUSTIFICATION in ALLOWED below, so the set can only
 *   shrink by explicit decision and any NEW bypass fails the build.
 *
 * WHAT COUNTS AS A BYPASS
 *   A call to the global `fetch(` that is not the one inside kernel/http.ts.
 *   kernel/http.ts is the sanctioned wrapper; it may call fetch directly.
 *
 * USAGE
 *   node scripts/ci/io-boundary.mjs           gate (exit 1 on new bypass)
 *   node scripts/ci/io-boundary.mjs --list    list every bypass with reasons
 *
 * EXIT CODES
 *   0  no unaccounted bypass
 *   1  new bypass introduced
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const FN = join(ROOT, 'netlify/functions');

/** The single sanctioned wrapper. It is allowed to call fetch. */
const WRAPPER = 'netlify/functions/_lib/kernel/http.ts';

/**
 * Known bypasses, each with the reason it is tolerated.
 *
 * INVARIANT: this list may only shrink. Adding an entry requires a reason that
 * survives review — "it was easier" is not one. Prefer routing through
 * kernel/http.ts with an explicit budget.
 */
const ALLOWED = {
  // REMOVED 2026-09-11 (Phase B follow-up): contexts/documents/download.ts.
  // It used a raw fetch with a hardcoded AbortSignal.timeout(10000) — longer
  // than kernel budgets and NOT deadline-clamped — inside a SEQUENTIAL loop of
  // up to 200 files. 200 x 10 s of intended wait against a 60 s platform
  // ceiling was the worst occupancy hole in the codebase. It now routes
  // through kernel/http.ts with BUDGETS.storage, and the loop stops once the
  // request deadline is nearly spent. The allow-list entry is gone so the rule
  // is enforced by construction, not by trust.
  'netlify/functions/contexts/ingestion/service.ts': {
    max: 2,
    reason:
      'Outbound fetch of a user-supplied URL for ingestion. Has its own ' +
      'DOWNLOAD_TIMEOUT_MS guard. Escape hatch is deliberate because the target ' +
      'host is untrusted and must NOT be attributed to a kernel dependency ' +
      '(circuit-breaking an arbitrary attacker-chosen host would be wrong).',
  },
  'netlify/functions/_lib/fcm-server.ts': {
    max: 2,
    reason:
      'Firebase Cloud Messaging. Two calls: OAuth token exchange and the send ' +
      'endpoint. Both are push-notification side effects already isolated behind ' +
      'the scheduling context. Candidate for kernel/http.ts with BUDGETS.external.',
  },
  'netlify/functions/_lib/ai/providers.ts': {
    max: 2,
    reason:
      'AI provider calls (Gemini / xAI) that stream and need provider-specific ' +
      'abort handling. Bounded separately by the ai tier admission cap ' +
      '(kernel/admission.ts). Candidate for kernel/http.ts with BUDGETS.ai_chat.',
  },
  'netlify/functions/contexts/notifications/service.ts': {
    max: 1,
    reason:
      'Fonnte WhatsApp send — the mass-mail path. Deliberately NOT routed through ' +
      'the shared breaker: an admin blast failing must not open the breaker that ' +
      'public job-board reads depend on. See the P0-P3 priority classes.',
  },
  'netlify/functions/_lib/metrics-sink.ts': {
    max: 1,
    reason:
      'The Phase C item 11 metrics exporter, and the one call that must NOT go ' +
      'through kernel/http.ts. All four things the wrapper provides are actively ' +
      'wrong here: (1) the receiver is NOT a product dependency, so counting its ' +
      'failures toward the shared breaker would let a broken monitoring endpoint ' +
      'open the breaker that public reads depend on; (2) it must never be ' +
      'deadline-clamped DOWN — the request is already finished, and the export ' +
      'has to complete or be dropped entirely, not truncated into a partial ' +
      'payload; (3) bulkhead slots are scarce per-instance capacity for user ' +
      'work; (4) a retry would duplicate samples. Bounded instead by its own ' +
      'SINK_TIMEOUT_MS plus a skip when the request deadline is nearly spent.',
  },
};

/** Recursively collect .ts files under a directory, excluding tests. */
function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collect(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

/**
 * Count `fetch(` occurrences, ignoring mentions inside comments and string
 * literals is overkill here — the codebase writes real calls on their own line
 * or after `await`. We do skip lines that are pure comments.
 */
function countFetchSites(src) {
  const hits = [];
  src.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) return;
    if (/(?<![\w.$])fetch\s*\(/.test(line)) hits.push(i + 1);
  });
  return hits;
}

const files = collect(FN);
const found = new Map();

for (const full of files) {
  const rel = relative(ROOT, full).split('\\').join('/');
  if (rel === WRAPPER) continue;
  const hits = countFetchSites(readFileSync(full, 'utf8'));
  if (hits.length) found.set(rel, hits);
}

if (process.argv.includes('--list')) {
  console.log('Raw fetch() sites outside kernel/http.ts\n');
  for (const [rel, hits] of [...found].sort()) {
    const allow = ALLOWED[rel];
    console.log(`  ${rel}`);
    console.log(`    lines: ${hits.join(', ')}`);
    console.log(`    ${allow ? 'ALLOWED — ' + allow.reason : '>>> NOT ALLOWED (gate will fail)'}`);
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
    violations.push(`${rel} — ${hits.length} raw fetch() at line(s) ${hits.join(', ')} — NOT in allow-list`);
  } else if (hits.length > allow.max) {
    violations.push(
      `${rel} — ${hits.length} raw fetch() but allow-list permits ${allow.max} — ` +
        `a NEW bypass was added. Route it through kernel/http.ts or raise the bound with a reason.`,
    );
  }
}

// The wrapper must still be the one calling fetch — if the implementation moved,
// this gate is guarding the wrong file.
if (!readFileSync(join(ROOT, WRAPPER), 'utf8').includes('fetch(')) {
  violations.push(`${WRAPPER} no longer calls fetch() — gate is guarding the wrong file. Update WRAPPER.`);
}

console.log('');
console.log('─'.repeat(68));
console.log('   IO BOUNDARY — no raw fetch() outside kernel/http.ts');
console.log(`   scanned ${files.length} file(s) under netlify/functions/`);
console.log(`   ${found.size} known bypass file(s), ${Object.keys(ALLOWED).length} allow-listed`);
console.log('─'.repeat(68));

if (violations.length) {
  console.log('\n   ✗ GATE FAILED\n');
  for (const v of violations) console.log(`     ${v}`);
  console.log('\n   Every outbound call must go through kernel/http.ts so it is');
  console.log('   deadline-clamped, circuit-broken, bulkhead-limited, and traced.\n');
  process.exit(1);
}

console.log('\n   ✓ PASS — all raw fetch() sites are accounted for.\n');
