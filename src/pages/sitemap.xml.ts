import type { APIRoute } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { siteOrigin } from '../lib/siteMeta';

/**
 * Sitemap XML — generated at build time from the content collection.
 *
 * WHY AN ENDPOINT AND NOT A STATIC FILE
 * -------------------------------------
 * A static file would drift: every new blog post would need a manual edit.
 * An endpoint queries the same `blog` collection the `[...slug].astro` route
 * uses, so the sitemap and the actual pages can never diverge.
 *
 * GATED ROUTES ARE EXCLUDED on purpose:
 *   /admin, /candidate, /share — all require auth and carry `noindex`.
 *   404 is not a real page.
 */
export const GET: APIRoute = async () => {
  // The origin now comes from PUBLIC_SITE_URL, or from Netlify's own `URL`
  // variable when that is unset (see siteOrigin). The literal below is a LAST
  // resort for a local build with neither set: a sitemap is only useful with
  // absolute URLs, so emitting one is better than emitting none — but a guessed
  // host is worth a line in the build log, because every <loc> in the file
  // would point at a site that may not be this one.
  const resolved = siteOrigin();
  if (!resolved) {
    // biome-ignore lint/suspicious/noConsole: build-time warning is the only signal that this file is naming a host it was not told about
    console.warn(
      '[sitemap] no origin (PUBLIC_SITE_URL and Netlify URL are both unset) — ' +
        'falling back to https://asjastro.netlify.app. Every <loc> will name that host.',
    );
  }
  const origin = resolved ?? 'https://asjastro.netlify.app';

  const staticRoutes: { loc: string; lastmod?: string; changefreq: string; priority: string }[] = [
    { loc: '/', changefreq: 'weekly', priority: '1.0' },
    { loc: '/loker', changefreq: 'daily', priority: '0.9' },
    { loc: '/public', changefreq: 'daily', priority: '0.9' },
    // /apply, /ai-cv and /siswa-baru are listed because `aa8fa40` gave each one
    // server-rendered copy (h1 + description + steps) instead of an empty shell.
    // They are also NO LONGER disallowed in public/robots.txt — a URL that is
    // advertised here and blocked there is the one combination Google reports as
    // "Blocked by robots.txt" and never indexes.
    { loc: '/apply', changefreq: 'weekly', priority: '0.8' },
    { loc: '/siswa-baru', changefreq: 'weekly', priority: '0.8' },
    { loc: '/ai-cv', changefreq: 'weekly', priority: '0.7' },
    // /master is deliberately absent: it is the candidate data-entry form, has no
    // unique copy, and robots.txt still disallows it. Listing it here while
    // blocking it there was the contradiction this change removes.
  ];

  const posts = await getCollection('blog');
  // Annotated, not inferred: `getCollection` resolves to `any[]` unless Astro's
  // generated `.astro/content.d.ts` is part of the type-check program, and an
  // un-annotated callback then fails the typecheck ratchet with TS7006 (measured
  // 2026-10-23: the same error is on HEAD, so this is not new debt — it is the
  // annotation the file always needed to survive a program without the
  // generated types).
  const postRoutes = posts.map((post: CollectionEntry<'blog'>) => ({
    loc: `/blog/${post.id.split('/').pop() ?? post.id}`,
    lastmod: post.data.last_updated,
    changefreq: 'monthly',
    priority: '0.8',
  }));

  const all = [...staticRoutes, ...postRoutes];

  const lines = all
    .map(
      (r) =>
        `  <url>\n` +
        `    <loc>${origin}${r.loc}</loc>\n` +
        (r.lastmod ? `    <lastmod>${r.lastmod}</lastmod>\n` : '') +
        `    <changefreq>${r.changefreq}</changefreq>\n` +
        `    <priority>${r.priority}</priority>\n` +
        `  </url>`,
    )
    .join('\n');

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    lines +
    `\n</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  });
};
