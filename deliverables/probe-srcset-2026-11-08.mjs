// Probe: which webp paths does a srcset-aware scan find, and which of them are
// currently invisible to scripts/ci/verify-assets.mjs?
// Lives in deliverables/ on purpose: includePath() refuses that directory, so it
// moves no frozen counter (asj-session-rules R13f).
import { readFileSync } from 'node:fs';

const FILES = [
  'src/pages/index.astro',
  'src/components/App.tsx',
  'src/lib/companyProfile.ts',
  'src/components/Footer.astro',
  'src/components/public/LayananSection.astro',
  'src/components/forms/ApplyFullForm.tsx',
  'src/lib/gallery.ts',
];

const CAND = /^\/(?:assets|icons)\/.+\.webp$/;
const found = new Map();

function add(file, url) {
  if (!CAND.test(url)) return;
  if (!found.has(url)) found.set(url, new Set());
  found.get(url).add(file);
}

for (const f of FILES) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bsrcset\s*=\s*["']([^"']*)["']/gi)) {
    for (const c of m[1].split(',')) add(f, c.trim().split(/\s+/)[0]);
  }
  for (const m of src.matchAll(/srcSet:\s*'([^']*)'/g)) {
    for (const c of m[1].split(',')) add(f, c.trim().split(/\s+/)[0]);
  }
}

const key = (u) => (u.startsWith('/icons/') ? `icons/${u.slice('/icons/'.length)}` : u.replace('/assets/', ''));

// What the gate currently sees as published: REF_RE over the four direct sources
// plus `src:` in the gallery block.
const REF_RE = /["'`](\/(?:assets|icons)\/[^"'`\s]+\.webp)["'`]/g;
const DIRECT = [
  'src/pages/index.astro',
  'src/components/App.tsx',
  'src/lib/companyProfile.ts',
  'src/components/Footer.astro',
];
const current = new Set();
for (const f of DIRECT) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(REF_RE)) current.add(key(m[1]));
}
const g = readFileSync('src/lib/gallery.ts', 'utf8');
for (const m of g.matchAll(/src:\s*'(\/assets\/[^']+)'/g)) current.add(key(m[1]));

const rows = [...found.entries()].sort(([a], [b]) => a.localeCompare(b));
console.log(`srcset candidates: ${rows.length}`);
for (const [url, files] of rows) {
  const k = key(url);
  console.log(`${current.has(k) ? '  seen ' : '  NEW  '} ${k}   <- ${[...files].join(', ')}`);
}
