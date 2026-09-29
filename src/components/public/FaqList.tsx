/**
 * FaqList.tsx — the FAQ accordion, one row per question.
 *
 * ── WHY NATIVE `details`/`summary` AND NOT A JAVASCRIPT ACCORDION ───────────
 * Three reasons, in order of how much they matter:
 *
 *   1. IT WORKS WITH NO JAVASCRIPT. The landing page's contact form is the only
 *      island in that region and hydrates on scroll (`client:visible`). A JS
 *      accordion here would add a second island, to a section that sits below an
 *      already-long page, to hide content that native elements hide for free.
 *   2. IT IS ACCESSIBLE WITHOUT BEING TAUGHT TO BE. `details`/`summary` exposes
 *      the expanded/collapsed state to assistive technology, is keyboard
 *      operable, and is findable by in-page search even when closed — none of
 *      which a div-and-click-handler gets without deliberate work. The repo has
 *      33 accessibility gates precisely because that work is easy to skip.
 *   3. IT ADDS ZERO BYTES OF SCRIPT.
 *
 * ── WHY THE MARKER IS STYLED, NOT REPLACED ─────────────────────────────────
 * The default disclosure triangle is left in place and merely coloured and
 * spaced. Replacing it with a custom icon via `list-style: none` plus a rotated
 * pseudo-element is the usual approach, and it is the one that most often breaks
 * the accessible name or the focus ring. The triangle is an affordance users
 * already recognise; it does not need to become a design element.
 *
 * ── WHY .tsx AND NOT .astro ────────────────────────────────────────────────
 * It iterates, and iterating inside an `.astro` template breaks the indexer's
 * zero-unresolved invariant — the same reason recorded in CheckList.tsx,
 * PartnerGrid.tsx and ReviewGrid.tsx.
 */
import type { FaqEntry } from '../../lib/faq';

export interface Props {
  items: FaqEntry[];
  class?: string;
}

export default function FaqList({ items, class: className }: Props) {
  const list = ['divide-y divide-line rounded-panel border border-line bg-surface', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div class={list} data-role="faq">
      {items.map((item) => (
        // `group` + `open:` variants keep the styling in CSS rather than in a
        // state hook; `details` owns the open state natively.
        <details key={item.id} class="group px-4 sm:px-5" data-role="faq-item">
          <summary class="flex cursor-pointer list-item items-center gap-3 py-4 text-body-sm font-bold text-fg marker:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-sky">
            <span data-lang={item.question.key}>{item.question.text}</span>
          </summary>
          <p
            class="pb-4 pl-6 text-body-sm leading-relaxed text-fg-muted"
            data-lang={item.answer.key}
          >
            {item.answer.text}
          </p>
        </details>
      ))}
    </div>
  );
}
