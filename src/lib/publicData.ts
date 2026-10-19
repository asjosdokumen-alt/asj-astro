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
