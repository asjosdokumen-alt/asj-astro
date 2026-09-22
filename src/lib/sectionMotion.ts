/**
 * sectionMotion.ts — which section of the landing page carries which ENTRANCE,
 * and which POSE + MOTION the princess mascot wears while that section is the
 * one on screen.
 *
 * WHY THIS IS A MODULE AND NOT TWO COPIES OF A TABLE
 * --------------------------------------------------
 * The landing page needs this map to render `data-enter` on each section and to
 * drive the mascot; `e2e/test-mascot-motion.mjs` needs the SAME map to assert
 * that her pose actually changes. If the test re-declared its own expectations,
 * it would be asserting that two hand-written lists agree — which passes
 * whenever someone edits both, and fails for reasons that are not defects. One
 * table, imported by both, means a change to the page is a change the test
 * already knows about.
 *
 * ⚠ THE OWNER'S OWN WORDS, because they are the specification:
 *
 *   "tiap bagian kek layanan, hero, galery, contacu us tolong setiap scrollnya
 *    bikin transisi beda beda dan mascot itu bukan model gitu maunya ikut
 *    sesuai scroll mau ke sesi terus jadi pindah ikutin bagian dan posenya beda
 *    beda tergantung tempat baik mimik wajah maupun motionnya."
 *
 * Three requirements fall out of that, and each one constrains the design:
 *
 *   1. "setiap scrollnya bikin transisi beda beda" — every section's entrance
 *      must be DIFFERENT. Not one shared fade with a different delay: a
 *      different KIND of movement. `ENTER_KINDS` below is that vocabulary, and
 *      `SECTION_MOTION` assigns each a distinct one.
 *
 *   2. "mascot itu bukan model" — she is NOT a 3D viewer. This is already true
 *      and this file must not change it: `PrincessMascot.astro` renders five
 *      flattened PNG/WebP/AVIF renders, and `motion.css` §7 documents at length
 *      why the 17 MB rig is not shipped (it carries exactly one animation clip,
 *      a walk, so a viewer would promise motion the source does not have).
 *      "Ikut scroll" is therefore achieved with a STICKY rail and pose swaps,
 *      not with a 3D camera.
 *
 *   3. "posenya beda beda tergantung tempat baik mimik wajah maupun motionnya" —
 *      pose AND motion change per section. `pose` below is her facial
 *      expression *and* body attitude (the five renders differ in both), and
 *      `motion` is the idle animation she plays while that section is current.
 *      Every section gets its own pair; no two adjacent sections repeat one.
 *
 * WHY THERE ARE NO SCROLL LISTENERS
 * ---------------------------------
 * "Follow the scroll" is tempting to implement with a `scroll` handler that
 * moves her by `scrollY`. That runs a callback on every frame of every scroll,
 * on the main thread, to move one decoration — and it fights the compositor,
 * which is already handling the sticky positioning off-thread. Instead:
 *
 *   - TRAVEL is CSS `position: sticky`. The browser moves her during compositing;
 *     no JavaScript observes the scroll at all.
 *   - POSE/MOTION CHANGES are an `IntersectionObserver` over the sections, which
 *     fires on crossing boundaries (a few times per page) rather than per frame.
 *
 * This is the same primitive `SiteNav.astro` uses for its active-section band and
 * `BaseLayout.astro` uses for the reveal pass, so it adds no new machinery.
 */

/**
 * The entrance vocabulary. Each name is one `@keyframes` set in motion.css §9b,
 * and the KEY is what a section writes as `data-enter="<key>"`.
 *
 * They are deliberately different in DIRECTION and in what moves, because that
 * is the difference a visitor actually perceives. Four fades that differ only in
 * distance read as one animation played four times.
 */
export const ENTER_KINDS = [
  /** Rises into place. The neutral one; used where a section has no better idea. */
  'rise',
  /** Arrives from the left, as if the band is sliding in under the previous. */
  'slide-left',
  /** Arrives from the right. Paired against `slide-left` so a sequence alternates. */
  'slide-right',
  /** Grows into place from 94%. Reads as "opening", good for a grid of tiles. */
  'grow',
  /** Wipes upward from a clipped edge, like a curtain lifting off the content. */
  'curtain',
  /** Settles down from above, as if dropping onto the page. */
  'drop',
  /** Focuses in: starts slightly blurred and soft, sharpens as it lands. */
  'focus',
] as const;

export type EnterKind = (typeof ENTER_KINDS)[number];

/**
 * The mascot idles. Each name is one `@keyframes` in motion.css §7b. They must
 * be motions that make sense for a STANDING FULL-BODY figure — `mascot-float`
 * (Aa-chan's, a Y translation) is deliberately not in this list, because lifting
 * a standing figure off the ground reads as a layout bug. motion.css §7 says the
 * same thing about why she needed `mascot-sway` rather than reusing the float.
 */
export const MASCOT_MOTIONS = [
  /** Slow sway + breath, pivoted on her feet. Her resting state. */
  'sway',
  /** The wave: rotate about the shoulder, the raised arm moving. */
  'wave',
  /** A small bounce, feet leaving the floor — used where she is celebrating. */
  'bounce',
  /** Leans in toward the content, as if reading it over your shoulder. */
  'lean',
  /** Looks around slowly, side to side, as if scanning the room. */
  'look',
] as const;

export type MascotMotion = (typeof MASCOT_MOTIONS)[number];

export interface SectionMotion {
  /** Section anchor id. Must exist in `src/pages/index.astro`. */
  id: string;
  /**
   * A short name for the human reading the test failure. Not rendered.
   */
  label: string;
  /** The section's entrance. See `ENTER_KINDS`. */
  enter: EnterKind;
  /** The pose she wears here — this IS her facial expression. */
  pose: string;
  /** The idle she plays here. */
  motion: MascotMotion;
}

/**
 * THE MAP. One row per section of the landing page, in page order.
 *
 * ORDER MATTERS and is asserted: the mascot travels DOWN the page, so
 * `SECTION_MOTION` is in document order, and no two ADJACENT rows may share a
 * `pose` or a `motion`. Repetition is what makes motion read as a loop rather
 * than as a response to where you are — if she is waving in two sections you
 * scroll past, the second wave says "this is still the same place".
 *
 * ── WHY EVERY SECTION IS LISTED, INCLUDING THE SHORT ONES ──────────────────
 * An earlier draft of this table carried only the sections "tall enough to be
 * the visitor's whole screen", on the theory that a short band cannot be "the
 * place you are at" and spending a pose change on it would make her flicker.
 * That reasoning is sound in general and WRONG FOR THIS PAGE, for a reason that
 * settled it: the owner named the short sections explicitly.
 *
 *   "tiap bagian kek layanan, hero, galery, contacu us"  — hero, layanan,
 *   galeri, kontak are all named, and `kontak` is one of the SHORTEST bands
 *   on the page.
 *
 * `lokasi` is last in document order and is also short. Excluding it would have
 * left the final band showing whatever pose the previous section chose, which
 * is the one place a visitor is most likely to look at her — they have stopped
 * scrolling.
 *
 * The flicker concern is handled by the SELECTION RULE rather than by omitting
 * rows: BaseLayout's mascot block picks the section whose MIDPOINT is nearest
 * the viewport's midpoint, which changes exactly once per boundary and cannot
 * oscillate. A threshold-based rule would have needed the omissions; a nearest-
 * midpoint rule does not.
 *
 * ── `hero` IS NOT TRACKABLE, AND THAT IS A MEASURED FACT, NOT A CHOICE ─────
 * This row used to be keyed `hero`, then `atas` — and BOTH were wrong. The hero
 * is a Preact island mounted `client:only="preact"` (src/components/App.tsx,
 * `id={hero ? "atas" : "asj-header"}`), which means it is NOT IN THE SERVER-
 * RENDERED HTML AT ALL. Measured on the built output:
 *
 *     dist/index.html  ->  id="atas"          absent
 *                          <astro-island>     15 occurrences
 *                          <section id="..."> kenapa-jepang … lokasi, daftar
 *
 * The script runs against the server-rendered DOM at parse time, so a selector
 * for `#atas` matches nothing, she keeps her initial pose through the whole
 * hero, and NO ASSERTION THAT TWO LATER SECTIONS DIFFER WOULD EVER NOTICE —
 * the first section was simply never tracked. That is the exact quiet failure
 * this comment exists to stop someone re-introducing by "fixing" the id.
 *
 * `ENTER_KINDS` still contains `rise`, and the hero band is rendered by the
 * island, so there is no `data-enter` on it either. Both are omitted here and
 * the reason is the same one: this table describes the STATIC page's sections,
 * and the hero is not one of them.
 *
 * ── `daftar` IS A REAL SECTION AND WAS MISSING ─────────────────────────────
 * `ClosingBand.astro` renders `<Section id="daftar">`. It is the page's closing
 * call to action and its LAST anchor, so omitting it would leave the final band
 * showing whatever pose the previous section chose — which is the one place a
 * visitor is most likely to be looking at her, because they have stopped
 * scrolling.
 */
export const SECTION_MOTION: readonly SectionMotion[] = [
  { id: 'kenapa-jepang', label: 'Kenapa Jepang', enter: 'slide-left', pose: 'princess-peace', motion: 'sway' },
  { id: 'layanan', label: 'Layanan', enter: 'slide-right', pose: 'princess-side', motion: 'lean' },
  { id: 'program', label: 'Program', enter: 'grow', pose: 'princess-still', motion: 'sway' },
  { id: 'alur', label: 'Alur', enter: 'curtain', pose: 'princess-head', motion: 'look' },
  { id: 'visi-misi', label: 'Visi & Misi', enter: 'drop', pose: 'princess-still', motion: 'lean' },
  { id: 'legalitas', label: 'Legalitas', enter: 'focus', pose: 'princess-head', motion: 'sway' },
  { id: 'fasilitas', label: 'Fasilitas', enter: 'slide-left', pose: 'princess-peace', motion: 'bounce' },
  { id: 'galeri', label: 'Galeri', enter: 'grow', pose: 'princess-wave', motion: 'look' },
  { id: 'loker-ringkas', label: 'Loker', enter: 'rise', pose: 'princess-side', motion: 'sway' },
  { id: 'penempatan', label: 'Penempatan', enter: 'slide-right', pose: 'princess-peace', motion: 'bounce' },
  { id: 'tentang', label: 'Tentang', enter: 'curtain', pose: 'princess-still', motion: 'lean' },
  { id: 'tim', label: 'Tim', enter: 'focus', pose: 'princess-head', motion: 'look' },
  { id: 'kontak', label: 'Kontak', enter: 'drop', pose: 'princess-wave', motion: 'wave' },
  { id: 'lokasi', label: 'Lokasi', enter: 'rise', pose: 'princess-side', motion: 'sway' },
  { id: 'daftar', label: 'Daftar', enter: 'focus', pose: 'princess-peace', motion: 'bounce' },
];

/** Lookup by section id. Returns undefined for a section with no entry. */
export function motionFor(id: string): SectionMotion | undefined {
  return SECTION_MOTION.find((s) => s.id === id);
}

/**
 * The class list `PrincessMascot.astro` emits, for a given motion.
 *
 * ── WHY THIS DOES NOT RETURN A POSE CLASS ─────────────────────────────────
 * An earlier version returned `mascot mascot-<motion> pose-<pose>`, and the
 * `pose-*` half was WRONG — no such class exists in any stylesheet. It looked
 * harmless because an unmatched class is inert, which is exactly what makes it
 * dangerous: a future reader would find the call site, search for `pose-`, find
 * nothing, and either add a pointless rule or conclude the mechanism was
 * half-built.
 *
 * The pose is not carried by a class at all. It is carried by `data-pose`,
 * because the pose is a SINGLE-VALUE SWAP with no cascade to resolve (one
 * `src=` at a time), whereas a class list is the right tool for the motion,
 * which composes with the entrance. `verify:keyframes` now guards the motion
 * half; nothing guards a dead class, so the honest move is not to emit one.
 */
export function mascotClasses(motion: MascotMotion): string {
  return `mascot mascot-${motion}`;
}
