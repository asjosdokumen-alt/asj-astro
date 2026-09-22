#!/usr/bin/env node
/**
 * verify-e2e-ports.mjs — "a probe's port matches the port it can actually reach".
 *
 * WHY THIS EXISTS
 *   Deleting the two orphan `e2e/verify-*.mjs` probes on 2026-09-18 removed the
 *   only scripts that defaulted to port **4322**. But the defect was never the
 *   two files — it was that NOTHING COULD SEE the disagreement.
 *
 *   Measured 2026-09-18, the day the orphans went: `e2e/measure-riwayat-card.mjs`
 *   instructed `BASE_URL=http://localhost:4322 ...` in its header while the code
 *   two lines below defaulted to `'http://localhost:4321'`. Copying the comment
 *   into a terminal starts a browser against a port where nothing is listening,
 *   and the failure looks like a broken page rather than a wrong address. That is
 *   the class this gate closes: a probe whose stated address and actual address
 *   disagree.
 *
 *   A SECOND, WORSE INSTANCE WAS FOUND WHILE WRITING IT. Three probes default to
 *   **4323** (`measure-bottomnav-tap`, `measure-bottomnav-clearance`,
 *   `shot-bottomnav-occlusion`) and a repo-wide search finds 4323 in **no other
 *   file** — no server binds it, no script starts one. They assume a human will
 *   bring up a second instance by hand on that port, and nothing records how.
 *   That is not the same defect as a lying comment (the comment and the default
 *   agree, so P2 passes) and it is not a wrong port either: 4323 is a
 *   deliberate, documented second-instance choice. So this gate does NOT call it
 *   a violation — it reports it as an UNBOUND port, because `BASE_URL` is
 *   mandatory for those three in practice and the honest thing a gate can do is
 *   say so out loud instead of reporting a green it did not earn.
 *
 * WHAT IT CHECKS
 *   For every probe under `e2e/` that reads `BASE_URL` (i.e. is a browser probe
 *   against a running server):
 *     P1  there IS a parseable default. A probe with no default cannot run
 *         without a hand-typed URL, which is how a wrong port survives review.
 *     P2  every `BASE_URL=...:<port>` written in a comment names the SAME port as
 *         the effective default. This is the exact `measure-riwayat-card` bug.
 *     P3  the default is a port the repo BINDS somewhere (derived, never typed
 *         here) — otherwise it is reported as UNBOUND with the reason, and
 *         `--strict` turns that into a failure.
 *
 * WHY THE SERVED SET IS DERIVED
 *   A hand-typed list of "allowed ports" would drift from the servers it
 *   describes, which is the same defect one level up. The set is read off
 *   `server.cjs` / `serve.cjs` / `astro.config.mjs` / `package.json`, and the
 *   gate REFUSES TO RUN (exit 2) if it comes up empty, because an empty set
 *   would make every probe look unbound.
 *
 * USAGE
 *   node scripts/ci/verify-e2e-ports.mjs            gate (unbound ports reported)
 *   node scripts/ci/verify-e2e-ports.mjs --strict   unbound ports FAIL
 *   node scripts/ci/verify-e2e-ports.mjs --list     print every probe and its port
 *
 * EXIT CODES
 *   0  no disagreement; unbound ports (if any) reported but not fatal
 *   1  a disagreement was found — or an unbound port, under --strict
 *   2  the gate is looking at the wrong tree, or found nothing to measure
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd().replace(/\\/g, '/');
const E2E = join(ROOT, 'e2e');
const LIST = process.argv.includes('--list');
const STRICT = process.argv.includes('--strict');

// ── Derive the served ports from the repo ───────────────────────────────────
// Never hand-type these: the whole point of the gate is that a number written in
// one place drifted from the number written in another. Read it off the sources
// that actually bind a port.
function servedPorts() {
  const ports = new Map(); // port -> where it came from
  const note = (port, why) => {
    const p = String(port);
    if (!ports.has(p)) ports.set(p, why);
  };

  const astro = join(ROOT, 'astro.config.mjs');
  if (existsSync(astro)) {
    const t = readFileSync(astro, 'utf8');
    for (const m of t.matchAll(/\bport\s*:\s*(\d{4,5})/g)) note(m[1], 'astro.config.mjs');
  }

  // `server.cjs` and `serve.cjs` bind the canonical port. `server.cjs` also has a
  // `findPort(PREFERRED_PORT)` fallback, which is why the port it BINDS on a busy
  // machine can differ from the one it prefers — that fallback is exactly why a
  // probe should not hard-code a second instance's port.
  for (const f of ['server.cjs', 'serve.cjs']) {
    const p = join(ROOT, f);
    if (!existsSync(p)) continue;
    const t = readFileSync(p, 'utf8');
    for (const m of t.matchAll(/(?:PREFERRED_PORT|PORT)\s*=\s*(\d{4,5})/g)) note(m[1], f);
    for (const m of t.matchAll(/\blisten\(\s*(\d{4,5})/g)) note(m[1], f);
  }

  const pkg = join(ROOT, 'package.json');
  if (existsSync(pkg)) {
    const t = readFileSync(pkg, 'utf8');
    for (const m of t.matchAll(/--port[= ](\d{4,5})/g)) note(m[1], 'package.json');
    for (const m of t.matchAll(/localhost:(\d{4,5})/g)) note(m[1], 'package.json');
  }

  // A battery that starts its own server declares the port it binds.
  if (existsSync(E2E)) {
    for (const f of readdirSync(E2E)) {
      if (!f.endsWith('.mutations.sh')) continue;
      const t = readFileSync(join(E2E, f), 'utf8');
      for (const m of t.matchAll(/(?:BASE_URL|PORT)[^\n]*?localhost:(\d{4,5})/g)) note(m[1], `e2e/${f}`);
    }
  }

  return ports;
}

// ── Measure every probe ─────────────────────────────────────────────────────
function probes() {
  if (!existsSync(E2E)) return [];
  return readdirSync(E2E)
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => ({ file: f, path: join(E2E, f), text: readFileSync(join(E2E, f), 'utf8') }))
    .filter((p) => /BASE_URL/.test(p.text));
}

function declaredPort(text) {
  // The effective default: `process.env.BASE_URL || 'http://host:PORT'`.
  const m = /process\.env\.BASE_URL\s*\|\|\s*['"`]https?:\/\/[^:'"`]*:(\d{4,5})/.exec(text);
  return m ? m[1] : null;
}

function commentPorts(text) {
  // Any `BASE_URL=...:<port>` appearing inside a comment line. Both `//` and
  // a JSDoc `*` prefix are comments; a real shell invocation in prose is the
  // thing under test, and that is exactly what a reader copies.
  const out = new Set();
  for (const line of text.split(/\r?\n/)) {
    const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);
    if (!isComment) continue;
    for (const m of line.matchAll(/BASE_URL=https?:\/\/[^:\s'"`]*:(\d{4,5})/g)) out.add(m[1]);
  }
  return [...out];
}

// ── Run ─────────────────────────────────────────────────────────────────────
const served = servedPorts();
const all = probes();

if (!served.size) {
  console.error('GATE ERROR: could not derive any served port from the repo.');
  console.error('  The gate refuses to guess — a wrong served set would pass every probe.');
  process.exit(2);
}
if (!all.length) {
  console.error('GATE ERROR: found no e2e probe reading BASE_URL.');
  console.error(`  Looked in ${E2E}. Zero matches is a measurement failure, not a clean result.`);
  process.exit(2);
}

const findings = [];
const unbound = [];
for (const p of all) {
  const def = declaredPort(p.text);
  const commented = commentPorts(p.text);

  if (LIST) {
    console.log(
      `${p.file.padEnd(38)} default=${def ?? '(none)'}  comments=[${commented.join(', ')}]`
    );
  }

  if (def === null) {
    findings.push(
      `${p.file}: reads BASE_URL but has no parseable default ` +
        `(expected \`process.env.BASE_URL || 'http://host:PORT'\`). ` +
        `Without a default the probe cannot run without a hand-typed URL, ` +
        `which is how a wrong port survives review.`
    );
    continue;
  }

  if (!served.has(def)) {
    // NOT a violation by itself. Three probes deliberately want a SECOND server
    // instance; the repo never binds their port, so in practice BASE_URL is
    // mandatory for them. Report it, do not pretend it is covered.
    unbound.push({ file: p.file, port: def });
  }

  for (const c of commented) {
    if (c !== def) {
      findings.push(
        `${p.file}: a comment tells the reader to use port ${c}, but the code defaults to ${def}. ` +
          `Copying the comment starts a browser against the wrong address — this is the ` +
          `measure-riwayat-card defect (2026-09-18).`
      );
    }
  }
}

if (LIST) {
  console.log(`\nports the repo BINDS: ${[...served.entries()].map(([p, w]) => `${p} (${w})`).join(', ')}`);
}

if (unbound.length) {
  const lines = unbound.map((u) => `${u.file}=${u.port}`);
  const message =
    `UNBOUND (not a violation, but not covered either): ${lines.join(', ')}. ` +
    `The repo binds only ${[...served.keys()].join(', ')}; these probes need a second ` +
    `server instance on another port and nothing starts one. BASE_URL is therefore ` +
    `mandatory for them in practice.`;
  if (STRICT) findings.push(message);
  else console.log(`NOTE ${message}`);
}

if (findings.length) {
  console.error('E2E PORT GATE FAILED');
  for (const f of findings) console.error(`  - ${f}`);
  console.error(
    `\nMeasured ${all.length} probe(s): ` +
      all.map((p) => `${p.file}=${declaredPort(p.text) ?? 'NO-DEFAULT'}`).join(', ')
  );
  process.exit(1);
}

console.log(
  `E2E PORT GATE PASSED — ${all.length} probe(s) have a declared default that matches ` +
    `their comment (${all.length - unbound.length} bound to a repo port, ${unbound.length} needing BASE_URL).`
);
