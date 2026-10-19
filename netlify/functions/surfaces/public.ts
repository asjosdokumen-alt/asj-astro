/**
 * surfaces/public.ts — Public data surface (read-only, high-traffic)
 *
 * Handles: getAppData, getMonthlyReport
 * Cacheable: Yes — CDN cache + stale-while-revalidate + stale-if-error
 *
 * This surface imports ONLY from contexts/catalog (boundary rule).
 *
 * CDN Cache Strategy (Phase 5):
 *   - s-maxage=60: CDN serves cached response for 60s
 *   - stale-while-revalidate=86400: serve stale for up to 24h while revalidating
 *   - stale-if-error=86400: serve stale for up to 24h during Supabase outage
 *   This keeps the public job board alive during a full database outage.
 */
import * as catalog from '../contexts/catalog';
import { cache, genKey } from '../_lib/kernel/cache';
import type { SurfaceCachePolicy } from '../_lib/netlify-wrapper-surface';

/** Cache headers for public surface responses (Phase 5) */
export const PUBLIC_CACHE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=86400, stale-if-error=86400',
  'CDN-Cache-Control': 'public, s-maxage=60',
  'Vary': 'Accept-Encoding',
};

/**
 * The L0 policy this surface hands to `makeSurfaceHandler`.
 *
 * WHY IT LIVES HERE AND IS APPLIED THERE: a Netlify function handler returns
 * `{ statusCode, headers, body }` — a plain object — so a helper that builds a
 * `Response` can never put a header on the wire. The previous
 * `withCacheHeaders()` did exactly that and had ZERO callers, which is why the
 * declared strategy above never took effect (measured 2026-10-19: two identical
 * public reads, both `Cache-Status: fwd=miss`, `Cache-Control: no-cache`).
 *
 * `getAppData` is the only anonymous, identical-for-everyone read on this
 * surface — the hottest path in the system (every visit to `/` and `/loker`
 * costs a PostgREST round-trip of ~113 KB). Everything else either needs a
 * session or is a write, and `sessionToken` is checked by the wrapper before
 * this policy is even consulted.
 *
 * ⚠ THE CLIENT MUST USE GET. Netlify's CDN caches GET/HEAD only; a POST
 * response is never stored however it is labelled. `src/lib/publicData.ts`
 * therefore issues a GET, and its suite pins that.
 */
export const PUBLIC_CACHE_POLICY: SurfaceCachePolicy = {
  cacheControl: (action, sessionToken) =>
    action === 'getAppData' && !sessionToken ? PUBLIC_CACHE_HEADERS['Cache-Control'] : null,
};

export const PUBLIC_ACTIONS: Record<string, (payload: unknown[], sessionToken?: string) => Promise<unknown>> = {
  getAppData: async (payload, sessionToken) => {
    const mode = (payload?.[0] as string) || 'default';
    // Security fix (review K2): respons dengan sessionToken bersifat privat
    // per-sesi (mode admin/kandidat memuat seluruh data kandidat) dan TIDAK
    // boleh masuk cache bersama — kunci lama ('public-appdata', mode) membuat
    // respons admin disajikan ke peminta anonim berikutnya. Hanya panggilan
    // anonim yang di-cache; semua panggilan ber-token selalu segar.
    if (!sessionToken) {
      const key = genKey('public-appdata', mode);
      return cache.getOrSet(key, () => catalog.handleGetAppData(payload, undefined), { ttlMs: 60_000 });
    }
    return catalog.handleGetAppData(payload, sessionToken);
  },
  getMonthlyReport: (payload, sessionToken) => catalog.handleGetMonthlyReport(payload, sessionToken),
};
