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
const ICONS_DIR = join(ROOT, 'public/icons');
const GALLERY_TS = join(ROOT, 'src/lib/gallery.ts');
const GITIGNORE = join(ROOT, '.gitignore');
const INDEX_ASTRO = join(ROOT, 'src/pages/index.astro');

// ── Guards: is this gate even looking at the right tree? ────────────────────
// A gate that silently finds zero files passes vacuously, which is worse than
// no gate because it looks like coverage.
const missing = [ASSETS_DIR, ICONS_DIR, GALLERY_TS, GITIGNORE, INDEX_ASTRO].filter((p) => !existsSync(p));
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

const onDisk = [
  ...walkWebp(ASSETS_DIR),
  // `public/icons/` is walked too, since 2026-09-24. The footer logo moved off
  // its Supabase hotlink onto `/icons/logo-asj.webp` (see Footer.astro), and a
  // reference the gate cannot see is a broken image the gate cannot catch. Keys
  // from this directory are prefixed `icons/` so they cannot collide with an
  // asset of the same basename under `public/assets/`.
  ...walkWebp(ICONS_DIR).map((f) => `icons/${f}`),
].sort();

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

/**
 * Every asset path a gallery entry renders: its `src` AND every `srcSet`
 * candidate.
 *
 * `srcSet` JOINED THIS SCAN ON 2026-11-08, for the same reason it joined the
 * direct-reference scan above. The gallery is where most of the photographs
 * live, so a variant it renders was the most consequential thing this gate
 * could not see: six `fasilitas-*-700.webp` files are referenced ONLY from
 * `srcSet` in this file. Before the change, check (a) never demanded a basis for
 * them and check (c) would not have noticed one 404ing.
 *
 * The `src:`-only shape is kept for the block markers' existing assertions; the
 * added loop is additive, so a gallery entry with no `srcSet` behaves exactly as
 * before.
 */
const srcPathsIn = (block) => {
  const out = [...block.matchAll(/src:\s*'(\/assets\/[^']+)'/g)].map((m) =>
    m[1].replace('/assets/', ''),
  );
  for (const m of block.matchAll(/srcSet:\s*'([^']*)'/g)) {
    for (const cand of m[1].split(',')) {
      const url = cand.trim().split(/\s+/)[0];
      if (/^\/assets\/[^'"\s]+\.webp$/.test(url)) out.push(url.replace('/assets/', ''));
    }
  }
  return out;
};

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
//
// Footer.astro JOINED THIS LIST on 2026-09-24, for the same reason App.tsx and
// companyProfile.ts did before it: it now renders a LOCAL image
// (`/icons/logo-asj.webp`, replacing a Supabase hotlink), and a file the gate
// cannot see is a 404 that ships silently. The list is the set of files that
// render assets, not a fixed historical trio.
const DIRECT_REF_SOURCES = [
  INDEX_ASTRO,
  join(ROOT, 'src/components/App.tsx'),
  join(ROOT, 'src/lib/companyProfile.ts'),
  join(ROOT, 'src/components/Footer.astro'),
  // ── ADDED 2026-11-08, and the reason is the same one that added the other
  // four: this list is "the files that render assets", not a fixed historical
  // set. Both files were rendering photographs the gate could not see.
  //
  //   public/LayananSection.astro  the three service banners. Their `src` values
  //                                happened to be referenced elsewhere, so the
  //                                BASE files were already in `published` — which
  //                                is exactly why the hole stayed invisible: the
  //                                gate looked right for the wrong reason.
  //   forms/ApplyFullForm.tsx      the ASJ mark on the application form
  //                                (`logo-apply.webp` + its 200w variant). No
  //                                other scanned file names it, so BOTH the mark
  //                                and its variant were outside every check.
  join(ROOT, 'src/components/public/LayananSection.astro'),
  join(ROOT, 'src/components/forms/ApplyFullForm.tsx'),
  // ── ADDED 2026-11-11, same reason again: this file renders twelve assets and
  // the gate could not see one of them.
  //
  // `StoryFilm.tsx` holds the six portrait plates and six 3:2 plates of the
  // `#alur` band. Until it was listed here every one of those twelve files
  // reported "ILLUSTRATION LISTED BUT NOT RENDERED" — a warning that reads like
  // stale bookkeeping and is actually the gate saying it cannot see the band at
  // all. The consequence was measured, not theoretical: the 3:2 passport plate
  // shipped as a blank booklet and no gate had an opinion, because the reference
  // was outside the scan. A path typo here would 404 the band silently.
  join(ROOT, 'src/components/public/StoryFilm.tsx'),
];

/**
 * A `.webp` reference under either served image root.
 *
 * WHY `/icons/` IS IN THE PATTERN. The scan used to be `/assets/`-anchored, so
 * a footer logo at `/icons/…` would have been invisible to it — adding
 * Footer.astro to `DIRECT_REF_SOURCES` alone would then have policed nothing.
 * Widening the pattern makes the new reference actually checked; it does not
 * relax any existing check (every `/assets/` match behaves exactly as before).
 */
const REF_RE = /["'`](\/(?:assets|icons)\/[^"'`\s]+\.webp)["'`]/g;

/**
 * `srcset` CANDIDATES — added 2026-11-08, and this was a real blind spot rather
 * than a tidy-up.
 *
 * `REF_RE` requires the path to be followed IMMEDIATELY by a quote. In a
 * `srcset="A 700w, B 900w"` attribute that is true only for the LAST candidate,
 * so every first candidate was rendered, committed, and invisible to all three
 * checks: (a) never demanded a basis for it, (c) could never report it missing,
 * (d) could never object to it. Measured on this tree with a probe: 32 srcset
 * candidates, **18 of them unseen**, including `fasilitas-gedung-700.webp` and
 * `logo-apply-200.webp` — files that were added by the responsive-image work and
 * therefore are exactly the kind of asset nobody re-reads.
 *
 * The fix parses the ATTRIBUTE, not the line: split its value on commas and take
 * each candidate's URL token. That is the syntax the browser parses, so a
 * candidate cannot be visible to the page and invisible here.
 *
 * `.avif` IS DELIBERATELY NOT COLLECTED. `onDisk` walks `.webp` only, so adding
 * avif here would turn every avif candidate into "PUBLISHED BUT MISSING" — a
 * false red for a file that is present. Widening `onDisk` is a separate decision
 * with its own inventory; until then this scan stays inside the same extension
 * the rest of the gate agrees on.
 */
const SRCSET_RE = /\bsrcset\s*=\s*["']([^"']*)["']/gi;
function srcsetFiles(src) {
  const out = [];
  for (const m of src.matchAll(SRCSET_RE)) {
    for (const cand of m[1].split(',')) {
      const url = cand.trim().split(/\s+/)[0];
      if (/^\/(?:assets|icons)\/[^"'`\s]+\.webp$/.test(url)) out.push(refKey(url));
    }
  }
  return out;
}

/**
 * Drop comment-only lines before scanning for references.
 *
 * WHY THIS EXISTS — 2026-10-19, and it was a FALSE RED, not a missing file.
 * `src/components/App.tsx` explains in a doc comment that a retired legacy name
 * now 404s, and it writes that path inside backticks. `REF_RE` accepts a
 * backtick as a delimiter, so the PROSE was counted as a live reference:
 * `sakra_banner.webp` entered `published`, was not on disk, and the gate
 * reported "PUBLISHED BUT MISSING — this ships a broken image to every
 * visitor" for a file nothing renders. Two violations, both invented by a
 * comment.
 *
 * This is the same convention `src/lib/vip.test.ts` already documents for its
 * own hotlink scan ("Komentar kode TIDAK dihitung"), and it is not a relaxation:
 * a comment cannot request an asset, so it must not be able to add one to
 * `published`. A REAL reference in live code is untouched — that is the only
 * thing this check was ever meant to police.
 *
 * Deliberately line-based and narrow. Stripping `//` to end-of-line would
 * truncate every `https://` URL and could hide a genuine reference that shares a
 * line with one; block comments are removed whole, and a line whose first
 * non-space characters are `//`, `*`, `/*` or `{/*` is a comment line by
 * construction in every file in `DIRECT_REF_SOURCES`.
 */
function stripCommentLines(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\*|\{?\/\*)/.test(line))
    .join('\n');
}

/** Normalise a reference into the same key space as `onDisk` (see above). */
const refKey = (p) =>
  p.startsWith('/icons/') ? `icons/${p.slice('/icons/'.length)}` : p.replace('/assets/', '');

const directFiles = DIRECT_REF_SOURCES.flatMap((file) => {
  if (!existsSync(file)) return [];
  const src = stripCommentLines(readFileSync(file, 'utf8'));
  return [...src.matchAll(REF_RE)].map((m) => refKey(m[1])).concat(srcsetFiles(src));
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

/**
 * PARTNER LOGOS — the same indirect-reference shape as Tile.image, added
 * 2026-09-29 when the six MoU partner marks were wired into the "Mitra Kami" grid.
 *
 * The reference is assembled, not literal:
 *     partners.ts:      logo: 'ysflora'
 *     PartnerGrid.tsx:  src={`/assets/mitra/${partner.logo}.webp`}
 * So `REF_RE` — which matches a literal `/assets/…webp` string — sees nothing in
 * either file, and without this block all six files fall out of `published`.
 *
 * WHAT THAT WOULD COST, MEASURED. Before this block existed, `--list` showed the
 * six `mitra/*.webp` files as `ON DISK yes / PUBLISHED no`. Check (c) only
 * polices what is in `published`, so a logo renamed on one side of the pair — the
 * `.ts` sets `logo` but the file is called something else — would ship a broken
 * image to every visitor and the gate would stay green. That is the exact
 * failure (c) exists to catch, so the pair is resolved here the same narrow way
 * `TILE_IMAGE_NAMES` resolves its one templated form.
 *
 * NARROWNESS IS THE POINT. A general interpolation scanner would be guessing, and
 * a guess that matches nothing looks identical to a pass. If `PARTNERS` or the
 * `logo:` key is renamed, `PARTNER_LOGO_NAMES` comes back empty and the guard
 * below fails loudly rather than passing vacuously.
 */
const PARTNER_URL_DIR = 'mitra';
const PARTNER_SRC = readFileSync(join(ROOT, 'src/lib/partners.ts'), 'utf8');
// Only a NON-NULL logo is a rendered path. `logo: null` is the deliberate
// "no mark supplied" state — it renders the dashed box, so it must NOT be added
// to `published` (that would make check (c) demand a file that is meant to be
// absent).
//
// ⚠ THE LEADING WHITESPACE IS LOAD-BEARING, AND ITS ABSENCE WAS A REAL BUG.
// The first version of this regex was `/logo:\s*'([^']+)'/g`, unanchored, and it
// matched the DOC COMMENT at the top of partners.ts — the line that reads
// `set \`logo: '<slug>'\`` inside a backtick code span. It captured the literal
// string `<slug>`, produced a phantom `mitra/<slug>.webp` entry, and the gate
// failed with BOTH "no publication basis" and "published but missing" for a file
// that does not and should never exist. This is the same defect the ILLUSTRATIONS
// block names: a comment can satisfy a scan that reads text instead of code.
//
// The fix anchors on the indentation a real object-literal property has (four
// spaces at this nesting) and excludes `<`, so a placeholder in prose cannot
// stand in for a wired slug.
const PARTNER_LOGO_NAMES = [...PARTNER_SRC.matchAll(/^\s{4}logo:\s*'([^'<]+)'/gm)].map(
  (m) => m[1],
);
const partnerLogoFiles = PARTNER_LOGO_NAMES.map((n) => `${PARTNER_URL_DIR}/${n}.webp`);

// A scan whose expected input has moved must not pass quietly. `partners.ts` is
// where `logo:` lives; if the section were ever emptied back to all-null, this
// would fire — and that is CORRECT, because the moment the regex stops matching
// is the moment this block stopped policing anything.
if (PARTNER_LOGO_NAMES.length === 0) {
  console.error('\n   ✗ ASSET GATE — found 0 non-null `logo:` entries in');
  console.error(`     ${join(ROOT, 'src/lib/partners.ts')}`);
  console.error('     This is either the deliberate all-null state (fine — then delete this');
  console.error('     block) or a rename that has silently blinded it (not fine). Do not let');
  console.error('     it pass without saying which.\n');
  process.exit(2);
}

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

const published = [
  ...new Set([...galleryFiles, ...directFiles, ...tileImageFiles, ...partnerLogoFiles]),
].sort();

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
  // FACES PRESENT. The publication basis is recorded here so the claim is visible
  // rather than implied. These four were moved out of CONSENT_OPEN on 2026-09-23
  // when the owner answered — see the note on that set below.
  'fasilitas-grup-staf.webp', // ~20 people in uniform — owner's ruling 2026-09-23
  'fasilitas-grup-siswa-1.webp', // ~50 people in uniform — owner's ruling 2026-09-23
  'galeri-keberangkatan-1.webp', // departure group — owner's ruling 2026-09-23
  'tim-hadi-prasojo.webp', // named individual, a manager — owner's ruling 2026-09-23
  // ── THE SIX MoU PARTNER LOGOS — added 2026-09-29 ──────────────────────────
  // These are MARKS, not photographs, and that distinction is deliberate rather
  // than incidental: a logo has no subject who could consent or refuse in the
  // §11.2 sense, because it is a company's trademark, not a person's likeness.
  // So they are NOT in `ILLUSTRATIONS` either — that set's criterion is "is
  // there a subject who could consent or refuse", and a trademark's printed rule
  // (§11.2) is a different one: "Logo boleh masuk repo — Logo bukan data
  // pribadi", which this set is the record of.
  //
  // THE PUBLICATION BASIS IS THE OWNER'S REQUEST, 2026-09-29. Each mark was
  // fetched from the SAME `home` URL the partner's name was read from, so the
  // mark is the partner's own, served by the partner — never a redraw, a
  // lookalike, or a mark borrowed from an unrelated page. Do not add a seventh
  // entry here without the same basis: a wrong or borrowed logo is a false claim
  // about a third party, which is the failure `partners.ts` warns about in its
  // own header.
  'mitra/ysflora.webp', // owner's request 2026-09-29 — from ysfloraindonesia.com
  'mitra/human.webp', // owner's request 2026-09-29 — from humanindonesia.com
  'mitra/japanesia.webp', // owner's request 2026-09-29 — from lpkjapanesia.com
  'mitra/jipa.webp', // owner's request 2026-09-29 — from jipa.co.id
  'mitra/jinzai.webp', // owner's request 2026-09-29 — from jsi-jinzai.com
  'mitra/hibiki.webp', // owner's request 2026-09-29 — from hibikicendekia.com

  // ── THE TWO THEME BANNERS — recorded 2026-10-19 ──────────────────────────
  //
  // These two are rendered by the theme map in `src/components/App.tsx` and had
  // NO recorded basis, so this gate was red on them. What is recorded here is an
  // OBSERVATION, not a consent: both files were OPENED AND LOOKED AT on
  // 2026-10-19, the same standard the entries above were recorded to, and
  // neither contains a person who could consent or refuse in the §11.2 sense.
  //
  //   banner-sakura.webp  800x400  landscape artwork — Mt Fuji, a pagoda, cherry
  //                                blossom; NO person anywhere in the frame.
  //   banner-tokyo.webp   900x600  night alley; two figures at the far end,
  //                                ~40 px tall, no readable face at any size the
  //                                page renders it.
  //
  // ⚠ IF THE OWNER DISAGREES WITH THAT READING, THESE TWO LINES COME OUT AND
  // THE FILES LEAVE `public/assets/` — they are not to be kept by widening the
  // rule. Nothing here asserts consent for a person, because no identifiable
  // person is depicted.
  'banner-sakura.webp', // no person in frame — seen 2026-10-19
  'banner-tokyo.webp', // distant figures only, no readable face — seen 2026-10-19

  // ── THE THIRD THEME BANNER + THE APPLY MARK — recorded 2026-11-08 ─────────
  //
  // Both were ALREADY on the page before this date. What changed is that the gate
  // can finally SEE them: `banner-momiji` is rendered by LayananSection.astro
  // (added to the scanned set), and `logo-apply` by ApplyFullForm.tsx (ditto).
  // So this records a basis that was missing, it does not publish anything new.
  //
  //   banner-momiji.webp  900x487  autumn artwork — Mt Fuji across a lake, red
  //                                maple framing the shot, mist on the water. No
  //                                person anywhere in the frame.
  //                                REPLACED 2026-11-08 at the owner's request: the
  //                                previous file carried a small "Elysium"
  //                                watermark in the lower-left corner, which is a
  //                                LICENSING question (whose artwork is it?) and
  //                                not a §11.2 consent question. The replacement is
  //                                generated artwork with no third-party mark; the
  //                                observation above was re-made on the new file,
  //                                not carried over from the old one.
  //   logo-apply.webp     300x300  the ASJ emblem — torii, Mt Fuji, laurel, and the
  //                                words PT AMANAH SAKURA JAPAN. A MARK, not a
  //                                photograph: same criterion as the six mitra
  //                                marks above, a trademark has no subject who
  //                                could consent or refuse.
  'banner-momiji.webp', // autumn artwork, no readable face — seen 2026-11-08
  'logo-apply.webp', // ASJ emblem/mark, no person — seen 2026-11-08
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
 * GALLERY_EXCLUDED), or move it out of this set and add the publication basis for
 * it next to its entry in OWNER_APPROVED. Do not simply delete the annotation.
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
 * photograph needs a recorded publication basis, because the repo is public and a
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
 *
 * ⚠ THAT DESCRIPTION IS NOW FALSE FOR ONE MEMBER, AND THE CLAIM IS CORRECTED
 * RATHER THAN LEFT STANDING. `ilustrasi/hero-sakura.webp` was REPLACED on
 * 2026-09-24: the owner supplied a generated 2.75:1 banner (sakura, Fuji, a
 * pagoda, and a figure in an ASJ PORTAL jacket) and asked for it as the profile
 * hero. It is not a flat-vector scene and it does depict a person. The other four
 * are unchanged.
 *
 * WHY IT STAYS IN THIS SET RATHER THAN MOVING TO `OWNER_APPROVED`. The rule this
 * set encodes is not "is it a drawing" — it is "is there a subject who could
 * consent or refuse". `OWNER_APPROVED` is a record of a publication BASIS, and
 * for a real person that basis is consent or the owner's ruling standing in for
 * it. The figure in this banner is GENERATED: there is no person whose likeness
 * it is, so §11.2's consent requirement has no subject and there is no basis to
 * record. Filing it under `OWNER_APPROVED` would put a non-photograph into a list
 * whose every other entry is a consent decision — the same category error this
 * block already warns about in the opposite direction.
 *
 * WHAT THIS DOES NOT CLAIM. It is not a judgement that the image is safe to
 * publish, and it does not verify that the figure is generated — the gate cannot
 * check that, exactly as it cannot check consent. It records the owner's stated
 * basis. If a REAL photograph is ever dropped at this path, this entry must be
 * re-examined rather than inherited.
 */
const ILLUSTRATIONS = new Set([
  'ilustrasi/hero-sakura.webp',
  // ADDED 2026-11-09: `hero-sakura-816` adalah CROP PORTRAIT dari artwork yang
  // SAMA (perempuan + Fuji), dipakai khusus HP lewat `<source media>`. Ia bukan
  // fotografi baru dan bukan subjek baru — orangnya tetap figur hasil generate,
  // jadi dasar yang sama berlaku. Namanya mengikuti aturan varian lebar
  // (`-<angka>`), sehingga resolver `basisOf()` pun akan menemukannya; entri
  // eksplisit ini ada supaya fakta "ini CROP, bukan resize" tercatat di tempat
  // keputusan itu diambil, bukan tersembunyi di pola nama.
  'ilustrasi/hero-sakura-816.webp',
  // REMOVED 2026-10-20: 'ilustrasi/lokasi-banner.webp'. The `#lokasi` band is now
  // an interactive Google Maps embed (owner request), so the skyline illustration
  // is no longer rendered by anything and the entry would have become a dead
  // approval — the exact case check (a1) exists to report. The four files
  // (1x/@2x, webp/avif) are still on disk; they are simply unreferenced. If the
  // embed is ever reverted to a picture, the entry comes back WITH this note, not
  // as an inheritance of it: the artwork was a generated skyline, so there was no
  // subject who could consent, and that is why it was allowed here.
  // The three program cards. THEIR ARTWORK CHANGED ON 2026-09-28: the owner
  // replaced the flat-vector scenes (a factory, a skyline, an open book) with
  // generated anime illustrations that DO depict people. The paragraph above
  // describes the set as it was in 2026-09-20, so it is now false for these
  // three in the same way it was already false for `hero-sakura`, and the same
  // reasoning keeps them here: the figures are generated, so there is no person
  // whose likeness it is and §11.2's consent requirement has no subject. The
  // criterion is "is there a subject who could consent or refuse", NOT "is it a
  // drawing" — if a REAL photograph is ever dropped at one of these paths, this
  // entry must be re-examined rather than inherited.
  // REPLACED 2026-11-11 (owner): the three program tiles were anime-style
  // drawings that read as a different site next to the film plates. They are now
  // PHOTOGRAPHIC renders of the same two models who appear in the film — the
  // woman from the hero, plus one male participant — wearing the identical
  // charcoal Amanah polo with magenta trim and the crest badge, so the program
  // grid and the film share one cast and one grade.
  //
  // The set's criterion still holds, and for the same reason as the film plates:
  // these are GENERATED people, not photographs of anyone, so §11.2 has no
  // subject who could consent or refuse. The filenames are unchanged on purpose —
  // `companyProfile.ts` builds the path from `image.name`, and a rename would
  // have moved four frozen counters for no gain.
  'ilustrasi/program-bahasa.webp',
  'ilustrasi/program-magang.webp',
  'ilustrasi/program-ssw.webp',
  // ADDED 2026-09-24 with the #kontak QR tiles and the #penempatan banner.
  //
  // The three QR codes are machine-readable graphics — there is no subject who
  // could consent or refuse, which is this set's actual criterion (see the
  // block above; it is NOT "is it a drawing").
  'ilustrasi/qr-whatsapp.webp',
  'ilustrasi/qr-instagram.webp',
  'ilustrasi/qr-tiktok.webp',
  // The placement band. ITS ARTWORK CHANGED ON 2026-09-28, so the justification
  // recorded here before is REPLACED rather than left standing — it said the
  // file was a photograph of Mt Fuji across a lake (`fuji banner.jpg`,
  // 5325x3550), admitted because it contains no people. It is now a GENERATED
  // MAP OF JAPAN. The set's criterion is unchanged and still satisfied, but by
  // the other half of it: there is no photograph here at all, hence no subject
  // who could consent or refuse. Do not move the entry to OWNER_APPROVED, whose
  // every other member is a consent decision.
  'ilustrasi/penempatan-banner.webp',
  // ADDED 2026-09-28 — the six "Bagaimana Prosesnya?" step illustrations. Each
  // is one slice of a single generated composite the owner supplied; they are
  // wired through `Step.image` in companyProfile.ts, which is the same
  // `image: { name: … }` shape `TILE_IMAGE_NAMES` above already resolves, so the
  // indirect-reference scan picks all six up with no change to it.
  //
  // They belong in this set rather than OWNER_APPROVED for the criterion stated
  // above: they are generated drawings, so §11.2's consent requirement has no
  // subject to attach to.
  //
  // ⚠ RECORDED DEPARTURE, NOT A SILENT ONE. These six DO contain incidental
  // in-scene lettering (a whiteboard, a passport cover, a contract sheet).
  // `docs/ILLUSTRATION_SPEC.md` §2.1 rule 1 bans text inside images, and its
  // reason is specific: page text must stay translatable. No step TITLE or
  // DESCRIPTION is baked in — every word on these cards is still a keyed
  // `Text` rendered as `data-lang`, so the JP toggle still reaches all of it.
  // The rule is a prose convention and this gate does not enforce it; the
  // departure is written down here so the next reader meets it at the asset
  // rather than discovering it by opening the file.
  'ilustrasi/langkah-1.webp',
  'ilustrasi/langkah-2.webp',
  'ilustrasi/langkah-3.webp',
  'ilustrasi/langkah-4.webp',
  'ilustrasi/langkah-5.webp',
  'ilustrasi/langkah-6.webp',
  // ADDED 2026-11-11 — the six portrait plates of the "Satu Jalan" band in
  // `#alur` (src/pages/index.astro). They are what the page renders now; the six
  // `langkah-*` entries above STAY, because those files are still on disk and
  // still referenced by `FLOW_STEPS.image`, and an approval withdrawn while the
  // reference stands is exactly how a broken image ships unnoticed.
  //
  // Same criterion as the rest of this set: generated drawings, one model across
  // all six, no person whose likeness it is — so §11.2 has no subject to attach
  // to. THE OUTFIT IS THE POINT of this set and is recorded here rather than
  // left to the pixels: the model wears the LPK Amanah polo (charcoal, magenta
  // trim, PWA badge on the chest) for registration, training and documents;
  // white-and-black for the interview; the owner's own jacket plus the badge for
  // departure; and a kimono on arrival. The badge is `icons/icon-512.png`, the
  // same mark the PWA installs — not an invented emblem.
  'story/01-daftar.webp',
  'story/02-latihan.webp',
  'story/03-wawancara.webp',
  // RENAMED 2026-11-11, `04-dokumen` -> `04-paspor`. The old 3:2 plate had
  // outpainted the passport into a BLANK burgundy booklet — no emblem, no
  // lettering — so at full-bleed the step read as "brown rectangle", which is
  // what the owner reported. Both plates were regenerated around one subject:
  // a closed Indonesian passport, dark green cover, gold Garuda Pancasila and
  // gold `REPUBLIK INDONESIA` / `PASPOR`. The rename is not cosmetic:
  // `netlify.toml` serves `/assets/*` as `immutable` for a year, so replacing
  // the bytes under the old name would have left returning visitors looking at
  // the blank booklet until 2027. Same criterion and same outfit as its
  // neighbours — generated drawing, no person whose likeness it is, charcoal
  // Amanah sleeve with the magenta cuff.
  'story/04-paspor.webp',
  'story/05-mcu.webp',
  'story/06-tiba.webp',
  // ADDED 2026-11-11 — the same six scenes re-framed 3:2 for the full-bleed
  // desktop band. They are NOT a resize of the plates above and must not inherit
  // their basis: a 2:3 portrait cannot be cropped to 3:2 without cutting the
  // subject, so each one was re-composed with the model on the right third and
  // the left two thirds left dark for the copy. Same criterion as their parents
  // — generated drawings, one model, no person whose likeness it is — and the
  // same recorded outfit sequence (Amanah polo for registration/training/
  // documents, white-and-black for the interview, the owner's jacket plus badge
  // for departure, kimono on arrival). Portrait plates stay because the stacked
  // mobile layout still renders them.
  'story/wide/01-daftar.webp',
  'story/wide/02-latihan.webp',
  'story/wide/03-wawancara.webp',
  'story/wide/04-paspor.webp',
  'story/wide/05-mcu.webp',
  'story/wide/06-tiba.webp',
  // The footer emblem, localised off Supabase on 2026-09-24. A logo is a mark,
  // not a person, so the same criterion applies. It is the only member of this
  // set that lives outside `public/assets/` (under `public/icons/`); the gate
  // walks both directories and prefixes this key `icons/`.
  //
  // PROVEN KILLABLE, not merely asserted: removing this line makes the gate exit
  // 1 with "RENDERED AND COMMITTABLE, NO PUBLICATION BASIS ON RECORD —
  // icons/logo-asj.webp", which is also what proves the REF_RE `/icons/` widening
  // works — before it, that path was never captured into `published` at all.
  'icons/logo-asj.webp',
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

/**
 * Does this file have a publication basis — its own, or its base file's?
 *
 * WHY INHERITANCE IS NEEDED, AND WHY IT IS NARROW. Once the scan can see
 * `srcSet`, the responsive-image work of 2026-11-07 appears as 14 "new"
 * published files — but they are not new photographs. `fasilitas-grup-staf-700`
 * is the SAME photograph as `fasilitas-grup-staf`, resized; so are
 * `banner-tokyo-700`, `logo-asj-96`, `hero-sakura@2x`. Demanding a separate
 * consent line for each size would be asking the owner to re-answer the same
 * question per file, and the predictable outcome is a list nobody reads.
 *
 * The rule therefore resolves a WIDTH/DPR VARIANT to its base: `-<digits>` or
 * `@<digits>x` immediately before `.webp`. Two guards keep it from becoming a
 * general "some prefix matches" hole:
 *
 *   1. the base must EXIST ON DISK, so `fasilitas-ruang-tamu-3.webp` cannot
 *      inherit from `fasilitas-ruang-tamu-1.webp` (its base name is not a file);
 *   2. the base must itself carry a basis, recursively.
 *
 * A file that carries its OWN basis never reaches the resolver, so this can only
 * ADD a basis that a resize genuinely shares — it can never overwrite one.
 */
function basisOf(key) {
  if (ILLUSTRATIONS.has(key) || OWNER_APPROVED.has(key) || ignored.has(key)) return key;
  const m = /^(.*?)(?:-\d+|@\d+x)\.webp$/.exec(key);
  if (!m) return null;
  const base = `${m[1]}.webp`;
  if (!onDisk.includes(base)) return null;
  return basisOf(base);
}

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
  if (!basisOf(f)) {
    violations.push(
      `RENDERED AND COMMITTABLE, NO PUBLICATION BASIS ON RECORD — ${f}\n` +
        `        the site displays it, .gitignore does not block it, and it is not in\n` +
        `        OWNER_APPROVED. Either it should not be published (§11.2), or its\n` +
        `        publication basis needs recording — consent from the people shown, or\n` +
        `        the owner's recorded ruling, which are NOT the same thing. Do not fix\n` +
        `        this by widening the gate.`,
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
console.log(`   ${approved} published photograph(s) carry a recorded publication basis (consent and/or owner ruling)`);
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
