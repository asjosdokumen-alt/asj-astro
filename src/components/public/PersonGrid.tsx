/**
 * PersonGrid.tsx — the team grid: one card per role, with a name only when the
 * company profile publishes one.
 *
 * WHY THE NAME IS OPTIONAL
 * ------------------------
 * Six roles come from the official organisation structure (company profile page 8),
 * and TODAY all six carry a printed name — the document publishes every one. The
 * field stays nullable because the rule it encodes is the point: a person is named
 * only when the company profile publishes them, and a `name` field that always
 * rendered would force an unnamed role to say something — which is how a placeholder
 * like "Staff" or, worse, an invented name, ends up on a public company page. So
 * `name: null` remains a real, supported state: it renders an honest "Belum
 * dipublikasikan" instead of an empty gap that reads as a layout bug. No row uses it
 * right now; `e2e/test-landing.mjs` ties this branch's output to the data so the two
 * cannot drift apart.
 *
 * The credential note is rendered under the role rather than in its own column
 * because JLPT N1 belongs to ONE of these people, and a detached badge would read as
 * a company-wide claim. The separate credential card above the grid carries the
 * certificate number; this line is the human attribution.
 *
 * WHY .tsx AND NOT .astro — see the long note in IconTileGrid.tsx. Short version: it
 * iterates, and iterating inside an `.astro` template breaks the indexer's
 * zero-unresolved invariant.
 */
import type { Person } from '../../lib/companyProfile';

export interface Props {
  people: Person[];
  class?: string;
}

export default function PersonGrid({ people, class: className }: Props) {
  const grid = ['grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <ul class={grid}>
      {people.map((person) => (
        <li
          key={person.role.key}
          class="flex flex-col gap-1 rounded-card border border-line bg-surface p-5"
        >
          <span class="text-card-title font-bold text-fg">
            {person.name ?? (
              <span class="text-fg-muted font-normal italic" data-lang="profile.team_name_pending">
                Belum dipublikasikan
              </span>
            )}
          </span>
          <span data-lang={person.role.key} class="text-body-sm text-accent font-medium">
            {person.role.text}
          </span>
          {person.note ? (
            <span data-lang={person.note.key} class="mt-1 text-caption text-fg-muted">
              {person.note.text}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
