/**
 * ReviewGrid.tsx — the "Kata Alumni" grid: one slot per testimonial.
 *
 * ── WHY THE CARDS CAN BE EMPTY (and why that is the point) ──────────────────
 * The section ships before the reviews do. Rather than hide that, each unfilled
 * slot renders an honest pending card, so the section reads as "here is where
 * our alumni's words go" instead of a grid that lies about being finished. The
 * alternative — paraphrased or invented quotes so the grid looks full — is
 * banned outright (COMPANY_PROFILE_DATA.md §8; see testimonials.ts).
 *
 * ── WHY THE EMPTY STATE KEEPS ITS SHAPE ─────────────────────────────────────
 * A pending card reserves the SAME height and the same three parts (stars, quote
 * area, author line) as a filled one. That keeps the grid from reflowing as
 * reviews arrive, and it tells the truth about what a finished card will hold.
 *
 * ── WHY .tsx AND NOT .astro ────────────────────────────────────────────────
 * It iterates, and iterating inside an `.astro` template breaks the indexer's
 * zero-unresolved invariant — see the long note in IconTileGrid.tsx and the same
 * reasoning in CheckList.tsx.
 *
 * ── WHY THE DRIFT IS ON THE <ul>, NOT THE <li> ─────────────────────────────
 * Same rule as CheckList: a CSS animation on `transform` overrides a
 * `transition` on the same property of the SAME element, so the scroll-linked
 * transform must live on the container's children, leaving each card's own
 * hover transform free (motion.css §9d, measured).
 */
import type { Review } from '../../lib/testimonials';

export interface Props {
  reviews: Review[];
  class?: string;
}

/** The label a slot shows while its quote is unknown, keyed so it localises. */
const REVIEW_PENDING_KEY = 'profile.review_slot_pending';

/**
 * One star filled to `fill` (0–1) of its own width.
 *
 * ── WHY THE FILL IS A GRADIENT AND NOT A CLIPPED BOX ────────────────────────
 * This used to round, so a 4.8 rating drew FIVE solid stars — the markup claimed
 * a perfect score the listing does not have. A rating is a measurement, and
 * rounding it UP is the one direction that flatters us; rounding down to 4 would
 * be just as wrong in the other direction. So the fraction is drawn.
 *
 * The first attempt wrapped the glyph in an `overflow: hidden` box 80% wide.
 * Measured in Chromium that produced a star with its right arm sliced FLAT —
 * which does not read as "4.8 out of 5", it reads as a broken glyph. Painting a
 * two-stop gradient and clipping it to the text keeps the star's silhouette
 * intact and puts the split where the rating says it is.
 *
 * ⚠ `currentColor` cannot be used inside the gradient: `bg-clip-text` requires
 * `color: transparent` on the same element, so `currentColor` resolves to
 * transparent and the star vanishes. The token is named explicitly instead.
 */
function Star({ fill }: { fill: number }) {
  if (fill >= 1) return <span>★</span>;
  const pct = Math.round(fill * 100);
  // 0% — a full stop rather than a gradient at 0%, which some engines render as
  // a hairline sliver of colour at the glyph's left edge.
  if (pct <= 0) return <span class="opacity-25">★</span>;
  return (
    <span
      class="bg-clip-text text-transparent"
      style={{
        backgroundImage:
          `linear-gradient(90deg, var(--color-accent-amber) ${pct}%, ` +
          `color-mix(in oklab, var(--color-accent-amber) 25%, transparent) ${pct}%)`,
      }}
    >
      ★
    </span>
  );
}

/**
 * Five stars for a rating — filled, fractionally filled, then empty. `null`
 * renders no stars (an unfilled review slot has no rating to show).
 *
 * Used by the CARDS, where a per-review rating is a whole number and this row is
 * therefore exact. The aggregate strip on the landing page deliberately does NOT
 * use it: it shows one star and the number instead, because a five-glyph row at
 * 16.7px cannot express a 4.8 (see the note in index.astro — measured, the
 * fraction is ~3px and reads as five solid stars).
 */
function Stars({ rating, class: className }: { rating: number | null; class?: string }) {
  if (rating === null) return null;
  const clamped = Math.max(0, Math.min(5, rating));
  const whole = Math.floor(clamped);
  // Snap to one decimal so float noise (4.8 - 4 = 0.7999999) cannot produce a
  // 79.99999% clip.
  const fraction = Math.round((clamped - whole) * 10) / 10;
  return (
    <span
      class={['flex gap-0.5 text-accent-amber', className ?? ''].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} fill={i < whole ? 1 : i === whole ? fraction : 0} />
      ))}
    </span>
  );
}

export default function ReviewGrid({ reviews, class: className }: Props) {
  const grid = ['grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <ul class={grid} data-scroll-item>
      {reviews.map((review) => {
        const filled = review.quote !== null;
        return (
          <li
            key={review.slot}
            data-filled={filled ? 'true' : 'false'}
            class="u-surface-depth flex flex-col gap-3 rounded-card border border-line bg-surface p-5 md:p-6 min-h-[12rem]"
          >
            <span class="flex items-center justify-between gap-3">
              <Stars rating={review.rating} />
              <span class="text-caption uppercase font-bold text-accent">
                {review.source}
              </span>
            </span>

            <span class="flex-1 text-body-sm">
              {filled ? (
                <span class="text-fg italic" data-lang={review.quote?.key}>
                  “{review.quote?.text}”
                </span>
              ) : (
                <span class="text-fg-muted font-normal italic" data-lang={REVIEW_PENDING_KEY}>
                  Review belum tayang
                </span>
              )}
            </span>

            <span class="flex items-center gap-3 border-t border-line pt-3">
              {/* A pending card shows the initials placeholder; a filled card
                  would show the reviewer photo — but ONLY with consent
                  (COMPANY_PROFILE_DATA.md §11.2, P-7), so initials are the
                  default until a photo is supplied. */}
              <span
                aria-hidden="true"
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-line/60 text-caption text-fg-muted"
              >
                {filled ? (review.author?.text.slice(0, 1) ?? '?') : '+'}
              </span>
              <span class="text-body-sm font-bold text-fg">
                {filled ? (
                  <span data-lang={review.author?.key}>{review.author?.text}</span>
                ) : (
                  <span class="text-fg-muted font-normal" data-lang="profile.review_pending_author">
                    Menunggu review
                  </span>
                )}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
