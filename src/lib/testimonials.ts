/**
 * testimonials.ts — the review/testimonial model for the "Kata Alumni" section.
 *
 * ── WHY THIS FILE EXISTS, AND WHAT IT IS NOT ────────────────────────────────
 * The owner asked (2026-09-29) for a testimonial section, to be filled first from
 * the Google Maps reviews of our own listing, and upgraded later. This file is
 * the MODEL: the place is built, and since 2026-11-11 four real quotes fill it.
 *
 * ⚠ DO NOT WRITE A REVIEW HERE. `COMPANY_PROFILE_DATA.md` §8 records the standing
 * rule: an invented testimonial is banned — a quoted sentence attributed to a
 * named person who never said it is a fabricated claim about a third party, the
 * same class of error as inventing a partner (see partners.ts). Every quote below
 * was transcribed from a screenshot of our own listing. The section shipped with
 * an explicit "review belum tayang" state for six weeks precisely so that this
 * file would stay empty until real words arrived — the empty state was a
 * first-class rendering, not a placeholder to be quietly swapped for filler.
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
import { CONTACT_MAPS_URL } from './companyProfile';

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
 * ── FILLED 2026-11-11, FROM THE OWNER'S OWN LISTING ────────────────────────
 * Four real Google Maps reviews, supplied by the owner as screenshots of the
 * listing on 2026-11-11. Everything below is copied from those screenshots:
 * the name exactly as Google shows it (including `Anggi ekadamayanti`, whose
 * capitalisation is theirs, not a typo), the star row, and the text.
 *
 * ⚠ THE TEXT IS THE LISTING'S ENGLISH TRANSLATION, NOT THE REVIEWER'S ORIGINAL
 * WORDS. Google served these with "Translated by Google · See original
 * (Indonesian)" underneath, and the originals are in Indonesian. Publishing the
 * translation as if it were the original would be a quiet rewrite of somebody
 * else's sentence, so the section says out loud that it is a translation
 * (`profile.review_translated_note`). The alternative — translating the English
 * back into Indonesian ourselves — is worse: it is a translation of a
 * translation, attributed verbatim to a named person.
 *
 * That is also why the `jp` dictionary carries the SAME English text: a quote is
 * reproduced or noted, never silently rewritten. `profile.review_N_name` is
 * invariant in both dictionaries for the same reason a licence number is.
 *
 * ── WHY FOUR SLOTS AND NOT SIX ─────────────────────────────────────────────
 * The grid shipped with six, matching the Mitra grid, because six empty slots
 * were the honest shape while nothing was quoted. With four real reviews in
 * hand, two cards saying "Review belum tayang" would be a claim about our own
 * incompleteness sitting next to the proof that it is not true. The count
 * follows the evidence, not the other grid.
 *
 * The pending state still exists and is still first-class (see the header): a
 * slot goes back to `quote: null` the moment its quote is withdrawn, and
 * `ReviewGrid` renders it exactly as before.
 */
export const REVIEWS: Review[] = [
  {
    slot: 1,
    quote: {
      key: 'profile.review_1_quote',
      text: "Looking at the map review? Don't hesitate. I've been to Japan through this LPK. The LPK near my house rejected me outright because I had a broken bone. The Amanah Sakura LPK accepted me and thank God.. I'm now here.. in Japan..",
    },
    author: { key: 'profile.review_1_name', text: 'EL GASING' },
    rating: 5,
    source: 'Google Maps',
    avatar: null,
  },
  {
    slot: 2,
    quote: {
      key: 'profile.review_2_quote',
      text: 'Alhamdulillah, this LPK carries out its function as its name suggests, I am the first batch to study at this LPK, far from Padang, God willing, nothing is impossible, my age when I entered this LPK was quite old, namely 27, God willing, through this LPK I finally flew and worked in the land of the rising sun,',
    },
    author: { key: 'profile.review_2_name', text: 'Feri Wahyudi' },
    rating: 5,
    source: 'Google Maps',
    avatar: null,
  },
  {
    slot: 3,
    quote: {
      key: 'profile.review_3_quote',
      text: "LPK GACOR Se PONOROGO, There are lots of jobs, guaranteed to leave quickly, just wait for COE 3-4 months. Standard fees. Admin and sensei are very nice if you don't know, they explain until you understand. Thank you sensei 🥰🥰🥰 ...",
    },
    author: { key: 'profile.review_3_name', text: 'Anggi ekadamayanti' },
    rating: 5,
    source: 'Google Maps',
    avatar: null,
  },
  {
    slot: 4,
    quote: {
      key: 'profile.review_4_quote',
      text: 'Konnichiwa, Sensei, and all the administrators of LPK AMANAH SAKURA JAPAN. I would like to express my deepest gratitude for all the help, guidance, and valuable opportunities given to me. Through this LPK, thank God, I was able to pass the interview and get a job in Japan, finally reaching this point of departure. Thank you for the hard work of Sensei and the staff in accompanying me from the beginning of the process. I apologize for any mistakes, and please pray for my smooth work there.',
    },
    author: { key: 'profile.review_4_name', text: 'Angelina Julia Putri' },
    rating: 5,
    source: 'Google Maps',
    avatar: null,
  },
];

/** How many reviews are filled — derived, so it cannot drift from REVIEWS. */
export const REVIEW_FILLED = REVIEWS.filter((r) => r.quote !== null).length;

/** How many slots exist. The denominator a progress note would use. */
export const REVIEW_TOTAL = REVIEWS.length;

/**
 * The aggregate shown above the grid: the rating and review count from our own
 * Google listing.
 *
 * ── VERIFIED 2026-10-31, AND THE PREVIOUS FIGURES WERE STALE ────────────────
 * Carried 5.00 · 7 since 2026-09-29, then sat under a "STILL UNVERIFIED" warning
 * from 2026-10-20 because no listing could be found to check them against.
 * The owner supplied the listing URL on 2026-10-31 and the listing card now
 * renders it: **4.8 · 20 ulasan**. So the old pair was not merely unverified, it
 * was wrong — the count had nearly tripled and the average had moved.
 *
 * HOW IT WAS READ (no API key, no scraping): Google's keyless embed, queried by
 * the listing's NAME, renders the place card with the live average and count —
 * `https://www.google.com/maps?q=PT%2FLPK+AMANAH+SAKURA+JAPAN+Ponorogo&output=embed`
 * inside an iframe. That card is what `MAPS_EMBED_URL` now shows on the page, so
 * a visitor can check these numbers against the same surface we read them from.
 *
 * WHY THE FIGURES ARE STILL COPIED HERE AT ALL, given they drift: the section
 * needs a headline number that a no-JS reader and a crawler can see, and an
 * iframe cannot supply that. `checkedOn` is the honesty valve — it dates the
 * copy. Refresh it whenever the listing is re-read, and if the listing ever
 * disappears set `rating`/`count` back to `null`: the null branches in
 * index.astro and below degrade the block instead of printing a stale claim.
 *
 * WHY A SEPARATE OBJECT, NOT FIELDS ON EACH REVIEW. These numbers belong to the
 * LISTING, not to any one review, and they change on Google's side without us
 * touching the code. Keeping them in one place makes the eventual refresh a
 * one-line edit and makes it obvious when they were last checked — a rating
 * copied into six cards would be six things to get wrong.
 */

/**
 * WHY `rating`/`count` ARE CAST TO `number | null` AND NOT PINNED BY `as const`.
 *
 * This object shipped with `as const`, which pinned `rating` to the literal type
 * `4.8`. The comments above and below then promised, twice, that setting
 * `rating: null` would degrade the block — but that assignment did not even
 * TYPE-CHECK, and `index.astro` called `rating.toFixed(1)` unguarded, so the
 * documented escape hatch was a crash waiting for the first person to use it.
 * A doc comment that describes a path the types forbid is worse than no comment:
 * it is a promise nobody can keep.
 *
 * ⚠ WHY A PER-FIELD CAST AND NOT A NAMED INTERFACE (measured 2026-10-31). The
 * obvious fix is `export interface ReviewAggregate { … }` plus an annotation, and
 * it was written that way first — then the indexer's symbol envelope went from
 * 30,807 to 30,814, because an interface's five members are five symbols. The
 * ceiling is a budget, and spending seven of it on a type that says "this field
 * may be null" is a bad trade. The casts cost ZERO symbols and say the same thing
 * at the exact two fields that need it.
 *
 * ⚠ AND NOT NAMED `ReviewSource`: that name is already the closed union of
 * platform labels above (`Review.source`), so an interface of that name would
 * have silently narrowed this object to `'Google Maps' | 'Instagram' | …`.
 */
export const REVIEW_SOURCE = {
  label: 'Google Maps',
  /** Average rating on the listing, or `null` if not re-checked recently. */
  rating: 4.8 as number | null,
  /** Number of reviews on the listing, or `null`. */
  count: 20 as number | null,
  /** When the figures above were last read from the live listing. */
  checkedOn: '2026-10-31',
  /**
   * The live listing they came from — the read-through for a curious visitor.
   *
   * ⚠ WAS A DEAD `place_id:` LINK (found 2026-10-20). This used to be a
   * hardcoded copy of `https://www.google.com/maps/place/?q=place_id:ChIJVdybaAKfeS4RzVbekeKOhKE`
   * — the same place_id `companyProfile.ts` was measured not to resolve. It is
   * exactly the third hardcoded copy that `CONTACT_MAPS_URL`'s comment warned
   * about ("⚠ Keep BOTH call sites on this constant") and it was still missed,
   * because the warning named two call sites and there were three.
   *
   * RESOLVED 2026-10-31, and the old warning is now obsolete: `CONTACT_MAPS_URL`
   * searches the listing BY NAME, which does resolve, so this link opens the
   * real place card — the same card the embed shows, with the same 4.8 · 20 on
   * it. That is what makes the figures above checkable: a reader can arrive at
   * the number from the number's own source. Still one constant, still three
   * call sites (`#lokasi`, footer GPS, this link).
   *
   * If the listing ever disappears, set `rating`/`count` back to `null` and the
   * block degrades itself — see the `null` branches here and in index.astro.
   */
  href: CONTACT_MAPS_URL,
};

/**
 * The accent role for the section. `exam` (amber) — the same role the headings
 * that carry a score/credential use. Star ratings are a score, and amber is the
 * one accent not already spoken for by the sections this one sits between
 * (`legal` for mitra, `identity` for kontak).
 */
export const REVIEW_ACCENT: AccentRole = 'exam';
