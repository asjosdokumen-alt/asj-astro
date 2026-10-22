import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Blog collection — added 2026-10-23 for the SEO pillar cluster.
 *
 * WHY A COLLECTION AND NOT `src/pages/*.md`
 * -----------------------------------------
 * Astro renders `.md` pages without the site layout, so a Markdown page in
 * `src/pages/` would ship as unstyled HTML with no nav, no footer and no
 * canonical/hreflang metadata — the exact opposite of what an SEO article
 * needs. A collection keeps the Markdown as content and lets one route own the
 * layout, so the article and the site chrome cannot drift apart.
 *
 * `schema` is deliberately permissive on the SEO-only keys (`primary_keyword`,
 * `schema`, `image_alt`): they are consumed by the JSON-LD and the meta tags,
 * not by the renderer, and making them required would reject a draft that is
 * otherwise publishable.
 */
const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    slug: z.string().optional(),
    primary_keyword: z.string().optional(),
    image: z.string().optional(),
    image_alt: z.string().optional(),
    last_updated: z.string().optional(),
    schema: z.array(z.string()).optional(),
  }),
});

export const collections = { blog };
