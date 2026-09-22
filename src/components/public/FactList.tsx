/**
 * FactList.tsx — label/value rows for the sections that are a list, not a grid.
 *
 * WHY THIS EXISTS
 * ---------------
 * Legality and the placement table are both "a label and a value", and both were
 * going to be built as a bento grid because that is what the rest of the page uses.
 * DESIGN.md §4.2 says the opposite, and the reason is measurable: bento communicates
 * parallel, comparable items, while a licence register has hierarchy and no
 * comparison to make. Cards there would invite the reader to compare things that are
 * not comparable.
 *
 * WHY .tsx AND NOT .astro — see the long note in IconTileGrid.tsx. Short version: it
 * iterates, and iterating inside an `.astro` template breaks the indexer's
 * zero-unresolved invariant because template interpolations only resolve against the
 * frontmatter module scope, not a nested callback scope.
 *
 * THE VALUE IS A LITERAL, NEVER A KEY. Licence numbers, registration numbers and
 * proper nouns are identical in every language; routing them through the dictionary
 * would be a defect waiting to happen (a translated registration number). Only the
 * label is translatable, which is why only the label carries `data-lang`.
 *
 * `dl`/`dt`/`dd` rather than a table or a grid of divs: this IS a description list
 * semantically, and screen readers announce the pairing with no extra ARIA. Each row
 * is a two-column grid so the columns align without a table.
 */
import { ACCENT_TEXT, type AccentRole } from '../../lib/accentClass';
import type { Fact } from '../../lib/companyProfile';

export interface Props {
  facts: Fact[];
  /** Accent role for the labels, from the closed list in DESIGN.md §3.2. */
  accent?: AccentRole;
  class?: string;
}

export default function FactList({ facts, accent = 'legal', class: className }: Props) {
  const wrapper = [
    'divide-y divide-line rounded-card bg-surface border border-line',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  const labelClass = `text-caption uppercase font-bold ${ACCENT_TEXT[accent]}`;

  return (
    <dl class={wrapper}>
      {facts.map((fact) => (
        <div
          key={fact.label.key}
          class="grid gap-1 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:gap-4 px-5 py-4 min-w-0"
        >
          <dt data-lang={fact.label.key} class={labelClass}>
            {fact.label.text}
          </dt>
          {/* A literal, on purpose — see the note at the top of this file. It is also
              why this line carries no data-lang: there is nothing to translate. */}
          <dd class="text-body-sm text-fg break-words">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
