/**
 * verify-assets.mutations.mjs — proves `verify-assets.mjs` can actually FAIL.
 *
 * A gate never observed red is a hypothesis, not evidence (asj-session-rules R5).
 * This battery breaks the three-way agreement between disk, the page and
 * `.gitignore` in seven ways, each aimed at one documented check, and asserts that
 * the gate exits non-zero AND names that check.
 *
 * WHY THE `expect` STRING IS NOT ENOUGH ON ITS OWN
 *   Asserting only `status !== 0` would score a SURVIVED mutation as KILLED if the
 *   gate happened to crash for an unrelated reason (a syntax error, a moved
 *   marker). Every mutation therefore also asserts the gate's OUTPUT names the
 *   specific violation. A mutation that trips the wrong check scores
 *   WRONG-FAILURE, which is reported with the lines that did fail.
 *
 * WHY M2 MUTATES `.gitignore` RATHER THAN A SOURCE FILE
 *   The dangerous case this gate exists for is a photo that is rendered AND
 *   committable. The cheapest way to reproduce it is to delete an ignore rule,
 *   which is also EXACTLY the mistake a person makes while "tidying" the file.
 *
 * USAGE
 *   node scripts/ci/verify-assets.mutations.mjs
 *
 * EXIT CODES
 *   0  every mutation KILLED and both files restored byte-identically
 *   1  a mutation SURVIVED, a wrong-failure, or the tree was not restored
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const GATE = 'scripts/ci/verify-assets.mjs';
const GALLERY = 'src/lib/gallery.ts';
const GITIGNORE = '.gitignore';
/** Mutating the gate itself proves what it does and does not claim to check. */
const GATE_SELF = GATE;

const originals = {
  [GALLERY]: readFileSync(GALLERY, 'utf8'),
  [GITIGNORE]: readFileSync(GITIGNORE, 'utf8'),
  [GATE_SELF]: readFileSync(GATE_SELF, 'utf8'),
};

/**
 * Normalise a source file's line endings to LF before matching, and restore the
 * original bytes untouched afterwards.
 *
 * WHY THIS IS NOT COSMETIC. Measured in a clean worktree at HEAD: `gallery.ts`
 * checks out with CRLF on this machine, so every mutation `from` string ending in
 * `\n` failed to match and the battery reported `NOT-APPLIED — target not found`.
 * That reads like "the code moved" when in fact the WORKING COPY differs only in
 * line endings, and it scored 3/6 on a HEAD that was entirely correct.
 *
 * This is the repo's documented "CRLF × battery = silent killer" trap, and it is
 * the second time this battery has been fooled by a difference that is not about
 * the code. Matching is therefore done on an LF-normalised view, while the file on
 * disk is written back from the ORIGINAL bytes so `restored` stays exact.
 */
const lf = (s) => s.replace(/\r\n/g, '\n');

/**
 * Each mutation names the file it edits, a `from` it must find EXACTLY once (or
 * `all: true` when the target is deliberately repeated), and the `expect`
 * substring the gate must print.
 */
const MUTATIONS = [
  {
    name: 'M1 — a GALLERY_EXCLUDED member is added back to GALLERY',
    file: GALLERY,
    from: "export const GALLERY: readonly GalleryItem[] = Object.freeze([\n",
    to:
      "export const GALLERY: readonly GalleryItem[] = Object.freeze([\n" +
      "  {\n" +
      "    src: '/assets/poster-rekrutmen.webp',\n" +
      "    alt: 'Poster rekrutmen.',\n" +
      "    captionKey: 'profile.x',\n" +
      "    caption: 'Poster',\n" +
      "    width: 842,\n" +
      "    height: 1192,\n" +
      "  },\n",
    expect: 'EXCLUDED PHOTOGRAPH IS PUBLISHED',
  },
  {
    name: 'M1b — a gitignored mensetsu poster is rendered (the hole M1 could not reach)',
    file: GALLERY,
    from: "export const GALLERY: readonly GalleryItem[] = Object.freeze([\n",
    to:
      "export const GALLERY: readonly GalleryItem[] = Object.freeze([\n" +
      "  {\n" +
      "    src: '/assets/galeri-mensetsu-okayama.webp',\n" +
      "    alt: 'Peserta sesi wawancara penempatan Okayama.',\n" +
      "    captionKey: 'profile.x',\n" +
      "    caption: 'Mensetsu',\n" +
      "    width: 1200,\n" +
      "    height: 1390,\n" +
      "  },\n",
    // THE CHECK THIS BATTERY ADDED. The mensetsu posters are in .gitignore but not
    // in GALLERY_EXCLUDED, so the first version of this gate passed with one on the
    // page: check (a) only looks at committable photos, and check (d) only knows
    // the four entries somebody wrote down. See the (d2) note in the gate.
    expect: 'BLOCKED PHOTOGRAPH IS PUBLISHED',
  },
  {
    name: 'M2 — a RENDERED photo is dropped from OWNER_APPROVED (consent basis erased)',
    file: GATE_SELF,
    from: "  'tim-hadi-prasojo.webp', // named individual, a manager — owner's ruling 2026-09-23\n",
    to: '',
    expect: 'RENDERED AND COMMITTABLE, NO CONSENT ON RECORD',
  },
  {
    name: 'M3 — an excluded photo is quietly added to OWNER_APPROVED (consent fabricated)',
    file: GATE_SELF,
    from: "  'fasilitas-ruang-tamu-3.webp', // 3 young men showing documents — seen\n",
    to:
      "  'fasilitas-ruang-tamu-3.webp', // 3 young men showing documents — seen\n" +
      "  'fasilitas-ruang-kantor-2.webp',\n",
    // Approving a CCTV frame does NOT violate the gate (it is rendered-or-not, not
    // safe-or-unsafe) — the gate is explicit that safety is a human call. So the
    // correct expectation is that this mutation SURVIVES, and the battery ASSERTS
    // that: it documents the gate's real boundary instead of overclaiming.
    expect: '',
    expectSurvive: true,
  },
  {
    name: 'M4 — a published photo is removed from disk (broken image ships)',
    file: '__SKIP__',
    from: 'x',
    to: 'y',
    expect: 'PUBLISHED BUT MISSING',
  },
  {
    name: 'M5 — the GALLERY / GALLERY_EXCLUDED slice markers are renamed (gate guards nothing)',
    file: GALLERY,
    from: 'export const GALLERY_EXCLUDED',
    to: 'export const GALLERY_FORBIDDEN',
    expect: 'could not locate the GALLERY',
  },
  {
    name: 'M6 — an excluded photo is rendered while ALSO blocked from git (the (d2) rule)',
    file: GALLERY,
    from: "export const GALLERY: readonly GalleryItem[] = Object.freeze([\n",
    to:
      "export const GALLERY: readonly GalleryItem[] = Object.freeze([\n" +
      "  {\n" +
      "    src: '/assets/legal-jlpt-n1-hadi-prasojo.webp',\n" +
      "    alt: 'Sertifikat JLPT N1.',\n" +
      "    captionKey: 'profile.x',\n" +
      "    caption: 'JLPT N1',\n" +
      "    width: 1000,\n" +
      "    height: 1435,\n" +
      "  },\n",
    // Deliberately NOT a GALLERY_EXCLUDED member, so it only trips (d2). This is
    // the distinction the battery exists to keep honest: (d) is the written-down
    // list, (d2) is the mechanical rule, and a photo can need one without the
    // other. M1 and M1b cover the other combinations.
    expect: 'BLOCKED PHOTOGRAPH IS PUBLISHED',
  },
  {
    name: 'M7 — the CONSENT annotation is deleted from an open-question photo (check f)',
    file: GALLERY,
    from:
      "    // CONSENT — ANSWERED BY THE OWNER, 2026-09-23. Publishable by the owner's\n" +
      "    // ruling; see the note on `fasilitas-grup-staf.webp` above. This is the\n" +
      "    // sharpest case of the distinction that note draws: the subject is a NAMED\n" +
      "    // individual, and §11.2 is explicit that a public role and a certification do\n" +
      "    // not imply consent to appear in a public repo. An owner's ruling to publish\n" +
      "    // is a decision about this site; it is not the person agreeing.\n",
    to: '',
    // THE MUTATION THAT FOUND CHECK (f) WAS WRONG. Its first implementation looked
    // back a flat 600 characters from the src line, which reaches into the PREVIOUS
    // entry — so deleting this annotation left the gate GREEN, satisfied by
    // galeri-keberangkatan-1's comment. This mutation is the one that caught it, and
    // it stays in the battery so the scoping cannot regress to a window again.
    //
    // IT ALSO EARNED A SECOND JOB ON 2026-09-23. When the owner answered and
    // CONSENT_OPEN was emptied, this mutation stopped being killable at all — the
    // check it tests had nothing left to walk, so the annotations became
    // unenforced and deletable. That is what forced CONSENT_RECORDED into the
    // gate. If this mutation ever goes green again, the history has lost its
    // guard, not its question.
    expect: 'CONSENT ANNOTATION IS MISSING',
  },
];

const RESULTS = [];

for (const m of MUTATIONS) {
  if (m.file === '__SKIP__') {
    RESULTS.push({ name: m.name, verdict: 'SKIPPED', detail: 'handled separately below' });
    continue;
  }

  const original = originals[m.file];
  // Match against the LF-normalised view so a CRLF checkout cannot masquerade as
  // a moved target; write an LF-normalised result, which the restore step then
  // overwrites with the true original bytes regardless.
  const matchable = lf(original);
  const matches = matchable.split(m.from).length - 1;

  if (matches === 0) {
    RESULTS.push({ name: m.name, verdict: 'NOT-APPLIED', detail: `target not found: ${m.from.slice(0, 50)}` });
    continue;
  }
  if (!m.all && matches > 1) {
    RESULTS.push({
      name: m.name,
      verdict: 'NOT-APPLIED',
      detail: `${matches} matches for a unique target — refusing to guess which one`,
    });
    continue;
  }

  const mutated = m.all ? matchable.split(m.from).join(m.to) : matchable.replace(m.from, m.to);
  writeFileSync(m.file, mutated);
  const { status, output } = runGate();
  writeFileSync(m.file, original);

  // A mutation with `expectSurvive` asserts the gate does NOT catch it, which is
  // a real claim about the gate's boundary rather than a gap in the battery.
  if (m.expectSurvive) {
    RESULTS.push({
      name: m.name,
      verdict: status === 0 ? 'EXPECTED-PASS' : 'OVERCLAIM',
      detail:
        status === 0
          ? ''
          : 'gate failed on a change it does not claim to police — the battery and the gate disagree about the boundary',
    });
    continue;
  }

  const named = output.includes(m.expect);
  RESULTS.push({
    name: m.name,
    verdict: status !== 0 && named ? 'KILLED' : status === 0 ? 'SURVIVED' : 'WRONG-FAILURE',
    detail:
      status !== 0 && named
        ? ''
        : `exit=${status}; expected "${m.expect}"; got: ` +
          (output.split('\n').filter((l) => l.trim().startsWith('RENDERED') || l.trim().startsWith('EXCLUDED') || l.trim().startsWith('PUBLISHED') || l.trim().startsWith('IGNORED') || l.trim().startsWith('OPEN CONSENT') || l.includes('could not locate')).slice(0, 2).join(' | ') || '(no violation line)'),
  });
}

/**
 * M4 is run here rather than in the loop: deleting a real file is not a text
 * mutation, and doing it inside the shared loop would risk leaving the tree
 * broken if the process died mid-mutation.
 */
{
  const { renameSync } = await import('node:fs');
  const live = 'public/assets/fasilitas-gedung.webp';
  const parked = 'public/assets/__mut-parked.webp';
  renameSync(live, parked);
  const { status, output } = runGate();
  renameSync(parked, live);
  const named = output.includes('PUBLISHED BUT MISSING');
  const m4 = MUTATIONS.find((x) => x.expect === 'PUBLISHED BUT MISSING');
  RESULTS.push({
    name: m4 ? m4.name : 'M4 — a published photo is removed from disk (broken image ships)',
    verdict: status !== 0 && named ? 'KILLED' : status === 0 ? 'SURVIVED' : 'WRONG-FAILURE',
    detail: status !== 0 && named ? '' : `exit=${status}; expected "PUBLISHED BUT MISSING"`,
  });
}

// ── Restore verification ───────────────────────────────────────────────────
let restored = true;
for (const [file, content] of Object.entries(originals)) {
  if (readFileSync(file, 'utf8') !== content) {
    writeFileSync(file, content);
    restored = false;
  }
}

console.log('\nverify-assets.mutations — verdict per mutation');
console.log('-'.repeat(74));
for (const r of RESULTS) {
  console.log(`  ${r.verdict.padEnd(14)} ${r.name}`);
  if (r.detail) console.log(`                 ${r.detail}`);
}
console.log('-'.repeat(74));

const killed = RESULTS.filter((r) => r.verdict === 'KILLED').length;
const expectedPass = RESULTS.filter((r) => r.verdict === 'EXPECTED-PASS').length;
const counted = RESULTS.filter((r) => r.verdict !== 'SKIPPED' && r.verdict !== 'EXPECTED-PASS').length;
console.log(
  `killed ${killed}/${counted} · expected-pass ${expectedPass} · restored=${restored}`,
);

if (killed !== counted || !restored) {
  console.log('BATTERY RED — a mutation survived, failed for the wrong reason, or the tree was not restored.');
  process.exit(1);
}
console.log('BATTERY GREEN — every mutation was caught, files restored byte-identically.');

function runGate() {
  const r = spawnSync(process.execPath, [GATE], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } });
  return { status: r.status, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}
