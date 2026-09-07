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
          target: process.env.FUNCTIONS_PROXY_TARGET || "https://asjportal.netlify.app",
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

