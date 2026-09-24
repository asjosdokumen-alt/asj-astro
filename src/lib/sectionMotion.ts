/**
 * sectionMotion.ts — which section of the landing page carries which ENTRANCE.
 *
 * WHY THIS IS A MODULE AND NOT A COPY OF A TABLE
 * ----------------------------------------------
 * The landing page renders `data-enter="<kind>"` on each section, and the CSS
 * (`motion.css` §9b) turns each kind into one `@keyframes` set. Nothing in the
 * type system connects the two, so the vocabulary lives in exactly ONE place —
 * here — and the page reads it rather than re-spelling it. A second hand-written
 * list would be a list that agrees with this one only until somebody edits one.
 *
 * ⚠ THE OWNER'S OWN WORDS, because they are the specification:
 *
 *   "tiap bagian kek layanan, hero, galery, contacu us tolong setiap scrollnya
 *    bikin transisi beda beda ..."
 *
 * "setiap scrollnya bikin transisi beda beda" — every section's entrance must be
 * DIFFERENT. Not one shared fade with a different delay: a different KIND of
 * movement. `ENTER_KINDS` below is that vocabulary, and `SECTION_MOTION` gives
 * every section its own distinct one.
 *
 * ── WHAT THIS FILE USED TO CARRY, AND WHY IT NO LONGER DOES ─────────────────
 * It also carried a `pose` and a `motion` per section, driving a princess mascot
 * that followed the scroll. Owner ruling 2026-09-24: the mascot is removed from
 * the site entirely, so those two columns, the `MASCOT_MOTIONS` vocabulary and
 * the `mascotClasses()` helper are gone with her. What remains is the half that
 * was never about her — the entrance table.
 *
 * WHY THERE ARE NO SCROLL LISTENERS
 * ---------------------------------
 * "Follow the scroll" is tempting to implement with a `scroll` handler. That
 * runs a callback on every frame of every scroll, on the main thread, to start
 * an animation the compositor could have started for free. Instead the entrance
 * is driven by an `IntersectionObserver` over `[data-enter]` bands in
 * `BaseLayout.astro`, which fires on crossing a boundary (a few times per page)
 * rather than per frame. This is the same primitive `SiteNav.astro` uses for its
 * active-section band, so it adds no new machinery.
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

export interface SectionMotion {
  /** Section anchor id. Must exist in `src/pages/index.astro`. */
  id: string;
  /** A short name for the human reading a test failure. Not rendered. */
  label: string;
  /** The section's entrance. See `ENTER_KINDS`. */
  enter: EnterKind;
}

/**
 * THE MAP. One row per section of the landing page, in page order.
 *
 * ORDER MATTERS and is asserted: this is in document order, and no two ADJACENT
 * rows may share an `enter`. Repetition is what makes an entrance read as a loop
 * rather than as a response to where you are — if two bands you scroll past in a
 * row arrive the same way, the second arrival says "this is still the same
 * place". `test-landing.mjs` checks the page's rendered `data-enter` values
 * against this table, so the page cannot drift from it silently.
 *
 * ── `hero` IS NOT TRACKABLE, AND THAT IS A MEASURED FACT, NOT A CHOICE ─────
 * The hero is a Preact island mounted `client:load` (src/components/App.tsx,
 * `id={hero ? "atas" : "asj-header"}`), and the reveal script runs against the
 * server-rendered DOM. The hero band therefore carries no `data-enter`, and it
 * is deliberately absent here: this table describes the STATIC page's sections,
 * and the hero is rendered by the island. Adding a row for it would create an
 * entry no `[data-enter]` band can ever satisfy.
 *
 * ── `daftar` IS A REAL SECTION AND MUST STAY LISTED ────────────────────────
 * `ClosingBand.astro` renders `<Section id="daftar">`. It is the page's closing
 * call to action and its LAST anchor, so it belongs in this table like any other
 * band — the table is the page's list of entrance-bearing sections, and this is
 * one of them.
 */
export const SECTION_MOTION: readonly SectionMotion[] = [
  { id: 'kenapa-jepang', label: 'Kenapa Jepang', enter: 'slide-left' },
  { id: 'layanan', label: 'Layanan', enter: 'slide-right' },
  { id: 'program', label: 'Program', enter: 'grow' },
  { id: 'alur', label: 'Alur', enter: 'curtain' },
  { id: 'visi-misi', label: 'Visi & Misi', enter: 'drop' },
  { id: 'legalitas', label: 'Legalitas', enter: 'focus' },
  { id: 'fasilitas', label: 'Fasilitas', enter: 'slide-left' },
  { id: 'galeri', label: 'Galeri', enter: 'grow' },
  { id: 'penempatan', label: 'Penempatan', enter: 'slide-right' },
  { id: 'tentang', label: 'Tentang', enter: 'curtain' },
  { id: 'tim', label: 'Tim', enter: 'focus' },
  { id: 'kontak', label: 'Kontak', enter: 'drop' },
  { id: 'lokasi', label: 'Lokasi', enter: 'rise' },
  { id: 'daftar', label: 'Daftar', enter: 'focus' },
];

/** Lookup by section id. Returns undefined for a section with no entry. */
export function motionFor(id: string): SectionMotion | undefined {
  return SECTION_MOTION.find((s) => s.id === id);
}
