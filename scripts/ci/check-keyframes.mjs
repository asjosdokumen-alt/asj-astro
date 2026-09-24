/**
 * check-keyframes.mjs — every `animation-name` that motion.css NAMES must be
 * a keyframe that motion.css (or another stylesheet) DEFINES.
 *
 * WHY THIS EXISTS
 * ---------------
 * The per-section motion table (`src/lib/sectionMotion.ts`) builds class
 * names by string concatenation, and the stylesheet turns those into
 * `animation: <keyframe> ...`. Nothing in the type system connects the two:
 * a typo produces a class that matches no rule, and CSS says nothing about a
 * class that matches no rule. The page simply does not animate, no error is
 * logged, and every test that asserts "an animation is running" still passes
 * as long as ONE name in the list resolves.
 *
 * This is the same failure `asj-icon-sprite` documents for glyph ids: the
 * build is happy, the artefact is silently incomplete.
 *
 * WHAT IT CHECKS, AND WHAT IT DELIBERATELY DOES NOT
 * ------------------------------------------------
 * It checks the DEFINE/REFERENCE direction only (a name used but never
 * defined). It does NOT fail on a defined-but-unused keyframe: `slide-in` is
 * declared in `theme.css` for Tailwind's `animate-slide-in` utility, which
 * builds its `animation:` shorthand at build time rather than writing it in a
 * stylesheet, so this gate can never see the reference. A gate that failed on
 * it would demand the deletion of a keyframe the shipped page uses.
 *
 * SCOPE
 * -----
 * Only `src/styles/*.css`, because that is where our hand-written keyframes
 * live (`motion.css` entrance/reveal/marquee/petal, `theme.css` the two
 * Tailwind ones). `global.css` keyframes (Tailwind's) are out of scope and
 * are excluded by only collecting references to names that LOOK like ours:
 * `enter-`, `reveal-`, `marquee`, `petal`, `boot`.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const STYLE_DIR = "src/styles";
/**
 * ── WHY PREFIXING IS NOT ENOUGH, AND WHY THE FIRST VERSION OF THIS LIST WAS ──
 *
 * The guard started as a list of PREFIXES (`enter-`, `reveal-`, ...)
 * on the theory that our keyframes are named in families. The battery then
 * proved the guard was both over- and under-inclusive at once, in one run:
 *
 *     FAIL: marquee-duration  (motion.css:80)
 *     FAIL: enter-ease        (motion.css:385)
 *     FAIL: reveal-dur        (motion.css:528)
 *
 * `enter-ease` and `reveal-dur` are CUSTOM PROPERTIES, not keyframes — they match
 * the prefix and they are not animation names at all. That is a false POSITIVE,
 * and it is the failure mode that gets a gate deleted: the obvious repair is to
 * widen the pattern until it stops complaining, which eventually means it checks
 * nothing. Nine of them in one run.
 *
 * So membership is decided by the name's SHAPE on both sides: a candidate is an
 * animation name only if it does NOT start with `--`. Custom properties are
 * `--enter-ease`, `--reveal-dur`, `--enter-shift`; keyframes never are.
 *
 * ── WHY A PREFIX LIST REMAINS, RATHER THAN "EVERYTHING" ─────────────────────
 * Parsing CSS properly is out of scope for a gate this size, and the crude parse
 * cannot tell a keyframe name from a timing-function name (`ease-in-out`), an
 * iteration keyword (`infinite`) or a fill keyword (`both`). The prefix list is
 * how those are excluded. It is the names WE author, taken from the two files
 * that declare keyframes for this app, and it is deliberately broad within that:
 * a false reference to a name we DO define is harmless, a missed reference is
 * the whole bug.
 *
 * A keyframe declared under a name that matches no prefix here is caught by the
 * sanity check at the bottom of this file rather than silently ignored.
 */
const OUR_PREFIXES = [
  // `mascot-` was removed 2026-09-24 with the mascot itself. It is deliberately
  // NOT left here as a no-op: if a `mascot-*` keyframe is ever reintroduced, the
  // unreachable-name check at the bottom must flag it so the prefix comes back
  // WITH the family, rather than the gate silently scanning a list that names a
  // family it can no longer see.
  "enter-",
  "reveal-",
  "marquee-",
  "petals-",
  "sakura",
  "boot-",
  // Tailwind-generated, from the `--animate-*` tokens in theme.css. They are
  // declared by Tailwind at build time rather than by hand, but they resolve the
  // same way and a typo in `animate-slide-in` is just as silent.
  "slide-in",
  "fadeIn",
];

/**
 * Shorthands and longhands that take an animation name. `transition` is NOT in
 * this list: transitioning is a different feature, and including it would pull in
 * every `transform`, `opacity` and `clip-path` token in the file.
 */
const ANIMATION_DECL = /animation(?:-name)?\s*:\s*([^;}]+)/g;

const files = readdirSync(STYLE_DIR).filter((f) => f.endsWith(".css"));

const defined = new Map(); // name -> [file]
const references = []; // { name, file, line }

for (const file of files) {
  const path = join(STYLE_DIR, file);
  const text = readFileSync(path, "utf8");

  /**
   * ── WHY COMMENTS ARE STRIPPED, AND WHY IT MATTERS MORE THAN IT SOUNDS ──────
   * `global.css:152` is a sentence: "`.animate-fade-in` and `@keyframes fadeIn`
   * used to live here." A parser that greps raw lines reads that as a DEFINITION
   * of `fadeIn`, and the consequence is not cosmetic — a phantom definition
   * makes a genuinely dangling reference to that name resolve, so the gate would
   * report "all resolve" for a name that no longer exists anywhere. It would also
   * defeat the unreachable-name check below, which is the check that keeps this
   * gate's own prefix list honest.
   *
   * This repository has the same trap recorded elsewhere ("komentar memicu gate
   * yg menghitung string di dokumen TERSAJI"), which is why the strip is done
   * BEFORE any line matching rather than per-pattern.
   *
   * Line structure is preserved — each comment character becomes a space and
   * newlines are kept — so `line` numbers in the report still point at the real
   * line of the real file. A stripper that collapsed the text would silently
   * shift every reported line number, and a finding with the wrong line number
   * is a finding someone has to re-derive by hand.
   */
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split(/\r?\n/);

  /**
   * ── DECLARATIONS ARE SCANNED AS WHOLE STATEMENTS, NOT LINE BY LINE ─────────
   *
   * AND THIS IS THE FIX THE BATTERY WAS WRITTEN TO FORCE, because the line-by-line
   * version had a hole aimed exactly at the thing this gate is for. The rule that
   * exposed it was a WRAPPED two-name shorthand — the mascot's, deleted with her
   * on 2026-09-24, but kept here as the record of why the scanner has this shape:
   *
   *     .mascot-bounce {                         // (no longer in the tree)
   *       animation: mascot-enter-soft 420ms var(--enter-ease) both,
   *                  mascot-bounce 3.4s ease-in-out infinite 420ms;
   *     }
   *
   * The second name sat on the CONTINUATION line, which contains no `animation:`
   * token — so a per-line scan never looked at it. Battery case M3 renamed exactly
   * that name and the gate stayed GREEN, on this tree, measured:
   *
   *     line 824:  mascot-bouns 3.4s ease-in-out infinite 420ms;
   *     verify:keyframes -> OK: 22 keyframes defined, 29 references, all resolve.
   *
   * The first name (the entrance) resolved, so the rule looked healthy, and the
   * SECOND name was the idle. The gate was blind to its own subject. No two-name
   * shorthand survives the mascot's removal, so the scanner is now belt-and-braces
   * rather than load-bearing — but a wrapped list is one edit away and the shape
   * that survived a real defect is the shape that stays.
   *
   * ── HOW A STATEMENT BOUNDARY IS FOUND WITHOUT A CSS PARSER ─────────────────
   * A declaration ends at `;`. Braces and comments are already blanked out above,
   * so the only remaining structure is "text terminated by a semicolon". Splitting
   * on `;` and scanning each fragment as one unit is enough, because a CSS value
   * may legally contain almost anything EXCEPT a semicolon.
   *
   * ── THE ONE PLACE THIS COULD GO WRONG, AND WHY IT DOES NOT HERE ────────────
   * A semicolon INSIDE a string literal or a url() would split a declaration in
   * two. This app's stylesheets contain neither in a value that also names an
   * animation, and the failure direction is safe: a split can only make a name
   * fail to match, never invent one. It is recorded here rather than guarded,
   * because a guard for a case that does not occur is a line nobody can test.
   */
  const statements = stripped
    .join("\n")
    .split(";")
    // Track the line each statement STARTS on, so a finding still reports a
    // line number a human can open. Semicolons are not evenly distributed, so
    // this is derived by counting the newlines consumed so far.
    .reduce(
      (acc, chunk) => {
        const at = acc.consumed;
        const line = (acc.text.slice(0, at).match(/\n/g) || []).length + 1;
        acc.list.push({ body: chunk, line });
        acc.consumed += chunk.length + 1; // +1 for the ';' the split removed
        acc.text += `${chunk};`;
        return acc;
      },
      { list: [], consumed: 0, text: "" }
    ).list;

  for (const { body, line } of statements) {
    const kf = body.match(/@keyframes\s+([A-Za-z0-9_-]+)/);
    if (kf) {
      if (!defined.has(kf[1])) defined.set(kf[1], []);
      defined.get(kf[1]).push(`${path}:${line}`);
    }

    // `animation:` shorthand and `animation-name:` longhand. EVERY comma-separated
    // part may name a keyframe — a shorthand is a LIST. The live declarations here
    // are single-name today, but the mascot's wrapped two-name rules (deleted
    // 2026-09-24) are the record of why the list form must be handled.
    //
    // ── WHY THIS ITERATES THE PARTS INSTEAD OF TAKING THE FIRST TOKEN ────────
    // The first version took only the first token of the whole declaration, and
    // the battery caught it: case M3 renamed the SECOND name in `.mascot-bounce`
    // (`mascot-enter-soft ..., mascot-bouns ...`) and the gate stayed GREEN,
    // because it was reading `mascot-enter-soft` — which resolved — and never
    // looking at the name the case had broken. Measured on committed bytes:
    //
    //     .mascot-bounce { animation: mascot-enter-soft 420ms ... both,
    //                                  mascot-bouns 3.4s ... infinite 420ms; }
    //     verify:keyframes -> exit 0
    //
    // In that codebase the FIRST name was the entrance and the SECOND was the idle,
    // so taking the first token alone meant the gate was blind to precisely the
    // name it was written for. Iterating the parts finds both, and it is the only
    // shape that stays correct if a list is written again.
    //
    // ── AND WHY AN IDENTIFIER IS MATCHED WITH ITS LEADING DASHES ─────────────
    // The second version matched the name shape `[A-Za-z][A-Za-z0-9_-]*`, which
    // cannot see that `--enter-ease` is a CUSTOM PROPERTY: the match starts at the
    // `e`, so the two dashes that are the entire difference between a custom
    // property and a keyframe are gone by the time the name is tested. Measured
    // in the same run that found the M3 hole: nine false FAILs, every one of them
    // a custom property —
    //
    //     FAIL: enter-ease (motion.css:385)   <- var(--enter-ease)
    //     FAIL: reveal-dur (motion.css:528)   <- var(--reveal-dur)
    //
    // A gate whose output is nine false findings is a gate that gets widened until
    // it finds nothing. So the pattern now REQUIRES the dashes to be present or
    // absent explicitly: `(?:--)?`. A custom property keeps its marker and is
    // rejected by the `startsWith("--")` test in the loop; a keyframe name keeps
    // its true spelling.
    const IDENT = /(?:--)?[A-Za-z][A-Za-z0-9_-]*/g;
    for (const m of body.matchAll(ANIMATION_DECL)) {
      const value = m[1];
      for (const part of value.split(",")) {
        if (/^\s*(none|inherit|initial|unset|revert)\s*$/.test(part)) continue;
        for (const token of part.match(IDENT) || []) {
          // Custom properties are values, not animation names. See the note above;
          // without this line the gate reports every `var(--enter-ease)` as a
          // dangling keyframe.
          if (token.startsWith("--")) continue;
          if (!OUR_PREFIXES.some((p) => token.startsWith(p))) continue;
          references.push({ name: token, file, line });
        }
      }
    }
  }
}

const missing = references.filter((r) => !defined.has(r.name));

if (missing.length > 0) {
  console.error("FAIL: animation names referenced but never defined as @keyframes:");
  for (const r of missing) {
    console.error(`  ${r.name}  (${r.file}:${r.line})`);
  }
  console.error("");
  console.error("A name with no @keyframes is a silent no-op: the element");
  console.error("matches the rule, the browser drops the unknown name, and");
  console.error("nothing in the build or the browser console says so.");
  process.exit(1);
}

/**
 * ── THE CHECK THAT KEEPS `OUR_PREFIXES` FROM BECOMING A BLIND SPOT ──────────
 *
 * The reference scan admits a name only if it matches one of OUR_PREFIXES. That
 * is a hand-maintained list, and a hand-maintained list has one characteristic
 * failure: a keyframe added next month under a name nobody thought to add, whose
 * references are then INVISIBLE to this gate — which is exactly the silent
 * incompleteness the gate exists to prevent, reintroduced by the gate itself.
 *
 * So the direction is inverted for one check: a declared keyframe whose name this
 * gate would never have admitted as a reference is reported. It is an ERROR and
 * not a note, because the repair is one word (add the prefix) and the failure it
 * prevents is invisible.
 *
 * This is deliberately about NAMES, not about usage: `slide-in` is unreferenced
 * in any stylesheet this gate reads and must not trip this.
 */
const unreachable = [...defined.keys()].filter(
  (n) => !OUR_PREFIXES.some((p) => n.startsWith(p))
);

if (unreachable.length > 0) {
  console.error("FAIL: @keyframes declared under a name this gate cannot scan for:");
  for (const n of unreachable) {
    console.error(`  ${n}  (${defined.get(n).join(", ")})`);
  }
  console.error("");
  console.error("Every reference to these is invisible to the check above, so a");
  console.error("typo in one of them would be reported as 'all resolve'. Add the");
  console.error(`prefix to OUR_PREFIXES in ${import.meta.url.split("/").pop()}.`);
  process.exit(1);
}

const unused = [...defined.keys()].filter(
  (n) => !references.some((r) => r.name === n)
);

console.log(
  `OK: ${defined.size} keyframes defined, ${references.length} references, all resolve.`
);
if (unused.length > 0) {
  // Informational only — see the header. Exit code stays 0.
  console.log(`note: defined but not currently referenced: ${unused.join(", ")}`);
}
process.exit(0);
