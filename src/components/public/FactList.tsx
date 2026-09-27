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
 * THE VALUE IS USUALLY A LITERAL, BUT NOT ALWAYS — CORRECTED 2026-09-27.
 * This note used to read "the value is a literal, never a key. Licence numbers,
 * registration numbers and proper nouns are identical in every language". The
 * first half is right and the reasoning was over-applied: it holds for
 * IDENTIFIERS (a licence number, a registration number, a legal name, a person,
 * an address, an email) and NOT for NAMES or QUANTITIES. The placement table in
 * `companyProfile.ts` contradicted the rule it was being justified by — four
 * prefectures stayed romanised while their labels translated, and the price
 * `6 JUTA` was declared "not translated". So a value may now be `Text`, and the
 * decision is per row: **an identifier is invariant; a name or a quantity is
 * not.** A keyed value renders with `data-lang` and its literal is the
 * pre-hydration default, exactly like every other translated string here.
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
      {facts.map((fact) => {
        // A value is either a literal (an identifier — licence numbers, a legal
        // name, an address, an email) or `Text`, which means it must localise
        // (a place name, a quantity, prose). See the note at the top.
        //
        // Bind the narrowed value to a local rather than testing
        // `typeof fact.value` inline: a `const valueIsText = typeof … ` boolean
        // does NOT narrow `fact.value` at the point of use (TS only narrows the
        // expression it tested), which is why this first version failed
        // `tsc --noEmit` with "Property 'key' does not exist on type
        // 'string | Text'" on both lines below.
        const value = fact.value;
        return (
          <div
            key={fact.label.key}
            class="grid gap-1 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:gap-4 px-5 py-4 min-w-0"
          >
            <dt data-lang={fact.label.key} class={labelClass}>
              {fact.label.text}
            </dt>
            {typeof value === 'string' ? (
              /* An identifier: identical in every language, so deliberately no
                 data-lang — there is nothing to translate and a dictionary
                 round-trip could only corrupt it. */
              <dd class="text-body-sm text-fg break-words">{value}</dd>
            ) : (
              <dd data-lang={value.key} class="text-body-sm text-fg break-words">
                {value.text}
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}
