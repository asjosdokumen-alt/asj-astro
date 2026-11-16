import type { APIRoute } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import { FALLBACK_ORIGIN, siteOrigin } from '../lib/siteMeta';

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
export const GET: APIRoute = async () => {  // The origin now comes from PUBLIC_SITE_URL, or from Netlify's own `URL`
  // variable when that is unset (see siteOrigin). The literal below is a LAST
  // resort for a local build with neither set: a sitemap is only useful with
  // absolute URLs, so emitting one is better than emitting none — but a guessed
  // host is worth a line in the build log, because every <loc> in the file
  // would point at a site that may not be this one.
  const resolved = siteOrigin();
  if (!resolved) {
    // biome-ignore lint/suspicious/noConsole: build-time warning is the only signal that this file is naming a host it was not told about
    console.warn(
      '[sitemap] no origin (PUBLIC_SITE_URL, Netlify URL and NETLIFY_SITE_URL are all unset) — ' +
        `falling back to ${FALLBACK_ORIGIN}. Every <loc> will name that host.`,
    );
  }
  const origin = resolved ?? FALLBACK_ORIGIN;

  /**
   * The form Netlify actually SERVES. Every route here is a directory, and the
   * bare form (`/loker`) answers 301 → `/loker/`.
   *
   * MEASURED 2026-10-24 against the live host: all seven non-root `<loc>`
   * entries redirected, because this file emitted the bare form while the
   * page's canonical (`Astro.url.pathname`) carries the slash. Search Console
   * files those as "Page with redirect", not "Indexed" — a sitemap that
   * advertises URLs which immediately move is the slowest way to ask for a
   * crawl. Gated by `e2e/sitemap-robots-agreement.test.ts`: every `<loc>` must
   * equal the canonical of the page it names.
   */
  const canonicalPath = (path: string) => (path.endsWith('/') ? path : `${path}/`);

  const staticRoutes: { loc: string; lastmod?: string; changefreq: string; priority: string }[] = [
    { loc: '/', changefreq: 'weekly', priority: '1.0' },
    { loc: '/loker', changefreq: 'daily', priority: '0.9' },
    { loc: '/public', changefreq: 'daily', priority: '0.9' },
    /* ── /apply, /siswa-baru DAN /ai-cv DIKELUARKAN (2026-11-14) ───────────
       Ketiganya dulu ada di sini dengan alasan yang ditulis di komentar lama:
       "`aa8fa40` memberi masing-masing salinan server-rendered (h1 + deskripsi
       + langkah)". Alasan itu SUDAH TIDAK BERLAKU: pada 2026-11-10 pemilik
       memangkas pengantarnya ("pedekin, hilangin kata-kata yang tidak berguna
       di HP"), dan yang tersisa di HTML server tinggal judul + satu baris.

       TERUKUR dengan UA Googlebot, 2026-11-14, teks setelah script/gaya dibuang:
         /apply 277 karakter · /siswa-baru 198 · /ai-cv 146
       Halaman dengan <300 karakter adalah definisi thin content. Mengiklankannya
       di sitemap meminta Google merayapi halaman yang tidak akan pernah ranking,
       dan itu memakan crawl budget yang seharusnya dipakai halaman yang bisa.

       KETIGANYA TETAP BISA DIRAYAPI (tidak diblokir robots.txt). Mereka dibagikan
       lewat WhatsApp kepada pelamar, jadi URL-nya harus tetap hidup untuk manusia;
       yang dicabut hanya IKLANNYA ke mesin pencari, bukan aksesnya.

       ⚠ JANGAN kembalikan ketiganya tanpa mengembalikan isinya lebih dulu. Kalau
       nanti halaman ini punya naskah server yang benar-benar layak diindeks,
       barisnya boleh masuk lagi — dengan angka karakter yang menyertainya. */
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

  const all = [...staticRoutes, ...postRoutes].map((r) => ({ ...r, loc: canonicalPath(r.loc) }));

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
