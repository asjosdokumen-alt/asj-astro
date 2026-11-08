// Probe v2: broad substring match. v1 required href/navigateTo and produced
// FALSE ORPHANS (/tes-iq is opened via bukaTes(), /share via a template string).
// A probe that cannot see a reference reports a clean result — the exact trap
// the asset gate documented. This version counts any occurrence in any non-test
// source file, then prints the files so a human can judge.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src', 'netlify'];
const ROUTES = [
  '/admin', '/ai-cv', '/apply', '/arcade', '/candidate', '/kotoba', '/loker',
  '/master', '/matematika', '/public', '/share', '/siswa-baru',
  '/tes-iq', '/tes-mata', '/tes-mbti', '/wawancara',
];

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      walk(p, out);
    } else if (/\.(ts|tsx|astro|mjs|js)$/.test(e.name)) out.push(p.replace(/\\/g, '/'));
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r)).filter((f) => !/\.test\.(ts|tsx)$/.test(f));

for (const route of ROUTES) {
  const hits = files.filter((f) => {
    if (f === `src/pages${route}.astro`) return false;
    return readFileSync(f, 'utf8').includes(route);
  });
  console.log(`${hits.length === 0 ? 'ORPHAN' : '      '} ${route.padEnd(14)} ${hits.slice(0, 5).join(', ')}`);
}
