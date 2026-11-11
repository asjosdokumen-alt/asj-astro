/**
 * IconTileGrid.tsx — icon + heading + one supporting line, as a bento grid.
 *
 * WHY THIS EXISTS
 * ---------------
 * Three sections need the same shape: "Why Japan" (3 tiles), "Program ASJ" (3) and
 * "Facilities" (6). Writing the tile markup once per section is how the padding, the
 * radius and the icon size end up different in each one — the measured drift that
 * DESIGN.md §3.5 and §4.2 exist to stop.
 *
 * WHY .tsx AND NOT .astro
 * -----------------------
 * It is a data-driven list, so it iterates, and iterating in an `.astro` TEMPLATE
 * breaks a hard invariant of this repo. `indexer/src/build.test.ts:428` requires
 * ZERO unresolved references originating outside a test file, and the indexer
 * resolves `.astro` template interpolations against the FRONTMATTER MODULE SCOPE
 * only — so a `.map()` callback parameter inside an `.astro` template is reported as
 * an unresolved global (measured: 21 entries, every one a callback parameter). The
 * same code in `.tsx` binds correctly, which is why `App.tsx` has always iterated
 * freely.
 *
 * The two ways out were to teach the indexer nested template scopes, or to stop
 * writing that pattern. A third — adding a filter to the assertion — was rejected:
 * the test's own comment asks for that assertion to be COLLAPSED back to
 * `length === 0` as gaps close, so adding a filter moves the repo the wrong way.
 *
 * A `.tsx` component used WITHOUT a `client:*` directive is server-rendered to
 * static HTML by Astro and ships no JavaScript. That is what makes this the cheap
 * fix rather than an architectural one.
 *
 * THE CARD RULES IT ENFORCES (DESIGN.md §4.2), so a caller cannot get them wrong:
 *  - grid: 1 column below `sm`, 2 at `sm`, `columns` at `lg` — the bento ladder.
 *  - every tile shares one padding rhythm; a grid of tiles with different internal
 *    padding reads as hand-placed rather than composed.
 *  - `min-w-0` on every tile, so a long unbroken string truncates or wraps instead
 *    of pushing the grid wider than the viewport — the most common cause of
 *    horizontal scroll on this page.
 *
 * COPY BUDGET. The body is `line-clamp-2`: DESIGN.md §4.2 allows at most 30 words per
 * bento card. The clamp is not decoration — it is what stops a long translation from
 * silently turning a bento grid into a wall of text, and it fails visibly.
 *
 * The heading level is `h3` and deliberately not configurable: a tile is always
 * inside a section that owns an `h2`, and a tile that could emit an `h2` would let a
 * page grow two competing section titles — the defect `e2e:headings` checks for.
 */
import Icon from '../ui/Icon';
import { ACCENT_TEXT, type AccentRole } from '../../lib/accentClass';
import type { Tile } from '../../lib/companyProfile';

export interface Props {
  tiles: Tile[];
  /** Columns at `lg` and up. Ignored by `presentation="sheet"` — see below. */
  columns?: 2 | 3;
  class?: string;
  /**
   * ── TWO PRESENTATIONS, ONE DATA SOURCE ────────────────────────────────────
   *
   * `bento` (default) is the card grid described above: padding, radius, border,
   * icon above the title. Every existing caller gets it unchanged.
   *
   * `sheet` is a CONTACT SHEET: the illustration leads, the caption sits under a
   * hairline, and there is no card chrome at all — no padding, no radius, no
   * border, no icon. It exists because `#program` is now a film chapter rather
   * than a bento section (owner picked "perluas film ke beberapa seksi"), and a
   * card inside a chapter reads as a brochure pasted onto a still.
   *
   * WHY A VARIANT AND NOT A NEW COMPONENT: a new file under `src/` moves FOUR
   * frozen indexer counters (see R15), and this is the same data rendered with a
   * different shell. The data contract — `Tile`, `h3`, `data-lang` on both text
   * nodes — is identical, which is exactly what a variant should mean.
   *
   * The hairline BETWEEN cells comes from `gap-px` + `bg-line` on the grid and
   * an opaque `bg-canvas` on each cell, not from per-cell borders: that way the
   * divider is correct at one column as well (a horizontal rule between stacked
   * panels) without a second media query.
   */
  presentation?: 'bento' | 'sheet';
}

const LADDER = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
} as const;

const FX_TINT: Record<AccentRole, { orb: string; sparkle: string; sheen: string }> = {
  identity: { orb: '#fda4af', sparkle: '#ffe4e6', sheen: 'rgb(253 164 175 / 0.2)' },
  program: { orb: '#6ee7b7', sparkle: '#d1fae5', sheen: 'rgb(110 231 183 / 0.2)' },
  jobs: { orb: '#7dd3fc', sparkle: '#e0f2fe', sheen: 'rgb(125 211 252 / 0.2)' },
  exam: { orb: '#fcd34d', sparkle: '#fef3c7', sheen: 'rgb(252 211 77 / 0.22)' },
  critical: { orb: '#fca5a5', sparkle: '#fee2e2', sheen: 'rgb(252 165 165 / 0.2)' },
  legal: { orb: '#c4b5fd', sparkle: '#ede9fe', sheen: 'rgb(196 181 253 / 0.2)' },
};

const ALIVE_VECTORS = [
  '--alive-delay:-1.2s;--alive-dur:9.4s;--alive-scale-from:1.035;--alive-scale:1.105;--alive-x0:-1.1%;--alive-y0:0.8%;--alive-x:1.2%;--alive-y:-0.9%',
  '--alive-delay:-4.6s;--alive-dur:10.4s;--alive-scale-from:1.035;--alive-scale:1.105;--alive-x0:1.1%;--alive-y0:-0.7%;--alive-x:-1.2%;--alive-y:0.9%',
  '--alive-delay:-7.8s;--alive-dur:9.8s;--alive-scale-from:1.035;--alive-scale:1.105;--alive-x0:-0.9%;--alive-y0:-0.8%;--alive-x:1.1%;--alive-y:0.9%',
] as const;

export default function IconTileGrid({
  tiles,
  columns = 3,
  class: className,
  presentation = 'bento',
}: Props) {
  const sheet = presentation === 'sheet';
  const grid = sheet
    ? ['grid gap-px bg-line grid-cols-1 md:grid-cols-3', className ?? ''].filter(Boolean).join(' ')
    : ['grid gap-4 md:gap-6', LADDER[columns], className ?? ''].filter(Boolean).join(' ');

  return (
    // `data-reveal-stagger` is what lets motion.css index the children with
    // `nth-child` instead of every call site having to count its own tiles.
    // It is inert until the page swaps in `html.js-reveal` (see §9).
    //
    // `data-scroll-item` is the CONTINUOUS half (§9f), and it is on this <ul>
    // rather than on each <li> for the reason §9f records: a scroll-linked
    // `transform` on the same element as a §9c hover recipe overrides that
    // recipe outright. The only hover here is `.u-zoom` on the <img>, so a
    // drift on the <li> would in fact coexist — but it would also move the
    // card's own border and background, and the tile would read as sliding
    // out of its own grid cell. The GRID is the thing that moves; the cards
    // stay registered to it. Same structure as §9's stagger: one attribute on
    // the container, children handled by `> *`.
    <ul class={grid} data-reveal-stagger data-scroll-item>
      {tiles.map((tile, index) => {
        const tint = FX_TINT[tile.accent as AccentRole] ?? FX_TINT.identity;
        const aliveStyle = ALIVE_VECTORS[index % ALIVE_VECTORS.length];
        return (
          <li
            key={tile.title.key}
            data-reveal
            class={
              sheet
                ? 'min-w-0 group flex flex-col bg-canvas overflow-hidden'
                : 'min-w-0 group flex flex-col gap-2 rounded-card bg-surface border border-line p-5 md:p-6 overflow-hidden'
            }
          >
            {/* The illustration, when the tile carries one, sits ABOVE the icon
                and bleeds to the card's own padding edge via a negative margin —
                `-mx-5 -mt-5 md:-mx-6 md:-mt-6` cancels exactly the `p-5 md:p-6`
                above. `.u-illus-frame` clips all four sides of the `3/2` frame
                so the continuous `.u-alive` pan/zoom and ambient sakura/sparkle
                overlay never spill toward the icon below.

                `aspect-[3/2]` is fixed rather than derived from the file, because
                the ratio must be reserved BEFORE the image loads — deriving it
                from the decoded file is what causes layout shift. All three
                program illustrations ship at 600x400, so 3/2 is their true
                ratio, not an approximation. It was `4/3` until 2026-09-28, when
                the artwork was replaced; the ratio follows the artwork, so the
                two moved together rather than leaving `object-cover` to crop
                14% of every card's width. */}
            {tile.image ? (
              <div
                class={
                  sheet
                    ? 'u-illus-frame'
                    : 'u-illus-frame -mx-5 -mt-5 md:-mx-6 md:-mt-6 mb-1'
                }
              >
                <picture class="block">
                  <source
                    type="image/avif"
                    srcset={`/assets/ilustrasi/${tile.image.name}.avif 1x, /assets/ilustrasi/${tile.image.name}@2x.avif 2x`}
                  />
                  <source
                    type="image/webp"
                    srcset={`/assets/ilustrasi/${tile.image.name}.webp 1x, /assets/ilustrasi/${tile.image.name}@2x.webp 2x`}
                  />
                  <img
                    src={`/assets/ilustrasi/${tile.image.name}.webp`}
                    alt={tile.image.alt}
                    width={tile.image.w}
                    height={tile.image.h}
                    loading="lazy"
                    decoding="async"
                    class="w-full aspect-[3/2] object-cover u-zoom u-alive"
                    style={aliveStyle}
                  />
                </picture>
                <div class="u-illus-fx" aria-hidden="true">
                  <div
                    class="u-sheen-bar"
                    style={`--fx-dur:7.8s;--fx-delay:${(index * 1.9).toFixed(1)}s;--fx-sheen:${tint.sheen}`}
                  />
                  <svg
                    class="w-full h-full"
                    viewBox="0 0 600 400"
                    preserveAspectRatio="xMidYMid slice"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <ellipse
                      class="u-fx-petal"
                      cx="95"
                      cy="34"
                      rx="9"
                      ry="5"
                      fill="#fda4af"
                      style={`--fx-dur:6.4s;--fx-delay:${(-1.1 - index * 1.7).toFixed(1)}s;--fx-mid-x:58px;--fx-mid-y:115px;--fx-end-x:125px;--fx-end-y:245px;--fx-alpha:0.88`}
                    />
                    <ellipse
                      class="u-fx-petal"
                      cx="285"
                      cy="26"
                      rx="8"
                      ry="4.5"
                      fill="#fecdd3"
                      style={`--fx-dur:7.2s;--fx-delay:${(-3.6 - index * 1.3).toFixed(1)}s;--fx-mid-x:42px;--fx-mid-y:125px;--fx-end-x:92px;--fx-end-y:260px;--fx-alpha:0.82`}
                    />
                    <ellipse
                      class="u-fx-petal"
                      cx="490"
                      cy="42"
                      rx="8.5"
                      ry="4.8"
                      fill="#fb7185"
                      style={`--fx-dur:6.9s;--fx-delay:${(-5.2 - index * 1.1).toFixed(1)}s;--fx-mid-x:-48px;--fx-mid-y:110px;--fx-end-x:-108px;--fx-end-y:235px;--fx-alpha:0.8`}
                    />
                    <circle
                      class="u-fx-orb"
                      cx="150"
                      cy="108"
                      r="14"
                      fill={tint.orb}
                      style={`--fx-dur:4.5s;--fx-delay:${(-0.9 - index * 1.4).toFixed(1)}s;--fx-dx:12px;--fx-dy:-14px;--fx-alpha-min:0.2;--fx-alpha-max:0.52`}
                    />
                    <circle
                      class="u-fx-orb"
                      cx="455"
                      cy="92"
                      r="11"
                      fill="#fbcfe8"
                      style={`--fx-dur:5.1s;--fx-delay:${(-2.7 - index * 1.2).toFixed(1)}s;--fx-dx:-11px;--fx-dy:-13px;--fx-alpha-min:0.18;--fx-alpha-max:0.48`}
                    />
                    <path
                      class="u-fx-sparkle"
                      d="M210 66 L213 74 L221 77 L213 80 L210 88 L207 80 L199 77 L207 74 Z"
                      fill={tint.sparkle}
                      style={`--fx-dur:2.6s;--fx-delay:${(-0.6 - index * 0.9).toFixed(1)}s`}
                    />
                    <path
                      class="u-fx-sparkle"
                      d="M372 54 L374.5 60.5 L381 63 L374.5 65.5 L372 72 L369.5 65.5 L363 63 L369.5 60.5 Z"
                      fill="#ffffff"
                      style={`--fx-dur:3.1s;--fx-delay:${(-1.9 - index * 0.8).toFixed(1)}s`}
                    />
                  </svg>
                </div>
              </div>
            ) : null}
            {/* The zoom is on the IMAGE only; the card itself gets no lift. These
                tiles are informational — no href, nothing to click — and a lift
                would promise a response that never comes (§9c). The illustration
                can still come alive under the pointer without that implication,
                and the `li`'s own `overflow-hidden` is what clips the scale. */}
            {sheet ? (
              /* Contact-sheet caption: a numeral, the name in the film's
                 uppercase, then one line. The numeral is the chapter number of
                 this panel and is derived from the order, so it cannot drift
                 from the data. No `line-clamp` here — that clamp exists to keep
                 bento cards equal height, and a sheet has no row to equalise. */
              <div class="px-4 pt-4 pb-6 md:px-5 md:pt-5">
                <div class="flex items-baseline gap-3">
                  <span
                    class={`text-caption font-bold tabular-nums ${ACCENT_TEXT[tile.accent as AccentRole]}`}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3
                    data-lang={tile.title.key}
                    class="text-card-title font-bold uppercase tracking-tight text-fg"
                  >
                    {tile.title.text}
                  </h3>
                </div>
                <p data-lang={tile.body.key} class="mt-2 text-body-sm text-fg-muted">
                  {tile.body.text}
                </p>
              </div>
            ) : (
              <>
                <Icon name={tile.icon} class={`text-xl ${ACCENT_TEXT[tile.accent as AccentRole]}`} />
                <h3 data-lang={tile.title.key} class="text-card-title font-bold text-fg">
                  {tile.title.text}
                </h3>
                <p data-lang={tile.body.key} class="text-body-sm text-fg-muted line-clamp-2">
                  {tile.body.text}
                </p>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
