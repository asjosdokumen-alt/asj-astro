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
 * ── THE SLOTS ARE NOW FILLED, AND WHERE THE NAMES CAME FROM ─────────────────
 * The section was built 2026-09-27 with six empty slots whose names were to be
 * supplied later. On 2026-09-29 the OWNER supplied the six partner websites as
 * the MoU list, and the names below are read from those sites' own pages (their
 * legal entity name, their own about/company page — never inferred from a domain
 * alone). That origin is the publication basis: a name here is on the page
 * because the partner publishes it as its own identity, which is the same
 * standard `COMPANY_PROFILE_DATA.md` holds ASJ's own data to.
 *
 * ⚠ A NAME MAY ONLY BE ADDED once the owner has named the partner. A fabricated
 * partner is not a placeholder, it is a false claim about a third party — a real
 * company's name on a partnership it has not agreed to. That is why the type
 * makes `name` nullable and the component still renders an explicit pending
 * state: the empty branch is not dead, it is the state a seventh slot would take.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────────
 * No partner COUNT is published (`COMPANY_PROFILE_DATA.md` §12 bans a partner
 * count as a claim; §8's "Batas klaim" says the same). The grid shows names, not
 * a statistic, and `PARTNER_TOTAL` is for a progress note — never page copy.
 * No logos are set: none were supplied, and a logo is a trademark, so a slot
 * without one renders the dashed box rather than a wrong or borrowed mark.
 *
 * ── HOW TO FILL OR CHANGE A SLOT ────────────────────────────────────────────
 *   1. Set `name` to `{ key, text }` — `key` is the i18n key, `text` the
 *      Indonesian fallback. Add the same key to BOTH dictionaries (id + jp).
 *   2. Set `kind` to `'SO'` or `'LPK'` — see PartnerKind.
 *   3. Set `home` to the URL the name was read from, so the entry stays checkable.
 *   4. Drop the logo at `public/assets/mitra/<slug>.webp`, set `logo: '<slug>'`,
 *      and record it in `scripts/ci/verify-assets.mjs` (a new asset that is
 *      rendered but unregistered fails that gate). The component derives the URL,
 *      so a caller cannot point at a `@2x` file by mistake.
 *   5. Nothing else. The grid, the count and the empty-slot fallback all follow
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
  /**
   * The partner's own public website, or `null`.
   *
   * Carried for TRACEABILITY, not for rendering: it is the page a name in this
   * list was read from, so anyone reviewing the section can confirm the name is
   * the partner's own and not an invention. The grid does NOT link it (a
   * partner's site is not ours to advertise from a slot that exists to describe
   * the relation), so this is documentation the type keeps honest — a field that
   * nothing renders is easy to let drift, and a comment beside the data is
   * easier still.
   */
  home: null | string;
}

/**
 * The partner slots.
 *
 * SIX is the owner's own list as supplied 2026-09-29. It is also exactly the
 * count the section was built for, so the grid, the entrance oracle and the
 * `data-filled` split all keep working unchanged.
 *
 * ORDER IS NOT RANK. It follows the order the owner listed the six sites in,
 * deliberately: any other order would imply a preference among partners that
 * the owner never stated. `slot` stays the stable id (it is the React key and
 * the empty-slot label) and does not renumber when a name changes.
 *
 * The names and the `kind` values are read from each partner's own site — see
 * the header for the publication basis. `kind` is the DECLARED status on that
 * site (an SO licence number, or a P3MI/LPK identity), never a guess from the
 * domain: putting "SO" on a partner that only publishes itself as an LPK would
 * overstate what it can legally do.
 */
export const PARTNERS: Partner[] = [
  {
    slot: 1,
    name: { key: 'profile.mitra_1_name', text: 'PT Flora Talent Indonesia' },
    kind: 'LPK',
    logo: null,
    home: 'https://www.ysfloraindonesia.com/',
  },
  {
    slot: 2,
    name: { key: 'profile.mitra_2_name', text: 'PT Human Mandiri Indonesia' },
    kind: 'LPK',
    logo: null,
    home: 'https://humanindonesia.com/id',
  },
  {
    slot: 3,
    name: { key: 'profile.mitra_3_name', text: 'LPK Japanesia' },
    kind: 'SO',
    logo: null,
    home: 'https://lpkjapanesia.com/',
  },
  {
    slot: 4,
    name: { key: 'profile.mitra_4_name', text: 'PT JIPA' },
    kind: 'LPK',
    logo: null,
    home: 'https://www.jipa.co.id/',
  },
  {
    slot: 5,
    name: { key: 'profile.mitra_5_name', text: 'LPK Jinzai Servis Indonesia' },
    kind: 'SO',
    logo: null,
    home: 'http://jsi-jinzai.com/',
  },
  {
    slot: 6,
    name: { key: 'profile.mitra_6_name', text: 'PT Hibiki Cendekia Mandala' },
    kind: 'LPK',
    logo: null,
    home: 'https://www.hibikicendekia.com/',
  },
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
