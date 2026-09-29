/**
 * testimonials.ts — the review/testimonial model for the "Kata Alumni" section.
 *
 * ── WHY THIS FILE EXISTS, AND WHAT IT IS NOT ────────────────────────────────
 * The owner asked (2026-09-29) for a testimonial section, to be filled first from
 * the Google Maps reviews of our own listing, and upgraded later. This file is
 * the MODEL ONLY: the place is built, the reviews are deliberately EMPTY.
 *
 * ⚠ DO NOT WRITE A REVIEW HERE. `COMPANY_PROFILE_DATA.md` §8 records the standing
 * rule: an invented testimonial is banned — a quoted sentence attributed to a
 * named person who never said it is a fabricated claim about a third party, the
 * same class of error as inventing a partner (see partners.ts). The section
 * therefore ships with an explicit "review belum tayang" state, exactly as the
 * Mitra grid shipped with empty slots on 2026-09-27 and was filled two days
 * later. The empty state is a first-class rendering, not a placeholder to be
 * quietly swapped for filler.
 *
 * ── WHAT IS REAL HERE, AND WHY THAT MATTERS ─────────────────────────────────
 * `REVIEW_SOURCE` carries facts that DO exist and are checkable — the Google
 * listing's own rating and review COUNT. They are not a testimonial; they are a
 * pointer to where the testimonials live until they are quoted here, and the
 * link is a read-through to the live listing. Publishing the count is fine
 * because it is the listing's number, not ours to invent; §8's ban is on
 * claims WE make up (candidate totals, departure totals), not on citing a
 * platform's own public figure. If the owner later decides even that is too
 * close to a claim, dropping this block degrades the section to the empty grid.
 *
 * ── HOW TO FILL A SLOT (the upgrade the owner mentioned) ────────────────────
 *   1. Copy the reviewer NAME and the review TEXT VERBATIM from the source, and
 *      set `rating` to the stars shown.
 *   2. Set `source` to where it was read (e.g. 'Google Maps', 'Instagram
 *      @amanah_sakura_japan'), so the quote stays checkable.
 *   3. Add `profile.review_N_quote` + `profile.review_N_name` to BOTH i18n
 *      dictionaries (id + jp). A review is a quote — it is translated as a quote,
 *      or left in its original language with a note, never silently rewritten.
 *   4. Add the reviewer's photo ONLY with their consent (see the P-7 photo rule
 *      in COMPANY_PROFILE_DATA.md §11.2 — an identifiable face needs permission;
 *      the `avatar` field stays `null` until then).
 */

/** One accent role, from the closed list in DESIGN.md §3.2. */
import type { AccentRole } from './companyProfile';

/**
 * Where a review came from. A closed set on purpose: the label under a quote has
 * to name a real platform, and a free string invites "Testimoni" with no source,
 * which is the shape the anti-fabrication rule exists to prevent.
 */
export type ReviewSource = 'Google Maps' | 'Instagram' | 'TikTok' | 'WhatsApp';

export interface Review {
  /**
   * Stable slot number — the React key and the pending-slot label. Does NOT
   * renumber when a review is added, so the position a reviewer occupies never
   * changes identity (same reasoning as `Partner.slot`).
   */
  slot: number;
  /**
   * The review text, verbatim, or `null` while the slot is unfilled.
   *
   * `null` rather than an empty string, for the same reason as `Partner.name`:
   * an empty string is a quote that is present and blank. `null` is the explicit
   * "not yet published" state the component branches on.
   */
  quote: null | { key: string; text: string };
  /** The reviewer's name as shown at the source, or `null` while unfilled. */
  author: null | { key: string; text: string };
  /**
   * Star rating 1–5, or `null` while unfilled. Carried per review because a
   * quoted review has its own score; the section's aggregate lives in
   * `REVIEW_SOURCE`.
   */
  rating: null | 1 | 2 | 3 | 4 | 5;
  /** Which platform the quote was read from — see ReviewSource. */
  source: ReviewSource;
  /**
   * Reviewer photo basename, or `null`.
   *
   * Only ever set WITH the reviewer's consent (COMPANY_PROFILE_DATA.md §11.2,
   * P-7): a recognisable face is personal data, and this repo is public. Until
   * consent exists the card shows initials, which carry no likeness.
   */
  avatar: null | string;
}

/**
 * The reviews.
 *
 * ALL SIX ARE EMPTY TODAY — this is the shipped state, not unfinished business.
 * The grid renders six honest pending cards, and each becomes a real quote the
 * moment the owner supplies one. The count six matches the Mitra grid so the two
 * social-proof sections read as a pair.
 */
export const REVIEWS: Review[] = [
  { slot: 1, quote: null, author: null, rating: null, source: 'Google Maps', avatar: null },
  { slot: 2, quote: null, author: null, rating: null, source: 'Google Maps', avatar: null },
  { slot: 3, quote: null, author: null, rating: null, source: 'Google Maps', avatar: null },
  { slot: 4, quote: null, author: null, rating: null, source: 'Google Maps', avatar: null },
  { slot: 5, quote: null, author: null, rating: null, source: 'Instagram', avatar: null },
  { slot: 6, quote: null, author: null, rating: null, source: 'TikTok', avatar: null },
];

/** How many reviews are filled — derived, so it cannot drift from REVIEWS. */
export const REVIEW_FILLED = REVIEWS.filter((r) => r.quote !== null).length;

/** How many slots exist. The denominator a progress note would use. */
export const REVIEW_TOTAL = REVIEWS.length;

/**
 * The aggregate shown above the grid: the rating and review count from our own
 * Google listing, MEASURED 2026-09-29 from the public listing (5.00 · 7 ulasan).
 *
 * WHY A SEPARATE OBJECT, NOT FIELDS ON EACH REVIEW. These numbers belong to the
 * LISTING, not to any one review, and they change on Google's side without us
 * touching the code. Keeping them in one place makes the eventual refresh a
 * one-line edit and makes it obvious when they were last checked — a rating
 * copied into six cards would be six things to get wrong.
 */
export const REVIEW_SOURCE = {
  label: 'Google Maps',
  /** Average rating on the listing, or `null` if not re-checked recently. */
  rating: 5.0,
  /** Number of reviews on the listing, or `null`. */
  count: 7,
  /** When the figures above were last read from the live listing. */
  checkedOn: '2026-09-29',
  /** The live listing they came from — the read-through for a curious visitor. */
  href: 'https://www.google.com/maps/place/?q=place_id:ChIJVdybaAKfeS4RzVbekeKOhKE',
} as const;

/**
 * The accent role for the section. `exam` (amber) — the same role the headings
 * that carry a score/credential use. Star ratings are a score, and amber is the
 * one accent not already spoken for by the sections this one sits between
 * (`legal` for mitra, `identity` for kontak).
 */
export const REVIEW_ACCENT: AccentRole = 'exam';
