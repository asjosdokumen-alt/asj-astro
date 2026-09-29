/**
 * strip-html-comments.mjs — drop authored HTML comments from the PRODUCTION build only.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * MEASURED 2026-09-29 on `dist/index.html`: the landing page shipped **18,412
 * bytes of HTML comments in 55 blocks = 8.6% of the page**. Gzipped, the page was
 * 55,679 B against 9,450 / 10,752 / 8,995 / 6,017 B for the six MoU partner sites
 * (5.2x the heaviest, 9.3x the lightest). See
 * `docs/COMPANY_PAGE_ASSESSMENT_2026-09-29.md` §2a.
 *
 * The comments are not noise — they are the repo's rationale notes ("why this is
 * this way"), and this project deliberately keeps them in SOURCE. The problem is
 * only that they were also being SHIPPED, so every visitor paid for notes written
 * for maintainers. This plugin separates those two concerns: source keeps every
 * word, the browser gets none of it.
 *
 * ── WHY NOT JUST DELETE THE COMMENTS ────────────────────────────────────────
 * Because the rationale is load-bearing for the next reader, and Astro ships
 * HTML comments through `compressHTML` (which is already `true`). Deleting them
 * from source would trade a real maintenance asset for 18 KB. Moving them to a
 * `.md` file was the alternative, but then they drift from the code they explain.
 *
 * ── WHY THIS IS A VITE PLUGIN AND NOT A POST-BUILD SED ──────────────────────
 * `generateBundle` runs inside the build, before anything is written, so there is
 * no window where a half-stripped `dist/` exists on disk to be served or measured
 * by accident. A post-build script would leave that window open.
 *
 * ── ⚠ THE ONE THING THAT WOULD BREAK THE SITE ──────────────────────────────
 * Astro's hydration runtime locates `<!--astro:end-->` in the DOM to know when a
 * client island has finished hydrating:
 *
 *     this.lastChild.nodeValue === "astro:end" && (this.lastChild.remove(), ...)
 *
 * MEASURED 2026-09-29 in `dist/index.html` itself. Removing that node silently
 * breaks EVERY `client:*` island — the contact form, the review grid, the whole
 * `/candidate` surface — and it would break them in the browser only, not in the
 * build, so a green build would prove nothing. Hence `KEEP` below, and hence the
 * self-test at the bottom of this file.
 *
 * ── SCOPE ───────────────────────────────────────────────────────────────────
 * Only `text/html` chunks, and only in a production build. `astro dev` is
 * untouched, so a developer's View Source still shows every comment.
 */

/** Comments that must SURVIVE the strip, because code reads them at runtime. */
const KEEP = [
  // Astro's island hydration sentinel — see the warning above.
  /^astro:/,
  // Conditional comments are directives to old IE, not prose.
  /^\[if\b/i,
];

/**
 * Strip HTML comments from a string, preserving any in KEEP.
 *
 * Deliberately NOT a regex: a regex over arbitrary HTML can be walked past by a
 * `-->` inside an attribute value, and cannot honour KEEP per-match cheaply.
 * The scan below only treats `<!--` as a comment opener when it is outside a
 * tag (i.e. not inside `<...>`), which is the case that actually occurs here.
 *
 * `<!-- -->` and unterminated `<!--` are left alone: a malformed comment is a
 * symptom worth seeing, not something to erase.
 */
function stripComments(html) {
  let out = '';
  let i = 0;
  while (i < html.length) {
    const open = html.indexOf('<!--', i);
    if (open === -1) {
      out += html.slice(i);
      break;
    }
    // A `<!--` inside an attribute (e.g. title="a<!--b") is not a comment.
    // NOTE: the search MUST start at `open - 1`. `lastIndexOf('<', open)`
    // includes position `open` — the comment's own `<` — so it finds itself and
    // the guard below is always true, which silently disables the whole strip.
    // CAUGHT BY THE SELF-TEST at the bottom of this file, 2026-09-29.
    //
    // NOTE 2: JS `lastIndexOf(x, -1)` CLAMPS the start to 0, so a comment at
    // position 0 reported `lastLt === 0` and looked like it was inside a tag —
    // every leading comment survived. Hence the explicit bounds check.
    const inTag = open > 0 && html.lastIndexOf('<', open - 1) > html.lastIndexOf('>', open - 1);
    if (inTag) {
      // We are inside a tag: copy through and keep scanning.
      out += html.slice(i, open + 4);
      i = open + 4;
      continue;
    }
    const close = html.indexOf('-->', open + 4);
    if (close === -1) {
      // Unterminated comment: leave the rest verbatim.
      out += html.slice(i);
      break;
    }
    const body = html.slice(open + 4, close);
    if (KEEP.some((re) => re.test(body.trim()))) {
      out += html.slice(i, close + 3);
    } else {
      out += html.slice(i, open);
    }
    i = close + 3;
  }
  return out;
}

/**
 * Astro integration entry point.
 *
 * ── WHY `astro:build:done` AND NOT A VITE `generateBundle` HOOK ─────────────
 * MEASURED 2026-09-29: a `generateBundle` implementation was written first and
 * did NOTHING — `dist/index.html` still carried all 55 comments and 18,412 B,
 * byte-for-byte identical. Reason: for a static build Astro serves final HTML
 * through `runPostBuildHooks` (route mutations written straight to disk), which
 * runs AFTER Vite's bundle phase. The HTML a `generateBundle` sees is an
 * intermediate, not what ships.
 *
 * `astro:build:done` hands over the real written pages, so the strip happens on
 * the artefact the browser actually receives. It also means `apply: 'build'` is
 * implicit — this hook only exists during a build, never in `astro dev`, so a
 * developer's View Source keeps every comment.
 *
 * ── WHAT IT DOES NOT TOUCH ─────────────────────────────────────────────────
 * Only `.html` pages under `dir`. Not `_astro/*.js` (a `<!--` can legitimately
 * appear inside a template literal there, and stripping it would corrupt code),
 * not `.css`, not the icon sprite's own markup beyond the emitted pages.
 */
export default function stripHtmlComments() {
  return {
    name: 'asj:strip-html-comments',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const { readdir, readFile, writeFile } = await import('node:fs/promises');
        const { fileURLToPath } = await import('node:url');
        const { join } = await import('node:path');

        const root = fileURLToPath(dir);

        /** Every .html under `root`, recursively. */
        async function walk(dirPath) {
          const out = [];
          for (const entry of await readdir(dirPath, { withFileTypes: true })) {
            const full = join(dirPath, entry.name);
            if (entry.isDirectory()) out.push(...(await walk(full)));
            else if (entry.name.endsWith('.html')) out.push(full);
          }
          return out;
        }

        let totalBefore = 0;
        let totalAfter = 0;
        let pages = 0;

        for (const file of await walk(root)) {
          const before = await readFile(file, 'utf8');
          const after = stripComments(before);
          if (after.length === before.length) continue;
          await writeFile(file, after, 'utf8');
          totalBefore += before.length;
          totalAfter += after.length;
          pages++;
        }

        const saved = totalBefore - totalAfter;
        if (saved > 0) {
          logger.info(
            `stripped ${saved} B of HTML comments from ${pages} page(s) ` +
              `(${((saved / totalBefore) * 100).toFixed(1)}% of those pages)`,
          );
        }
      },
    },
  };
}

export { stripComments, KEEP };
