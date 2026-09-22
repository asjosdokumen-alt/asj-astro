/**
 * Icon.test.ts — guards the SVG sprite against silent drift
 *
 * WHY THIS EXISTS
 * ---------------
 * `src/icons/sprite.svg` is a *subset* built by `npm run icons`, which has to
 * guess which glyphs are reachable. When it guesses wrong the failure mode is
 * the worst possible one: `<use href="#fas-print">` simply renders nothing.
 * No error, no 404, just a blank space where an icon should be. It happened
 * once — RirekishoBuilder writes markup as an HTML string, so its icon was
 * invisible to the scanner.
 *
 * These tests assert the other way round. Instead of trusting the scanner,
 * they read every icon reference out of the source and demand a symbol for
 * it. They need no Font Awesome packages, so they run anywhere `npm test` does.
 *
 * If one of these fails: run `npm run icons`, then commit the regenerated
 * `sprite.svg` + `sprite-map.ts`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPRITE_IDS } from '../../icons/sprite-map';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Files holding real icon usage — the sprite itself and this test are not. */
const SKIP = /(\\?\/)?(icons[\/\\]|Icon\.test\.ts$)/;

function sourceFiles(dir: string = SRC, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.(tsx|ts|astro|mjs)$/.test(entry) && !SKIP.test(full.slice(SRC.length))) {
      acc.push(full);
    }
  }
  return acc;
}

/** Body of every `name={ … }` on an <Icon>, brace-matched so ternaries work. */
function iconNameExpressions(text: string): string[] {
  const out: string[] = [];
  const re = /<Icon\b[^>]*?\bname=\{(?=[\s\S]*?\/>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let i = m.index + m[0].length;
    let depth = 1;
    const start = i;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      if (depth > 0) i++;
    }
    out.push(text.slice(start, i));
    re.lastIndex = i;
  }
  return out;
}

function literals(text: string): string[] {
  return [...text.matchAll(/(['"`])([a-z0-9][a-z0-9-]*)\1/g)].map((m) => m[2]);
}

describe('icon sprite', () => {
  const files = sourceFiles();
  const ids = new Set(Object.values(SPRITE_IDS));

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('resolves every hand-written <use href="#faX-…"> reference', () => {
    const dangling: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      // Covers both `href="#fas-x"` and markup escaped inside a JS string,
      // i.e. `href=\"#fas-x\"`.
      for (const m of text.matchAll(/href=(?:\\{1,2})?["'`]#(fa[bsrl]-[a-z0-9][a-z0-9-]*)/g)) {
        if (!ids.has(m[1])) dangling.push(`${m[1]}  (${relative(SRC, file)})`);
      }
    }
    expect(dangling, `run: npm run icons\n${dangling.join('\n')}`).toEqual([]);
  });

  it('resolves every static <Icon name="…">', () => {
    const unknown = new Set<string>();
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const tag of text.match(/<Icon\b[^>]*?\/?>/g) ?? []) {
        const m = tag.match(/\bname=(?:"([^"]*)"|'([^']*)')/);
        if (!m) continue;
        const bare = (m[1] ?? m[2]).replace(/^fa[bsrl]?-/, '');
        if (!SPRITE_IDS[bare]) unknown.add(`${bare}  (${relative(SRC, file)})`);
      }
    }
    expect([...unknown], `run: npm run icons\n${[...unknown].join('\n')}`).toEqual([]);
  });

  it('resolves icon names that are computed rather than written inline', () => {
    // `name={ done ? 'check-circle' : 'circle' }` and `icon: 'fa-globe'`
    // data arrays — neither is a plain name="…" attribute.
    const unknown = new Set<string>();
    for (const file of files) {
      const text = readFileSync(file, 'utf8');

      for (const expr of iconNameExpressions(text)) {
        for (const lit of literals(expr)) {
          const bare = lit.replace(/^fa[bsrl]?-/, '');
          if (bare && !SPRITE_IDS[bare]) unknown.add(`${bare}  (${relative(SRC, file)})`);
        }
      }

      for (const m of text.matchAll(/\bicon:\s*['"]((?:fa[bsrl]?-)?[a-z0-9][a-z0-9-]*)['"]/g)) {
        const bare = m[1].replace(/^fa[bsrl]?-/, '');
        if (bare && !SPRITE_IDS[bare]) unknown.add(`${bare}  (${relative(SRC, file)})`);
      }
    }
    expect([...unknown], `run: npm run icons\n${[...unknown].join('\n')}`).toEqual([]);
  });

  it('resolves icon names passed as an `icon="…"` attribute to a wrapper', () => {
    // A wrapper component forwards the name — PemberkasanModal's
    // `Panel({ icon })` renders `<Icon name={icon} />` — so the literal sits on
    // the CALL SITE and none of the other scans see it. The generator used to
    // miss it and dropped `plane-departure` from the sprite, which renders as a
    // blank space with no error. Asserted here so the scan rule cannot be
    // removed without this failing.
    const unknown = new Set<string>();
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\bicon=["']((?:fa[bsrl]-)?[a-z0-9][a-z0-9-]*)["']/g)) {
        const bare = m[1].replace(/^fa[bsrl]?-/, '');
        if (bare && !SPRITE_IDS[bare]) unknown.add(`${bare}  (${relative(SRC, file)})`);
      }
    }
    expect([...unknown], `run: npm run icons\n${[...unknown].join('\n')}`).toEqual([]);
  });

  it('maps brand glyphs to the fab- prefix', () => {
    // A brand written without a `brand` prop used to resolve to
    // `#fas-whatsapp`, which is not in the sheet. The manifest prevents that.
    expect(SPRITE_IDS['whatsapp']).toBe('fab-whatsapp');
    expect(SPRITE_IDS['instagram']).toBe('fab-instagram');
    expect(SPRITE_IDS['tiktok']).toBe('fab-tiktok');
  });
});
