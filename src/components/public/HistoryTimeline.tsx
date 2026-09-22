/**
 * HistoryTimeline.tsx — the company's milestones, rendered as a description list
 * of dated entries.
 *
 * WHY THIS COMPONENT EXISTS AT ALL
 * --------------------------------
 * `sejarah` (history) is one of the four things the About section is explicitly
 * required to carry, and until this slice the repo had NO history content in any
 * form: `grep` for a milestone, a founding date or the word `sejarah` across
 * `src/` returned nothing. The section simply did not exist. The dates here are
 * the ones the company's own signed profile states (founding 15 August 2023,
 * legal-entity approval 28 August 2023); `companyProfile.test.ts` pins them and
 * bans the mockup's invented "Berdiri Sejak 2015" from ever coming back.
 *
 * WHY .tsx AND NOT .astro — see the long note in IconTileGrid.tsx. Short version:
 * it iterates, and iterating inside an `.astro` template breaks the indexer's
 * zero-unresolved invariant. `build.test.ts` requires ZERO unresolved references
 * originating outside a test file, and the indexer resolves `.astro` template
 * interpolations against the frontmatter module scope only — so a `.map()`
 * callback parameter in an `.astro` template is reported as an unresolved global.
 * This was MEASURED, not assumed: written inline in `index.astro` it produced
 * exactly four `global-unknown` entries, one per property read off the callback
 * parameter (`milestone.title.key`, `.title.text`, `.body.key`, `.body.text`).
 * The same markup here binds correctly.
 *
 * Rendered without a `client:*` directive, so Astro emits static HTML and this
 * ships no JavaScript — the fix is cheap because the component is not interactive.
 *
 * WHY A <dl> AND NOT HEADING-PER-MILESTONE
 * ----------------------------------------
 * `e2e/test-headings.mjs` asserts `/` carries EXACTLY ONE <h1>, and the About
 * section is already nested under its own <h2>. A heading per milestone would
 * push a third level into a document that must stay flat; a description list is
 * the semantically correct container for "term → description" pairs, which is
 * exactly what a dated milestone is.
 *
 * The `data-lang` keys are load-bearing, not decoration: `i18n` coverage is
 * gated, so every user-visible string here has a key in BOTH dictionaries
 * (`store/i18n.ts` and `store/i18n-jp.ts`) or the suite goes red.
 */
import type { Milestone } from '../../lib/companyProfile';

export interface Props {
  milestones: Milestone[];
  class?: string;
}

export default function HistoryTimeline({ milestones, class: className }: Props) {
  const list = ['flex flex-col gap-5', className ?? ''].filter(Boolean).join(' ');

  return (
    <dl class={list}>
      {milestones.map((milestone) => (
        <div key={milestone.title.key} class="flex flex-col gap-1">
          <dt class="text-body-sm font-bold text-fg" data-lang={milestone.title.key}>
            {milestone.title.text}
          </dt>
          <dd class="text-body-sm text-fg-muted" data-lang={milestone.body.key}>
            {milestone.body.text}
          </dd>
        </div>
      ))}
    </dl>
  );
}
