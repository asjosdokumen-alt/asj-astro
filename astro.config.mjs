import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import netlify from '@astrojs/netlify';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [preact({ compat: true })],
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

