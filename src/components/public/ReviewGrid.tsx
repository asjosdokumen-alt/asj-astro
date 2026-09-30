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
 * reasoning in PartnerGrid.tsx.
 *
 * ── WHY THE DRIFT IS ON THE <ul>, NOT THE <li> ─────────────────────────────
 * Same rule as PartnerGrid: a CSS animation on `transform` overrides a
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

/** Filled stars for a rating, empty ones up to five. `null` renders no stars. */
function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return null;
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span class="flex gap-0.5 text-accent-amber" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} class={i < filled ? 'opacity-100' : 'opacity-25'}>
          ★
        </span>
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
