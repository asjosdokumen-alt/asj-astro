/**
 * HreflangLinks.tsx — the `<link rel="alternate" hreflang=…>` set, as an island.
 *
 * ── WHY THIS IS A `.tsx` AND NOT AN INLINE `.map()` ────────────────────────
 * This is the repo's established rule, stated at `src/pages/index.astro:63`:
 *
 *   "Iterating inside an `.astro` TEMPLATE breaks a hard invariant of this repo:
 *    `indexer/src/build.test.ts:428` requires zero unresolved references
 *    originating outside a test file, and the indexer resolves template
 *    interpolations against the FRONTMATTER MODULE SCOPE only — so a `.map()`
 *    callback parameter in a template is reported as an unresolved global
 *    (measured: 21 entries, every one a callback parameter). Every list on this
 *    page therefore lives in a `.tsx` primitive, where callbacks bind correctly."
 *
 * MEASURED 2026-09-29 rather than assumed: the first version of this markup was
 * written inline in `BaseLayout.astro` as `{alternates.map((a) => …)}`, and a
 * probe against the indexer reported exactly two `global-unknown` refs — both
 * the name `a`, both on the `<link>` line. That is the gate firing correctly, so
 * the fix belongs in the markup, not in the gate.
 *
 * ── WHY IT RENDERS NOTHING WHEN THE LIST IS EMPTY ──────────────────────────
 * `hreflangAlternates()` returns `[]` when `PUBLIC_SITE_URL` is unset (every
 * local build and every test). An empty list must emit NO tag rather than a
 * relative or guessed href — a wrong alternate misdirects crawlers, while a
 * missing one is neutral. See `src/lib/siteMeta.ts` for the full reasoning.
 *
 * ── WHY IT IS NOT A HYDRATED ISLAND ────────────────────────────────────────
 * This is `<head>` content that a crawler must read from the static HTML, so it
 * carries no `client:*` directive. No directive means Preact renders it on the
 * server and ships no JavaScript for it — which is also why it adds nothing to
 * the bundle. Do not add `client:load` here: nothing in this component is
 * interactive, and hydration would only delay the tag.
 */

export interface Alternate {
  hreflang: string;
  href: string;
}

export default function HreflangLinks({ alternates }: { alternates: Alternate[] }) {
  if (alternates.length === 0) return null;
  return (
    <>
      {alternates.map((entry) => (
        <link key={entry.hreflang} rel="alternate" hreflang={entry.hreflang} href={entry.href} />
      ))}
    </>
  );
}
