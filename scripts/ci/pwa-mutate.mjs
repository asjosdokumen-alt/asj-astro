// pwa-mutate.mjs — apply ONE named mutation to the PWA gate's inputs.
//
// Ship-with-the-battery helper, NOT scratch space. Named without a `.tmp-`
// prefix on purpose: `.gitignore` line 81 is a catch-all (`.tmp-*`) and would
// exclude it, so a fresh checkout would abort with MODULE_NOT_FOUND.
//
// WHY A FILE
// ----------
// The mutations below rewrite BUILD OUTPUT (dist/sw.js) and the manifest. The
// first draft embedded each one as `node -e "..."` inside the shell battery, and
// the escaping went wrong immediately: the backslash case produced a DOUBLE
// backslash, so it exercised an escaped backslash rather than the real defect.
// That is the same failure the aliases battery hit — a mutation that does not
// test what its label claims. Code on disk removes shell + Node + regex escaping
// from the same expression.
//
// Every mutation asserts its own replacement LANDED (comparing before/after) and
// exits 3 if it did not, so the battery aborts instead of reporting a verdict on
// a mutation that never applied.
//
// USAGE  node scripts/ci/pwa-mutate.mjs <case>
// EXIT   0 applied · 2 bad usage · 3 the replacement did not apply

import fs from 'node:fs';

const SW = 'dist/sw.js';
const MF = 'public/manifest.webmanifest';
const LAYOUT = 'src/layouts/BaseLayout.astro';

const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, s) => fs.writeFileSync(p, s);
const BS = String.fromCharCode(92);

/** Apply `fn` to a file, refusing to continue if nothing changed. */
function mutate(path, fn) {
  const before = read(path);
  const after = fn(before);
  if (after === before) {
    console.error(`MUTATION NO-OP on ${path} — the replacement did not apply.`);
    process.exit(3);
  }
  write(path, after);
}

const cases = {
  // A bare string literal where an array element belongs — the actual shipping
  // bug: a syntax error that would have deployed a dead service worker.
  syntax: () =>
    mutate(SW, (s) =>
      s.replace(/const VERSION = '[^']*';/, "const VERSION = 'x';\n  '/broken/entry',"),
    ),

  // A service worker that caches nothing: installs fine, offline does not work.
  'empty-precache': () =>
    mutate(SW, (s) =>
      s.replace(/const PRECACHE = \[[\s\S]*?\r?\n\];/, 'const PRECACHE = [\n// PRECACHE_START\n];'),
    ),

  // A generator that interpolated path.join() output: '\_astro\x.js' resolves
  // nowhere. Built with fromCharCode so the count of backslashes is not decided
  // by two layers of shell/Node escaping.
  backslash: () =>
    mutate(SW, (s) =>
      s.replace('const PRECACHE = [', `const PRECACHE = [\n  "${BS}_astro${BS}broken.js",`),
    ),

  // 'asj-astro-dev' means the build step did not rewrite the constant, so cached
  // clients never see an update — the worker's identity never changes.
  'dev-version': () =>
    mutate(SW, (s) => s.replace(/const VERSION = '[^']*';/, "const VERSION = 'asj-astro-dev';")),

  // The original regression: the manifest pointed into Supabase Storage, so an
  // unreachable bucket meant no icon and an un-installable PWA.
  'remote-icon': () =>
    mutate(MF, (s) => {
      const m = JSON.parse(s);
      m.icons[0].src = 'https://example.supabase.co/storage/v1/object/public/asj/icon-192.png';
      return `${JSON.stringify(m, null, 2)}\n`;
    }),

  // A declared icon that is not on disk.
  'missing-icon': () =>
    mutate(MF, (s) => {
      const m = JSON.parse(s);
      m.icons[0].src = '/icons/definitely-not-there.png';
      return `${JSON.stringify(m, null, 2)}\n`;
    }),

  // NOT a defect: a remote URL that is not an icon href. The gate scopes its
  // check to rel=icon/apple-touch-icon and to manifest icons[].src; a canonical
  // link is legitimate and must stay green. A gate that flagged any http://
  // would be wrong and would be switched off.
  'remote-canonical': () =>
    mutate(LAYOUT, (s) =>
      s.replace(
        '<head>',
        '<head>\n    <link rel="canonical" href="https://asj.example.org/" />',
      ),
    ),
};

const which = process.argv[2];
if (!which || !Object.hasOwn(cases, which)) {
  console.error(`usage: node scripts/ci/pwa-mutate.mjs <${Object.keys(cases).join('|')}>`);
  process.exit(2);
}
cases[which]();
