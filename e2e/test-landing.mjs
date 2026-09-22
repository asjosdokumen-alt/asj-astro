/**
 * E2E Test: the landing page's section inventory (`/`) — L8.1 .. L8.4
 *
 * WHY THIS EXISTS
 * ---------------
 * The landing page was rebuilt section by section across L2..L7, and every one of
 * those phases was verified by EYE: a human looked at 390px and 1280px and said
 * "yes, that is the section". Nothing in the repo disagreed, because nothing in
 * the repo was watching. Measured before this file existed:
 *
 *   `grep -rn 'kenapa-jepang|#tentang|#tim' e2e/`  →  0 hits outside prose
 *
 * So the single most expensive class of mistake on this page — a section that
 * silently disappears, or that renders 0px tall because a `hidden` attribute
 * leaked onto it, or that slides under another section during a refactor — had
 * no detector at all. A section vanishing is not a crash: the page still returns
 * 200, still has headings, still passes `e2e:headings`, still passes `e2e:public`
 * (whose marker text lives elsewhere). It just gets shorter.
 *
 * WHY THE ASSERTION IS "PRESENT **AND VISIBLE", NOT "ID EXISTS IN THE DOM"
 * ----------------------------------------------------------------------
 * `#layanan` is the reason, and its history is worth keeping because this file got
 * it wrong for a day. It WAS a tab panel: it carried `hidden` and was in the DOM
 * with zero geometry on every load where loker was the active tab, so a gate
 * asking `document.querySelector('#layanan')` would have been green while the
 * section was unreachable. That is why visibility is measured here at all, with
 * the same `visible()` predicate `test-headings.mjs` uses.
 *
 * `e9317cf` then deleted the tab mechanism outright: `LokerTable` moved to
 * `/loker`, `#layanan` became a plain <SECTION> (measured 2026-09-21: 1623px tall
 * at 1280px), and `[data-public-tab]` now matches ZERO elements. THIS FILE KEPT
 * ASSERTING THE OLD SHAPE and reported 10 red checks against a correct page — the
 * exact failure mode the "a gate that cannot fail is a hypothesis" rule is about,
 * inverted: a gate that fails for a stale reason stops being evidence just as
 * surely. The visibility rule is retained because it is still the right rule for
 * a section that collapses to zero height; what was removed is the tab state and
 * the claim that any section here is legitimately hidden.
 *
 * The vacancy list is still guarded — see LOKER_ROUTE — because deleting `#loker`
 * from SECTIONS without a replacement would have traded a stale rule for no rule.
 *
 * THE FACT THIS FILE RECORDS RATHER THAN PRETENDS AWAY
 * ---------------------------------------------------
 * `/` mounts `<App client:only="preact" />`, so the SERVER HTML contains no h1,
 * no hero, and none of the sections that live inside the island. Everything this
 * gate measures therefore exists only AFTER HYDRATION. That is fine for a browser
 * gate — but it means a green here says nothing about what a crawler receives,
 * and a green `e2e:headings` says nothing either. The consequence is real and is
 * recorded in `docs/LANDING_PAGE_SPEC.md` (S1, "hero tidak ada di HTML yang
 * dikirim") with the two ways out, both needing an owner decision.
 *
 * HOW THIS GATE COULD LIE, AND WHAT STOPS IT (three ways)
 * -------------------------------------------------------
 * 1. Reading an ERROR page as data. A dead server, a 502 through the sandbox
 *    proxy, an Astro error overlay — all of them return a document with a body
 *    and ZERO sections, which reports as "every section is missing": a red gate
 *    for a reason that has nothing to do with the page. The non-200 guard and the
 *    proxy note below exist for that. THREE SEPARATE TIMES in this repo a probe
 *    was written that could not tell "no server" from "no content".
 * 2. Passing vacuously on an empty selector. `#galeri` does not exist yet. A rule
 *    of the form "every element matching .foo must be visible" passes when it
 *    matches nothing at all — so the *expected* set is written down here and the
 *    count is asserted, rather than derived from the page being judged.
 * 3. Green-lighting a PLACEHOLDER. "Coming soon", "TBD", "lorem ipsum" are all
 *    valid, visible, correctly-ordered content. L8.3 is the only rule in this
 *    file that can see them.
 *
 * SECTION ORDER IS ASSERTED FROM THE SPEC, NOT FROM THE PAGE
 * ----------------------------------------------------------
 * Reading the section ids out of the DOM and checking they are "sorted" would
 * prove nothing: any permutation of a set is a set. The spec's own order is
 * transcribed below as `SECTION_ORDER` from `docs/LANDING_PAGE_SPEC.md` §3 and §4,
 * and the gate asserts the DOM matches it. L8.2's mutation (swap two sections)
 * is only detectable because the expected order is independent of the artifact.
 *
 * Run against a built artifact:
 *   BASE_URL=http://127.0.0.1:4321 node e2e/test-landing.mjs
 *
 * ⚠ The sandbox exports HTTP_PROXY, which sends 127.0.0.1 through the proxy and
 * returns 502 — which looks exactly like "the server is down". Hence
 * `--no-proxy-server`.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4321';

/**
 * Every section the spec requires on `/`, in the spec's order, with the phase
 * that was supposed to deliver it. This table is the CONTRACT — it is written
 * from `docs/LANDING_PAGE_SPEC.md` §3 (S1..S12) and §4 (R1..R5), not from the
 * markup, so the gate cannot be satisfied by lowering the bar to whatever the
 * page happens to contain.
 *
 * `phase` is carried so a failure names the phase whose work regressed, which is
 * the difference between "one section is missing" and "L3 regressed".
 *
 * `visible: false` marks a section that is legitimately not visible on a default
 * load, with `because` stating why. NOTHING USES IT TODAY: it existed for the tab
 * panel, and `e9317cf` removed the tab mechanism. It is kept in the type because
 * a hidden-on-load section is a real design that would need it, and the visibility
 * assertion below still honours it — but an entry that sets it must also arrive
 * with the companion test that proves the section can be REVEALED, or "hidden"
 * becomes an escape hatch any broken section could hide in.
 */
const SECTIONS = [
  // The hero (S1). `#atas` is on the <header> band itself, and it is the FIRST
  // entry because the order check below is what proves it sits above everything
  // else — a hero that drifted below the fold would still pass a presence check.
  { id: 'atas', phase: 'L8', visible: true },
  { id: 'kenapa-jepang', phase: 'L4', visible: true },
  // `loker` IS DELIBERATELY ABSENT, and it is not an omission — see
  // LOKER_ROUTE below, which asserts the lowongan surface still exists.
  //
  // `layanan` IS A PLAIN SECTION NOW, and the fact that this line used to say
  // otherwise is the reason this gate spent a day reporting 10 red checks against
  // a page that was correct. Measured 2026-09-21: `#layanan` is a <SECTION> 1623px
  // tall at 1280px, and `[data-public-tab]` matches ZERO elements.
  { id: 'layanan', phase: 'L3', visible: true },
  { id: 'program', phase: 'L4', visible: true },
  { id: 'alur', phase: 'L4', visible: true },
  { id: 'visi-misi', phase: 'L4', visible: true },
  { id: 'legalitas', phase: 'L4', visible: true },
  { id: 'fasilitas', phase: 'L4', visible: true },
  { id: 'loker-ringkas', phase: 'L8', visible: true },
  { id: 'penempatan', phase: 'L8', visible: true },
  { id: 'tentang', phase: 'L3', visible: true },
  { id: 'tim', phase: 'L3', visible: true },
  { id: 'kontak', phase: 'L3', visible: true },
  { id: 'lokasi', phase: 'L3', visible: true },
  // The closing CTA band. It is rendered by ClosingBand.astro OUTSIDE <main>, so
  // it is a sibling of the main landmark rather than a child — the order check
  // below therefore walks the whole document, not `main`.
  { id: 'daftar', phase: 'L4', visible: true },
];

/**
 * The lowongan surface, which left `/` for its own route.
 *
 * WHY THIS REPLACED A `PANEL_TAB` CONSTANT, AND WHY IT IS NOT JUST A DELETION.
 * This gate used to assert that `#loker` was a visible TAB PANEL reachable through
 * `[data-public-tab="loker"]`. Commit `e9317cf` ("dedicate /loker page") removed
 * that whole mechanism: `LokerTable` moved to `/loker`, the tab system was deleted,
 * and `#layanan` — the panel that used to be hidden — became a plain section.
 *
 * Deleting `#loker` from SECTIONS and stopping there would have made this gate
 * GREEN while silently dropping a guarantee: NOTHING here would then notice if the
 * vacancy list vanished from the site. The old rule's two halves (the panel exists,
 * its control reveals it) still have to be enforced somewhere; only the ADDRESS
 * changed. So the rule becomes: `/` must still LINK to the route that now carries
 * it. Measured at the time of writing: 13 such links, including the hero strip CTA,
 * `#loker-ringkas`'s "Lihat Semua Lowongan", and the section nav.
 *
 * The route's own CONTENTS are guarded by `e2e:loker-layout`, which measures the
 * table. This rule is the connective tissue between the two: it is what makes
 * "the table is well-formed" and "the table is reachable" two separate claims
 * instead of one untested assumption.
 */
const LOKER_ROUTE = {
  href: '/loker',
  /**
   * The affordances that must survive, one per region a visitor actually looks at.
   *
   * WHY THIS IS A LIST OF REGIONS AND NOT A LINK COUNT. The first version of this
   * rule asserted `count >= 2`, and it was WRONG in a way worth recording: the page
   * carries 13 links from 7 independent sources (hero CTA, drawer, section nav,
   * the mini-list's own two CTAs, its five job rows, and the closing band), so a
   * realistic regression — deleting one CTA, breaking the nav item, dropping the
   * whole `#loker-ringkas` section — leaves the count in double digits and the rule
   * stays green. A threshold no plausible defect can cross is not a gate; it is a
   * green light with a number attached.
   *
   * Region-scoped assertions fail on exactly those defects. Each entry below is a
   * SEPARATE place a visitor can reach the list from, and each names the region so
   * a failure says which one broke.
   */
  regions: [
    {
      name: 'hero',
      selector: 'header a[href="/loker"], header a[href^="/loker#"]',
      because: 'the hero is the first thing on the page and its primary CTA is the main path to the list',
    },
    {
      name: 'section nav',
      /**
       * SCOPED TO THE PAGE'S OWN NAV, and the reason is a MEASURED GATE HOLE.
       *
       * The first version of this selector was `nav a[href="/loker"]`, and the
       * battery's M8 mutation — which correctly retargeted BOTH of the section
       * nav's links away from /loker — SURVIVED it. Measured 2026-09-21, the page
       * has THREE `<nav>` elements:
       *
       *   nav[aria-label="Primary navigation"]  the mobile drawer, 0 loker links
       *   nav[aria-label="Navigasi halaman"]    the section nav, 2 loker links
       *   nav[aria-label="Footer navigation"]   1 loker link ("Lowongan Kerja")
       *
       * So `nav a[href="/loker"]` was satisfied by the FOOTER even after the
       * section nav was emptied: the assertion was measuring the union of three
       * regions and reporting it as one. The footer is a separate destination with
       * its own reason to exist, and a page whose section nav lost its Lowongan
       * item is broken no matter how many footer links remain.
       *
       * `aria-label="Navigasi halaman"` is the stable handle (SiteNav.astro:74);
       * it is a user-facing label, so it is unlikely to be renamed casually, and
       * the region is a named region rather than a positional index.
       */
      selector: 'nav[aria-label="Navigasi halaman"] a[href="/loker"], nav[aria-label="Navigasi halaman"] a[href^="/loker#"]',
      because: 'the page nav is how a visitor who scrolled anywhere jumps to Lowongan',
    },
  ],
};

/**
 * The hero's anchor, which the spec's §5.2 map lists as `#atas`.
 *
 * Kept as a named constant because it is quoted in the failure message below, and
 * the message is the place a reader learns WHY an unresolved fragment matters.
 * The claim is verified rather than assumed: `#atas` is in SECTIONS, so the
 * presence check fails first if the hero loses its id.
 */
const HERO_ID_NOTE =
  '#atas is the hero band (App.tsx, the `hero` branch) and it is the anchor the ' +
  'spec §5.2 lists for S1';

/**
 * HERO_STATS — the hero's three numbers, each pinned to what the company profile
 * actually documents. Roadmap L8.4: "angka statistik berasal dari satu sumber",
 * accepted when a mutation hardcoding one number turns the gate red.
 *
 * WHY THIS RULE EXISTS AT ALL. Every other rule here asserts that something is
 * PRESENT or VISIBLE. None of them can tell a documented number from an invented
 * one, because an invented statistic is perfectly valid markup in a perfectly
 * visible tile. docs/COMPANY_PROFILE_DATA.md §12 states the boundary explicitly:
 * the document carries no candidate count, no departure count and no partner
 * count, and "Jangan menuliskan '50+ perusahaan Jepang' di halaman publik sebelum
 * pemilik menunjuk sumbernya" — a fabricated number on a company page is a legal
 * claim, not decoration. So the assertion pairs VALUE with SOURCE.
 *
 * THE VALUES ARE COPIED FROM THE DOCUMENT, NOT FROM App.tsx, and that direction
 * matters. Deriving the expected value from the implementation would make the
 * check agree with whatever the code happens to say — the tautology this whole
 * file exists to avoid. Each pair below was read out of COMPANY_PROFILE_DATA.md:
 *
 *   2023  'Akta pendirian 15 Agustus 2023' (h. 6)
 *   5     'Bidang Tokutei Ginou: Perawat Lansia · Pengolahan Makanan · Restoran ·
 *          Pertanian · Peternakan' — exactly five (h. 3)
 *   4     'Empat prefektur: Miyazaki · Okayama · Nagano · Kagoshima' (h. 13-14)
 *
 * The LABEL is what locates the tile, and the label itself comes from i18n
 * (`profile.stat_*`), so a tile cannot pass this rule by carrying the right digit
 * under a different heading. The label is asserted VISIBLE for the same reason the
 * other content rules are: an invisible tile is not a published claim.
 */
const HERO_STATS_EXPECTED = [
  { value: '2023', label: 'Berdiri sejak', source: 'COMPANY_PROFILE_DATA.md h. 6 (akta pendirian 15 Agustus 2023)' },
  { value: '5', label: 'Bidang penempatan', source: 'COMPANY_PROFILE_DATA.md h. 3 (lima bidang Tokutei Ginou)' },
  { value: '4', label: 'Prefektur di Jepang', source: 'COMPANY_PROFILE_DATA.md h. 13-14 (empat prefektur)' },
];

/**
 * Text that must never reach production. A placeholder is invisible to every
 * other gate in this repo: it is valid HTML, it has a heading, it is visible, it
 * occupies space. Only this list sees it.
 *
 * TWO SHAPES OF FALSE POSITIVE, BOTH MEASURED ON THE FIRST RUN, BOTH FIXED BY
 * NARROWING THE RULE RATHER THAN ADDING AN IGNORE LIST:
 *
 * 1. **A marker appearing in an i18n KEY NAME rather than in copy.** The
 *    dictionaries legitimately contain 11 keys called `*_placeholder`
 *    (`form.placeholder_name`, `ai_cv.chat_placeholder`, …) — "placeholder" is
 *    the correct name for an input's hint text. Scanning raw file text flags all
 *    of them. So `scanCopy` below reads only the STRING VALUES, and the key is
 *    skipped.
 * 2. **A marker appearing inside a phone-number FORMAT MASK.** `628xxxxxxxxxx`
 *    and `81xxxxxxxxxx` are how the form tells a candidate what to type; the `xxx`
 *    is a digit wildcard, not unfinished copy. Hence `\b` anchoring on `xxx`,
 *    which stops it matching a run of x's inside a longer token.
 *
 * Matched case-insensitively. Multi-word markers are plain substrings; single
 * tokens are word-anchored so they cannot match inside a larger word.
 */
const PLACEHOLDER_MARKERS = [
  'lorem ipsum',
  'lorem',
  'ipsum dolor',
  'to be announced',
  'dummy text',
  'sample text',
  'tbd',
  'todo',
  'fixme',
  'foo bar',
  'rashh',
];

/**
 * 'Segera hadir' IS DELIBERATELY NOT IN THE LIST ABOVE. Measured: it appears once,
 * as `admin.tt_segera_hadir`, and it is the label AND tooltip of a button that is
 * hard-coded `disabled` in `TabMail.tsx:245` — an honest "this admin feature is
 * not built yet", which is correct copy doing its job. Treating it as a defect
 * would make a correct string into a recurring false positive, and a gate that
 * cries wolf on correct copy gets suppressed wholesale.
 *
 * The distinction being drawn: a placeholder is copy that stands in for content
 * that was SUPPOSED to be written and was not. "Segera hadir" on a disabled
 * control is content that was supposed to be exactly that.
 */

/**
 * The one WORD-ANCHORED marker, kept separate from the substring list above so
 * that the reason for the difference is stated where the list is read.
 *
 * `xxx` is a real placeholder in English copy ("xxx units") and a legitimate digit
 * wildcard inside a phone mask (`628xxxxxxxxxx`). Anchoring it to a word boundary
 * distinguishes the two: in `628xxxxxxxxxx` the x-run is preceded by a digit, so
 * `\bxxx\b` does not match it, while a bare `<span>xxx</span>` does.
 */
const WORD_MARKERS = [/\bxxx\b/i];

/**
 * PLACEHOLDER_ALLOWLIST IS DELIBERATELY ABSENT. Both false positives found on the
 * first run were fixed by making the rule PRECISE (values-only, word-anchored)
 * rather than by exempting a word. An exemption list would re-open the hole this
 * mechanism exists to close: a real `<p>placeholder</p>` would then be ignored
 * too. If a future false positive is genuinely unavoidable, add the exemption
 * WITH its reason written down — at that point a reviewer can disagree with the
 * reason instead of with an unexplained string in an array.
 */

/**
 * Search a file's SOURCE for placeholder markers, in COPY only.
 *
 * Why not just scan the whole file: the i18n dictionaries declare 11 keys whose
 * NAMES contain "placeholder" (`"form.placeholder_name": "Masukkan nama lengkap"`).
 * A raw-text scan reports the key name as the defect. Reading the values is what
 * makes the check about copy.
 *
 * ⚠ THE KEY MAY BE UNQUOTED, AND BOTH VOICES OF VALUE QUOTE ARE REQUIRED. Two
 * separate silent zero-reads were measured before this pattern was right:
 *   - `companyProfile.ts` uses SINGLE quotes for values, so a double-only pattern
 *     found 0 pairs and reported the module clean;
 *   - it also writes its keys UNQUOTED (`key: 'profile.about_welcome',`), so a
 *     pattern requiring `"key"` matched nothing in that file even after the quote
 *     fix.
 * The `matched` count returned below is what turns each of those silent no-ops
 * into a failure — a rule that reads nothing must not pass.
 *
 * The parse is a deliberate regex rather than a real parser: these files are flat
 * object literals of `key: 'value',` pairs and nothing else, and a full JSON5
 * parse would need a dependency and would still have to tolerate the comments.
 * A line that does not match the pair shape is skipped, so a nested object cannot
 * produce a false hit.
 */
function scanCopy(source) {
  const hits = [];
  const stripped = stripComments(source);
  // key: 'value' | "key": "value" — the key's quotes are optional, the value's are not.
  const pair = /(?:["']([^"'\n]{1,80})["']|([A-Za-z_$][\w$]*))\s*:\s*["']([^"'\n]*)["']/g;
  let matched = 0;
  // `pair.exec` in the `while` condition rather than an assignment expression:
  // `noAssignInExpressions` is an ERROR in this repo's Biome config (measured on
  // this file), and the explicit form reads the same.
  while (true) {
    const m = pair.exec(stripped);
    if (m === null) break;
    matched++;
    const key = m[1] ?? m[2];
    const value = m[3];
    const lowered = value.toLowerCase();
    for (const marker of PLACEHOLDER_MARKERS) {
      if (lowered.includes(marker)) hits.push(`${marker} in ${key}`);
    }
    for (const re of WORD_MARKERS) {
      if (re.test(value)) hits.push(`${re} in ${key}`);
    }
  }
  return { hits, matched };
}

/**
 * Remove `//` and block comments from a source file's text, so the placeholder
 * scan judges COPY rather than PROSE-ABOUT-copy.
 *
 * Measured reason this is needed: `src/lib/companyProfile.ts:267` contains the
 * word "placeholder" inside an English CODE COMMENT explaining WHY the legality
 * section was withheld until the company profile arrived — "the roadmap
 * deliberately withheld it rather than print placeholder licence numbers". That
 * is the record of a placeholder being REFUSED, and a raw-text scan reports the
 * documentation as the defect.
 *
 * Deliberately naive — it does not parse strings, so a `//` inside a URL literal
 * would truncate that line. That is safe here: this function only feeds a
 * substring search for placeholder words, and a truncated line can only cause a
 * MISS, never a false hit. A false hit is the failure mode that matters.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/**
 * "Belum dipublikasikan" is RENDERED ON PURPOSE — `PersonGrid` prints it for team
 * members whose names the company profile does not carry (see the `name: null`
 * rows in `companyProfile.ts`). It is honest ("not published yet") rather than a
 * placeholder standing in for content that was supposed to be written.
 *
 * It is therefore NOT in PLACEHOLDER_MARKERS, and this comment exists so that a
 * future reader does not "fix" that omission.
 */
const HONEST_ABSENCE_COPY = 'Belum dipublikasikan';

let browser;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    failures.push(name);
  }
}

/**
 * Read the landing page once per width and return everything every assertion
 * needs. One page load per width rather than one per check: the page is heavy
 * (a 159-row table island) and re-loading it for each of ~20 assertions is both
 * slow and needlessly flaky.
 */
async function inspectLanding(width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  // Do NOT read the DOM after a failed navigation: `goto().catch()` followed by
  // `evaluate()` reads the ERROR page and reports its empty DOM as "nothing is
  // there". Fail with the reason instead.
  const resp = await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 45000 });
  const status = resp ? resp.status() : 0;
  if (status !== 200) {
    await ctx.close();
    throw new Error(
      `GET / -> HTTP ${status}; refusing to read the DOM of an error page. ` +
        `(A 502 here is usually the sandbox proxy, not a dead server — see the ` +
        `--no-proxy-server note at the top of this file.)`,
    );
  }

  // The islands are `client:only="preact"`, so nothing this gate looks for is in
  // the server HTML — it all appears after hydration.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600);

  let data;
  try {
    data = await page.evaluate(
      ({ ids, lokerHref, regionSelectors, wantStats }) => {
        const visible = (el) => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
        };

        // The walk must cover the WHOLE document, not `main`: ClosingBand renders
        // `#daftar` as a sibling of the main landmark.
        const all = [...document.querySelectorAll('[id]')];
        const byId = new Map();
        for (const el of all) if (!byId.has(el.id)) byId.set(el.id, el);

        const sections = ids.map((id) => {
          const el = byId.get(id) || null;
          const r = el ? el.getBoundingClientRect() : null;
          const cs = el ? getComputedStyle(el) : null;
          return {
            id,
            found: el !== null,
            tag: el ? el.tagName : null,
            hiddenAttr: el ? el.hasAttribute('hidden') : null,
            visible: visible(el),
            // Absolute Y in the DOCUMENT, not the viewport: the page is taller
            // than the window, so viewport-relative tops are all near-zero and
            // cannot express order.
            docTop: r ? Math.round(r.top + window.scrollY) : null,
            height: r ? Math.round(r.height) : null,
            display: cs ? cs.display : null,
            // A section with no accessible name is a region a screen reader
            // announces as nothing. The spec's §6 heading contract requires a
            // heading per section, so this is checked rather than assumed.
            labelledBy: el ? el.getAttribute('aria-labelledby') : null,
            hasHeading: el ? el.querySelector('h1,h2,h3,h4,h5,h6') !== null : false,
          };
        });

        // DOM order of the ids we care about, from the real document order of the
        // id-carrying elements. `querySelectorAll` returns document order, so the
        // index in `all` IS the order.
        const order = new Map();
        all.forEach((el, i) => {
          if (!order.has(el.id)) order.set(el.id, i);
        });

        // Where a visitor can reach the vacancy list. Counted from the AUTHORED
        // href, per REGION rather than as a total — see LOKER_ROUTE.regions for why
        // a total is the wrong shape (13 links means no single defect moves it).
        const lokerRegions = regionSelectors.map((r) => {
          const found = [...document.querySelectorAll(r.selector)];
          return {
            name: r.name,
            count: found.length,
            labels: found
              .map((a) => (a.innerText || a.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40))
              .filter(Boolean),
          };
        });
        const lokerLink = {
          total: document.querySelectorAll(`a[href="${lokerHref}"], a[href^="${lokerHref}#"]`).length,
          regions: lokerRegions,
        };

        const bodyText = document.body.innerText || '';
        const lowered = bodyText.toLowerCase();

        // Anchors the page LINKS TO (not the anchors it defines). A link to a
        // fragment that does not resolve is a control that looks live and does
        // nothing — the defect §5.1 was written about.
        const linkedFragments = [
          ...new Set(
            [...document.querySelectorAll('a[href^="#"]')]
              .map((a) => (a.getAttribute('href') || '').replace(/^#/, ''))
              .filter((f) => f && f !== 'main-content'),
          ),
        ];
        const unresolvedFragments = linkedFragments.filter((f) => !byId.has(f));

        const h2Count = document.querySelectorAll('h2').length;

        // ── HERO_STATS tiles (L8.4) ────────────────────────────────────────
        //
        // Locate each tile by its LABEL, then read the value from the same tile.
        // The label is a leaf `<div>` whose entire text is the i18n string, and
        // the value is its previous sibling inside the tile (App.tsx: the tile
        // renders value then label). Matching on the leaf's exact text avoids the
        // trap that bit this file before: a substring or ancestor match would also
        // hit a wrapper, or the whole hero band, and report a text that merely
        // CONTAINS the label as if it were the tile.
        //
        // `offsetWidth || offsetHeight` rather than a Playwright visibility call
        // because this runs inside `page.evaluate`; it is the same test the
        // section-visibility rule above uses, kept consistent on purpose.
        const statLabels = wantStats.map((s) => s.label);
        const heroStats = statLabels.map((label) => {
          const leaf = [...document.querySelectorAll('div')].find(
            (d) => d.children.length === 0 && d.textContent.trim() === label,
          );
          if (!leaf) return { label, found: false };
          const tile = leaf.parentElement;
          const valueEl = tile ? tile.children[0] : null;
          return {
            label,
            found: true,
            value: valueEl ? valueEl.textContent.trim() : null,
            visible: !!(leaf.offsetWidth || leaf.offsetHeight),
          };
        });

        return {
          path: location.pathname,
          sections,
          order: Object.fromEntries(order),
          lokerLink,
          bodyTextLen: bodyText.length,
          /** Only the visible text — innerText excludes display:none subtrees. */
          bodyTextSample: bodyText.slice(0, 400),
          lowered,
          linkedFragments,
          unresolvedFragments,
          h2Count,
          heroStats,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      },
      {
        ids: SECTIONS.map((s) => s.id),
        lokerHref: LOKER_ROUTE.href,
        regionSelectors: LOKER_ROUTE.regions.map((r) => ({ name: r.name, selector: r.selector })),
        wantStats: HERO_STATS_EXPECTED.map((s) => ({ label: s.label })),
      },
    );
  } catch (err) {
    await ctx.close();
    throw new Error(`could not read the DOM (navigation?): ${err.message.slice(0, 80)}`);
  }
  await ctx.close();
  return data;
}

const cache = new Map();
function inspect(width) {
  if (!cache.has(width)) cache.set(width, inspectLanding(width));
  return cache.get(width);
}

async function run() {
  browser = await chromium.launch({ headless: true, args: ['--no-proxy-server'] });

  for (const width of [390, 1280]) {
    // ── L8.1 — every section is present AND visible ─────────────────────────
    await test(`${width}px /: every spec section is in the DOM`, async () => {
      const d = await inspect(width);
      const missing = d.sections.filter((s) => !s.found).map((s) => s.id);
      if (missing.length) {
        // Name the phase, not just the id: "one section is missing" is a
        // 12-file search, "#tim missing (L3)" is a one-file read.
        const detail = missing
          .map((id) => `${id} (${SECTIONS.find((s) => s.id === id).phase})`)
          .join(', ');
        throw new Error(
          `${missing.length}/${SECTIONS.length} spec section(s) have no element in the document: ` +
            `${detail}. Sections are listed in docs/LANDING_PAGE_SPEC.md §3/§4.`,
        );
      }
    });

    await test(`${width}px /: every section the spec lists is visible`, async () => {
      const d = await inspect(width);
      const problems = [];
      for (const s of d.sections) {
        const spec = SECTIONS.find((x) => x.id === s.id);
        if (spec.visible && !s.visible) {
          problems.push(
            `#${s.id} is NOT visible (height=${s.height}, display=${s.display}, ` +
              `hidden=${s.hiddenAttr}) but the spec requires it visible on a default load`,
          );
        }
        // The converse half — "a section the spec calls HIDDEN must stay hidden" —
        // is GONE, and its removal is the point rather than a loss. It existed only
        // to pin `#layanan` in its tab-panel state, and `e9317cf` deleted that
        // state: there is no longer any section on `/` that is legitimately
        // invisible on a default load, so there is no second half to assert. The
        // `visible: false` escape hatch is kept in the type because re-introducing
        // a hidden-on-load section is a real design that would need it — but
        // nothing uses it today, and a rule with no subject is worse than no rule.
      }
      if (problems.length) {
        throw new Error(
          `${problems.length} section(s) not visible on a default load:\n    - ` +
            problems.join('\n    - '),
        );
      }
    });

    // ── The vacancy surface, which left `/` for its own route ────────────────
    //
    // This is the replacement for the old "the layanan panel is reachable through
    // its tab" rule. When `LokerTable` moved to `/loker`, `#loker` stopped being a
    // section of this page — so a gate that only deleted it from SECTIONS would
    // have gone green while guaranteeing nothing about vacancies at all. This rule
    // keeps the guarantee and changes only the address: `/` must still offer a way
    // to reach the list.
    await test(`${width}px /: the vacancy list is reachable from every region that offers it`, async () => {
      const d = await inspect(width);
      const broken = d.lokerLink.regions.filter((r) => r.count === 0);
      if (broken.length) {
        const spec = broken.map(
          (r) => `the ${r.name} no longer links to ${LOKER_ROUTE.href} (${LOKER_ROUTE.regions.find((x) => x.name === r.name).because})`,
        );
        throw new Error(
          `${broken.length} region(s) lost their path to the vacancy list:\n    - ${spec.join('\n    - ')}\n` +
            `  Total links to ${LOKER_ROUTE.href} on this page: ${d.lokerLink.total}. The list itself ` +
            `is guarded by e2e:loker-layout, but if the affordances that lead there disappear, that ` +
            `gate is measuring a page no visitor is offered.`,
        );
      }
    });

    // ── L8.1 (cont.) — a visible section must have real height ──────────────
    await test(`${width}px /: no visible section is collapsed to zero height`, async () => {
      const d = await inspect(width);
      const collapsed = d.sections
        .filter((s) => {
          const spec = SECTIONS.find((x) => x.id === s.id);
          return spec.visible && (!s.height || s.height < 40);
        })
        .map((s) => `#${s.id} (height=${s.height})`);
      if (collapsed.length) {
        throw new Error(
          `${collapsed.length} visible section(s) have no usable height: ${collapsed.join(', ')}. ` +
            `A section can be present, "visible" by the box test, and still occupy nothing.`,
        );
      }
    });

    await test(`${width}px /: every visible section has an accessible name`, async () => {
      const d = await inspect(width);
      const nameless = d.sections
        .filter((s) => {
          const spec = SECTIONS.find((x) => x.id === s.id);
          return spec.visible && !s.hasHeading;
        })
        .map((s) => `#${s.id} (aria-labelledby=${JSON.stringify(s.labelledBy)})`);
      if (nameless.length) {
        throw new Error(
          `${nameless.length} visible section(s) contain no heading at all: ${nameless.join(', ')}. ` +
            `docs/LANDING_PAGE_SPEC.md §6 requires one heading per section; a region with no ` +
            `heading is announced as an unnamed landmark.`,
        );
      }
    });

    // ── L8.2 — order matches the SPEC, not the page ────────────────────────
    await test(`${width}px /: sections appear in the order the spec lists them`, async () => {
      const d = await inspect(width);
      const present = SECTIONS.map((s) => s.id).filter((id) => d.sections.find((x) => x.id === id)?.found);
      const actual = [...present].sort((a, b) => (d.order[a] ?? 0) - (d.order[b] ?? 0));
      if (actual.join(' → ') !== present.join(' → ')) {
        // Report the first divergence rather than dumping two 13-item lists: the
        // reader needs to know WHICH swap happened.
        let i = 0;
        while (i < present.length && present[i] === actual[i]) i++;
        throw new Error(
          `section order differs from docs/LANDING_PAGE_SPEC.md at position ${i + 1}: ` +
            `expected #${present[i]}, found #${actual[i]}. ` +
            `Expected: ${present.join(' → ')}. Found: ${actual.join(' → ')}.`,
        );
      }
    });

    // ── L8.4 — the hero's numbers come from one documented source ──────────
    await test(`${width}px /: hero statistics match the company profile`, async () => {
      const d = await inspect(width);
      const problems = [];

      // A rule that reads nothing must not pass. If the tiles cannot be located
      // at all, "no mismatches" would be vacuously true and this test would
      // report a green hero that has no statistics on it — the silent-zero-read
      // failure that scanCopy below documents in two other shapes.
      const foundTiles = d.heroStats.filter((s) => s.found);
      if (foundTiles.length !== HERO_STATS_EXPECTED.length) {
        throw new Error(
          `located ${foundTiles.length}/${HERO_STATS_EXPECTED.length} hero statistic tiles. ` +
            `Missing: ${d.heroStats
              .filter((s) => !s.found)
              .map((s) => `"${s.label}"`)
              .join(', ') || '(none)'}. ` +
            `The tiles render from HERO_STATS in src/components/App.tsx and were expected on the ` +
            `landing page (the App island is mounted with the \`hero\` prop).`,
        );
      }

      for (const expected of HERO_STATS_EXPECTED) {
        const actual = d.heroStats.find((s) => s.label === expected.label);
        if (!actual.visible) {
          // An invisible tile is not a published claim, so it cannot satisfy a
          // rule about what the company states. Reported separately from a value
          // mismatch because the fixes differ: one is layout, one is a number.
          problems.push(`"${expected.label}" is in the DOM but not visible`);
        } else if (actual.value !== expected.value) {
          problems.push(
            `"${expected.label}" shows "${actual.value}" but ${expected.source} documents "${expected.value}"`,
          );
        }
      }

      if (problems.length) {
        throw new Error(
          `${problems.length} hero statistic(s) disagree with docs/COMPANY_PROFILE_DATA.md:\n` +
            problems.map((p) => `  - ${p}`).join('\n') +
            `\n  A statistic on a company page is a legal claim (COMPANY_PROFILE_DATA.md §12: no ` +
            `candidate/departure/partner count is documented, so none may be shown). If a number ` +
            `here is intentional, the SOURCE DOCUMENT must change first, then this list.`,
        );
      }
    });

    // ── L8.3 — no placeholder text reached production ─────────────────────
    await test(`${width}px /: no placeholder text is rendered`, async () => {
      const d = await inspect(width);
      if (d.bodyTextLen < 200) {
        throw new Error(
          `the page rendered only ${d.bodyTextLen} characters of visible text — too little to ` +
            `judge, which usually means hydration did not finish. Sample: ` +
            JSON.stringify(d.bodyTextSample.slice(0, 120)),
        );
      }
      const hits = PLACEHOLDER_MARKERS.filter((m) => d.lowered.includes(m)).concat(
        WORD_MARKERS.filter((re) => re.test(d.lowered)).map((re) => String(re)),
      );
      if (hits.length) {
        const excerpts = hits.map((m) => {
          const at = d.lowered.indexOf(m.toLowerCase());
          const around = at < 0 ? '' : d.lowered.slice(Math.max(0, at - 40), at + m.length + 40);
          return `${JSON.stringify(m)}${around ? ` near ${JSON.stringify(around)}` : ''}`;
        });
        throw new Error(
          `${hits.length} placeholder marker(s) found in the rendered page: ${excerpts.join('; ')}`,
        );
      }
      // "Belum dipublikasikan" is EXPECTED on this page and must not be treated as
      // a placeholder — see HONEST_ABSENCE_COPY. Asserting its presence turns that
      // decision into something measured rather than a comment: if the copy is
      // renamed without updating the reasoning, this fails and the reader is sent
      // to the explanation instead of a stale constant.
      if (!d.lowered.includes(HONEST_ABSENCE_COPY.toLowerCase())) {
        throw new Error(
          `the honest-absence copy ${JSON.stringify(HONEST_ABSENCE_COPY)} is not on the page. ` +
            `Either the team grid stopped rendering unpublished names (in which case the ` +
            `placeholder-marker exclusion is stale and must be revisited), or the string changed. ` +
            `See the HONEST_ABSENCE_COPY comment.`,
        );
      }
      // If this ever fires, the marker list has stopped describing reality and
      // the check above is passing vacuously.
      if (PLACEHOLDER_MARKERS.length === 0) {
        throw new Error('PLACEHOLDER_MARKERS is empty — this check cannot fail');
      }
    });
  }

  // ── L8.3 (pre-hydration) — the check the DOM read CANNOT make ────────────
  //
  // THIS TEST EXISTS BECAUSE A MUTATION SURVIVED WITHOUT IT. The battery injected
  // "Lorem ipsum dolor sit amet" into a `SectionTitle` `desc` literal, rebuilt, and
  // this gate stayed GREEN — while `grep lorem dist/index.html` found the string.
  //
  // The reason is the repo's own i18n design, documented in SectionTitle.astro:27:
  //   "The literal is what a crawler and a no-JS visitor see; `translateDataLang()`
  //    overwrites it once the language store is read."
  // So every `data-lang` element's visible text is a FALLBACK that only exists
  // pre-hydration. `document.body.innerText` after hydration shows the dictionary
  // value, and a placeholder sitting in the fallback is invisible to it — even
  // though it is exactly what a crawler indexes and what a no-JS visitor reads.
  //
  // The fix is to read the SERVED HTML, not the hydrated DOM: fetch the document
  // and search it raw. This complements the check above rather than duplicating
  // it — the DOM read sees runtime-injected text (a JS-generated string), this one
  // sees what is actually on the wire.
  for (const width of [390, 1280]) {
    await test(`${width}px /: the SERVED HTML contains no placeholder text`, async () => {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      const resp = await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const status = resp ? resp.status() : 0;
      if (status !== 200) {
        await ctx.close();
        throw new Error(`GET / -> HTTP ${status}; cannot read the served HTML`);
      }
      // `resp.text()` is the response body as the SERVER sent it — before a single
      // line of island JS has run.
      const html = await resp.text();
      await ctx.close();

      if (html.length < 5000) {
        throw new Error(
          `the served HTML is only ${html.length} bytes — too small to be the page, so a ` +
            `green here would be meaningless`,
        );
      }
      const lowered = html.toLowerCase();
      const hits = PLACEHOLDER_MARKERS.filter((m) => lowered.includes(m));
      if (hits.length) {
        const excerpts = hits.map((m) => {
          const at = lowered.indexOf(m);
          return `${JSON.stringify(m)} near ${JSON.stringify(lowered.slice(Math.max(0, at - 60), at + m.length + 40))}`;
        });
        throw new Error(
          `${hits.length} placeholder marker(s) found in the SERVED HTML (pre-hydration): ` +
            `${excerpts.join('; ')}. These are the strings a crawler and a no-JS visitor see — ` +
            `the hydrated-DOM check above cannot see them because translateDataLang() ` +
            `overwrites data-lang text after hydration (SectionTitle.astro:27).`,
        );
      }
    });
  }

  // ── L8.3 (source-level) — no placeholder in the page's two copy sources ───
  //
  // The two runtime checks above have complementary blind spots:
  //   - the hydrated-DOM read cannot see a `data-lang` FALLBACK (it is overwritten)
  //   - the served-HTML read cannot see a string that arrives in the other
  //     language, or in copy that is built at runtime
  // So the sources are read directly as well. `companyProfile.ts` holds the
  // literals; `i18n.ts` holds the text that actually replaces them — a placeholder
  // in EITHER is a placeholder in production.
  //
  // COMMENTS ARE STRIPPED FIRST. This is not cosmetic: measured on the gate's first
  // run, `companyProfile.ts:267` tripped this check with the word "placeholder"
  // inside an English comment explaining WHY the legality section was withheld
  // ("the roadmap deliberately withheld it rather than print placeholder licence
  // numbers") — the record of a placeholder being REFUSED, read as a placeholder.
  // A per-word ignore list would re-open the hole; stripping comments does not.
  const COPY_SOURCES = ['src/lib/companyProfile.ts', 'src/store/i18n.ts', 'src/store/i18n-jp.ts'];

  for (const rel of COPY_SOURCES) {
    await test(`${rel} contains no placeholder text`, async () => {
      const { readFileSync, existsSync } = await import('node:fs');
      const { fileURLToPath } = await import('node:url');
      const { dirname, join } = await import('node:path');
      const here = dirname(fileURLToPath(import.meta.url));
      const src = join(here, '..', rel);
      if (!existsSync(src)) {
        throw new Error(`expected ${rel} — it is one of the page's copy sources`);
      }
      const raw = readFileSync(src, 'utf8');
      const decomposed = raw.length - stripComments(raw).length;
      if (decomposed < 100) {
        throw new Error(
          `only ${decomposed} characters of comments were stripped from ${rel} — either the ` +
            `comment syntax changed or stripComments stopped matching. Without a working stripper ` +
            `this check reports the module's own prose as placeholder copy.`,
        );
      }
      const { hits, matched } = scanCopy(raw);
      // A rule that shrugs when it finds nothing to judge is not a rule. If the
      // `"key": "value"` pattern stops matching (a reformat, a nested object),
      // this must fail loudly instead of reporting a clean file.
      if (matched < 20) {
        throw new Error(
          `only ${matched} "key": "value" pairs were found in ${rel} — the copy scan is no longer ` +
            `reading the file, so a clean verdict would be meaningless.`,
        );
      }
      if (hits.length) {
        throw new Error(
          `${rel} contains ${hits.length} placeholder marker(s) in copy (comments and key names ` +
            `excluded): ${hits.join(', ')}`,
        );
      }
    });
  }

  // ── Anchor contract — every fragment the page LINKS TO must resolve ──────
  for (const width of [390, 1280]) {
    await test(`${width}px /: every in-page link resolves to a real element`, async () => {
      const d = await inspect(width);
      if (d.unresolvedFragments.length) {
        throw new Error(
          `${d.unresolvedFragments.length} in-page link(s) point at a fragment that does not ` +
            `exist: ${d.unresolvedFragments.map((f) => `#${f}`).join(', ')} — the link renders, ` +
            `looks live, and does nothing when activated. ` +
            `(${HERO_ID_NOTE})`,
        );
      }
      if (d.linkedFragments.length === 0) {
        throw new Error(
          'the page contains no in-page anchors at all — the selector or the nav changed, not the page',
        );
      }
    });
  }

  await browser.close();

  console.log('');
  if (failures.length) {
    console.log(`landing: ${failures.length} check(s) FAILED`);
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  } else {
    const w = [390, 1280];
    console.log(
      `landing: all checks passed (${SECTIONS.length} spec sections × ${w.length} widths, ` +
        `order + visibility + placeholders + anchors).`,
    );
  }
}

run().catch((err) => {
  console.error('landing: harness error —', err.message);
  process.exitCode = 1;
});
