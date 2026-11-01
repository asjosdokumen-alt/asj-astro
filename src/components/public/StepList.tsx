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

const STEP_ALIVE_VECTORS = [
  '--alive-delay:-0.8s;--alive-dur:9.6s;--alive-scale-from:1.04;--alive-scale:1.11;--alive-x0:-1.1%;--alive-y0:0.8%;--alive-x:1.2%;--alive-y:-0.9%',
  '--alive-delay:-2.7s;--alive-dur:10.4s;--alive-scale-from:1.04;--alive-scale:1.11;--alive-x0:1.1%;--alive-y0:-0.7%;--alive-x:-1.1%;--alive-y:0.9%',
  '--alive-delay:-4.6s;--alive-dur:9.9s;--alive-scale-from:1.04;--alive-scale:1.11;--alive-x0:-0.9%;--alive-y0:-0.8%;--alive-x:1.2%;--alive-y:0.8%',
  '--alive-delay:-6.5s;--alive-dur:10.8s;--alive-scale-from:1.04;--alive-scale:1.11;--alive-x0:1.2%;--alive-y0:0.7%;--alive-x:-1.1%;--alive-y:-0.9%',
  '--alive-delay:-8.4s;--alive-dur:9.7s;--alive-scale-from:1.04;--alive-scale:1.11;--alive-x0:-1.0%;--alive-y0:0.9%;--alive-x:1.1%;--alive-y:-0.8%',
  '--alive-delay:-10.3s;--alive-dur:10.2s;--alive-scale-from:1.045;--alive-scale:1.115;--alive-x0:-1.2%;--alive-y0:0.8%;--alive-x:1.3%;--alive-y:-1.0%',
] as const;

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
              which cancels exactly the `p-5 md:p-6` above. `.u-illus-frame`
              clips all four sides of the `7/5` frame while the illustration
              pans/breathes continuously and the ambient sakura/sheen wave runs
              across steps 1..6.

              `aspect-[7/5]` is fixed rather than derived from the file, because
              the ratio must be reserved BEFORE the image loads — deriving it
              from the decoded file is what causes layout shift. All six step
              illustrations ship at 560x400, so 7/5 is their true ratio. */}
          {step.image ? (
            <div class="u-illus-frame -mx-5 -mt-5 md:-mx-6 md:-mt-6 mb-1">
              <picture class="block">
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
                  class="w-full aspect-[7/5] object-cover u-zoom u-alive"
                  style={STEP_ALIVE_VECTORS[index % STEP_ALIVE_VECTORS.length]}
                />
              </picture>
              <div class="u-illus-fx" aria-hidden="true">
                <div
                  class="u-sheen-bar"
                  style={`--fx-dur:8.4s;--fx-delay:${(index * 1.15).toFixed(2)}s;--fx-sheen:rgb(254 240 138 / 0.19)`}
                />
                <svg
                  class="w-full h-full"
                  viewBox="0 0 560 400"
                  preserveAspectRatio="xMidYMid slice"
                  aria-hidden="true"
                  focusable="false"
                >
                  <ellipse
                    class="u-fx-petal"
                    cx="82"
                    cy="30"
                    rx="8.5"
                    ry="4.8"
                    fill="#fda4af"
                    style={`--fx-dur:6.6s;--fx-delay:${(-0.9 - index * 1.3).toFixed(1)}s;--fx-mid-x:52px;--fx-mid-y:110px;--fx-end-x:112px;--fx-end-y:240px;--fx-alpha:0.86`}
                  />
                  <ellipse
                    class="u-fx-petal"
                    cx="448"
                    cy="36"
                    rx="8"
                    ry="4.5"
                    fill="#fecdd3"
                    style={`--fx-dur:7.1s;--fx-delay:${(-3.4 - index * 1.1).toFixed(1)}s;--fx-mid-x:-44px;--fx-mid-y:115px;--fx-end-x:-96px;--fx-end-y:245px;--fx-alpha:0.82`}
                  />
                  <circle
                    class="u-fx-orb"
                    cx="430"
                    cy="94"
                    r="13"
                    fill="#fde68a"
                    style={`--fx-dur:4.6s;--fx-delay:${(-1.3 - index * 0.9).toFixed(1)}s;--fx-dx:-10px;--fx-dy:-13px;--fx-alpha-min:0.18;--fx-alpha-max:0.5`}
                  />
                  <circle
                    class="u-fx-orb"
                    cx="128"
                    cy="112"
                    r="10"
                    fill="#fbcfe8"
                    style={`--fx-dur:5.2s;--fx-delay:${(-2.8 - index * 1.0).toFixed(1)}s;--fx-dx:11px;--fx-dy:-12px;--fx-alpha-min:0.16;--fx-alpha-max:0.45`}
                  />
                  <path
                    class="u-fx-sparkle"
                    d="M176 58 L178.5 64.5 L185 67 L178.5 69.5 L176 76 L173.5 69.5 L167 67 L173.5 64.5 Z"
                    fill="#fef3c7"
                    style={`--fx-dur:2.7s;--fx-delay:${(-0.5 - index * 0.7).toFixed(1)}s`}
                  />
                  <path
                    class="u-fx-sparkle"
                    d="M366 52 L368.5 58.5 L375 61 L368.5 63.5 L366 70 L363.5 63.5 L357 61 L363.5 58.5 Z"
                    fill="#ffffff"
                    style={`--fx-dur:3.2s;--fx-delay:${(-1.8 - index * 0.6).toFixed(1)}s`}
                  />
                  {/* Step 6 ("GO TO JAPAN"): soaring departure flight silhouette & contrail */}
                  {index === 5 ? (
                    <g class="u-fx-plane" style="--fx-dur:5.4s;--fx-delay:-1.2s">
                      <line
                        x1="285"
                        y1="108"
                        x2="338"
                        y2="84"
                        stroke="#ffffff"
                        stroke-width="2"
                        stroke-dasharray="4 4"
                        stroke-opacity="0.7"
                      />
                      <path
                        d="M342 82 L360 74 L350 86 L354 93 L349 95 L344 88 L336 91 L334 87 Z"
                        fill="#ffffff"
                      />
                    </g>
                  ) : null}
                </svg>
              </div>
            </div>
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
