/**
 * StepList.tsx — a numbered, sequential flow.
 *
 * WHY THIS IS NOT RENDERED AS SIX EQUAL, INTERCHANGEABLE TILES
 * ------------------------------------------------------------
 * The temptation is to make the admission flow a bento grid of six identical
 * cells. The 2026 bento research DESIGN.md cites is explicit about why a grid
 * says "these are parallel options you may compare" while a flow says "this
 * comes after that", and rendering a six-step process as six equal tiles
 * destroys the only information the section carries.
 *
 * SO THE ORDER IS REAL, IN THREE WAYS AT ONCE:
 *  1. `<ol>`, so assistive tech announces position ("2 of 6").
 *  2. A visible number per step — the version a sighted reader uses.
 *  3. Reading order is the flow order: left to right, then top to bottom. The
 *     numbering is what carries the sequence now that the row wraps.
 *
 * WHY 3x2 AND NOT SIX COLUMNS — CHANGED 2026-09-28.
 * The six columns were right while every step was text-only. They stopped being
 * right when the owner supplied an illustration per step: a six-column row at a
 * 1280 viewport gives each column ~180px, so a picture there is a thumbnail
 * nobody can read, and the section's whole point is that the picture carries
 * meaning. `DESIGN.md` §5.7 already allowed this — "Desktop: 6 kolom dengan
 * garis horizontal, **atau** 3×2 kalau labelnya panjang" — and these labels
 * ("Training & Education", "Employment Document") plus a picture per card is
 * that case. What changed is the tier, not the contract: it is still an `<ol>`
 * with a visible 1..6, never a set of six parallel options.
 *
 * WHY .tsx AND NOT .astro — see the long note in IconTileGrid.tsx. The image
 * markup below is deliberately identical to that component's, including the
 * negative margins that cancel the card's own padding, so the two sections'
 * cards cannot drift apart.
 */
import type { Step } from '../../lib/companyProfile';

export interface Props {
  steps: Step[];
  class?: string;
}

export default function StepList({ steps, class: className }: Props) {
  const list = ['grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    // `data-reveal-stagger` lets motion.css index the children with `nth-child`,
    // exactly as IconTileGrid does, so neither call site counts its own items.
    <ol class={list} data-reveal-stagger>
      {steps.map((step, index) => (
        <li
          key={step.title.key}
          data-reveal
          class="min-w-0 group flex flex-col gap-2 rounded-card bg-surface border border-line p-5 md:p-6 overflow-hidden"
        >
          {/* The illustration sits ABOVE the number and the title, and bleeds to
              the card's own padding edge via `-mx-5 -mt-5 md:-mx-6 md:-mt-6`,
              which cancels exactly the `p-5 md:p-6` above. That is why
              `overflow-hidden` is on the <li>: without it the picture's square
              corners poke past the card's radius.

              `aspect-[7/5]` is fixed rather than derived from the file, because
              the ratio must be reserved BEFORE the image loads — deriving it
              from the decoded file is what causes layout shift. All six step
              illustrations ship at 560x400, so 7/5 is their true ratio. */}
          {step.image ? (
            <picture class="block -mx-5 -mt-5 md:-mx-6 md:-mt-6 mb-1">
              <source
                type="image/avif"
                srcset={`/assets/ilustrasi/${step.image.name}.avif 1x, /assets/ilustrasi/${step.image.name}@2x.avif 2x`}
              />
              <source
                type="image/webp"
                srcset={`/assets/ilustrasi/${step.image.name}.webp 1x, /assets/ilustrasi/${step.image.name}@2x.webp 2x`}
              />
              <img
                src={`/assets/ilustrasi/${step.image.name}.webp`}
                alt={step.image.alt}
                width={step.image.w}
                height={step.image.h}
                loading="lazy"
                decoding="async"
                class="w-full aspect-[7/5] object-cover u-zoom"
              />
            </picture>
          ) : null}
          {/* The number is `aria-hidden`: the `<ol>` already conveys order, so
              announcing it twice is noise rather than redundancy. It sits on the
              same line as the title so the pair reads as one unit, and it is the
              first thing in the card's text column — which is what keeps the
              sequence legible now that the row wraps at `lg`. */}
          <div class="flex items-center gap-3">
            <span
              aria-hidden="true"
              class="shrink-0 w-9 h-9 rounded-pill bg-surface-raised border border-line-strong text-fg font-black text-body-sm flex items-center justify-center"
            >
              {index + 1}
            </span>
            <h3 data-lang={step.title.key} class="text-card-title font-bold text-fg">
              {step.title.text}
            </h3>
          </div>
          {/* Deliberately NOT clamped. Step 5 carries two things in the source
              document (MCU + contract, then COE) and `line-clamp-2` would cut
              the second one off — the same loss of information the six-column
              argument above is about. Cards in a row stretch to the tallest, so
              the uneven text lengths do not misalign the grid. */}
          <p data-lang={step.body.key} class="text-body-sm text-fg-muted">
            {step.body.text}
          </p>
        </li>
      ))}
    </ol>
  );
}
