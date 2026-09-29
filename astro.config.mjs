import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import netlify from '@astrojs/netlify';
import tailwindcss from '@tailwindcss/vite';
import stripHtmlComments from './scripts/build/strip-html-comments.mjs';

export default defineConfig({
  // Strips authored HTML comments from the PRODUCTION build only.
  //
  // MEASURED 2026-09-29: `dist/index.html` shipped 18,412 B of comments (8.6%
  // of the page, 55 blocks), which is why our landing page was 55,679 B gzipped
  // against 9,450 / 10,752 / 8,995 / 6,017 B for the six MoU partner sites.
  // The comments are the repo's rationale notes and stay in SOURCE — they were
  // only ever meant for maintainers, not for visitors.
  //
  // It is an INTEGRATION (not a vite plugin): a vite `generateBundle` hook was
  // tried first and silently did nothing, because Astro writes final static HTML
  // in `runPostBuildHooks`, after the bundle phase. See the plugin's own header.
  // The `astro:build:done` hook never runs in `astro dev`, so View Source in
  // development still shows every comment. It also preserves `<!--astro:end-->`,
  // which Astro's hydration runtime looks up in the DOM.
  // See docs/COMPANY_PAGE_ASSESSMENT_2026-09-29.md §4.1 item A.
  integrations: [preact({ compat: true }), stripHtmlComments()],
  // output: 'server',  // SSR enabled when deploying to Netlify
  // adapter: netlify(),  // Enable for SSR deploy
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ["preact", "preact/hooks", "@nanostores/persistent", "nanostores"],
      exclude: ["@astrojs/preact", "@nanostores/preact"],
    },
    server: {
      proxy: {
        "/.netlify/functions": {
          // Must be the site that is DEPLOYING, not merely one that answers.
          // Pointing this at a retired host silently serves an OLD backend, which
          // makes `astro dev` look like it is running stale code. It has happened
          // twice: asjportal.netlify.app (legacy app) and, from 2026-09-28,
          // asjastro.netlify.app — that one still returned HTTP 200 and a healthy
          // /health while frozen at its 2026-09-24 build, because its account ran
          // out of credit and every later deploy was skipped. A liveness check
          // cannot see that; the deploy list can. Override with
          // FUNCTIONS_PROXY_TARGET.
          target:
            process.env.FUNCTIONS_PROXY_TARGET || "https://boisterous-taiyaki-c61202.netlify.app",
          changeOrigin: true,
          secure: false,
        },
      },
    },
    resolve: {
      alias: { "react": "preact/compat", "react-dom": "preact/compat" },
      dedupe: ["preact", "preact/compat", "preact/hooks", "@nanostores/preact", "react", "react-dom"],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['preact'],
          },
        },
      },
    },
  },
});

