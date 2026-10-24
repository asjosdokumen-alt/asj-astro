/**
 * TESTS: sitemap.xml dan robots.txt tidak boleh saling bertentangan.
 *
 * MASALAH YANG DIKUNCI (terukur 2026-10-23)
 *   `aa8fa40` menambahkan sitemap yang mendaftarkan sembilan URL, sementara
 *   `public/robots.txt` masih memblokir empat di antaranya (`/apply`, `/ai-cv`,
 *   `/siswa-baru`, `/master`). Untuk URL yang diiklankan di sitemap lalu
 *   diblokir di robots, Google TIDAK mengindeksnya dan melaporkannya sebagai
 *   "Blocked by robots.txt" — jadi seluruh kerja "thin content" di commit itu
 *   tidak sampai ke index, dan tidak ada satu pun gate yang bisa melihatnya:
 *   sitemap tidak punya tes, robots hanya punya tes "file-nya ada".
 *
 * KENAPA DI `e2e/`
 *   Murni membaca dua berkas sebagai teks (node:fs), tanpa DOM — jadi milik
 *   project 'backend'. Tinggal di e2e/ HANYA karena counter beku `indexer`
 *   menghitung `src/**`; `.ts` di tier e2e tidak dihitung (R15). Wajib juga
 *   terdaftar di `exclude` project frontend `vitest.config.ts`, kalau tidak ia
 *   jalan DUA KALI (R13f-bis).
 *
 * `dist/sitemap.xml` dibaca, bukan `src/pages/sitemap.xml.ts`: yang menentukan
 * apa yang dilihat crawler adalah artefak build-nya. Kalau `dist/` belum ada,
 * suite ini di-SKIP, bukan lulus diam-diam.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SITEMAP = join(ROOT, 'dist', 'sitemap.xml');
const ROBOTS = join(ROOT, 'public', 'robots.txt');
const hasBuild = existsSync(SITEMAP);

/** Path yang dilarang robots.txt, sudah dinormalisasi tanpa slash akhir. */
function disallowed(): string[] {
  return readFileSync(ROBOTS, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^Disallow:/i.test(l))
    .map((l) => l.replace(/^Disallow:\s*/i, '').trim())
    .filter(Boolean)
    .map((p) => (p.length > 1 ? p.replace(/\/+$/, '') : p));
}

/** Path dari setiap <loc> di sitemap. */
function sitemapPaths(): string[] {
  return [...readFileSync(SITEMAP, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].trim())
    .map((u) => new URL(u).pathname)
    .map((p) => (p.length > 1 ? p.replace(/\/+$/, '') : p));
}

describe.skipIf(!hasBuild)('sitemap.xml vs robots.txt', () => {
  it('tidak ada URL di sitemap yang diblokir robots.txt', () => {
    // Cocokkan sebagai PREFIX, karena `Disallow: /apply` juga memblokir
    // `/apply/` dan `/apply/apa-saja` — persis perilaku crawler.
    const blocked = disallowed();
    const offenders = sitemapPaths().filter((p) => blocked.some((b) => p === b || p.startsWith(`${b}/`)));
    expect(offenders, [
      'URL berikut didaftarkan di sitemap.xml tapi DIBLOKIR public/robots.txt.',
      'Google tidak akan mengindeksnya dan melaporkannya sebagai',
      '"Blocked by robots.txt". Pilih satu: keluarkan dari sitemap, atau',
      'hapus baris Disallow-nya.',
      '',
      ...offenders.map((p) => `  - ${p}`),
    ].join('\n')).toEqual([]);
  });

  it('/master tetap keluar dari sitemap (form data kandidat, bukan halaman)', () => {
    // Kasus konkret yang memicu gate ini: `/master` didaftarkan di sitemap
    // sementara robots memblokirnya. Halaman itu form entri data dengan nol
    // copy unik, jadi jawabannya "keluarkan dari sitemap", bukan "buka blokir".
    expect(sitemapPaths()).not.toContain('/master');
  });

  it('setiap <loc> absolut dan memakai satu origin yang sama', () => {
    // Sitemap menebak host kalau origin tidak diketahui; satu origin yang
    // konsisten adalah cara termurah mendeteksi tebakan yang berubah-ubah.
    const locs = [...readFileSync(SITEMAP, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(0);
    const origins = new Set(locs.map((u) => new URL(u).origin));
    expect(origins.size, `origin bercampur: ${[...origins].join(', ')}`).toBe(1);
  });

  it('setiap <loc> adalah URL FINAL — berakhiran slash, dan cocok dengan canonical bila ada', () => {
    // MEASURED 2026-10-24 di host live: TUJUH dari delapan <loc> menjawab 301.
    // Sitemap mengirim bentuk tanpa slash (`/loker`), sementara Netlify melayani
    // `/loker/` dan canonical halaman memakai bentuk berslash. Google mencatatnya
    // sebagai "Page with redirect", bukan "Indexed" — sitemap yang seluruh isinya
    // dialihkan adalah cara paling lambat meminta crawl.
    //
    // Tiga hal diuji bersamaan:
    //   1. <loc> berakhiran slash (kecuali root) — inilah bentuk yang dilayani;
    //   2. berkas halamannya benar-benar ada di dist/ (URL tidak menebak);
    //   3. KALAU halaman itu punya canonical, nilainya harus sama persis.
    //
    // Kenapa (3) kondisional: `siteOrigin()` mengembalikan null kalau tidak ada
    // PUBLIC_SITE_URL maupun URL Netlify, dan BaseLayout memang TIDAK menebak —
    // jadi build lokal tanpa env tidak punya <link rel="canonical"> sama sekali
    // (terukur: 0 di dist/index.html). Di Netlify `URL` selalu ada, jadi di sana
    // (3) yang menahan; di sini (1) dan (2).
    const locs = [...readFileSync(SITEMAP, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const problems: string[] = [];
    let compared = 0;
    for (const loc of locs) {
      const path = new URL(loc).pathname;
      if (path !== '/' && !path.endsWith('/')) {
        problems.push(`${loc} → bukan bentuk yang dilayani (tanpa slash ⇒ 301)`);
        continue;
      }
      const rel = path === '/' ? 'index.html' : join(path, 'index.html');
      const file = join(ROOT, 'dist', rel);
      if (!existsSync(file)) {
        problems.push(`${loc} → tidak ada dist/${rel.replace(/\\/g, '/')}`);
        continue;
      }
      const canon = readFileSync(file, 'utf8').match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      if (!canon) continue;
      compared++;
      if (canon !== loc) problems.push(`${loc} → canonical halaman: ${canon}`);
    }
    expect(problems, [
      'Sitemap mendaftarkan URL yang bukan URL final (atau bukan halaman yang sama).',
      'Setiap <loc> harus berbentuk berslash dan — bila halaman mendeklarasikannya —',
      'sama persis dengan canonical-nya, kalau tidak Google melihatnya sebagai redirect.',
      '',
      ...problems.map((p) => `  - ${p}`),
    ].join('\n')).toEqual([]);
    // Kalau build-nya punya origin, (3) harus benar-benar membandingkan sesuatu.
    // Angka ini menjaga gate dari keadaan "hijau karena tidak ada yang diperiksa".
    if (process.env.PUBLIC_SITE_URL || process.env.URL) {
      expect(compared, 'build punya origin tapi tidak ada canonical yang dibandingkan').toBe(locs.length);
    }
  });

  it('robots.txt masih mendeklarasikan User-agent dan tidak mengosongkan Allow', () => {
    const text = readFileSync(ROBOTS, 'utf8');
    expect(text).toMatch(/^User-agent:\s*\*/m);
    expect(text).toMatch(/^Allow:\s*\/$/m);
  });
});
