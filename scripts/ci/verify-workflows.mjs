#!/usr/bin/env node
/**
 * verify-workflows.mjs — the workflow files GitHub will actually ACCEPT.
 *
 * WHY THIS GATE EXISTS
 * --------------------
 * On 2026-09-17 this repository was measured and found to have **32 failed
 * workflow runs and zero successful ones, ever** — every run with zero jobs.
 * The cause was one expression in `_notify.yml`:
 *
 *   if: ${{ secrets.SLACK_WEBHOOK_URL != '' }}
 *
 * GitHub does not warn about that. It rejects the ENTIRE FILE:
 *
 *   Invalid workflow file: .github/workflows/ci.yml#L379
 *   error parsing called workflow ".github/workflows/ci.yml"
 *     -> "./.github/workflows/_notify.yml" :
 *   (Line: 81, Col: 13): Unrecognized named-value: 'secrets'.
 *
 * and a CALLED workflow that fails to parse makes its CALLER fail to parse too.
 * That single line therefore disabled ci.yml, deploy-staging.yml,
 * deploy-production.yml and rollback.yml at once — so CI never ran, and the
 * automatic post-deploy rollback had never been armed either.
 *
 * Nothing in this repository could see it. Every local gate passed, because
 * every local gate tests the code and none of them reads the workflow files as
 * GitHub reads them. The failure is invisible from inside the repo: the only
 * evidence was an annotation on a web page.
 *
 * THE RULES, AND WHY EACH IS NOT A STYLE PREFERENCE
 * -------------------------------------------------
 * W1  every workflow parses as a workflow at all (`name`, `on`, `jobs`).
 * W2  no `if:` references the `secrets` context. GitHub's context-availability
 *     table lists the contexts allowed per key, and `secrets` is absent from
 *     both `jobs.<id>.if` and `jobs.<id>.steps[*].if`. It IS allowed in `env`,
 *     `steps.env`, `steps.with` and `steps.run` — so the portable fix is always
 *     to map the secret to `env` and test it in the shell. That is what
 *     `_notify.yml` now does.
 * W3  every `uses: ./.github/workflows/<file>` target exists AND declares
 *     `workflow_call`. Calling a workflow that is not reusable is another
 *     parse-time rejection, i.e. the same silent total outage.
 * W4  `name:` is present and non-empty. When GitHub cannot parse a workflow it
 *     reports the FILE PATH as the workflow's name — that is the tell that
 *     identified the two broken files, and it costs nothing to keep honest.
 *
 * DEPENDENCY-FREE ON PURPOSE
 * --------------------------
 * `yaml` is not a declared dependency here; it is hoisted in from
 * `@netlify/config`. A CI gate that depends on a transitive package is a gate
 * that can disappear on the next `npm ci`, which is the same class of
 * "exists on disk, not in the checkout" mistake this repo has already paid for
 * twice. So this reads the files structurally, line by line, and says so.
 *
 * Scope: keys are matched at the START of a trimmed line, and YAML comment
 * lines are skipped. That is narrower than a parser and is deliberately so —
 * but it is exactly the surface on which these four rules are decidable, and
 * the mutation battery (verify-workflows.mutations.sh) proves each rule can
 * fail.
 *
 * Usage:
 *   node scripts/ci/verify-workflows.mjs
 *   node scripts/ci/verify-workflows.mjs --dir .github/workflows
 *
 * Exit: 0 pass · 1 a rule was violated · 2 tooling error (no workflows found)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const WORKFLOW_EXT = /\.(ya?ml)$/i;

/** A line that is a YAML comment, so never a key. */
const isComment = (line) => /^\s*#/.test(line);

/**
 * The value of `if:` on this line, with any trailing YAML comment removed.
 *
 * Returns null when the line is not an `if:` key. Handles both spellings GitHub
 * accepts: the `${{ … }}` form and a bare expression.
 */
export function ifValue(line) {
  if (isComment(line)) return null;
  const m = line.match(/^\s*(?:-\s*)?if\s*:\s*(.*)$/);
  if (!m) return null;
  let v = m[1].trim();
  const expr = v.match(/^\$\{\{(.*)\}\}\s*$/);
  if (expr) return expr[1];
  // Bare form: a trailing ` # comment` is not part of the condition.
  v = v.replace(/\s+#.*$/, '');
  return v;
}

/** Does this `if:` expression reference the `secrets` context? */
export function usesSecretsContext(expr) {
  if (expr === null) return false;
  // `secrets.FOO`, `secrets['FOO']`, and a bare `secrets` all fail the same way.
  return /\bsecrets\b/.test(expr);
}

/** Local reusable-workflow references: `uses: ./.github/workflows/x.yml`. */
export function localWorkflowRefs(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (isComment(line)) continue;
    const m = line.match(/^\s*(?:-\s*)?uses\s*:\s*['"]?\.\/\.github\/workflows\/([^'"\s#]+)/);
    if (m) out.push(m[1]);
  }
  return out;
}

export function checkWorkflows({ dir }) {
  const failures = [];
  const notes = [];

  if (!existsSync(dir)) {
    return { failures: [`workflow directory not found: ${dir}`], notes, files: [] };
  }
  const files = readdirSync(dir)
    .filter((f) => WORKFLOW_EXT.test(f))
    .sort();
  if (files.length === 0) {
    return { failures: [`no workflow files under ${dir}`], notes, files: [] };
  }

  for (const file of files) {
    const full = path.join(dir, file);
    const text = readFileSync(full, 'utf8');
    const lines = text.split(/\r?\n/);

    // ── W1 ──────────────────────────────────────────────────────────────────
    const hasOn = lines.some((l) => /^(?:on|'on'|"on")\s*:/.test(l));
    const hasJobs = lines.some((l) => /^jobs\s*:/.test(l));
    if (!hasOn) failures.push(`W1 ${file} — no top-level \`on:\` key`);
    if (!hasJobs) failures.push(`W1 ${file} — no top-level \`jobs:\` key`);

    // ── W4 ──────────────────────────────────────────────────────────────────
    const nameLine = lines.find((l) => /^name\s*:/.test(l));
    const nameValue = (nameLine ?? '').replace(/^name\s*:/, '').trim();
    if (!nameValue) {
      failures.push(`W4 ${file} — no non-empty top-level \`name:\` (GitHub falls back to the file path when a workflow will not parse)`);
    }

    // ── W2 ──────────────────────────────────────────────────────────────────
    lines.forEach((line, i) => {
      const expr = ifValue(line);
      if (usesSecretsContext(expr)) {
        failures.push(
          `W2 ${file}:${i + 1} — \`secrets\` in an \`if:\` expression: ${expr.trim()}\n` +
            `     GitHub rejects the WHOLE FILE with "Unrecognized named-value: 'secrets'",\n` +
            `     and any workflow that CALLS this one fails to parse with it.\n` +
            `     Fix: map it to \`env:\` on the job or step and test it in \`run:\` instead —\n` +
            `     \`secrets\` IS allowed in env/with/run, only \`if:\` excludes it.`,
        );
      }
    });

    // ── W3 ──────────────────────────────────────────────────────────────────
    for (const ref of localWorkflowRefs(text)) {
      const target = path.join('.github', 'workflows', ref);
      if (!existsSync(target)) {
        failures.push(`W3 ${file} — \`uses: ./${target.replace(/\\/g, '/')}\` but that file does not exist`);
        continue;
      }
      const targetText = readFileSync(target, 'utf8');
      if (!/workflow_call\s*:/.test(targetText)) {
        failures.push(
          `W3 ${file} — calls \`${ref}\`, which does not declare \`on: workflow_call\`.\n` +
            `     Calling a non-reusable workflow is a parse-time rejection: the caller dies too.`,
        );
      }
    }
  }

  notes.push(`scanned ${files.length} workflow file(s) in ${dir}`);
  return { failures, notes, files };
}

function main(argv) {
  const dirIdx = argv.indexOf('--dir');
  const dir = dirIdx >= 0 ? argv[dirIdx + 1] : '.github/workflows';

  console.log('Workflow acceptance gate');
  console.log('--------------------------------------------------------');
  const { failures, notes, files } = checkWorkflows({ dir });

  if (files.length === 0) {
    console.error('No workflows found — refusing to report a pass on an empty scan.');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(2);
  }

  for (const n of notes) console.log(`  ${n}`);
  console.log('  rules: W1 shape · W2 no `secrets` in `if:` · W3 callable targets · W4 name');

  if (failures.length) {
    console.error('\nWORKFLOW GATE FAILED');
    for (const f of failures) console.error(`  - ${f}`);
    console.error('\nA workflow GitHub will not parse is invisible from inside the repo:');
    console.error('every local gate still passes, and the run simply has zero jobs.');
    process.exit(1);
  }
  console.log('\nWORKFLOW GATE PASSED — every workflow is one GitHub can parse.');
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('verify-workflows.mjs')) {
  process.exit(main(process.argv.slice(2)));
}
