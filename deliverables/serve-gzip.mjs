/**
 * serve-gzip.mjs — server statis untuk PENGUKURAN, bukan untuk dipakai.
 *
 * KENAPA ADA
 * ----------
 * `server.cjs` mengirim berkas TANPA kompresi. Diukur 2026-11-09:
 *
 *   dist/_astro/admin.<hash>.css   213.342 byte mentah  ->  32.396 gzip
 *   dist/index.html                148.693 byte mentah  ->  27.892 gzip
 *
 * Netlify memampatkan (gzip/brotli). Jadi setiap angka waktu-di-jaringan yang
 * diukur lewat `server.cjs` dilebihkan ~6x untuk aset teks — dan itu terbaca
 * persis seperti "halaman butuh 4,7 detik", yang akan memicu "perbaikan" atas
 * masalah yang tidak ada di produksi. Probe harus mengukur bentuk yang
 * DIKIRIM, bukan bentuk yang ada di disk.
 *
 * Server ini: menyajikan `dist/` dengan gzip untuk tipe teks, dan meneruskan
 * `/.netlify/functions/**` ke `server.cjs` yang sudah hidup (BACKEND), supaya
 * data lowongan tetap nyata dan bukan fixture.
 *
 * Pakai:
 *   PORT=4400 BACKEND=http://localhost:4321 node deliverables/serve-gzip.mjs
 */
import http from 'node:http';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = join(import.meta.dirname, '..', 'dist');
const PORT = Number(process.env.PORT || 4400);
const BACKEND = process.env.BACKEND || 'http://localhost:4321';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};
const COMPRESSIBLE = /^(text\/|application\/(json|manifest\+json|xml)|image\/svg)/;

const gzCache = new Map();

function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const candidates = [
    join(ROOT, clean),
    join(ROOT, clean, 'index.html'),
    join(ROOT, `${clean}.html`),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {}
  }
  return null;
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/.netlify/functions/')) {
    const target = new URL(req.url, BACKEND);
    const up = http.request(
      { hostname: target.hostname, port: target.port, path: target.pathname + target.search, method: req.method, headers: req.headers },
      (r) => {
        res.writeHead(r.statusCode || 502, r.headers);
        r.pipe(res);
      },
    );
    up.on('error', () => {
      res.writeHead(502).end('backend down');
    });
    req.pipe(up);
    return;
  }

  const file = resolveFile(req.url);
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    return;
  }
  const ext = extname(file).toLowerCase();
  const type = TYPES[ext] || 'application/octet-stream';
  const headers = {
    'content-type': type,
    'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  };

  const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (acceptsGzip && COMPRESSIBLE.test(type)) {
    let buf = gzCache.get(file);
    if (!buf) {
      buf = gzipSync(readFileSync(file), { level: 9 });
      gzCache.set(file, buf);
    }
    headers['content-encoding'] = 'gzip';
    headers['content-length'] = buf.length;
    res.writeHead(200, headers).end(buf);
    return;
  }

  headers['content-length'] = statSync(file).size;
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => console.log(`gzip preview: http://localhost:${PORT}  (backend ${BACKEND})`));
