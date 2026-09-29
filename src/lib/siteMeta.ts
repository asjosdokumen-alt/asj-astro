/**
 * siteMeta.ts — the site's own origin, and the JSON-LD + hreflang built from it.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * MEASURED 2026-09-29 (`docs/COMPANY_PAGE_ASSESSMENT_2026-09-29.md` §2b, §3.7):
 * this site had **0 JSON-LD** and **0 hreflang**, while 3 of the 6 MoU partner
 * sites emit JSON-LD and two emit hreflang (Human 3, JIPA 6). We have the fullest
 * bilingual content of the seven (1,737 ID + 1,700 JP keys) and were getting none
 * of the discovery benefit, because nothing told a crawler that the Indonesian
 * and Japanese pages are the same page in two languages.
 *
 * The root cause of the missing hreflang is concrete: **absolute alternate URLs
 * need an origin, and this repo had no origin constant anywhere.** The origin
 * lives in prose (`docs/ARCHITECTURE.md`) and in proxy targets, not in code.
 *
 * ── WHY THE ORIGIN IS AN ENV VAR AND NOT A LITERAL ─────────────────────────
 * ⚠ The host has MOVED TWICE. `docs/ARCHITECTURE.md` records that on 2026-09-28
 * the Netlify host changed to `boisterous-taiyaki-c61202.netlify.app` because the
 * account owning `asjastro.netlify.app` ran out of credit — and the OLD host still
 * answers HTTP 200 with a healthy `/health`, so a liveness check cannot tell them
 * apart. A hardcoded literal here would therefore:
 *
 *   1. be a third copy of a value that already drifted twice, and
 *   2. silently emit canonical/hreflang URLs pointing at a FROZEN site, which is
 *      worse than emitting none — it actively misdirects crawlers.
 *
 * So the origin is read from `PUBLIC_SITE_URL` at build time. When it is absent,
 * the caller is expected to OMIT the absolute-URL tags rather than guess. A
 * wrong canonical is a real SEO defect; a missing one is neutral.
 */

/**
 * The site's origin, e.g. `https://example.com` — no trailing slash.
 *
 * `null` when unknown, which is the honest state on a machine with no
 * `PUBLIC_SITE_URL` set (every local build and every test). Callers must treat
 * `null` as "emit nothing", never as "use a placeholder".
 */
export function siteOrigin(): string | null {
  const raw = import.meta.env?.PUBLIC_SITE_URL ?? process.env?.PUBLIC_SITE_URL;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed === '') return null;
  // Only absolute http(s) origins are usable in a canonical URL. A bare word
  // here means a misconfigured environment, and emitting it would produce an
  // invalid href, so it is treated as absent.
  if (!/^https?:\/\/[^/\s]+$/i.test(trimmed)) return null;
  return trimmed;
}

/**
 * An absolute URL for a path, or `null` when the origin is unknown.
 *
 * `path` is expected to start with `/`.
 */
export function absoluteUrl(path: string, origin = siteOrigin()): string | null {
  if (!origin) return null;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

/** The two languages this site serves, and the path each page lives at. */
export type SiteLang = 'id' | 'jp';

/**
 * `hreflang` alternates for a page, INCLUDING `x-default`.
 *
 * ── WHY `x-default` AND NOT JUST THE TWO LANGUAGES ─────────────────────────
 * `x-default` is what Google serves to a visitor whose language matches neither
 * `id` nor `jp` — the common case for a Japanese-facing LPK whose visitors are
 * often already abroad. Without it, a crawler has two candidates and no stated
 * preference, which is the ambiguous state this whole change exists to remove.
 *
 * ── WHY `id` AND NOT `id-ID` ───────────────────────────────────────────────
 * `<html lang="id">` is what the layout already emits (BaseLayout.astro), and a
 * mismatch between the tag and the `lang` attribute is a contradiction a crawler
 * has to resolve. JIPA uses `id-ID`; we are internally consistent with `id`.
 *
 * Returns an empty array when the origin is unknown, so callers emit nothing
 * rather than a relative or guessed alternate.
 */
export function hreflangAlternates(
  paths: Record<SiteLang, string>,
  origin = siteOrigin(),
): { hreflang: string; href: string }[] {
  const entries: { hreflang: string; href: string }[] = [];
  const id = absoluteUrl(paths.id, origin);
  const jp = absoluteUrl(paths.jp, origin);
  if (id) entries.push({ hreflang: 'id', href: id });
  if (jp) entries.push({ hreflang: 'jp', href: jp });
  // `x-default` points at the Indonesian page: it is the server-rendered default
  // (BaseLayout's `<title>` and every page's static copy are Indonesian), so the
  // declared default matches what a crawler actually receives.
  if (id) entries.push({ hreflang: 'x-default', href: id });
  return entries;
}

/**
 * The `Organization` JSON-LD block for the company profile page.
 *
 * ── WHAT IS IN IT, AND WHY NOTHING MORE ────────────────────────────────────
 * Every field below is copied from `companyProfile.ts` — the file the site
 * already renders from — so the structured data and the visible page cannot
 * disagree. That matters more than volume: `COMPANY_PROFILE_DATA.md` §8/§12 ban
 * publishing invented figures (candidate counts, departures, partner totals), and
 * structured data is a place those could be smuggled in where no visible gate
 * would catch them. So this deliberately carries NO `numberOfEmployees`, NO
 * `aggregateRating` and NO counts of any kind.
 *
 * ── WHY `EducationalOrganization` AND NOT `Organization` ───────────────────
 * The two partners that emit JSON-LD use the generic `Organization` (Flora) and
 * `WebPage` (Hibiki). Our entity is an LPK — a Japanese-language training
 * institution — which is exactly what `EducationalOrganization` describes. The
 * more specific type is a superset of `Organization`, so nothing is lost, and it
 * is the type that can surface a school panel rather than a generic company one.
 *
 * ── WHY `@id` ──────────────────────────────────────────────────────────────
 * It gives the entity a stable identifier so future blocks (a `WebSite` with
 * `SearchAction`, a `Course`) can point at the same node instead of creating a
 * second, disconnected organisation that a crawler must reconcile.
 *
 * Returns `null` when the origin is unknown — an `Organization` with no `url`
 * and no `@id` is a weaker signal than none at all, and would contradict the
 * canonical link this same module declines to emit in that state.
 */
export function organizationJsonLd(input: {
  name: string;
  description: string;
  streetAddress: string;
  telephone: string;
  email: string;
  latitude: number;
  longitude: number;
  /** Absolute URL of the logo, when one is known. */
  logo?: string | null;
  /** Profile URLs (Instagram, TikTok, Maps listing). */
  sameAs?: string[];
  origin?: string | null;
}): Record<string, unknown> | null {
  const origin = input.origin === undefined ? siteOrigin() : input.origin;
  if (!origin) return null;

  const id = `${origin}/#organization`;

  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    '@id': id,
    name: input.name,
    description: input.description,
    url: origin,
    email: input.email,
    telephone: input.telephone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: input.streetAddress,
      addressCountry: 'ID',
      addressRegion: 'Jawa Timur',
      addressLocality: 'Ponorogo',
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: input.latitude,
      longitude: input.longitude,
    },
    ...(input.logo ? { logo: input.logo } : {}),
    ...(input.sameAs?.length ? { sameAs: input.sameAs } : {}),
  };
}

/**
 * Serialise a JSON-LD object for embedding in a `script` tag.
 *
 * `<` is escaped to `\u003c` so a value containing `</script>` cannot terminate
 * the block early and inject markup — the standard JSON-in-HTML hardening. The
 * data here is ours and benign today, but the escape costs nothing and removes
 * the need to re-audit this line if a future field ever takes user input.
 */
export function jsonLdScript(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

