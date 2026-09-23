#!/usr/bin/env node
/**
 * verify-assets.mjs — the company-profile photos may not be published by accident.
 *
 * WHY THIS EXISTS
 *   `docs/COMPANY_PROFILE_DATA.md` §11.2 states a rule about photographs: this
 *   repo is PUBLIC, and the company profile contains faces of identifiable people
 *   — mostly young candidates, some possibly minors. Publishing them through a
 *   git repo is publication without limit and without a way to take it back. The
 *   rule is correct and it had NO ENFORCEMENT AT ALL until this file.
 *
 *   Measured 2026-09-20: 26 `.webp` files were sitting in `public/assets/` in the
 *   untracked state, and `.gitignore` contained not one pattern that mentioned
 *   them. `git add -A` — the command a tired person runs at the end of a session —
 *   would have committed every one of them, permanently, to a public repo. The
 *   only thing standing between the rule and that outcome was somebody reading
 *   §11.2 first. That is not a control, it is a hope.
 *
 *   The `.gitignore` block added alongside this gate closes the immediate hole.
 *   This gate closes the OTHER half, which ignore patterns cannot see: keeping the
 *   three sets in agreement.
 *
 * THE THREE SETS, AND WHY ALL THREE ARE NEEDED
 *
 *   1. ON DISK      what `public/assets/` actually contains
 *   2. PUBLISHED    what the site renders (`GALLERY` in src/lib/gallery.ts, plus
 *                   direct references in src/pages/index.astro)
 *   3. IGNORED      what `.gitignore` refuses to commit
 *
 *   The dangerous mismatch is 2-but-not-3: a photograph the page renders and the
 *   ignore list does not name. That is a face on the public site AND committable,
 *   and every individual step of adding it looks reasonable. The other direction,
 *   3-but-not-2, is merely untidy — it blocks something that is already invisible
 *   — but it is still reported, because a silently-growing ignore list is how the
 *   next person talks themselves into deleting the whole block.
 *
 *   A third check exists because of this repo's own history: the entry in
 *   `GALLERY_EXCLUDED` must never be a member of `GALLERY`. `gallery.test.ts`
 *   already asserts that from inside vitest; repeating it here is deliberate,
 *   because this gate runs in `ci:quality` BEFORE `npm run test`, so it is the one
 *   that fails first when somebody adds a mensetsu poster back.
 *
 * WHAT THIS GATE DOES *NOT* DO
 *   It does not judge whether a photograph is safe. It cannot — that is a human
 *   decision recorded in `gallery.ts` and §11.2. It only checks that the human
 *   decision is still reflected in all three places at once.
 *
 * USAGE
 *   node scripts/ci/verify-assets.mjs          gate (exit 1 on a mismatch)
 *   node scripts/ci/verify-assets.mjs --list   print all three sets
 *
 * EXIT CODES
 *   0  the three sets agree
 *   1  a rendered photo is not ignored, or an ignored photo is rendered
 *   2  the gate is looking at the wrong tree
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

const ASSETS_DIR = join(ROOT, 'public/assets');
const GALLERY_TS = join(ROOT, 'src/lib/gallery.ts');
const GITIGNORE = join(ROOT, '.gitignore');
const INDEX_ASTRO = join(ROOT, 'src/pages/index.astro');

// ── Guards: is this gate even looking at the right tree? ────────────────────
// A gate that silently finds zero files passes vacuously, which is worse than
// no gate because it looks like coverage.
const missing = [ASSETS_DIR, GALLERY_TS, GITIGNORE, INDEX_ASTRO].filter((p) => !existsSync(p));
if (missing.length) {
  console.error('\n   ✗ ASSET GATE — wrong tree; expected these to exist:\n');
  for (const m of missing) console.error(`     ${m}`);
  console.error('');
  process.exit(2);
}

/**
 * 1. Every photograph present in `public/assets/`.
 *
 * RECURSIVE, and that is a correctness fix made on 2026-09-20 — not a
 * convenience.
 *
 * This was `readdirSync(ASSETS_DIR)` (one level) while the REFERENCE scan below
 * (`indexSrc` matchAll) walks the whole path string. The two disagreed the first
 * time a subdirectory existed: `public/assets/ilustrasi/` holds 10 .webp files,
 * so the gate saw `src="/assets/ilustrasi/lokasi-banner.webp"` in `index.astro`,
 * looked for `ilustrasi/lokasi-banner.webp` in a flat listing, did not find it,
 * and reported PUBLISHED BUT MISSING — a broken-image failure for a file that
 * measurably decodes in a browser (naturalWidth 1200, verified over HTTP).
 *
 * Measured: flat scan 30 files, recursive 40 (the +10 are the ilustrasi set).
 * A gate whose "on disk" set and "referenced" set use different traversal depths
 * will always produce this false pair, so both now walk the same way.
 */
function walkWebp(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walkWebp(dir, rel));
    else if (entry.name.endsWith('.webp')) out.push(rel);
  }
  return out;
}

const onDisk = walkWebp(ASSETS_DIR).sort();

/**
 * 2. What the site renders.
 *
 * `GALLERY` is parsed TEXTUALLY, and the range matters: `gallery.ts` also holds
 * `GALLERY_EXCLUDED`, whose `src` values are paths the site must NOT render.
 * Slicing from the `GALLERY` declaration to the `GALLERY_EXCLUDED` declaration
 * keeps the two apart. This is not a stylistic choice — the Button battery in
 * this repo had a mutation SURVIVE for exactly this reason (an assertion that
 * filtered the set it was meant to police, so the decoy it existed to catch was
 * excluded from inspection). If the slice fails, the gate fails LOUDLY rather
 * than scanning the wrong text and reporting a clean result.
 */
const gallerySrc = readFileSync(GALLERY_TS, 'utf8');

function sliceBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) return null;
  const end = text.indexOf(endMarker, start + startMarker.length);
  return text.slice(start, end === -1 ? text.length : end);
}

const galleryBlock = sliceBetween(gallerySrc, 'export const GALLERY', 'export const GALLERY_EXCLUDED');
const excludedBlock = sliceBetween(gallerySrc, 'export const GALLERY_EXCLUDED', 'GALLERY_EXCLUDED: never');

if (galleryBlock === null || excludedBlock === null) {
  console.error('\n   ✗ ASSET GATE — could not locate the GALLERY / GALLERY_EXCLUDED blocks in');
  console.error(`     ${GALLERY_TS}`);
  console.error('     The gate slices text between these two declarations. If they were renamed,');
  console.error('     this gate would otherwise scan the wrong region and pass while checking nothing.\n');
  process.exit(2);
}

const srcPathsIn = (block) =>
  [...block.matchAll(/src:\s*'(\/assets\/[^']+)'/g)].map((m) => m[1].replace('/assets/', ''));

const galleryFiles = srcPathsIn(galleryBlock);
const excludedFiles = srcPathsIn(excludedBlock);

// Direct references outside gallery.ts (e.g. the #tentang building photo).
//
// MORE THAN index.astro, since 2026-09-20. This scan originally read only
// `index.astro`, which was accurate while every direct reference lived there.
// The landing redesign then moved the hero into `App.tsx` and the program-card
// illustrations into `companyProfile.ts`, so those files now render assets the
// gate could not see. The symptom was the mirror image of the traversal bug
// above: the gate reported four illustrations as "listed but not rendered" while
// a browser measurably decoded all four (naturalWidth 1200/1600, over HTTP).
//
// Consequence of NOT fixing it: `published` would be missing every asset wired
// through those two files, so check (c) — the broken-image check, the one that
// protects visitors — would never police them. An asset 404ing there would ship
// silently.
//
// A file that does not exist is skipped rather than treated as an error, so this
// list can name a file before it is created without breaking the gate.
const DIRECT_REF_SOURCES = [
  INDEX_ASTRO,
  join(ROOT, 'src/components/App.tsx'),
  join(ROOT, 'src/lib/companyProfile.ts'),
];

const REF_RE = /["'`](\/assets\/[^"'`\s]+\.webp)["'`]/g;

const directFiles = DIRECT_REF_SOURCES.flatMap((file) => {
  if (!existsSync(file)) return [];
  return [...readFileSync(file, 'utf8').matchAll(REF_RE)].map((m) =>
    m[1].replace('/assets/', ''),
  );
});

/**
 * INDIRECT references — a path assembled from data, so a literal-path regex
 * cannot see it.
 *
 * The three program illustrations are wired as:
 *     companyProfile.ts:  image: { name: 'program-magang', alt: …, w, h }
 *     IconTileGrid.tsx:   src={`/assets/ilustrasi/${tile.image.name}.webp`}
 * Neither file contains the string `/assets/ilustrasi/program-magang.webp`, so
 * the direct scan above finds nothing and all three assets fall out of
 * `published`. That is not cosmetic: check (c) only polices what is in
 * `published`, so without this those three could 404 and the gate would stay
 * green — the exact broken-image failure the check exists to catch.
 *
 * This resolves the ONE templated form the repo actually uses, by pairing the
 * `<basename>` literals in the `Tile.image` data with the directory in the URL
 * template. It is deliberately narrow: a general "find any interpolation"
 * scanner would be guessing, and a guess that silently matches nothing looks
 * identical to a pass.
 *
 * If the URL template or the data key is renamed, `TILE_IMAGE_NAMES` comes back
 * empty and the ILLUSTRATIONS-not-rendered note below fires — so the failure is
 * visible rather than silent.
 */
const TILE_URL_DIR = 'ilustrasi';
const TILE_IMAGE_SRC = readFileSync(join(ROOT, 'src/lib/companyProfile.ts'), 'utf8');
const TILE_IMAGE_NAMES = [...TILE_IMAGE_SRC.matchAll(/image:\s*\{\s*name:\s*'([^']+)'/g)].map(
  (m) => m[1],
);
const tileImageFiles = TILE_IMAGE_NAMES.map((n) => `${TILE_URL_DIR}/${n}.webp`);

// A scan whose expected input has moved must not pass quietly — the failure mode
// this whole block exists to avoid. `companyProfile.ts` is where Tile.image
// lives; if that data vanished, `tileImageFiles` is empty and the gate would go
// green while policing nothing.
if (TILE_IMAGE_NAMES.length === 0) {
  console.error('\n   ✗ ASSET GATE — found 0 `image: { name: … }` entries in');
  console.error(`     ${join(ROOT, 'src/lib/companyProfile.ts')}`);
  console.error('     The indirect-reference scan below can see nothing, so any asset wired');
  console.error('     through Tile.image would go unpoliced. Fix the pattern or remove this');
  console.error('     block — do not let it pass vacuously.\n');
  process.exit(2);
}

const published = [...new Set([...galleryFiles, ...directFiles, ...tileImageFiles])].sort();

/**
 * Photographs the owner has ruled publishable, with the basis for the ruling.
 *
 * THIS LIST IS A RECORD OF A DECISION, NOT A PLACE TO SILENCE A FAILURE.
 * Adding a filename here asserts that consent to publish exists. §11.2 is
 * explicit that consent is a PREREQUISITE, not a formality. Do not add an entry
 * to make the gate green.
 *
 * The list is populated from what was already rendering on 2026-09-20, i.e. the
 * state this gate found, NOT a judgement this gate made. Four of these nine DO
 * contain identifiable faces, and that is flagged to the owner as an open
 * question rather than treated as settled — see the finding raised alongside this
 * gate. The distinction the gate CAN enforce is the mechanical one, and it does:
 * everything not on this list must be blocked from git.
 */
const OWNER_APPROVED = new Set([
  // THE HEADING THAT USED TO SIT HERE READ: "Building and room interiors — no
  // identifiable face (§11.2's own safe set)". It was FALSE, and that was
  // measured on 2026-09-23 by opening all five files and looking at them:
  //
  //   fasilitas-gedung.webp         ~20 people in uniform batik, posed, facing camera
  //   fasilitas-kelas-bahasa-2.webp 8 men in a row, numbered chest tags 1·2·3·4·8
  //   fasilitas-ruang-tamu-1.webp   4 people holding documents up to the camera
  //   fasilitas-ruang-tamu-3.webp   3 young men holding documents
  //   fasilitas-ruang-kantor-1.webp was the fifth — a video-recording frame with a
  //                                 burned-in timestamp, now out of GALLERY and
  //                                 recorded in GALLERY_EXCLUDED instead
  //
  // Not one of them is a room with no identifiable face. The label is corrected
  // rather than deleted, because the mistake is the finding: four of these five
  // sat inside the "safe set" on the strength of an `alt` string that nothing had
  // ever checked against the picture. A list entry can carry a comment no gate
  // reads. Every face claim below was verified by eye on 2026-09-23, not read
  // from an alt.
  'fasilitas-gedung.webp', // ~20 people in uniform, posed group — seen, not assumed
  'fasilitas-kelas-bahasa-2.webp', // 8 men, numbered interview tags — seen
  'fasilitas-ruang-tamu-1.webp', // 4 people showing documents — seen
  'fasilitas-ruang-tamu-3.webp', // 3 young men showing documents — seen
  // FACES PRESENT. The consent basis is recorded here so the claim is visible
  // rather than implied. These four were moved out of CONSENT_OPEN on 2026-09-23
  // when the owner answered — see the note on that set below.
  'fasilitas-grup-staf.webp', // ~20 people in uniform — owner's ruling 2026-09-23
  'fasilitas-grup-siswa-1.webp', // ~50 people in uniform — owner's ruling 2026-09-23
  'galeri-keberangkatan-1.webp', // departure group — owner's ruling 2026-09-23
  'tim-hadi-prasojo.webp', // named individual, a manager — owner's ruling 2026-09-23
]);

/**
 * Photographs whose consent is an OPEN QUESTION, so they cannot be quietly
 * accepted as normal. This is not a second approval list — its members are the
 * ones §11.2's stated premise fails to cover.
 *
 * §11.2 calls the safe set "building/office/classroom photos which don't show
 * identifiable faces". Four of the nine photos on the page contradict that
 * premise: they show ~20 and ~50 people in uniform, and one named individual.
 * The owner's rule says consent is a PREREQUISITE, and applying that rule to a
 * photograph is a judgement this gate must not make. What it CAN do is refuse to
 * let the question go unnoticed.
 *
 * Every entry here must carry a `// CONSENT —` annotation in src/lib/gallery.ts.
 * The point is that a reader of gallery.ts meets the open question AT THE PHOTO,
 * rather than only in a report they may never open. Deleting the annotation to
 * tidy the file is what this check catches.
 *
 * When the owner answers: either remove the photo from GALLERY (and record it in
 * GALLERY_EXCLUDED), or move it out of this set and add the consent basis for it
 * next to its entry in OWNER_APPROVED. Do not simply delete the annotation.
 */
const CONSENT_OPEN = new Set([
  // EMPTY BY THE OWNER'S RULING, 2026-09-23. The four entries that used to live
  // here — fasilitas-grup-staf, fasilitas-grup-siswa-1, galeri-keberangkatan-1 and
  // tim-hadi-prasojo — moved into OWNER_APPROVED with their basis recorded beside
  // them, which is exactly the resolution the note above prescribes.
  //
  // WHAT WAS DECIDED, AND WHAT WAS NOT. The owner holds full authority over this
  // application and ruled these photographs publishable. That settles what this
  // site may publish. It is NOT a record that the ~70 people in uniform, or the
  // named manager, were asked. §11.2 makes consent a prerequisite; this gate
  // cannot verify consent and never could — all it can do is refuse to let the
  // question go unnoticed, which is what this set did from 2026-09-20.
  //
  // So: keep this set empty only while the ruling stands. Refilling it to silence
  // a failure is forbidden above. And an empty set is not evidence that consent
  // exists — it means the owner answered, not that anyone else did.
]);

/**
 * Photographs whose consent HISTORY must stay annotated in `gallery.ts`.
 *
 * WHY THIS SET EXISTS, AND WHY EMPTYING CONSENT_OPEN WAS NOT ENOUGH.
 * The four entries above were moved out of CONSENT_OPEN on 2026-09-23 when the
 * owner answered. Check (f) iterated CONSENT_OPEN, so the moment that set became
 * empty the check had nothing to walk — and the battery proved it: mutation M7,
 * which deletes an annotation, could no longer be killed. The annotations in
 * `gallery.ts` are the only place the history lives ("this was an open question
 * from 2026-09-20; the owner ruled on 2026-09-23"). Nothing enforced them.
 *
 * A record that nothing protects is a record that gets tidied away, and the
 * distinction those annotations draw — the owner approved publication, which is
 * not the same as the people depicted being asked — is the whole point of keeping
 * them. So check (f) walks this set as well. Removing an entry here to silence the
 * check would erase the only trace of the question.
 */
const CONSENT_RECORDED = new Set([
  'fasilitas-grup-staf.webp',
  'fasilitas-grup-siswa-1.webp',
  'galeri-keberangkatan-1.webp',
  'tim-hadi-prasojo.webp',
]);

/**
 * 3. What `.gitignore` refuses to commit.
 *
 * Read as patterns, not as prose: a path mentioned in the explanatory COMMENT
 * block must not count as an ignore rule. Every line is stripped of comments
 * before matching, so the long §11.2 explanation above the rules cannot make
 * this check pass by quoting the very filenames it is supposed to be guarding.
 */
const ignoreLines = readFileSync(GITIGNORE, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l.length > 0 && !l.startsWith('#'));

const ignored = new Set();
for (const line of ignoreLines) {
  const m = /^\/public\/assets\/(.+\.webp)$/.exec(line);
  if (m) ignored.add(m[1]);
}

/**
 * ILLUSTRATIONS — drawings, not photographs. §11.2 does not apply to them.
 *
 * WHY THIS SET EXISTS. Check (a) below enforces §11.2: a rendered, committable
 * photograph needs a recorded consent basis, because the repo is public and a
 * face cannot be unpublished. That rule is about PEOPLE. An illustration has no
 * subject who could consent or refuse, so requiring a consent entry for one is
 * not a stricter check — it is a category error that trains the reader to add
 * exemptions, which is how the real check next to it gets weakened.
 *
 * `docs/ILLUSTRATION_SPEC.md` §4 step 5 states the intent: illustrations must
 * not appear in `CONSENT_OPEN` because they have no consent basis. This is that
 * rule, made executable.
 *
 * WHY A SET AND NOT A PATTERN. A path-prefix test (`f.startsWith('ilustrasi/')`)
 * would silently cover every future file dropped in that directory, including a
 * real photograph of a real person. Listing names means adding a file requires a
 * deliberate edit here, which is the moment to ask "is this a drawing?" — the
 * same reasoning OWNER_APPROVED uses.
 *
 * These files were verified to be illustrations, not photographs, by opening
 * them: flat-vector scenes (Mt Fuji, a pagoda, a skyline, a factory, an open
 * book) with no human faces and no photographic content.
 */
const ILLUSTRATIONS = new Set([
  'ilustrasi/hero-sakura.webp',
  'ilustrasi/lokasi-banner.webp',
  'ilustrasi/program-bahasa.webp',
  'ilustrasi/program-magang.webp',
  'ilustrasi/program-ssw.webp',
]);

// ── Report mode ────────────────────────────────────────────────────────────
if (process.argv.includes('--list')) {
  const pad = (s, n) => s.padEnd(n);
  console.log('\n   ON DISK      PUBLISHED    IGNORED    PHOTOGRAPH');
  console.log(`   ${'─'.repeat(72)}`);
  for (const f of onDisk) {
    const pub = published.includes(f) ? '  yes  ' : '   -   ';
    const ign = ignored.has(f) ? '  yes  ' : '   -   ';
    const flag = published.includes(f) && !ignored.has(f) ? '   <-- RENDERED, COMMITTABLE' : '';
    console.log(`   ${pad('', 13 - 0)}${pub}    ${ign}    ${f}${flag}`);
  }
  console.log('');
}

// ── Verdict ────────────────────────────────────────────────────────────────
const violations = [];
const notes = [];

// (a) THE DANGEROUS ONE — rendered on the site and committable, without an
//     owner-approved basis on record.
//
//     Illustrations are excluded because the rule is about consent to publish a
//     PERSON's likeness and an illustration has no such subject — see the
//     ILLUSTRATIONS block above. The exclusion is narrow: it names files, and it
//     only skips THIS check. Every illustration is still held to the
//     published-but-missing check (c), so a wired illustration that 404s still
//     fails.
for (const f of published) {
  if (ILLUSTRATIONS.has(f)) continue;
  if (!OWNER_APPROVED.has(f) && !ignored.has(f)) {
    violations.push(
      `RENDERED AND COMMITTABLE, NO CONSENT ON RECORD — ${f}\n` +
        `        the site displays it, .gitignore does not block it, and it is not in\n` +
        `        OWNER_APPROVED. Either it should not be published (§11.2), or its\n` +
        `        consent basis needs recording — do not fix this by widening the gate.`,
    );
  }
}

// (a1) An illustration listed but never rendered is a dead entry — the same
//      "approval guarding nothing" case as (a2). Without this, the exclusion
//      above could be left behind after an asset is unwired and nobody would
//      notice the list had stopped describing the site.
for (const f of ILLUSTRATIONS) {
  if (!published.includes(f)) {
    notes.push(
      `ILLUSTRATION LISTED BUT NOT RENDERED — ${f}: in ILLUSTRATIONS but no page references it.`,
    );
  }
}

// (a2) An approved photo that is ALSO filled is fine, but an approved photo that
//      silently disappears from the page is worth surfacing: the approval would
//      still be listed while guarding nothing.
for (const f of OWNER_APPROVED) {
  if (!published.includes(f)) {
    notes.push(
      `APPROVED BUT NOT RENDERED — ${f}: listed in OWNER_APPROVED but no page references it.`,
    );
  }
}

// (b) An ignore rule naming a file that is not on disk is NORMAL HERE, not a
//     fault — and the first version of this check got that wrong.
//
//     Measured in a clean worktree at HEAD (the R11 pass): the face-bearing
//     photographs are gitignored, so a fresh checkout contains only the 12
//     permitted ones while `.gitignore` names 14 blocked paths. The gate went RED
//     at HEAD while passing on the machine where the photos had been copied.
//
//     That is precisely the false-red R11a exists to prevent, and it came from
//     treating absence as evidence of a typo. The rule's PURPOSE is different:
//     it stops a photograph from being committed on a machine where the file
//     DOES exist (the owner's, where E:\desain\ supplied them). On a machine that
//     never had them, the rule has nothing to do and that is correct.
//
//     So absence is not a violation, but it IS worth surfacing — a rule that is
//     absent everywhere may have been renamed, and the reader deserves to see
//     which rules are currently live. This becomes an informational note handled
//     below rather than a failure.
for (const f of ignored) {
  if (!onDisk.includes(f)) {
    // Deliberately not a violation. See the block above for why.
  }
}

// (c) A published path that is not on disk is a broken image on the live site.
for (const f of published) {
  if (!onDisk.includes(f)) {
    violations.push(
      `PUBLISHED BUT MISSING — ${f}\n` +
        `        referenced by the page but not present in public/assets/; this ships a\n` +
        `        broken image to every visitor.`,
    );
  }
}

// (d) The exclusions must stay excluded. This is the check that fires when
//     somebody "completes" the gallery with a mensetsu poster.
const leaks = excludedFiles.filter((f) => published.includes(f));
for (const f of leaks) {
  violations.push(
    `EXCLUDED PHOTOGRAPH IS PUBLISHED — ${f}\n` +
      `        it is listed in GALLERY_EXCLUDED with a recorded reason for NOT shipping\n` +
      `        it (a face, a third party's signature, a CCTV frame, or baked-in price)\n` +
      `        and it also appears in GALLERY. Read the reason in src/lib/gallery.ts\n` +
      `        before removing either one.`,
  );
}

/**
 * (d2) BLOCKED-FROM-GIT PHOTOGRAPHS MAY NOT BE RENDERED EITHER.
 *
 * This check exists because of a hole this gate's OWN mutation battery found, and
 * it is worth stating precisely because the first version looked complete and was
 * not. The two checks above each have a blind spot when taken alone:
 *
 *   · check (a) asks "rendered AND committable". A photo that IS in .gitignore
 *     passes it — being blocked from git looks like safety.
 *   · check (d) asks "in GALLERY_EXCLUDED and rendered". It only knows the four
 *     photos somebody wrote down.
 *
 * So a photograph that is blocked from git but NOT listed in GALLERY_EXCLUDED
 * passed BOTH. Measured: adding `galeri-mensetsu-okayama.webp` to GALLERY — the
 * exact edit a future contributor makes while "completing" the grid — left the
 * gate at exit 0. The mensetsu posters are in .gitignore but were never added to
 * GALLERY_EXCLUDED, so nothing objected to publishing them.
 *
 * The rule now enforced is the simple one: if a photograph is blocked from git, it
 * does not belong on the page. That is not a stylistic preference — .gitignore
 * blocks exactly the photographs §11.2 says must not be published, so rendering
 * one shows visitors a face that the repo itself refuses to carry.
 *
 * The remedy when this fires is to remove the photo from GALLERY, not to un-ignore
 * it. Record the reason in GALLERY_EXCLUDED so the next person finds it.
 */
for (const f of published) {
  if (ignored.has(f)) {
    violations.push(
      `BLOCKED PHOTOGRAPH IS PUBLISHED — ${f}\n` +
        `        .gitignore refuses to commit it (§11.2) and the page renders it anyway,\n` +
        `        so visitors see a photograph the repository itself will not carry.\n` +
        `        Remove it from GALLERY and add it to GALLERY_EXCLUDED with the reason.`,
    );
  }
}

// (f) A consent question must stay visible AT THE PHOTOGRAPH — both while it is
//     open, and after it has been answered.
//
//     `gallery.ts` parses textually above; here the SAME file is read for the
//     `// CONSENT —` annotation attached to each entry. The walk covers
//     CONSENT_OPEN (questions still open) AND CONSENT_RECORDED (questions the
//     owner answered, whose history must not be tidied away). Without the second
//     set this check went vacuous the moment CONSENT_OPEN was emptied — measured,
//     not predicted: mutation M7 stopped being killable.
//
//     The annotation is searched for INSIDE the entry that owns the src, not in a
//     fixed-size window before it. That distinction is not cosmetic: the first
//     version of this check looked back a flat 600 characters, and the mutation
//     battery caught it SURVIVING. A 600-char window reaches past the current
//     entry into the PREVIOUS one, so removing tim-hadi-prasojo's annotation left
//     the gate green — it was reading galeri-keberangkatan-1's comment and calling
//     it tim-hadi-prasojo's. Scoping to `{` … `},` makes the check measure the
//     photograph it names.
for (const f of new Set([...CONSENT_OPEN, ...CONSENT_RECORDED])) {
  if (!published.includes(f)) continue; // not on the page ⇒ nothing to annotate
  const marker = `'/assets/${f}'`;
  const at = galleryBlock.indexOf(marker);
  if (at === -1) continue; // already reported by another check
  const openBrace = galleryBlock.lastIndexOf('{', at);
  const closeBrace = galleryBlock.indexOf('},', at);
  if (openBrace === -1 || closeBrace === -1) continue; // unparseable; (a)/(c) cover it
  const entry = galleryBlock.slice(openBrace, closeBrace);
  if (!entry.includes('// CONSENT —')) {
    violations.push(
      `CONSENT ANNOTATION IS MISSING — ${f}\n` +
        `        its entry in src/lib/gallery.ts carries no '// CONSENT —' comment.\n` +
        `        That annotation is where the history lives: whether the question is\n` +
        `        still open (CONSENT_OPEN) or was answered by the owner\n` +
        `        (CONSENT_RECORDED), a reader of the gallery must meet it AT THE PHOTO.\n` +
        `        Restore the annotation. Do not clear this by deleting the entry from\n` +
        `        either set — for an open question that is the owner's decision, not a\n` +
        `        fix, and for a recorded one it erases the only trace of the ruling.`,
    );
  }
}

// (e) The gate must not pass vacuously.
if (onDisk.length === 0) {
  violations.push('NO PHOTOGRAPHS FOUND — public/assets/ holds no .webp files; this gate is checking nothing.');
}
if (published.length === 0) {
  violations.push('NOTHING PUBLISHED — no GALLERY or index.astro asset was parsed; the slice markers moved.');
}

const blocked = ignored.size;
const approved = [...OWNER_APPROVED].filter((f) => published.includes(f)).length;
const blockedHere = [...ignored].filter((f) => onDisk.includes(f)).length;

console.log('');
console.log('─'.repeat(68));
console.log('   COMPANY ASSET BOUNDARY — §11.2 photographs vs .gitignore');
console.log(`   ${onDisk.length} photograph(s) on disk · ${published.length} published · ${blocked} blocked from git`);
console.log(`   ${blockedHere} of those blocked rules are live on THIS machine (the rest guard copies not present here)`);
console.log(`   ${approved} published photograph(s) carry a recorded consent basis`);
console.log('─'.repeat(68));

if (notes.length) {
  console.log('');
  for (const n of notes) console.log(`   · ${n}`);
}

if (violations.length) {
  console.log('\n   ✗ GATE FAILED\n');
  for (const v of violations) console.log(`     ${v}\n`);
  console.log('   §11.2: this repo is public and the profile contains identifiable faces of');
  console.log('   young people, some possibly minors. Publication through the repo cannot be');
  console.log('   undone. Fix the mismatch — do not widen the gate.\n');
  process.exit(1);
}

console.log('\n   ✓ PASS — every published photograph is either blocked from git or safe to commit.\n');
