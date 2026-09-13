const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const net = require('net');

const PREFERRED_PORT = 4321;
const DIST = path.join(__dirname, 'dist');
// Backend target for the / .netlify/functions/ proxy.
//
// This is the ASTRO site (asjastro), not asjportal. `asjportal.netlify.app`
// runs the LEGACY app (/assets/app-*.js, /vendor/xlsx) and 404s on /public/,
// /candidate/, /apply/, /ai-cv/ and /master/ — so proxying there silently
// compared this build against a different application.
//
// Override with BACKEND_TARGET when pointing at a preview deploy or a local
// `netlify dev` (e.g. BACKEND_TARGET=http://127.0.0.1:8888 node server.cjs).
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
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
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

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';
  const cacheControl = ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
  });
  fs.createReadStream(filePath).pipe(res);
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
