/**
 * shim-coverage.mjs — every alpha'd `bg-*` utility used in src/ is ACCOUNTED FOR.
 *
 * THE DEFECT CLASS THIS CLOSES
 *   The light theme is kept alive by a hand-written allow-list of
 *   `:where([data-theme="light"]) .<class> { … }` rules in global.css. The shim
 *   matches on the CLASS STRING, so any utility nobody typed keeps its DARK value
 *   while §5b flips the text inside it to near-black. That produces text and
 *   surface in the same value range — "the data isn't showing up".
 *
 *   Measured cost of the class, 2026-10-02/03:
 *     · AdminShareModal doc chips      bg-slate-950/60  2.84:1  (11px/700, floor 4.5)
 *     · CandidateProfileModal ID pill  bg-sky-600/30    3.65:1
 *     · CandidateProfileModal status   bg-slate-600/50  3.70:1
 *   Fourteen instances were found by hand; three were real failures. A class that
 *   has produced three defects across fourteen instances is worth a gate.
 *
 * WHAT THIS GATE ASSERTS — AND WHAT IT DOES NOT
 *   It asserts ACCOUNTING, not contrast. A class must be either
 *     (a) present in the light shim, or
 *     (b) listed in ALLOWED below with a reason that survives review.
 *   Nothing more. In particular this gate CANNOT see:
 *     · a class that IS shimmed to a value that still fails contrast;
 *     · a class that is unshimmed and passes anyway (a 10 % tint over a light
 *       panel is within ~2 % of the page colour — four such classes measured
 *       4.61–5.75:1 and are allow-listed, not fixed);
 *     · anything outside `src/` — netlify/functions and e2e are not scanned,
 *       because the shim only governs the client bundle;
 *     · a background set from an inline `style=` or a CSS custom property.
 *   The contrast verdict itself needs a rendered pixel — see
 *   `deliverables/gstack/light-theme-shim-audit-2026-10-02.md` and the probes in
 *   `F:/tmp/ui-probe/`. Do not read "shim-coverage passed" as "the contrast is
 *   right"; it means "every surface has been considered".
 *
 * INVARIANT — this list may only shrink.
 *   Adding an entry requires a reason that survives review, and the honest reason
 *   for a 10 %-alpha tint is a MEASURED ratio, not "it looked fine". If the target
 *   is a surface that carries text and it is not shimmed, the fix is to shim it
 *   (or to use a token), not to add an entry here.
 *
 * USAGE
 *   node scripts/ci/shim-coverage.mjs          gate (exit 1 on an unaccounted class)
 *   node scripts/ci/shim-coverage.mjs --list   list every accounted class with its reason
 *
 * EXIT CODES
 *   0  every class is accounted for
 *   1  an unaccounted class, or an allow-listed class exceeded its bound
 *   2  the gate is looking at the wrong tree (guards below)
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const SRC = join(ROOT, 'src');
const CSS = join(ROOT, 'src/styles/global.css');

const LIST = process.argv.includes('--list');

/**
 * Known sites, each with the number of USES tolerated and the reason it is
 * tolerated. Every reason below carries a measurement or a structural fact —
 * "it is decorative" is a fact about the element, not an opinion about the colour.
 *
 * `max` counts USES, not files: a class allow-listed at 1 that later appears in a
 * second place is a new surface nobody has looked at, and must fail.
 */
const ALLOWED = {
  /* ── measured to pass in light theme, so no shim entry is warranted ── */
  'bg-amber-500/10': { max: 1, reason: 'Jadwal panel, /candidate (CandidateDash.tsx:607). MEASURED 2026-10-03 light 4.61:1, dark 9.69:1 — a 10% tint sits within ~2% of the page colour, so leaving it unshimmed is correct, not an oversight.' },
  'bg-sky-500/10': { max: 1, reason: 'Status-Lamaran panel, /candidate (CandidateDash.tsx:641). MEASURED 2026-10-03 light 5.35:1, dark 7.72:1.' },
  'bg-red-500/10': { max: 1, reason: 'Revision banner, /candidate (CandidateDash.tsx:772). MEASURED 2026-10-03 light 5.58:1, dark 6.27:1.' },
  'bg-rose-950/30': { max: 1, reason: '"Upload locked" block, PemberkasanModal.tsx:530, reached by a candidate whose tahapan matches neither RE_T1 nor RE_T2. MEASURED 2026-10-03 light 5.75:1, dark 10.95:1. Arithmetic said 2.87 — the palette is authored in oklab and a naive sRGB blend misreads it, which is why this entry cites a measurement.' },

  /* ── not a text surface at all, so contrast is not a property it can fail ── */
  'bg-amber-500/80': { max: 9, reason: 'Typing-indicator dots, `w-2 h-2 rounded-full` — three per indicator, in three places (AdminAiCopilot.tsx x3, AiCvForm.tsx x3, SiswaBaruForm.tsx x3). No text node is ever inside a 2x2 dot.' },
  'bg-violet-400/80': { max: 3, reason: 'Typing-indicator dots, `w-2 h-2 rounded-full` (InterviewSimulatorModal.tsx:333-339). Same shape as bg-amber-500/80.' },
  'bg-emerald-500/25': { max: 1, reason: '1px vertical connector line between payment steps — `w-px flex-1` (LokerDetailModal.tsx:66). A rule is not a surface.' },
  'bg-rose-500/10': { max: 1, reason: 'Decorative circle BEHIND an icon — `w-24 h-24 rounded-full` with <Icon> inside, no text (ShareView.tsx:251).' },
  'bg-rose-600/10': { max: 1, reason: 'Ambient blurred blob carrying aria-hidden="true" (ShareView.tsx:184) — hidden from the accessibility tree by construction.' },

  /* ── deliberately paired with text that is ALSO unshimmed ── */
  'bg-amber-500/90': { max: 1, reason: '"Unsaved" pill, MasterFullForm.tsx:630, paired with text-[#3b2503] — a raw hex, so the INK is unshimmed too and the pair is self-consistent in both themes (~7.1:1 by stop arithmetic on amber-500 at 90%). Shimming only the surface would break it.' },

  /* ── exempt by policy, not by measurement ── */
  'bg-slate-700/40': { max: 1, reason: 'Disabled button (TabMail.tsx:249, `disabled` + cursor-not-allowed). e2e/test-contrast.mjs:68 states disabled states are NOT measured, and WCAG 1.4.3 exempts inactive controls. Measured 2.69:1, which is expected and allowed for a disabled control.' },
};

/* ── self-tests: a gate whose instrument is broken reports a clean tree ────── */

/** `.bg-slate-950\/60` → `bg-slate-950/60`. The shim writes escaped selectors. */
function unescapeClass(s) {
  return s.replace(/\\/g, '');
}

const ESCAPE_CASES = [
  ['bg-slate-950\\/60', 'bg-slate-950/60'],
  ['bg-sky-600\\/30', 'bg-sky-600/30'],
  ['bg-slate-900\\/\\.97', 'bg-slate-900/.97'],
  ['bg-slate-800', 'bg-slate-800'],
];
let escapeOk = 0;
for (const [input, want] of ESCAPE_CASES) {
  if (unescapeClass(input) === want) escapeOk++;
}

/* ── read the shim: ONLY rules whose selector carries [data-theme="light"] ── */

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function lightShimmedClasses(cssRaw) {
  const css = stripComments(cssRaw);
  const out = new Set();
  const re = /\[data-theme\s*=\s*["']?light["']?\]/g;
  for (const m of css.matchAll(re)) {
    /* expand to the enclosing selector list: back to the previous `{` or `}`,
       forward to the next `{`. Handles both the per-line form and an :is() group. */
    const start = Math.max(css.lastIndexOf('{', m.index), css.lastIndexOf('}', m.index)) + 1;
    const end = css.indexOf('{', m.index);
    if (end === -1) continue;
    const selector = css.slice(start, end);
    for (const c of selector.matchAll(/\.((?:bg|text|border)-[a-z]+-\d+(?:\\\/[0-9.]+)?)/g)) {
      out.add(unescapeClass(c[1]));
    }
  }
  return out;
}

const shimmed = lightShimmedClasses(readFileSync(CSS, 'utf8'));

/* Selector self-test: a class the shim DOES carry must be seen, and one it does
   NOT carry must not be. Both directions — a one-directional assertion is also
   true of a parser that returns nothing. */
const SELECTOR_CASES = [
  ['bg-slate-900/40', true],
  ['bg-slate-500/20', true],
  ['bg-slate-950/60', true],   // added 2026-10-02
  ['bg-sky-600/30', true],     // added 2026-10-02
  ['bg-slate-600/50', true],   // added 2026-10-03
  ['bg-amber-500/80', false],  // allow-listed, NOT shimmed
  ['bg-violet-400/80', false],
  ['bg-emerald-500/25', false],
];
let selectorOk = 0;
const selectorMisses = [];
for (const [cls, want] of SELECTOR_CASES) {
  if (shimmed.has(cls) === want) selectorOk++;
  else selectorMisses.push(`${cls} (expected ${want ? 'shimmed' : 'not shimmed'})`);
}

/* ── walk src/ for alpha'd bg-* utilities ─────────────────────────────────── */

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|astro|css)$/.test(e)) out.push(p);
  }
  return out;
}

const TOKEN = /\bbg-[a-z]+-\d+\/\d+\b/g;
const uses = new Map(); // class -> [{file, line}]

for (const f of walk(SRC)) {
  if (f === CSS) continue; // the shim itself declares these; it is not a consumer
  const txt = readFileSync(f, 'utf8');
  txt.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(TOKEN)) {
      const cls = m[0];
      if (!uses.has(cls)) uses.set(cls, []);
      uses.get(cls).push({ file: relative(ROOT, f), line: i + 1 });
    }
  });
}

/* ── verdict ──────────────────────────────────────────────────────────────── */

const unaccounted = [];
const overBound = [];
const accounted = [];

for (const [cls, sites] of [...uses].sort()) {
  if (shimmed.has(cls)) { accounted.push({ cls, how: 'shim', sites }); continue; }
  const allow = ALLOWED[cls];
  if (!allow) { unaccounted.push({ cls, sites }); continue; }
  if (sites.length > allow.max) overBound.push({ cls, sites, max: allow.max });
  else accounted.push({ cls, how: 'allow', sites });
}

/* Anti-vacuity: a scan that found nothing is a measurement failure, not a pass. */
if (uses.size === 0 || shimmed.size === 0) {
  console.error('✗ GATE ERROR — the scan found nothing to check. This is a broken instrument, not a clean tree.');
  console.error(`   alpha'd bg-* uses: ${uses.size} · shimmed classes: ${shimmed.size}`);
  process.exit(2);
}

console.log('');
console.log('─'.repeat(72));
console.log('   SHIM COVERAGE — every alpha\'d bg-* in src/ is accounted for');
console.log(`   scanned ${uses.size} distinct class(es) in src/ · shim carries ${shimmed.size} class(es)`);
console.log(`   instrument self-test: escape ${escapeOk}/${ESCAPE_CASES.length} · selector ${selectorOk}/${SELECTOR_CASES.length}`);
console.log('─'.repeat(72));

if (escapeOk !== ESCAPE_CASES.length) {
  console.error('✗ GATE ERROR — the escape self-test failed; the shim parser cannot be trusted.');
  process.exit(2);
}
if (selectorOk !== SELECTOR_CASES.length) {
  console.error('✗ GATE ERROR — the selector self-test failed; the shim parser is looking at the wrong rules.');
  for (const m of selectorMisses) console.error(`     ${m}`);
  process.exit(2);
}

if (LIST) {
  console.log('\n   accounted for:');
  for (const a of accounted) {
    console.log(`     [${a.how === 'shim' ? 'shim ' : 'allow'}] ${a.cls.padEnd(22)} ${a.sites.length} use(s)`);
    if (a.how === 'allow') console.log(`             ${ALLOWED[a.cls].reason}`);
  }
  console.log('');
  process.exit(0);
}

if (!unaccounted.length && !overBound.length) {
  console.log('');
  console.log(`   ✓ every class accounted for — ${accounted.filter((a) => a.how === 'shim').length} shimmed, ` +
    `${accounted.filter((a) => a.how === 'allow').length} allow-listed`);
  console.log('');
  process.exit(0);
}

console.error('\n   ✗ GATE FAILED\n');
for (const u of unaccounted) {
  console.error(`     ${u.cls} — NOT in the light shim and NOT allow-listed`);
  for (const s of u.sites.slice(0, 4)) console.error(`        ${s.file}:${s.line}`);
  console.error('        → shim it in src/styles/global.css, or allow-list it with a MEASURED reason');
}
for (const o of overBound) {
  console.error(`     ${o.cls} — ${o.sites.length} use(s), allow-list tolerates ${o.max}`);
  for (const s of o.sites.slice(0, 6)) console.error(`        ${s.file}:${s.line}`);
  console.error('        → a new surface appeared; look at it, then either shim it or raise the bound deliberately');
}
console.error('\n   Every entry in ALLOWED must carry a reason that survives review.');
console.error('   "It looked fine" is not one; a measured ratio is.');
console.error('');
process.exit(1);
