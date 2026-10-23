const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const net = require('net');

const PREFERRED_PORT = 4321;
const DIST = path.join(__dirname, 'dist');
// Backend target for the /.netlify/functions/ proxy.
//
// THE RULE IS "THE SITE THAT IS DEPLOYING", NOT "A SITE THAT ANSWERS". The trap
// has bitten twice, both times silently:
//
//   1. `asjportal.netlify.app` — the LEGACY app (/assets/app-*.js,
//      /vendor/xlsx). It 404s on /public/, /candidate/, /apply/, /ai-cv/ and
//      /master/, so proxying there compared this build against a different
//      application.
//   2. `asjastro.netlify.app` — correct until 2026-09-28, when its account ran
//      out of credit. MEASURED that day: it still answers HTTP 200 and its
//      /.netlify/functions/health still returns {"status":"ok"}, but its last
//      successful deploy was 2026-09-24T10:41Z (commit 742e956) and every
//      deploy after it was skipped with "Skipped due to account credit usage
//      exceeded". So it is FROZEN — healthy-looking, permanently old backend.
//      A liveness check cannot tell you this; only the deploy list can.
//
//   3. `boisterous-taiyaki-c61202.netlify.app` — the 2026-09-28 replacement.
//      MEASURED 2026-10-13: **404 on every path** (/, /ai-cv, /health), so it is
//      gone, not merely stale.
//
// The owner moved the live site BACK to `asjastro.netlify.app` on 2026-10-13 and
// is shutting the other hosts down. MEASURED the same day: that host answers 200
// and serves the CURRENT build (its /ai-cv bundle carries `cv.doc_exists`, a key
// added that day). Override with BACKEND_TARGET when pointing at a preview deploy
// or a local `netlify dev` (e.g. BACKEND_TARGET=http://127.0.0.1:8888 node server.cjs).
const TARGET = process.env.BACKEND_TARGET || 'https://asjastro.netlify.app';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
  // `.txt` was missing until 2026-10-20, which is the SAME defect as `.avif`
  // (see src/lib/serverMime.test.ts). Nothing in dist/ had that extension, so
  // nothing measured it — until `public/robots.txt` existed. Without this entry
  // the harness serves robots.txt as application/octet-stream; Netlify serves it
  // correctly, so the wrong type would be invisible in production and real in
  // every place that measures. `src/lib/serverMime.test.ts` now derives this from
  // dist/ instead of trusting a list.
  '.txt': 'text/plain; charset=utf-8',
  // `.xml` — kelas cacat yang SAMA lagi (2026-10-22). `dist/sitemap.xml` baru
  // ada sejak sitemap dibuat (2026-10-21), dan tidak ada yang mengukur ekstensi
  // itu sampai `src/lib/serverMime.test.ts` menurunkannya dari dist/ — bukan
  // dari daftar yang ditulis tangan. Tanpa entri ini harness lokal menyajikan
  // sitemap sebagai application/octet-stream; Netlify menyajikannya benar,
  // jadi cacatnya tidak terlihat di produksi dan nyata di setiap tempat yang
  // mengukur. `application/xml` adalah tipe yang diterima Google untuk sitemap.
  '.xml': 'application/xml; charset=utf-8',
};

/** Check if a port is available */
function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => { tester.close(); resolve(true); })
      .listen(port, '0.0.0.0');
  });
}

/** Find an available port starting from preferred */
async function findPort(start) {
  for (let p = start; p < start + 10; p++) {
    if (await isPortFree(p)) return p;
  }
  return start + 10;
}

const server = http.createServer((req, res) => {
  // ── Proxy Netlify functions to the backend target ──
  if (req.url.startsWith('/.netlify/functions/')) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      // Pick the transport from the target's protocol so BACKEND_TARGET can be a
      // local http:// `netlify dev` as well as an https deploy. Previously this
      // was hardcoded to https.request, which made an http override impossible.
      const targetUrl = new URL(TARGET + req.url);
      const transport = targetUrl.protocol === 'http:' ? http : https;
      const proxyReq = transport.request(targetUrl, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          // Forward authorization header if present
          ...(req.headers.authorization ? { 'Authorization': req.headers.authorization } : {}),
        },
      }, proxyRes => {
        // Add CORS headers so client-side fetch works
        const headers = { ...proxyRes.headers };
        headers['access-control-allow-origin'] = '*';
        headers['access-control-allow-methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
        headers['access-control-allow-headers'] = 'Content-Type, Authorization';
        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', e => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Proxy error: ' + e.message }));
      });
      if (body) proxyReq.write(body);
      proxyReq.end();
    });
    return;
  }

  // ── Handle CORS preflight ──
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  // ── Serve dist files ──
  const urlPath = req.url.split('?')[0].split('#')[0];
  let filePath = path.join(DIST, urlPath === '/' ? 'index.html' : urlPath);

  // Handle directories + missing files
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  } else if (!fs.existsSync(filePath)) {
    // Try /path/index.html for clean URLs (Astro static pages)
    const indexTry = path.join(DIST, urlPath, 'index.html');
    if (fs.existsSync(indexTry)) filePath = indexTry;
    else filePath = path.join(DIST, 'index.html'); // SPA fallback
  }

  // ── A MISSING FILE MUST NOT KILL THE SERVER ──────────────────────────
  // MEASURED 2026-09-27: `astro build` CLEARS `dist/` before it writes the new
  // files, and a request landing in that window used to crash the whole
  // process with an unhandled `ENOENT` from the stream below. It happened
  // twice in one morning — the preview died every time anything rebuilt, and
  // the symptom ("connection refused", `curl` exit 7) looks exactly like the
  // server was never started.
  //
  // The SPA fallback on line 117 makes it worse: it points at
  // `dist/index.html` WITHOUT checking that file exists, so during a build
  // even a perfectly valid URL resolves to a path that is gone.
  //
  // Answer 404 and stay up. `no-store` because the next request should get
  // the freshly built file, not this refusal.
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end('404 — belum ada di dist/. Kalau baru saja ada build berjalan, coba lagi sebentar lagi.\n');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';
  // The icon sprite is the one file under /icons/ that CHANGES without its name
  // changing (every `npm run icons` rewrites it), and it is referenced as
  // `/icons/sprite.svg#id` from the whole app, so the name cannot be versioned.
  // `immutable` tells the browser never to revalidate, which is wrong for it.
  // netlify.toml carries the same exception for production, so local preview
  // and production agree.
  const cacheControl =
    ext === '.html' || urlPath === '/icons/sprite.svg'
      ? 'no-cache'
      : 'public, max-age=31536000, immutable';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
  });

  // The existence check above cannot be atomic with the open: the file can
  // still vanish in between. Without this listener that race is an unhandled
  // 'error' event on the stream, which terminates the process — the same
  // crash by a narrower door.
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    // Headers are already sent, so the only honest move is to cut the
    // response short rather than pretend it completed.
    if (!res.headersSent) res.writeHead(500);
    res.destroy();
  });
  stream.pipe(res);
});

(async () => {
  const port = await findPort(PREFERRED_PORT);
  server.listen(port, '0.0.0.0', () => {
    const url = `http://localhost:${port}`;
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════════╗');
    console.log('  ║  ASJ Portal — Local Preview Server                  ║');
    console.log('  ╚══════════════════════════════════════════════════════╝');
    console.log('');
    console.log('  Local:   ' + url);
    console.log('  API →    ' + TARGET);
    console.log('');
    console.log('  ⚠  JANGAN buka dist/index.html langsung di browser!');
    console.log('     Buka URL di atas agar API & JS bisa jalan.');
    console.log('');
  });
})();
