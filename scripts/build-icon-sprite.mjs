/**
 * build-icon-sprite.mjs — Generate a subset SVG sprite from Font Awesome
 *
 * WHY
 * ---
 * The app loaded the full Font Awesome 6.5.1 CSS from cdnjs (~110 KB of
 * CSS + 2 webfont files, render-blocking) to use ~150 glyphs. This walks
 * `src/`, finds every `fa-*` token actually referenced, and emits an
 * inlineable sprite containing only those glyphs.
 *
 * NOTES
 * -----
 * - FA6 renamed several icons (e.g. `times` -> `xmark`). The old names
 *   survive as *aliases* in `icon[2]`, so we resolve both. The emitted
 *   <symbol> id keeps the ORIGINAL class name, so `<Icon name="times" />`
 *   works and no call site has to change.
 * - Brand icons (whatsapp, instagram, tiktok) come from the brands
 *   package and get a `fab-` prefixed id. `Icon` no longer guesses the
 *   prefix — it reads the emitted manifest (see below), so a name that
 *   only exists as a brand resolves correctly from a plain
 *   `<Icon name="whatsapp" />`.
 * - Modifiers (fa-spin, fa-2x, fa-fw, ...) are not glyphs and are skipped.
 *
 * OUTPUTS
 * -------
 * - src/icons/sprite.svg     — the <symbol> sheet, inlined by BaseLayout
 * - src/icons/sprite-map.ts  — name -> symbol id, consumed by ui/Icon.tsx
 *
 * NAMES FOUND STATICALLY
 * ----------------------
 * Icon names reach the sprite through four shapes, all of which are
 * scanned. Anything else (a name computed at runtime from data we cannot
 * see) must be listed in EXTRA_NAMES.
 *   1. `fa-foo`              — legacy classes and `icon: 'fa-foo'` data
 *   2. `name="foo"`          — static <Icon> usage
 *   3. `name={ a ? 'x' : 'y' }` — every string literal inside the braces
 *   4. `icon: 'foo'`         — data arrays written without the fa- prefix
 *   5. `href="#fas-foo"`     — raw <use> written by hand inside HTML strings
 *      (RirekishoBuilder builds markup with innerHTML, where no component
 *      can be used, so its icons are literal <svg><use href="#…"/>),
 *   6. `icon="foo"`          — a wrapper component that forwards the name to
 *      <Icon>; the literal sits on the call site, not next to the <Icon>.
 *
 * USAGE:  npm run icons
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const solid = require('@fortawesome/free-solid-svg-icons');
const brands = require('@fortawesome/free-brands-svg-icons');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const OUT = join(SRC, 'icons', 'sprite.svg');
const MAP_OUT = join(SRC, 'icons', 'sprite-map.ts');

/**
 * Glyphs referenced only through a runtime value we cannot read statically.
 * Add an entry here (with a comment saying where it comes from) rather than
 * shipping a silently blank icon.
 */
const EXTRA_NAMES = [
  // <Icon name={tab.icon} /> in AdminPanel — values live in the TABS array
  // and are picked up as `fa-*` literals, listed here only as a safety net.
];

/** Non-glyph Font Awesome modifier classes. */
const MODIFIERS = new Set([
  'spin', 'pulse', 'beat', 'fade', 'beat-fade', 'bounce', 'shake', 'flip',
  'fw', 'border', 'inverse', 'li', 'ul', 'stack', 'stack-1x', 'stack-2x',
  'pull-left', 'pull-right', 'solid', 'regular', 'brands', 'light', 'thin',
  'duotone', '2xs', 'xs', 'sm', 'lg', 'xl', '2xl', '3xl',
  '1x', '2x', '3x', '4x', '5x', '6x', '7x', '8x', '9x', '10x',
]);
/** e.g. fa-rotate-90, fa-flip-horizontal, fa-stack-2x */
const MODIFIER_PREFIXES = ['rotate-', 'flip-', 'stack-'];

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(tsx|ts|astro|js|mjs|cjs)$/.test(entry)) acc.push(full);
  }
  return acc;
}

/* ── 1. Collect referenced tokens ─────────────────────────────────── */
const used = new Map(); // name -> occurrences

function add(raw) {
  if (!raw) return;
  // Callers hand us both `fa-globe` (data arrays, legacy classes) and bare
  // `globe` (<Icon name=…>); normalise to the bare form once, here.
  const name = raw.replace(/^fa[bsrl]?(-|$)/, '').replace(/^-/, '');
  if (!name) return;
  if (MODIFIERS.has(name)) return;
  if (MODIFIER_PREFIXES.some((p) => name.startsWith(p))) return;
  used.set(name, (used.get(name) ?? 0) + 1);
}

/** Every string literal inside a JSX expression container, e.g. { a ? 'x' : 'y' }. */
function literalsInBraces(expr) {
  return [...expr.matchAll(/(['"`])([a-z0-9][a-z0-9-]*)\1/g)].map((m) => m[2]);
}

/**
 * Body of every `name={ … }` on an <Icon>, brace-matched so ternaries and
 * nested calls are captured whole.
 */
function iconNameExpressions(text) {
  const out = [];
  const re = /<Icon\b[^>]*?\bname=\{(?=[\s\S]*?\/>)/g;
  let m;
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

for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');

  // 1. legacy classes and `icon: 'fa-foo'` data arrays
  for (const m of text.matchAll(/\bfa-([a-z0-9][a-z0-9-]*)/g)) add(m[1]);

  // 1b. Hyperscript calls: h(Icon, { name: "foo", ... }) — object-literal
  //     prop (UndanganKelasModal & legacy-style modals without JSX). Scoped
  //     to an `Icon, { name:` pair so data objects with `name:` keys are not
  //     mis-collected.
  for (const m of text.matchAll(/\bIcon\s*,\s*\{\s*name:\s*(?:"([^"]*)"|'([^']*)')/g)) {
    add((m[1] ?? m[2]).trim());
  }

  // 2. <Icon name="foo" />
  for (const m of text.matchAll(/<Icon\b[^>]*?\bname=(?:"([^"]*)"|'([^']*)')/g)) {
    add((m[1] ?? m[2]).trim());
  }

  // 3. <Icon name={ a ? 'x' : 'y' } /> — every literal inside the braces
  for (const expr of iconNameExpressions(text)) {
    for (const lit of literalsInBraces(expr)) add(lit);
  }

  // 4. data arrays written without the fa- prefix
  for (const m of text.matchAll(/\bicon:\s*['"]([a-z0-9][a-z0-9-]*)['"]/g)) add(m[1]);

  // 5. hand-written <use href="#fas-foo" /> inside HTML strings.
  //    The optional backslashes cover `href=\"#fas-foo\"`, i.e. markup that
  //    lives inside a JS string literal.
  for (const m of text.matchAll(/href=(?:\\{1,2})?["'`]#fa[bsrl]-([a-z0-9][a-z0-9-]*)/g)) {
    add(m[1]);
  }

  // 6. `icon="foo"` — a wrapper component that forwards the name to <Icon>,
  //    e.g. PemberkasanModal's `Panel({ icon })` → `<Icon name={icon} />`.
  //    The literal lives on the CALLER, so rules 1-5 never see it and the
  //    glyph was silently dropped: `plane-departure` vanished from the sprite
  //    and rendered as a blank space. Guarded to attributes whose name is
  //    `icon`, which is the convention these wrappers use.
  for (const m of text.matchAll(/\bicon=["']([a-z0-9][a-z0-9-]*)["']/g)) add(m[1]);
}

for (const name of EXTRA_NAMES) add(name);

/* ── 2. Index FA exports by canonical name AND alias ──────────────── */
function indexPack(pack) {
  const byName = new Map();
  const byAlias = new Map();
  for (const key of Object.keys(pack)) {
    if (!key.startsWith('fa')) continue;
    const def = pack[key];
    if (!def?.icon) continue;
    const [width, height, aliases] = def.icon;
    const path = def.icon[4];
    const rec = { width, height, path, canonical: def.iconName, prefix: def.prefix };
    if (def.iconName && !byName.has(def.iconName)) byName.set(def.iconName, rec);
    for (const a of aliases ?? []) {
      if (!byAlias.has(a)) byAlias.set(a, rec);
    }
  }
  return { byName, byAlias };
}

const SOLID = indexPack(solid);
const BRANDS = indexPack(brands);

/* ── 3. Resolve every used name ───────────────────────────────────── */
const resolved = [];
const missing = [];

for (const [name, count] of [...used].sort((a, b) => b[1] - a[1])) {
  // Solid first (most icons), then brands. Canonical name beats alias.
  let rec = SOLID.byName.get(name) ?? BRANDS.byName.get(name);
  let prefix = rec?.prefix;
  if (!rec) {
    const aliasRec = SOLID.byAlias.get(name) ?? BRANDS.byAlias.get(name);
    if (aliasRec) { rec = aliasRec; prefix = aliasRec.prefix; }
  }
  if (!rec) { missing.push(name); continue; }

  resolved.push({
    name,
    id: `${prefix}-${name}`,
    viewBox: `0 0 ${rec.width} ${rec.height}`,
    path: rec.path,
    canonical: rec.canonical,
    count,
  });
}

/* ── 4. Emit sprite ───────────────────────────────────────────────── */
const symbols = resolved
  .map(
    (r) =>
      `  <symbol id="${r.id}" viewBox="${r.viewBox}">\n` +
      `    <path d="${r.path}" />\n` +
      `  </symbol>`
  )
  .join('\n');

const svg =
  `<!--\n` +
  `  AUTO-GENERATED by scripts/build-icon-sprite.mjs — do not edit by hand.\n` +
  `  ${resolved.length} glyphs subsetted from Font Awesome Free 6.5.1.\n` +
  `  Regenerate with:  npm run icons\n` +
  `-->\n` +
  `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true" focusable="false">\n` +
  `<defs>\n${symbols}\n</defs>\n` +
  `</svg>\n`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg, 'utf8');

/* ── 4b. Emit the name -> id manifest ─────────────────────────────────
   Icon.tsx reads this instead of guessing a `fas-` prefix. Without it,
   a name that only exists in the brands pack (whatsapp, instagram,
   tiktok) would resolve to `#fas-whatsapp`, which is not in the sheet,
   and <use> would render nothing at all.                              */
const mapEntries = resolved
  .map((r) => `  ${JSON.stringify(r.name)}: ${JSON.stringify(r.id)},`)
  .join('\n');

const map =
  `// AUTO-GENERATED by scripts/build-icon-sprite.mjs — do not edit by hand.\n` +
  `// Regenerate with:  npm run icons\n` +
  `\n` +
  `/**\n` +
  ` * Bare icon name -> sprite symbol id.\n` +
  ` *\n` +
  ` * The prefix is part of the value on purpose: ` +
  `brand glyphs (${resolved
    .filter((r) => r.id.startsWith('fab-'))
    .map((r) => r.name)
    .join(', ') || 'none'}) live under \`fab-\`, everything else under \`fas-\`.\n` +
  ` */\n` +
  `export const SPRITE_IDS: Record<string, string> = {\n${mapEntries}\n};\n`;

writeFileSync(MAP_OUT, map, 'utf8');

/* ── 5. Report ────────────────────────────────────────────────────── */
const bytes = Buffer.byteLength(svg, 'utf8');
const { gzipSync } = await import('node:zlib');
const gz = gzipSync(Buffer.from(svg, 'utf8')).length;

console.log(`✓ ${resolved.length} glyphs → src/icons/sprite.svg`);
console.log(`  raw ${(bytes / 1024).toFixed(1)} KB · gzipped ${(gz / 1024).toFixed(1)} KB`);
console.log(`  (was ~110 KB CSS + 2 webfonts from cdnjs, render-blocking)`);
console.log(`✓ name→id manifest → src/icons/sprite-map.ts`);

/* ── 6. Post-check: every hand-written <use href="#faX-…"> must exist ─
   The scan in step 1 is what decides the sprite's contents, so a reference
   it misses produces a silently blank icon. This asserts the other way
   round: read every #faX-… out of the source and demand a symbol for it. */
const emitted = new Set(resolved.map((r) => r.id));
const dangling = new Map(); // id -> first file referencing it
for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/href=(?:\\{1,2})?["'`]#(fa[bsrl]-[a-z0-9][a-z0-9-]*)/g)) {
    if (!emitted.has(m[1]) && !dangling.has(m[1])) dangling.set(m[1], file);
  }
}

if (dangling.size) {
  console.log(`\n⚠ ${dangling.size} <use href="#…"> reference(s) with no symbol:`);
  for (const [id, file] of dangling) {
    console.log(`   #${id}  (${file.replace(ROOT, 'src')})`);
  }
  console.log(`\n  Add the name to EXTRA_NAMES, or make it discoverable.`);
  process.exitCode = 1;
}

if (missing.length) {
  console.log(`\n⚠ ${missing.length} token(s) could NOT be resolved to a glyph:`);
  for (const m of missing) console.log(`   fa-${m}`);
  console.log(`\n  Either fix the class name or add the icon manually.`);
  process.exitCode = 1;
}
