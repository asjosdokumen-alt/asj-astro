/**
 * partners.ts — the MoU partner list for the "Mitra Kami" section.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * ASJ is a small LPK WITHOUT SO (Sending Organization) status. Owner ruling
 * 2026-09-27: the site must say so plainly, and must show WHERE the departure
 * authority actually lives — with the partner LPKs and PTs (SOs) that ASJ has
 * signed MoUs with. A page that only apologises for not being an SO leaves the
 * reader with "so who does send me?", and the honest answer is this list.
 *
 * ── THE SLOTS ARE EMPTY ON PURPOSE, AND THAT IS THE DELIVERABLE ─────────────
 * The owner asked for the section to be BUILT with placeholder slots whose names
 * are filled in later ("Siapkan slot logo, nama diisi kemudian"). So a record
 * here carries a SLOT NUMBER, a role, and `null` for the name and logo — never a
 * fabricated partner name.
 *
 * A fabricated partner is not a placeholder, it is a false claim about a third
 * party: it would put a real company's name on a partnership it has not agreed
 * to. That is why the type makes the name nullable and the component renders an
 * explicit "coming soon" state, rather than the section being written with dummy
 * names that must be remembered and removed.
 *
 * ── HOW TO FILL A SLOT ──────────────────────────────────────────────────────
 *   1. Set `name` (and its `nameKey`, once the Japanese spelling is known).
 *   2. Set `kind` to `'SO'` or `'LPK'` — see PartnerKind.
 *   3. Drop the logo at `public/assets/mitra/<slug>.webp` (+ `@2x`), and set
 *      `logo: '<slug>'`. The component derives the URL, so a caller cannot point
 *      at a `@2x` file by mistake.
 *   4. Nothing else. The grid, the count and the empty-slot fallback all follow
 *      from this array — there is no second copy of the list to keep in sync.
 *
 * ── THE COUNT IS DERIVED, NOT TYPED ────────────────────────────────────────
 * `PARTNER_FILLED` / `PARTNER_TOTAL` are computed from the array. A number
 * typed into prose drifts the moment a slot is filled; this one cannot.
 */

/** One accent role, from the closed list in DESIGN.md §3.2. */
import type { AccentRole } from './companyProfile';

/**
 * What KIND of partner this is.
 *
 *  - `SO`  — a Sending Organization: the body authorised to depart a worker to
 *            Japan. The departure itself happens under a partner SO's licence.
 *  - `LPK` — a fellow training institute. A partner LPK is a peer ASJ works
 *            with; it may or may not also be an SO.
 *
 * Carried per record rather than inferred, because the two read differently to
 * the two audiences this page serves: a candidate wants to know who sends them,
 * a partner wants to know who they are a peer of.
 */
export type PartnerKind = 'SO' | 'LPK';

export interface Partner {
  /**
   * Stable slot number. Used as the empty-slot label ("Mitra 1") and as the
   * React key, so it must not change when a name is filled in — an id that
   * renumbers itself when the list is edited loses the one thing an id is for.
   */
  slot: number;
  /**
   * The partner's name, or `null` while the slot is unfilled.
   *
   * `null` rather than an empty string on purpose: an empty string is a name
   * that is present and blank, so it would render an empty card and read as a
   * rendering bug. `null` is the explicit "not yet known" state the component
   * branches on.
   */
  name: null | { key: string; text: string };
  /** Partner category — see PartnerKind. */
  kind: PartnerKind;
  /**
   * Logo basename, or `null` while unfilled.
   *
   * A basename only, matching `TileImage.name`: the component derives the
   * `1x`/`@2x` and `webp`/`avif` URLs, so a call site cannot accidentally point
   * a 1x slot at a `@2x` file — the defect that makes one DPR render a
   * double-size image.
   */
  logo: null | string;
}

/**
 * The partner slots.
 *
 * SIX is a deliberate, modest number: it is enough to show that the network is
 * real and plural — which is the entire point of the section — without
 * implying a scale ASJ cannot currently evidence. It is also exactly the count
 * the owner's own phrasing ("banyak rekan MoU LPK dan PT") supports without
 * turning into a statistic, and this repo does not publish partner COUNTS as a
 * claim anywhere (see companyProfile.ts's header, which bans exactly that).
 *
 * ⚠ DO NOT fill these with placeholder names to make the section look finished.
 * An unfilled slot renders an honest "belum dipublikasikan" state. A renamed
 * slot that was never actually signed is a false statement about a real
 * company, which is the one thing this section cannot afford.
 */
export const PARTNERS: Partner[] = [
  { slot: 1, name: null, kind: 'SO', logo: null },
  { slot: 2, name: null, kind: 'SO', logo: null },
  { slot: 3, name: null, kind: 'LPK', logo: null },
  { slot: 4, name: null, kind: 'LPK', logo: null },
  { slot: 5, name: null, kind: 'LPK', logo: null },
  { slot: 6, name: null, kind: 'LPK', logo: null },
];

/** How many slots are filled — derived, so it cannot drift from PARTNERS. */
export const PARTNER_FILLED = PARTNERS.filter((p) => p.name !== null).length;

/** How many slots exist. The denominator a progress note would use. */
export const PARTNER_TOTAL = PARTNERS.length;

/**
 * The accent role for the section's iconography. `legal` because a MoU is a
 * contract — the same role the legalitas and team sections use for documents
 * and credentials, so the colour reads as "this is about paperwork that binds",
 * which is exactly what a partner agreement is.
 */
export const PARTNER_ACCENT: AccentRole = 'legal';
