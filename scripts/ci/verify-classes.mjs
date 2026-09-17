#!/usr/bin/env node
/**
 * verify-classes.mjs — catch the "class that styles nothing" defect class
 *
 * WHY THIS GATE EXISTS
 * --------------------
 * Tailwind v4 generates utilities by scanning the source for candidate strings.
 * So a class written in markup either produces a rule in the stylesheet, or it
 * does not — and if it does not, the element silently renders unstyled. There is
 * no error, no warning, and no test that notices. In this repo that has now
 * happened four separate times:
 *
 *   §2      `.input` / `.label` used in the forms, defined nowhere.
 *   §11.4   `hover:bg-slate-750` — no such shade; hover did nothing.
 *   §14.2   `rt-row` / `rt-full` used in markup after their rules were removed.
 *   §20     `fas fa-check-circle` / `fa-times-circle` in PemberkasanModal —
 *           FontAwesome had been replaced by an SVG sprite, but three `<i>`
 *           elements were left behind, so three icons rendered as nothing. Plus
 *           `perspective-1000`, which is not a Tailwind utility at all.
 *
 * Fixing these one at a time has not stopped the next one, so this gate checks
 * the whole surface at once.
 *
 * WHY TAILWIND'S OWN COMPILER, NOT `dist/`
 * ----------------------------------------
 * `dist/_astro/*.css` is only as fresh as the last build, so a gate reading it
 * reports on whatever was built last rather than on the working tree. This uses
 * the real compiler (`compile()` + `build(candidates)`), which is fast (~0.5 s
 * for the whole tree), needs no build step, and resolves `@theme static`
 * overrides exactly as a build would.
 *
 * WHY THE "DEFINED" SET IS EXTRACTED FROM THE OUTPUT
 * --------------------------------------------------
 * The obvious approach — escape the token the way CSS would and search for
 * `.<escaped>` — has a trap: Tailwind hex-escapes a *leading digit*, so the
 * perfectly valid class `2xl:grid-cols-4` is emitted as `.\\32 xl\\:grid-cols-4`
 * and a hand-rolled `'\\' + ch` escaper reports it as dead. Instead this reads the
 * selectors Tailwind actually emitted and unescapes them, so every escape form
 * works by construction. The self-test pins the forms that are easy to get
 * wrong, and a broken self-test fails the gate rather than reporting a false
 * positive on your markup.
 *
 * RUNTIME-ASSEMBLED CLASS NAMES
 * -----------------------------
 * `class={'a ' + (cond ? 'b' : 'c')}` builds the name at runtime, but it is still
 * expandable: the operands and ternary branches are literals, so the gate
 * enumerates the possibilities and checks each one. An operand that is a real
 * variable (`ic + ' resize-none h-16'`) cannot be enumerated — that position is
 * replaced by a wildcard and only the surrounding literals are checked. Anything
 * that survives as a wildcard is counted and reported, so a green run never
 * silently claims to have covered it.
 *
 * KNOWN BOUNDARY — read before trusting a green run
 * ------------------------------------------------
 * **A rule that exists but never wins is NOT caught.** §19.4 found `mt-6` sitting
 * next to `.section-title`: `mt-6` is a real utility with a real rule, it just
 * loses the cascade to the unlayered `.section-title`. This gate checks that a
 * rule *exists*, not that it *applies*.
 *
 * USAGE
 *   node scripts/ci/verify-classes.mjs              check the working tree
 *   node scripts/ci/verify-classes.mjs --list       also list what was measured
 *   node scripts/ci/verify-classes.mjs --self-test  only run the escape self-test
 *
 * EXIT CODES  0 pass · 1 fail · 2 setup problem (no stylesheet / no source)
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

const ENTRY = resolve(ROOT, 'src/styles/global.css');
const SRC = resolve(ROOT, 'src');

const ARGV = process.argv.slice(2);
const LIST = ARGV.includes('--list');
const SELF_TEST_ONLY = ARGV.includes('--self-test');

const TAG = '[classes]';

// ═══ CSS identifier unescape (spec-correct) ══════════════════════════════════
// `\32 xl\:grid-cols-4` -> `2xl:grid-cols-4`. The whitespace after a hex escape
// is its terminator and belongs to the escape, not to the identifier.
function unescapeIdent(raw) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== '\\') {
      out += raw[i];
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) break;
    if (/[0-9a-fA-F]/.test(next)) {
      let hex = '';
      let j = i + 1;
      while (j < raw.length && hex.length < 6 && /[0-9a-fA-F]/.test(raw[j])) hex += raw[j++];
      if (raw[j] === ' ') j++;
      out += String.fromCodePoint(parseInt(hex, 16));
      i = j - 1;
    } else if (next === '\n') {
      i++; // line continuation
    } else {
      out += next;
      i++;
    }
  }
  return out;
}

/**
 * WHY SUBJECT POSITION IS PARSED, NOT REGEX-MATCHED (measured 2026-09-17)
 * ---------------------------------------------------------------------
 * The original implementation harvested every `.ident` anywhere in the emitted
 * stylesheet with a single regex. That regex has NO notion of selector
 * boundaries, so it also harvested the argument of `:not()` — and a rule that
 * *excludes* a class therefore credited that class as "defined".
 *
 * That is not theoretical. `src/styles/global.css:835` is
 * `[class*="fixed inset-0"]:not(.u-modal-shell)`, so `.u-modal-shell` stayed
 * "defined" even with BOTH of its real rules deleted — proven by deleting the
 * one in `layout.css` and then the one in `motion.css:281`: the gate still
 * printed "every checked class has a rule" and exited 0. A probe file using
 * nine tokens that have no rule at all (`inset-0`, `bg-emerald-900`,
 * `text-pink-300`, `border-pink-500`, `hamburger-btn`, `rt-full`, …) was
 * accepted 9 times out of 10; only an invented name was caught.
 *
 * SUBTLETIES, each one measured against the real compiler output
 * -------------------------------------------------------------
 * 1. `[class*="fixed inset-0"]` really DOES match an element carrying
 *    `inset-0`, so tokens inside a `class`-attribute match stay credited.
 * 2. `:where(.space-y-2 > :not(:last-child))` — Tailwind wraps the compound so
 *    the class lands INSIDE `:where()`. A `:where()` at the START of a compound
 *    holds that compound's selector, so its first compound IS the subject and
 *    `space-y-2` is credited. A regex cannot decide this; it must be parsed.
 * 3. `(` is NOT a subject position. `:not(` and `:is(` also end in `(`, and
 *    treating a paren as a combinator re-admits exactly the false credit this
 *    exists to remove — it did, on the first attempt: the trace still reported
 *    `[class*="fixed inset-0"]:not(.u-modal-shell)` as a subject.
 * 4. `table:has(.rt-row) td.rt-full` credits ONLY `rt-full`. `rt-row` is a
 *    lookback condition inside `:has()`, not something this rule styles.
 * 5. `:is(:where(.group):hover *)` — `.group` is a descendant ANCESTOR, yet it
 *    IS credited: it is a MARKER, defined by having a consumer rather than by
 *    being a subject (see `markerClasses`).
 * 6. An escaped comma is an identifier character, so
 *    `.transition-\[background-color\,transform\]` is ONE compound. Splitting it
 *    there reports a valid class as dead — a false positive that was measured
 *    against the real compiler before was fixed.
 */

/** Class tokens that appear in a `class` attribute MATCH, i.e. real usage. */
function attributeValueTokens(css) {
  const out = new Set();
  for (const m of css.matchAll(/\[\s*class\s*[*^$~|]?=\s*(["'])([\s\S]*?)\1\s*\]/g)) {
    for (const t of m[2].split(/\s+/)) if (t) out.add(t);
  }
  return out;
}

/**
 * MARKER classes that have a CONSUMER: `group`, `group/photo`, `peer`, …
 *
 * These are the one honest exception to "defined means it is a selector
 * subject". A marker carries no declarations of its own *by design* — Tailwind
 * emits `.group-hover\:opacity-100:is(:where(.group):hover *)`, where `.group`
 * sits behind a descendant precisely because it names an ANCESTOR. Measuring it
 * as dead would be a false positive, and a gate that cries wolf gets ignored.
 *
 * So a marker counts as defined when some rule CONSUMES it: a selector whose
 * name starts with `group-`/`peer-` and which reaches into `.group`/`.peer`.
 * The escape in the emitted name (`group-hover\:…`) is why this reads the raw
 * CSS for the consumer prefix rather than unescaped identifiers.
 */
function markerClasses(css) {
  const out = new Set();
  // `:where(.group)` / `:where(.group\/photo)` inside a consumer variant.
  for (const m of css.matchAll(/:(?:where|is)\s*\(\s*\.([A-Za-z][\w-]*(?:\\\/[\w-]+)?)/g)) {
    out.add(unescapeIdent(m[1]));
  }
  return out;
}

/** One class identifier, escape-aware. */
const IDENT = String.raw`(?:\\[0-9a-fA-F]{1,6} ?|\\.|[\w-])+`;

/**
 * Every selector prelude in a stylesheet: the text immediately before each `{`.
 * Walking block-by-block and taking `prelude` = "text since the last `{`/`}`/`;`"
 * gives exactly that, at any nesting depth, with no paren bookkeeping — a `(`
 * in a prelude never opens a block, and a declaration never contains a bare `{`.
 */
function selectorPreludes(css) {
  const out = [];
  let prelude = '';
  for (const ch of css) {
    if (ch === '{') {
      if (prelude.trim()) out.push(prelude);
      prelude = '';
    } else if (ch === '}' || ch === ';') {
      prelude = '';
    } else {
      prelude += ch;
    }
  }
  return out;
}

/**
 * Split one prelude into per-selector groups of `{ compound, combinatorIn }`,
 * at paren depth 0 only. Comma-separated selectors become separate groups.
 *
 * `combinatorIn` is the combinator that INTRODUCED the compound within its own
 * selector: `null` for the selector's first compound, `'>'`/`'+'`/`'~'` for an
 * explicit combinator, `' '` for a descendant.
 *
 * Grouping here rather than at the call site is deliberate: it is the only place
 * that knows where one selector ends and the next begins, and the subject rule
 * is per-selector.
 */
function compoundsOf(prelude) {
  const groups = [];
  let group = [];
  let depth = 0;
  let buf = '';
  let combinatorIn = null;
  let pendingCombinator = null; // an explicit `>`/`+`/`~` awaiting its compound

  const flush = () => {
    if (buf.trim() !== '') group.push({ text: buf, combinatorIn });
    buf = '';
    combinatorIn = null;
  };
  const endSelector = () => {
    flush();
    if (group.length) groups.push(group);
    group = [];
    combinatorIn = null;
    pendingCombinator = null;
  };

  for (let i = 0; i < prelude.length; i++) {
    const c = prelude[i];

    // A backslash escapes the NEXT character into the identifier. This is what
    // keeps `.transition-\[background-color\,transform\]` one compound: without
    // it the `\,` reads as a selector separator and the class is split in half,
    // so `transition-[background-color,transform]` is reported as having no rule
    // even though Tailwind emitted exactly that selector.
    if (c === '\\' && i + 1 < prelude.length) {
      buf += c + prelude[i + 1];
      i++;
      continue;
    }

    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);

    const isSpace = c === ' ' || c === '\t' || c === '\n' || c === '\r';
    const isCombinator = c === '>' || c === '+' || c === '~';
    const isDelim = c === ',' || c === '{';

    if (depth === 0 && isDelim) {
      endSelector();
      continue;
    }

    if (depth === 0 && isCombinator) {
      // An explicit combinator CLOSES the compound before it and binds to the
      // next one. Without the flush, `.a + .b` accumulates as `.a.b`.
      flush();
      pendingCombinator = c;
      combinatorIn = c;
      continue;
    }

    if (depth === 0 && isSpace) {
      // A space terminates a CSS hex escape, which is part of the IDENTIFIER
      // (`.\32 xl\:grid-cols-4` is the class `2xl:grid-cols-4`). Consuming it
      // here is what keeps that identifier whole.
      if (isHexEscapeTerminator(buf)) {
        buf += c;
        continue;
      }
      if (pendingCombinator !== null) {
        // whitespace after `>`/`+`/`~` — the combinator already set the mode
        continue;
      }
      // Plain whitespace with a compound accumulated is a DESCENDANT.
      if (buf.trim() !== '') {
        group.push({ text: buf, combinatorIn });
        buf = '';
        combinatorIn = ' ';
      }
      continue;
    }
    buf += c;
  }
  endSelector();
  return groups;
}

/**
 * Classes a selector prelude DEFINES.
 *
 * DEFINITION — a class is defined when it is part of some rule's SUBJECT:
 * the last compound of a selector, or a compound joined to it by `>`/`+`/`~`.
 * Compounds that appear only BEFORE a descendant combinator are ancestor
 * contexts, and `:not(.x)` mentions are exclusions. Neither defines anything.
 *
 * NESTED SELECTOR LISTS — `:where()` / `:is()` arguments are selector lists in
 * their own right, and Tailwind encodes several utilities that way. So each
 * argument is evaluated with the same rule, and the enclosing `:where()`'s own
 * compound is credited too:
 *
 *   `:where(.space-y-2 > :not(:last-child))`  -> `space-y-2` is the first
 *      compound of the nested list AND the anchor of the rule, so it counts.
 *   `.group-hover\:opacity-100:is(:where(.group):hover *)` -> `group` sits
 *      behind a descendant inside the `:is()` argument, so it does not.
 */
function definedSelectors(css) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const set = new Set();

  for (const prelude of selectorPreludes(stripped)) {
    for (const group of compoundsOf(prelude)) {
      // Last compound is the subject; walk backward while the chain holds.
      for (let i = group.length - 1; i >= 0; i--) {
        const comp = group[i];
        const inChain =
          i === group.length - 1 ||
          comp.combinatorIn === '>' ||
          comp.combinatorIn === '+' ||
          comp.combinatorIn === '~';
        if (!inChain) break;
        for (const ident of classIdentsIn(comp.text)) set.add(ident);
      }
      // A `:where()`/`:is()` argument is a selector list in its own right, and
      // Tailwind encodes e.g. `space-y-2` that way. Its own subject chain
      // counts. `:has()` is NOT included — its argument is a lookback
      // condition, and `:not()` is an exclusion; crediting either is exactly
      // the false credit this function exists to remove.
      for (const arg of nestedSelectorLists(group)) {
        for (const nested of compoundsOf(arg)) {
          for (let j = nested.length - 1; j >= 0; j--) {
            const c2 = nested[j];
            const nestedInChain =
              j === nested.length - 1 ||
              c2.combinatorIn === '>' ||
              c2.combinatorIn === '+' ||
              c2.combinatorIn === '~';
            if (!nestedInChain) break;
            for (const ident of classIdentsIn(c2.text)) set.add(ident);
          }
        }
      }
    }
  }

  // `[class*="fixed inset-0"]` genuinely matches an element carrying `inset-0`,
  // so tokens inside a `class`-attribute match stay credited.
  for (const t of attributeValueTokens(stripped)) set.add(t);

  // Marker classes are defined by having a consumer, not by being a subject —
  // see the comment on `markerClasses`.
  for (const t of markerClasses(stripped)) set.add(t);

  return set;
}

/**
 * The argument text of every `:where(…)` / `:is(…)` at the TOP paren depth of a
 * compound selector list. Balanced-paren scan so a nested `:not(:last-child)`
 * stays intact, and so a `:where()` buried inside another function is not
 * lifted out of its context.
 *
 * `:has()` and `:not()` are deliberately EXCLUDED: their arguments are a
 * lookback condition and an exclusion respectively, so a class named only there
 * is not styled by the rule.
 */
function nestedSelectorLists(groups) {
  const out = [];
  for (const comp of groups) {
    let depth = 0;
    for (let i = 0; i < comp.text.length; i++) {
      const ch = comp.text[i];
      if (ch === '(') {
        depth++;
        continue;
      }
      if (ch === ')') {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (ch !== ':' || depth !== 0) continue;
      const m = /^:(?:where|is)\s*\(/.exec(comp.text.slice(i));
      if (!m) continue;
      // Balanced scan of this argument, then resume AFTER it: the argument is a
      // selector list of its own, so lifting a `:where()` out of it would lose
      // the context that decides whether its classes are subject or ancestor.
      let d = 0;
      const open = i + m[0].length - 1;
      let end = comp.text.length;
      for (let j = open; j < comp.text.length; j++) {
        if (comp.text[j] === '(') d++;
        else if (comp.text[j] === ')') {
          d--;
          if (d === 0) {
            out.push(comp.text.slice(open + 1, j));
            end = j;
            break;
          }
        }
      }
      i = end;
    }
  }
  return out;
}

/**
 * True when `buf` ends with a CSS hex escape that a following space terminates:
 * a backslash, 1-6 hex digits, and nothing after them.
 * `.\32 ` -> yes (the space belongs to the escape); `.a\ b` -> no.
 */
function isHexEscapeTerminator(buf) {
  const m = buf.match(/\\([0-9a-fA-F]{1,6})$/);
  if (!m) return false;
  // Reject a backslash that is itself escaped (`\\.` then digits).
  const before = buf.slice(0, buf.length - m[0].length);
  let backslashes = 0;
  for (let i = before.length - 1; i >= 0 && before[i] === '\\'; i--) backslashes++;
  return backslashes % 2 === 0;
}

/**
 * The class identifiers inside ONE compound selector, from any position in it
 * EXCEPT inside a `:not()`.
 *
 * A compound is a single element (`td.rt-full`, `[class*="x"]`), so every
 * `.ident` in it describes THAT element and the rule may style it. `:not()` is
 * the exception: `td:not(.rt-full)` styles the `td` elements that are NOT
 * `.rt-full`, so `.rt-full` is named there as an EXCLUSION. Crediting it is
 * precisely the false credit this whole fix exists to remove.
 *
 * `:has()` is kept: its argument is a lookback condition on the same element,
 * and the caller strips those (see `nestedSelectorLists`), so what remains here
 * is a genuine part of the compound.
 */
function classIdentsIn(compoundText) {
  // Blank out `:not(…)` entirely — an exclusion never defines. Also blank the
  // arguments of `:where()`/`:is()` that FOLLOW other compound content, because
  // those are evaluated separately in their own selector context (see
  // `nestedSelectorLists`). A `:where()`/`:is()` at the very START of the
  // compound is different: its argument IS the compound's selector, so it is
  // left here and its classes count as the subject.
  let text = '';
  let i = 0;
  let sawContent = false;
  while (i < compoundText.length) {
    const m = /^:(?:where|is)\s*\(/.exec(compoundText.slice(i));
    const n = /^:not\s*\(/.exec(compoundText.slice(i));
    const blank = n !== null || (m !== null && sawContent);
    if (!blank) {
      sawContent = true;
      text += compoundText[i++];
      continue;
    }
    const head = (n ?? m)[0];
    let depth = 0;
    let j = i + head.length - 1;
    for (; j < compoundText.length; j++) {
      if (compoundText[j] === '(') depth++;
      else if (compoundText[j] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    i = j + 1; // drop the whole `:not(...)` / `:where(...)` / `:is(...)`
  }

  const out = [];
  const RE = new RegExp(`\\.(${IDENT})`, 'g');
  for (const m of text.matchAll(RE)) out.push(unescapeIdent(m[1]));
  return out;
}

// ═══ Escape self-test ════════════════════════════════════════════════════════
// Forms whose escaping is easy to get wrong. If any regress the gate would start
// reporting valid classes as dead — the false-positive failure mode that gets a
// gate ignored — so a broken self-test fails the run before anything is judged.
const SELF_TEST = [
  '!mt-0',
  'bg-[#fff]',
  'w-1/2',
  'hover:bg-slate-700',
  'md:hover:text-white',
  '2xl:grid-cols-4',
  'group-hover:opacity-100',
  'animate-[fadeIn_.4s_ease]',
  'grid-cols-[repeat(3,minmax(0,1fr))]',
  'text-[10px]',
  'bg-slate-900/[.97]',
  'shadow-[0_0_15px_rgba(244,114,182,0.3)]',
  'supports-[display:grid]:flex',
];

// ═══ Selector-semantics self-test ════════════════════════════════════════════
// `definedSelectors` answers "does this class have a rule?", and every entry
// here is a shape that answer depends on. They are real emitted selectors, not
// invented ones, and each was the site of a bug during the fix. Both directions
// are pinned: a class that MUST be credited (else the gate cries wolf) and one
// that MUST NOT be (else the gate is blind, which is the defect it exists for).
const SELECTOR_TEST = [
  // [selector, class, expected]
  // Tailwind's descendant-combinator encodings — must be credited.
  [':where(.space-y-2 > :not(:last-child))', 'space-y-2', true],
  [':where(.divide-y > :not(:last-child))', 'divide-y', true],
  // The subject is the last compound; an ancestor before a descendant is not.
  ['table:has(.rt-row) td.rt-full', 'rt-full', true],
  ['table:has(.rt-row) td.rt-full', 'rt-row', false],
  ['.wrapper .item', 'item', true],
  ['.wrapper .item', 'wrapper', false],
  // `:not()` names an EXCLUSION. Crediting it is the original bug.
  ['table:has(.rt-row) td:not(.rt-full)', 'rt-full', false],
  ['[class*="fixed inset-0"]:not(.u-modal-shell)', 'u-modal-shell', false],
  // …but a `class`-attribute match really does match.
  ['[class*="fixed inset-0"]:not(.u-modal-shell)', 'inset-0', true],
  // A `>` chain describes ancestors: only the LAST compound is styled, so
  // `.a` and `.b` are contexts here, not subjects.
  ['.a > .b > .c', 'c', true],
  ['.a > .b > .c', 'a', false],
  ['.a > .b', 'b', true],
  ['.a > .b', 'a', false],
  // Comma-separated selectors are independent.
  ['.a, .b > .c', 'a', true],
  ['.a, .b > .c', 'b', false],
  // Escapes: a hex escape's terminator is part of the identifier, and an
  // escaped comma is an identifier character, not a selector separator.
  ['.\\32 xl\\:grid-cols-4', '2xl:grid-cols-4', true],
  ['.transition-\\[background-color\\,transform\\]', 'transition-[background-color,transform]', true],
  // A marker has no declarations of its own and is credited via its consumer.
  ['.group-hover\\:opacity-100:is(:where(.group):hover *)', 'group', true],
];

/** Run SELECTOR_TEST against `definedSelectors`. Returns the failures. */
function selectorTestFailures() {
  const bad = [];
  for (const [sel, cls, want] of SELECTOR_TEST) {
    const got = definedSelectors(`${sel} { color: red }`).has(cls);
    if (got !== want) {
      bad.push(`${want ? 'should be defined' : 'should NOT be defined'}: ${cls}  in  ${sel}`);
    }
  }
  return bad;
}

// ═══ Tiny expression reader for `class={…}` ══════════════════════════════════
const WILD = '\u0001'; // an operand whose value cannot be known statically

/** Positions of `chars` that sit at bracket depth 0 and outside any string. */
function topLevelPositions(src, chars) {
  const out = [];
  let depth = 0;
  let quote = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (depth === 0 && chars.includes(c)) out.push(i);
  }
  return out;
}

/** The whole operand, if it is exactly one single- or double-quoted literal. */
function asLiteral(op) {
  const t = op.trim();
  if (t.length < 2) return null;
  const q = t[0];
  if (q !== "'" && q !== '"') return null;
  if (t[t.length - 1] !== q) return null;
  const inner = t.slice(1, -1);
  if (inner.includes(q)) return null; // more than one literal in there — bail
  return inner;
}

/** The inner text, if the whole operand is exactly one template literal. */
function asTemplate(op) {
  const t = op.trim();
  if (t.length < 2 || t[0] !== '`' || t[t.length - 1] !== '`') return null;
  const inner = t.slice(1, -1);
  if (inner.includes('`')) return null;
  return inner;
}

/**
 * Expand a template literal body into the strings it can produce.
 * `${isAll ? 'a' : 'b'} w-4` -> `a w-4` and `b w-4`; a `${variable}` becomes WILD.
 */
function expandTemplate(inner, depth = 0) {
  if (depth > 6) return null;
  const parts = [];
  const exprs = [];
  let buf = '';
  let i = 0;
  while (i < inner.length) {
    if (inner[i] === '$' && inner[i + 1] === '{') {
      parts.push(buf);
      buf = '';
      let d = 1;
      let j = i + 2;
      for (; j < inner.length && d > 0; j++) {
        if (inner[j] === '{') d++;
        else if (inner[j] === '}') d--;
      }
      exprs.push(inner.slice(i + 2, j - 1));
      i = j;
    } else {
      buf += inner[i++];
    }
  }
  parts.push(buf);

  let alts = [parts[0]];
  for (let k = 0; k < exprs.length; k++) {
    const sub = expandOperand(exprs[k], depth + 1);
    const next = [];
    for (const a of alts) for (const s of sub) next.push(a + s + parts[k + 1]);
    if (next.length > 32) return null; // give up rather than guess
    alts = next;
  }
  return alts;
}

/** Drop `( … )` when the parens wrap the entire operand. */
function stripOuterParens(s) {
  let t = s.trim();
  for (;;) {
    if (t[0] !== '(') return t;
    let depth = 0;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '(') depth++;
      else if (t[i] === ')') {
        depth--;
        if (depth === 0) {
          if (i !== t.length - 1) return t; // closes early: not a wrapper
          t = t.slice(1, -1).trim();
          break;
        }
      }
    }
    if (depth !== 0) return t;
  }
}

/** Every string one operand can evaluate to, with WILD for anything unknowable. */
function expandOperand(op, depth = 0) {
  if (depth > 6) return [WILD];
  const t = stripOuterParens(op);

  const lit = asLiteral(t);
  if (lit !== null) return [lit];

  const tpl = asTemplate(t);
  if (tpl !== null) return expandTemplate(tpl, depth + 1) ?? [WILD];

  // `cond ? a : b` — both branches are possible.
  for (const qi of topLevelPositions(t, '?')) {
    if (t[qi + 1] === '.' || t[qi + 1] === '?') continue; // `?.` / `??`
    const rest = t.slice(qi + 1);
    const cs = topLevelPositions(rest, ':');
    if (!cs.length) continue;
    return [
      ...expandOperand(rest.slice(0, cs[0]), depth + 1),
      ...expandOperand(rest.slice(cs[0] + 1), depth + 1),
    ];
  }

  // `cond && 'x'` contributes either nothing or `'x'` in a concatenation.
  for (const op2 of ['&&', '||']) {
    const at = topLevelPositions(t, op2[0]).find((p) => t.startsWith(op2, p));
    if (at === undefined) continue;
    return ['', ...expandOperand(t.slice(at + op2.length), depth + 1)];
  }

  return [WILD];
}

/**
 * Expand a `+` chain into the set of strings it can produce.
 * Returns null when the body is not a concatenation at all.
 */
function concatAlternatives(body) {
  const ops = [];
  let start = 0;
  for (const p of topLevelPositions(body, '+')) {
    ops.push(body.slice(start, p));
    start = p + 1;
  }
  if (!ops.length) return null;
  ops.push(body.slice(start));

  let alts = [''];
  for (const op of ops) {
    const sub = expandOperand(op);
    const next = [];
    for (const a of alts) for (const s of sub) next.push(a + s);
    if (next.length > 32) return null; // give up rather than guess
    alts = next;
  }
  return alts;
}

// ═══ main ════════════════════════════════════════════════════════════════════
async function main() {
  if (!existsSync(ENTRY)) {
    console.error(`${TAG} FAILED — no stylesheet at ${ENTRY}`);
    process.exit(2);
  }
  if (!existsSync(SRC)) {
    console.error(`${TAG} FAILED — no source tree at ${SRC}`);
    process.exit(2);
  }

  const loadStylesheet = async (id, base) => {
    let file;
    if (id === 'tailwindcss' || id.startsWith('tailwindcss/')) {
      file = resolve(ROOT, 'node_modules', id.endsWith('.css') ? id : `${id}/index.css`);
    } else if (id.startsWith('.')) {
      file = resolve(base, id);
    } else {
      file = resolve(ROOT, 'node_modules', id);
    }
    return { path: file, base: dirname(file), content: readFileSync(file, 'utf8') };
  };

  const compiler = await compile(readFileSync(ENTRY, 'utf8'), {
    base: dirname(ENTRY),
    loadStylesheet,
  });

  // ── self-test first: a buggy gate must not be allowed to judge the tree ───
  const selfDefined = definedSelectors(compiler.build(SELF_TEST));
  const selfFails = SELF_TEST.filter((t) => !selfDefined.has(t));
  if (selfFails.length) {
    console.error(`${TAG} FAILED — escape self-test: ${selfFails.length} valid class(es) not recognised:`);
    for (const t of selfFails) console.error(`  ${t}`);
    console.error(
      `\n${TAG} That is a bug in the gate, not in your markup. ` +
        `Fix the gate before reading any other result.`,
    );
    process.exit(1);
  }
  console.log(`${TAG} escape self-test: ${SELF_TEST.length}/${SELF_TEST.length} recognised`);

  const selFails = selectorTestFailures();
  if (selFails.length) {
    console.error(`${TAG} FAILED — selector-semantics self-test: ${selFails.length} wrong verdict(s):`);
    for (const f of selFails) console.error(`  ${f}`);
    console.error(
      `\n${TAG} That is a bug in the gate, not in your markup. ` +
        `A wrong "NOT defined" reports valid classes as dead; a wrong "defined" ` +
        `is the blind spot this gate exists to close. Fix the gate first.`,
    );
    process.exit(1);
  }
  console.log(`${TAG} selector self-test: ${SELECTOR_TEST.length}/${SELECTOR_TEST.length} verdicts correct`);

  if (SELF_TEST_ONLY) {
    console.log(`${TAG} OK — self-test only.`);
    return;
  }

  // ── collect class tokens from the source ─────────────────────────────────
  const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p, out);
      else if (/\.(tsx|astro|ts)$/.test(name)) out.push(p);
    }
    return out;
  };
  const files = walk(SRC);

  const SENTINEL = '\u0000'; // an interpolation: drop whatever token it sits in
  const braceBody = (src, open) => {
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) return src.slice(open + 1, i);
      }
    }
    return src.slice(open + 1);
  };

  // `+` is excluded: a token containing it is never a class name.
  const TOKEN_OK = /^[^\s${}()'"`;=+?!|&<>]+$/;
  // `tab === 'chat'` — the literal is a comparison operand, not a class.
  const CMP_BEFORE = /(===|!==|==|!=|case)\s*$/;
  const CMP_AFTER = /^\s*(===|!==|==|!=)/;
  const LIT = /'([^']*)'|"([^"]*)"|`([^`]*)`/g;

  const used = new Map(); // token -> Set("rel:line")
  const wildcarded = new Map(); // "rel:line" -> expression that kept a wildcard

  const lineAt = (src, index) => {
    let n = 1;
    for (let i = 0; i < index; i++) if (src[i] === '\n') n++;
    return n;
  };

  const add = (tok, where) => {
    if (!tok || tok.includes(SENTINEL) || !TOKEN_OK.test(tok)) return;
    // A class name always carries at least one letter. Without this, a ternary
    // whose branches are punctuation (`${m || l ? '-' : ''}`) would be checked
    // as though `-` were a class, and reported as dead.
    if (!/[A-Za-z]/.test(tok)) return;
    if (!used.has(tok)) used.set(tok, new Set());
    used.get(tok).add(where);
  };

  for (const file of files) {
    const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
    const src = readFileSync(file, 'utf8');
    const re = /class(?:Name)?\s*=\s*/g;
    let m;
    while ((m = re.exec(src))) {
      const at = m.index + m[0].length;
      const ch = src[at];
      const where = `${rel}:${lineAt(src, at)}`;
      let text = '';

      if (ch === '"' || ch === "'") {
        const end = src.indexOf(ch, at + 1);
        if (end === -1) continue;
        text = src.slice(at + 1, end);
      } else if (ch === '`') {
        const end = src.indexOf('`', at + 1);
        if (end === -1) continue;
        text = src.slice(at + 1, end);
      } else if (ch === '{') {
        const body = braceBody(src, at);
        const alts = concatAlternatives(body);

        if (alts === null) {
          // Not a concatenation: every literal in the expression is a class
          // list, except the ones used as comparison operands.
          const kept = [];
          for (const mm of body.matchAll(LIT)) {
            const before = body.slice(0, mm.index);
            const after = body.slice(mm.index + mm[0].length);
            if (CMP_BEFORE.test(before) || CMP_AFTER.test(after)) continue;
            if (mm[3] !== undefined) {
              // A template literal: expand its `${…}` interpolations, so
              // `${isAll ? 'a' : 'b'} w-4` is checked as `a w-4` and `b w-4`.
              const sub = expandTemplate(mm[3]);
              if (sub === null) kept.push(WILD);
              else kept.push(...sub);
            } else {
              kept.push(mm[1] ?? mm[2] ?? '');
            }
          }
          text = kept.join(' ');
        } else {
          if (alts.some((a) => a.includes(WILD))) wildcarded.set(where, body.trim().replace(/\s+/g, ' '));
          text = alts.join(' ');
        }
      } else continue;

      // `${…}` is runtime data; drop it rather than inventing a token from it.
      text = text.replace(/\$\{[^}]*\}/g, SENTINEL);
      text = text.replaceAll(WILD, SENTINEL);
      for (const tok of text.split(/\s+/)) add(tok, where);
    }
  }

  // Classes defined by a stylesheet that lives inside the source itself.
  // RirekishoBuilder emits a standalone printable document and carries its own
  // CSS in a template literal; those classes are defined, just not in the app
  // stylesheet, so the compiler cannot know about them.
  const inlineDefined = new Set();
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const mm of src.matchAll(/\.([A-Za-z_][\w-]*)\s*\{/g)) inlineDefined.add(mm[1]);
  }

  // ── ask the compiler about every token at once ───────────────────────────
  const tokens = [...used.keys()].sort();
  const css = compiler.build(tokens);
  const defined = definedSelectors(css);

  const dead = tokens.filter((t) => !defined.has(t) && !inlineDefined.has(t));
  const credited = tokens.filter((t) => !defined.has(t) && inlineDefined.has(t));

  // ── report ───────────────────────────────────────────────────────────────
  if (LIST) {
    console.log(`\nsource files scanned        : ${files.length}`);
    console.log(`class tokens checked        : ${tokens.length}`);
    console.log(`selectors Tailwind emitted  : ${defined.size}`);
    console.log(`expressions with a wildcard : ${wildcarded.size}`);
    console.log(`credited by inline CSS      : ${credited.length}`);
    if (credited.length) for (const t of credited) console.log(`  inline  ${t}`);
    if (wildcarded.size) {
      console.log('\nexpressions with an operand that is not statically knowable:');
      for (const [where, expr] of wildcarded) console.log(`  ${where}  ${expr}`);
    }
    console.log('');
  }

  console.log(
    `${TAG} measured ${tokens.length} class token(s) in ${files.length} file(s) ` +
      `against ${defined.size} emitted selector(s)`,
  );

  if (dead.length) {
    console.log(`${TAG} violations:`);
    for (const t of dead) console.log(`  FAIL ${t}  (${[...used.get(t)].join(', ')})`);
    console.error(
      `\n${TAG} FAILED — ${dead.length} class(es) have no rule. ` +
        `The element renders unstyled and nothing else will tell you.`,
    );
    process.exit(1);
  }

  console.log(`${TAG} every checked class has a rule.`);
  if (wildcarded.size) {
    console.log(
      `${TAG} NOTE: ${wildcarded.size} expression(s) had an operand that cannot be known ` +
        `statically; the literals around it were checked, the variable was not. ` +
        `Run with --list to see them.`,
    );
  }
}

main().catch((err) => {
  console.error(`${TAG} FAILED — ${err?.stack || err}`);
  process.exit(2);
});
