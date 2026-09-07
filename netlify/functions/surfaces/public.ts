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

/** Cache headers for public surface responses (Phase 5) */
export const PUBLIC_CACHE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=86400, stale-if-error=86400',
  'CDN-Cache-Control': 'public, s-maxage=60',
  'Vary': 'Accept-Encoding',
};

/**
 * Wrap a handler result with CDN cache headers.
 * Used by public surface to enable CDN caching.
 */
export function withCacheHeaders(data: unknown, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...PUBLIC_CACHE_HEADERS, ...extraHeaders },
  });
}

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
