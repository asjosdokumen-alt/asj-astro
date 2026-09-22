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
  /** Columns at `lg` and up. */
  columns?: 2 | 3;
  class?: string;
}

const LADDER = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
} as const;

export default function IconTileGrid({ tiles, columns = 3, class: className }: Props) {
  const grid = ['grid gap-4 md:gap-6', LADDER[columns], className ?? ''].filter(Boolean).join(' ');

  return (
    // `data-reveal-stagger` is what lets motion.css index the children with
    // `nth-child` instead of every call site having to count its own tiles.
    // It is inert until the page swaps in `html.js-reveal` (see §9).
    <ul class={grid} data-reveal-stagger>
      {tiles.map((tile) => (
        <li
          key={tile.title.key}
          data-reveal
          class="min-w-0 flex flex-col gap-2 rounded-card bg-surface border border-line p-5 md:p-6 overflow-hidden"
        >
          {/* The illustration, when the tile carries one, sits ABOVE the icon
              and bleeds to the card's own padding edge via a negative margin —
              `-mx-5 -mt-5 md:-mx-6 md:-mt-6` cancels exactly the `p-5 md:p-6`
              above. That is why `overflow-hidden` is on the <li>: without it
              the image's square corners poke past the card's radius. A wrapper
              with its own padding would also work but would leave the card's
              visual edge inset from the image, which reads as a double frame.

              `aspect-[4/3]` is fixed rather than derived from the file, because
              the ratio must be reserved BEFORE the image loads — deriving it
              from the decoded file is what causes layout shift. All three
              program illustrations ship at 1200x900, so 4/3 is their true
              ratio, not an approximation. */}
          {tile.image ? (
            <picture class="block -mx-5 -mt-5 md:-mx-6 md:-mt-6 mb-1">
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
                class="w-full aspect-[4/3] object-cover"
              />
            </picture>
          ) : null}
          <Icon name={tile.icon} class={`text-xl ${ACCENT_TEXT[tile.accent as AccentRole]}`} />
          <h3 data-lang={tile.title.key} class="text-card-title font-bold text-fg">
            {tile.title.text}
          </h3>
          <p data-lang={tile.body.key} class="text-body-sm text-fg-muted line-clamp-2">
            {tile.body.text}
          </p>
        </li>
      ))}
    </ul>
  );
}
