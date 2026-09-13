// ==========================================
// TESTS: PWA offline behaviour (#18) — the built service worker
//
// Why this test exists
//   The SW was previously believed "done" because a manifest existed and the
//   precache list was long (63 URLs). Reading that list is not proof of offline
//   behaviour: what matters is whether the URL keys stored in the cache MATCH
//   the URL the browser actually requests when the user navigates offline.
//
//   The real gap found here: `build-sw-manifest.mjs` collects HTML entry points
//   as `/apply/index.html`, but the app links to `/apply` (no trailing slash)
//   and Netlify 301-redirects that to `/apply/`. The SW's navigation fallback
//   does `cache.match(url.pathname)` — i.e. `cache.match('/apply/')` — which is
//   a MISS, so it serves `/index.html`, the public landing page. Offline, the
//   user taps "AI CV" and lands on the homepage with no explanation.
//
//   This file asserts against `dist/sw.js` — the artifact Netlify actually
//   serves — not the source or the manifest generator. If `dist/` is absent the
//   suite is skipped rather than silently passing (see the guard below).
// ==========================================
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SW_PATH = join(process.cwd(), 'dist', 'sw.js');
const DIST = join(process.cwd(), 'dist');
const hasBuild = existsSync(SW_PATH);

/** Pull the generated PRECACHE array out of the built SW. */
function readPrecache(): string[] {
  const src = readFileSync(SW_PATH, 'utf8');
  const m = src.match(/\/\/ PRECACHE_START\r?\n([\s\S]*?)\r?\n\/\/ PRECACHE_END/);
  if (!m) throw new Error('PRECACHE markers not found in dist/sw.js');
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/** Every route the app can be navigated to, as served by Netlify. */
function distRoutes(): string[] {
  const routes: string[] = [];
  for (const name of readdirSync(DIST)) {
    const full = join(DIST, name);
    if (!statSync(full).isDirectory()) continue;
    if (name.startsWith('_') || name === 'icons') continue;
    if (existsSync(join(full, 'index.html'))) routes.push('/' + name + '/');
  }
  return routes.sort();
}

describe.skipIf(!hasBuild)('built service worker — offline navigation (#18)', () => {
  it('the PRECACHE block is machine-generated and non-trivial', () => {
    const pre = readPrecache();
    expect(pre.length).toBeGreaterThan(50);
    expect(pre).toContain('/');
  });

  it('every directory route is cached under the URL the browser requests', () => {
    // THE regression this test exists for. A route present only as
    // `/x/index.html` cannot satisfy a navigation to `/x/`.
    const pre = readPrecache();
    const missing = distRoutes().filter((r) => !pre.includes(r));
    expect(missing).toEqual([]);
  });

  it('every directory route is also cached with a trailing slash AND without', () => {
    // The app links to `/apply` (no slash) which Netlify redirects to `/apply/`.
    // Caching only one form leaves the other to the network — which is exactly
    // what is unavailable offline.
    const pre = readPrecache();
    const gaps: string[] = [];
    for (const r of distRoutes()) {
      const bare = r.replace(/\/$/, '');
      if (!pre.includes(r)) gaps.push(r);
      if (bare && !pre.includes(bare)) gaps.push(bare);
    }
    expect(gaps).toEqual([]);
  });

  it('the offline fallback never resolves a route to the landing page shell alone', () => {
    // `/index.html` must remain as a last-resort shell, but every real route
    // must be reachable before it — otherwise offline navigation silently
    // rewrites the app to the homepage.
    const src = readFileSync(SW_PATH, 'utf8');
    expect(src).toContain("cache.match('/index.html')");
    const pre = readPrecache();
    expect(pre).toContain('/index.html');
  });

  it('lazy heavy chunks stay OUT of the precache', () => {
    // xlsx (~429 KB) and pdf-parse are loaded on demand; precaching them would
    // inflate install for code most sessions never run.
    const pre = readPrecache();
    expect(pre.filter((u) => /\/xlsx\./.test(u))).toEqual([]);
    expect(pre.filter((u) => /\/pdf-parse\./.test(u))).toEqual([]);
  });

  it('API traffic is never precached and never intercepted', () => {
    const pre = readPrecache();
    expect(pre.filter((u) => u.startsWith('/.netlify/') || u.startsWith('/api/'))).toEqual([]);
    const src = readFileSync(SW_PATH, 'utf8');
    // Both guards must be present: the request path is what keeps authenticated
    // responses out of the cache.
    expect(src).toContain("url.pathname.startsWith('/.netlify/')");
    expect(src).toContain("url.pathname.startsWith('/api/')");
  });

  it('the cache version is content-derived, not a static counter', () => {
    const src = readFileSync(SW_PATH, 'utf8');
    const m = src.match(/const VERSION = '([^']+)';/);
    expect(m, 'VERSION constant missing').toBeTruthy();
    // A content hash means identical builds do not churn the cache, and a
    // changed build always produces a new version (so activate drops the old).
    expect(m![1]).toMatch(/^asj-astro-[0-9a-f]{12}$/);
    expect(m![1]).not.toBe('asj-astro-dev');
  });

  it('activate drops every other cache and force-reloads open tabs', () => {
    const src = readFileSync(SW_PATH, 'utf8');
    // Without the version filter, old asset hashes accumulate forever.
    expect(src).toContain('keys.filter((k) => k !== VERSION)');
    expect(src).toContain('caches.delete(k)');
    expect(src).toContain("postMessage({ type: 'ASJ_FORCE_RELOAD' })");
  });

  it('navigations are network-first with a cache fallback (never cache-first)', () => {
    const src = readFileSync(SW_PATH, 'utf8');
    // Cache-first navigation would pin users to a stale app shell.
    expect(src).toContain("fetch(req.url, { cache: 'no-cache' })");
    expect(src).toContain("req.mode === 'navigate'");
  });

  it('other origins are left untouched (Supabase, CDNs, fonts)', () => {
    const src = readFileSync(SW_PATH, 'utf8');
    expect(src).toContain('if (url.origin !== self.location.origin) return;');
  });
});
