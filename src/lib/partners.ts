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
 * The logos WERE fetched from each partner's own site on 2026-09-29, from the
 * same `home` URL the name was read from — the mark is the partner's own, served
 * by the partner, never a redraw or a lookalike. `COMPANY_PROFILE_DATA.md` §11.2
 * rules that a logo MAY live in the public repo ("Logo bukan data pribadi"), and
 * §11.1 caps a logo at 512 px wide; each file here is ≤512 px on its long edge
 * and renders at 48 px tall. Each is registered in `scripts/ci/verify-assets.mjs`
 * — a rendered asset with no recorded basis fails that gate, deliberately.
 *
 * That is a SECOND owner ruling, distinct from the name ruling above: a name and
 * a mark are different acts. A name says "we have an MoU with this body"; a
 * borrowed mark says "this body endorses what is beside it". The owner asked for
 * the marks on 2026-09-29, which is the basis recorded here.
 *
 * ── HOW TO FILL OR CHANGE A SLOT ────────────────────────────────────────────
 *   1. Set `name` to `{ key, text }` — `key` is the i18n key, `text` the
 *      Indonesian fallback. Add the same key to BOTH dictionaries (id + jp).
 *   2. Set `kind` to `'SO'` or `'LPK'` — see PartnerKind.
 *   3. Set `home` to the URL the name was read from, so the entry stays checkable.
 *   4. Drop the logo at `public/assets/mitra/<slug>.webp`, set `logo: '<slug>'`,
 *      and record it in `scripts/ci/verify-assets.mjs` (a new asset that is
 *      rendered but unregistered fails that gate). The component derives the URL,
 *      so a caller cannot point at a `@2x` file by mistake. Fetch the file from
 *      the partner's OWN site — the same `home` URL at step 3 — and scale it to
 *      ≤512 px wide (§11.1); a mark taken from anywhere else is a borrowed mark,
 *      which is the failure this list exists to prevent.
 *
 *      THE FILE'S REAL PIXEL SIZE IS NOT IN THE MARKUP. `PartnerGrid.tsx` renders
 *      every logo into one 120x48 box (`max-h-12 max-w-[7.5rem]`), because these
 *      six marks have aspect ratios from 0.97 to 4.30 — sizing by height alone
 *      would make the widest render ~4x the width of the narrowest. The box is
 *      what keeps the grid even; the file just has to be big enough to be sharp
 *      at 120 px, which 512 px comfortably is.
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
    // LPK — CORRECT, and the one entry that stays. Its own site declares no
    // P3MI and no SO: "lembaga pelatihan dan penyalur tenaga kerja resmi di
    // bawah YS Talent Japan". No SO licence number appears anywhere on it. This
    // is the only partner that publishes itself as a training body only.
    kind: 'LPK',
    logo: 'ysflora',
    home: 'https://www.ysfloraindonesia.com/',
  },
  {
    slot: 2,
    name: { key: 'profile.mitra_2_name', text: 'PT Human Mandiri Indonesia' },
    // SO — CORRECTED 2026-09-30 from LPK. Its own site: "dengan nama Gunamandiri
    // Paripurna, kami juga telah resmi memperoleh izin P3MI dari pemerintah
    // Indonesia dan menjalankan bisnis penempatan tenaga kerja ke luar negeri."
    // A P3MI licence is the placement authority — the same standing this list
    // calls SO. NOTE the licence is held under the PARENT name (Gunamandiri
    // Paripurna), and the entry here is the site that publishes it; the owner
    // supplied this URL as the partner. Recorded rather than smoothed over: if
    // the MoU is signed with the parent, the `name` may warrant the parent's
    // legal name — an owner question, not one this file may decide.
    kind: 'SO',
    logo: 'human',
    home: 'https://humanindonesia.com/id',
  },
  {
    slot: 3,
    name: { key: 'profile.mitra_3_name', text: 'LPK Japanesia' },
    // SO — unchanged, now with the citation. Its own site: "ジャパネシア送り出し
    // 機関はインドネシア国内から認定された送出し機関として" ("recognised by the
    // Indonesian government as a sending organisation"). 送出し機関 = SO.
    // The name still reads "LPK" because that is the brand the partner trades
    // under; the badge is the LEGAL standing, which is what a candidate needs.
    kind: 'SO',
    logo: 'japanesia',
    home: 'https://lpkjapanesia.com/',
  },
  {
    slot: 4,
    name: { key: 'profile.mitra_4_name', text: 'PT JIPA' },
    // SO — CORRECTED 2026-09-30 from LPK. Its own site lists "Sending
    // Organization (SO) JIPA P3MI ... PT. Jaya Indonesia Pandu Abhipraya, yang
    // mempunyai izin resmi dari Pemerintah Indonesia". JIPA is the LPK arm (LPK
    // MOMIJI sits beside it), but the group's declared SO/P3MI standing is what
    // the badge reports, and the site states it in those words.
    kind: 'SO',
    logo: 'jipa',
    home: 'https://www.jipa.co.id/',
  },
  {
    slot: 5,
    name: { key: 'profile.mitra_5_name', text: 'LPK Jinzai Servis Indonesia' },
    // SO — unchanged. Its own site carries an explicit licence: "送り出し機関
    // 許可番号（SO)： 2/4276/HK.03.01/X/2023" plus OTIT registration IDN000431.
    // The strongest evidence in this list — an actual SO permit number.
    kind: 'SO',
    logo: 'jinzai',
    home: 'http://jsi-jinzai.com/',
  },
  {
    slot: 6,
    name: { key: 'profile.mitra_6_name', text: 'PT Hibiki Cendekia Mandala' },
    // SO — CORRECTED 2026-09-30 from LPK. The site's own meta description reads
    // "PT Hibiki Cendekia Mandala adalah P3MI resmi yang menyediakan pelatihan
    // bahasa Jepang dan penempatan kerja legal ke Jepang" — a P3MI placement
    // licence, i.e. SO standing.
    kind: 'SO',
    logo: 'hibiki',
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
