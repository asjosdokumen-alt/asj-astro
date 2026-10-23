import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
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
  const origin = siteOrigin() ?? 'https://asjastro.netlify.app';

  const staticRoutes: { loc: string; lastmod?: string; changefreq: string; priority: string }[] = [
    { loc: '/', changefreq: 'weekly', priority: '1.0' },
    { loc: '/loker', changefreq: 'daily', priority: '0.9' },
    { loc: '/public', changefreq: 'daily', priority: '0.9' },
    { loc: '/apply', changefreq: 'weekly', priority: '0.8' },
    { loc: '/siswa-baru', changefreq: 'weekly', priority: '0.8' },
    { loc: '/ai-cv', changefreq: 'weekly', priority: '0.7' },
    { loc: '/master', changefreq: 'monthly', priority: '0.6' },
  ];

  const posts = await getCollection('blog');
  const postRoutes = posts.map((post) => ({
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
