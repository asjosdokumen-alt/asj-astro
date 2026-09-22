/**
 * StepList.tsx — a numbered, sequential flow.
 *
 * WHY THIS IS NOT A BENTO GRID
 * ----------------------------
 * Every other list on this page is a bento grid, and the temptation is to make the
 * admission flow one too. DESIGN.md §4.2 forbids it, and the 2026 bento research is
 * explicit about why: the pattern underperforms for sequential processes. A grid says
 * "these are parallel options you may compare"; a flow says "this comes after that".
 * Rendering a six-step process as six equal tiles destroys the only information the
 * section carries.
 *
 * SO THE ORDER IS REAL, IN THREE WAYS AT ONCE:
 *  1. `<ol>`, so assistive tech announces position ("2 of 6").
 *  2. A visible number per step — the version a sighted reader uses.
 *  3. A connector line: a rule across the top of every item at `lg`, so the row reads
 *     as one track, with the badge column carrying the order below that breakpoint.
 *
 * The number is `aria-hidden`: the list already conveys order, so announcing it twice
 * is noise rather than redundancy.
 *
 * WHY SIX COLUMNS AND NOT THREE-BY-TWO. The source document defines six steps, and a
 * two-tier layout would imply a structure that is not in the flow.
 *
 * WHY .tsx AND NOT .astro — see the long note in IconTileGrid.tsx.
 */
import type { Step } from '../../lib/companyProfile';

export interface Props {
  steps: Step[];
  class?: string;
}

export default function StepList({ steps, class: className }: Props) {
  const list = ['grid gap-6 lg:grid-cols-6 lg:gap-4', className ?? ''].filter(Boolean).join(' ');

  return (
    <ol class={list}>
      {steps.map((step, index) => (
        <li key={step.title.key} class="min-w-0 flex gap-4 lg:block lg:border-t lg:border-line lg:pt-5">
          <span
            aria-hidden="true"
            class="shrink-0 w-9 h-9 rounded-pill bg-surface-raised border border-line-strong text-fg font-black text-body-sm flex items-center justify-center"
          >
            {index + 1}
          </span>
          <div class="min-w-0 lg:mt-4">
            <h3 data-lang={step.title.key} class="text-card-title font-bold text-fg">
              {step.title.text}
            </h3>
            <p data-lang={step.body.key} class="text-body-sm text-fg-muted mt-1">
              {step.body.text}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
