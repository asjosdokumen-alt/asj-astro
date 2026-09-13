const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const mimeTypes = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.webp':'image/webp','.webmanifest':'application/manifest+json'};
const dist = path.join(__dirname, 'dist');
// See server.cjs for why this is the Astro site and not asjportal (legacy).
const PROXY_TARGET = process.env.BACKEND_TARGET || 'https://asjastro.netlify.app';

function serveFile(res, fp) {
  const ext = path.extname(fp);
  res.writeHead(200, {'Content-Type': mimeTypes[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache'});
  fs.createReadStream(fp).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/.netlify/functions/')) {
    const target = new URL(PROXY_TARGET + req.url);
    const transport = target.protocol === 'http:' ? http : https;
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      // `host` is derived from the target instead of being pinned to the legacy
      // hostname: a pinned host makes the backend answer for the wrong site.
      const proxyReq = transport.request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, proxyRes => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', (e) => { res.writeHead(502); res.end('Proxy error: ' + e.message); });
      if (body) proxyReq.write(body);
      proxyReq.end();
    });
    return;
  }
  const urlPath = req.url.split('?')[0].split('#')[0];
  let fp = path.join(dist, urlPath === '/' ? 'index.html' : urlPath);
  // If file exists, serve it
  if (fs.existsSync(fp) && fs.statSync(fp).isFile()) { serveFile(res, fp); return; }
  // Try index.html inside directory
  const dirIdx = path.join(fp, 'index.html');
  if (fs.existsSync(dirIdx)) { serveFile(res, dirIdx); return; }
  // SPA fallback
  const fallback = path.join(dist, 'index.html');
  if (fs.existsSync(fallback)) { serveFile(res, fallback); return; }
  res.writeHead(404); res.end('Not found');
});
server.listen(4321, () => console.log('Serving + proxying on http://localhost:4321'));
