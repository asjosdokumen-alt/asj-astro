/**
 * LokerStaticTable.tsx — the table half of the server-rendered job fallback.
 *
 * WHY THIS IS A `.tsx` AND NOT MARKUP INSIDE `LokerStaticList.astro`
 * ---------------------------------------------------------------
 * The indexer resolves `.astro` template interpolations against the FRONTMATTER
 * module scope only, so `{jobs.map((j) => …)}` inside an `.astro` page produces
 * one `global-unknown` unresolved ref per `j.*` read — measured 2026-10-23:
 * seven of them, at LokerStaticList.astro:75-81, which turned
 * `indexer/src/build.test.ts > reports occurrences, unresolved, and stage timings`
 * red. `src/pages/index.astro:63` records the rule this repo settled on:
 * **every list in an `.astro` page lives in a `.tsx` primitive.** The hreflang
 * alternates were moved out of BaseLayout.astro for exactly this reason
 * (src/components/public/HreflangLinks.tsx).
 *
 * This component is rendered on the SERVER (no `client:` directive), so it ships
 * as static HTML — which is the whole point: crawlers and no-JS visitors read it.
 * Preact escapes every value on the way out, so job rows entered in the admin
 * panel can never become markup here. (Building the rows as a string and piping
 * them through `set:html` would have been one file fewer and one stored-XSS
 * surface more.)
 *
 * i18n: `data-lang` rather than `t()`. The HTML is frozen at build time, so a
 * `t()` call here would bake in the build's language and the JP toggle could
 * never reach it. `data-lang` is rewritten client-side by translateDataLang(),
 * which is what the rest of the static markup uses.
 */

import type { PublicJobRow } from '../../lib/publicData';

/**
 * The row shape is owned by the DATA layer (`parsePublicJobs`), not here.
 *
 * It used to be declared in this file. Once the static table stopped querying
 * PostgREST directly and started reading the function's payload, two copies of
 * the same seven field names would have been free to drift — and the drift is
 * invisible: a renamed key renders an empty `<td>`, and nothing in the suite
 * asserts a cell's TEXT (the component's own tests feed rows in by hand).
 */
export type LokerStaticRow = PublicJobRow;

/** Header cells, in render order. One entry, one `<th>`. */
const COLUMNS: { key: keyof LokerStaticRow; labelKey: string; label: string }[] = [
  { key: 'code', labelKey: 'loker_static.code', label: 'Kode' },
  { key: 'pekerjaan', labelKey: 'loker_static.job', label: 'Pekerjaan' },
  { key: 'kategori', labelKey: 'loker_static.category', label: 'Kategori' },
  { key: 'lokasi', labelKey: 'loker_static.location', label: 'Lokasi' },
  { key: 'gender', labelKey: 'loker_static.gender', label: 'Gender' },
  { key: 'kuota', labelKey: 'loker_static.quota', label: 'Kuota' },
  { key: 'status', labelKey: 'loker_static.status', label: 'Status' },
];

export default function LokerStaticTable({ jobs }: { jobs: LokerStaticRow[] }) {
  return (
    <table>
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th key={c.key} data-lang={c.labelKey}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {jobs.map((job, i) => (
          // The list is frozen at build time and a job code is not guaranteed
          // unique, so the index is part of the key on purpose.
          <tr key={`${job.code}-${i}`}>
            {COLUMNS.map((c) => (
              <td key={c.key}>{job[c.key]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
