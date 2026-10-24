/**
 * publicData.ts — single-flight cache for the public getAppData payload.
 *
 * The home page fetched the same ~110KB (159-job) payload TWICE per load:
 * LokerTable (table rows) and the marquee <script> in index.astro (which only
 * needs `pengumuman`). Both callers now share one in-flight request; the cache
 * resets after the response settles so a later load refetches fresh data.
 *
 * ⚠ GET, NOT POST (2026-10-19) — this is an egress decision, not a style one.
 * Every visit to `/` or `/loker` makes the function read ~113 KB from
 * PostgREST, and the payload is identical for every anonymous visitor. The
 * server now labels that response `s-maxage=60, stale-while-revalidate=86400`
 * (netlify/functions/surfaces/public.ts), but **Netlify's CDN caches GET and
 * HEAD only** — a POST is forwarded every time, so the same headers on a POST
 * would have changed nothing while looking like a fix. The endpoint accepts
 * both: the surface wrapper parses `action`/`payload` off the query string.
 *
 * Changing this back to POST does not break the page — it silently restores one
 * PostgREST read per visit, which is why `publicData.test.ts` pins the method.
 */
export interface PublicAppData {
  success: boolean;
  activeTheme?: string;
  sessionInvalid?: boolean;
  jobs?: Array<Record<string, unknown>>;
  pengumuman?: string;
}

/** The GET URL for the anonymous public payload (also used by the suite). */
export function publicDataUrl(): string {
  return (
    '/.netlify/functions/get-app-data?action=getAppData&payload=' +
    encodeURIComponent(JSON.stringify(['public']))
  );
}

let inflight: Promise<PublicAppData> | null = null;

export function getPublicData(): Promise<PublicAppData> {
  if (!inflight) {
    inflight = fetch(publicDataUrl(), { method: 'GET', headers: { Accept: 'application/json' } })
      .then((res) => res.json() as Promise<PublicAppData>)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * One row of the server-rendered job table (`LokerStaticTable`).
 *
 * ⚠ THE FIELD NAMES ARE THE PAYLOAD'S, NOT THE TABLE'S. The old build-time
 * reader queried PostgREST directly and selected `code_job`; the function's
 * payload renames it to `code` (measured 2026-10-24 against the live endpoint:
 * every row has `code`, `pekerjaan`, `kategori`, `status`, `lokasi`, `gender`,
 * `kuota`, `syarat`, …). Mapping the old name would have produced an empty
 * "Kode" column on every row — silently, because nothing asserts a cell's text.
 */
export interface PublicJobRow {
  code: string;
  pekerjaan: string;
  kategori: string;
  lokasi: string;
  gender: string;
  kuota: string;
  status: string;
}

/**
 * Absolute URL for the public payload — for callers that are NOT a browser.
 *
 * `publicDataUrl()` is relative on purpose (the island fetches it from the page
 * it is already on). A build has no page, so it needs an origin; it gets one
 * from `siteOrigin()` and joins it here, in the one place that owns the URL
 * shape. Trailing slashes on the origin are stripped so a stray `/` cannot
 * produce `//.netlify/...`.
 */
export function publicJobsUrl(origin: string): string {
  return origin.replace(/\/+$/, '') + publicDataUrl();
}

/**
 * Payload → table rows. Pure, so the shape rules are testable without a network.
 *
 * `jobs`, NOT `dbJobs`. The payload carries both (measured: 5 vs 6 rows on the
 * same request) and the island renders `jobs`; the static table must show what a
 * visitor sees, not a superset.
 */
export function parsePublicJobs(payload: unknown, limit = 50): PublicJobRow[] {
  const jobs = (payload as PublicAppData | null | undefined)?.jobs;
  if (!Array.isArray(jobs)) return [];
  const text = (value: unknown) => (value === null || value === undefined ? '' : String(value));
  return jobs.slice(0, Math.max(0, limit)).map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    return {
      code: text(row.code ?? row.code_job),
      pekerjaan: text(row.pekerjaan),
      kategori: text(row.kategori),
      lokasi: text(row.lokasi),
      gender: text(row.gender),
      kuota: text(row.kuota),
      status: text(row.status),
    };
  });
}

/**
 * The build-time warning, in one place so the lint exemption is in one place.
 *
 * A static table that quietly loses its rows is the exact failure this module
 * was rewritten to end: the old reader caught `42501`, swallowed it, and shipped
 * two pages with no table for as long as it existed. There is no UI during a
 * build, so stderr is the only signal there is.
 */
function warnBuild(message: string): void {
  // biome-ignore lint/suspicious/noConsole: build-time stderr is the only signal that the static table is empty — same reason as src/pages/sitemap.xml.ts
  console.warn(`[loker-static] ${message}`);
}

/**
 * Build-time fetch of the same public payload, for the server-rendered table.
 *
 * ── WHY THE ENDPOINT AND NOT POSTGREST ─────────────────────────────────────
 * MEASURED 2026-10-24, live, with the anon key the build actually has:
 *   GET /rest/v1/job_database?select=code_job,… → 401 `42501 permission denied
 *   for table job_database` (hint: GRANT SELECT … TO anon).
 * So the build-time query in `LokerStaticList.astro` had been failing silently
 * since it was written: `/loker` and `/public` shipped with NO static table at
 * all (`<table` count 0 in the live HTML), which is exactly the thin content
 * those pages were supposed to stop being.
 *
 * The data is already public — the island fetches this same payload from the
 * browser — so reading it through the same contract adds no exposure, needs no
 * `GRANT`, no view, and no service-role key in the build.
 *
 * ⚠ THE TRADE-OFF, stated plainly: a build reads the PREVIOUS deploy's function
 * (this deploy's functions are not live yet). The function queries PostgREST per
 * request, so the DATA is current; only the function CODE is one deploy behind.
 * On the very first deploy of a brand-new site the fetch 404s and the table is
 * empty — the same state as before this change, and non-fatal by design. A
 * deploy preview resolves to its own not-yet-deployed host and is empty too;
 * previews are not crawled.
 *
 * Returns `[]` on every failure (no origin, non-2xx, HTML where JSON was
 * expected, unparseable body) and says why on stderr. The HTML case is the one
 * that has bitten this repo before: three proxy defaults pointed at a renamed
 * host, and every API call received a 404 PAGE with a 200-shaped shape. A
 * `res.ok` check alone would not catch it, hence the content-type test.
 */
export async function fetchPublicJobs(
  origin: string | null | undefined,
  limit = 50,
): Promise<PublicJobRow[]> {
  if (!origin) return [];
  try {
    const res = await fetch(publicJobsUrl(origin), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      warnBuild(`${publicJobsUrl(origin)} → HTTP ${res.status}`);
      return [];
    }
    const contentType = res.headers?.get?.('content-type') ?? '';
    if (!contentType.includes('json')) {
      warnBuild(`${publicJobsUrl(origin)} answered "${contentType}" — expected JSON`);
      return [];
    }
    const rows = parsePublicJobs(await res.json(), limit);
    // A 200 with rows is not proof of a working backend. MEASURED 2026-10-24:
    // the function's `loadPublicBase()` starts from `demoGetAppData()` and only
    // overwrites `jobs` when it can read the table — so a backend that cannot
    // reach its database answers 200 with the DEMO dataset, and the page looks
    // populated while carrying no real vacancy. This warning is the only place
    // a build can tell the difference without knowing the schema.
    if (rows.length > 0 && rows.every((row) => /^DEMO-/i.test(row.code))) {
      warnBuild(
        `all ${rows.length} rows are DEMO-* placeholders — the function is serving its fallback dataset, not the database`,
      );
    }
    return rows;
  } catch (error) {
    warnBuild(`fetch failed: ${(error as Error)?.message ?? error}`);
    return [];
  }
}
