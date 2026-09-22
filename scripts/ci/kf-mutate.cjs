/**
 * kf-mutate.cjs — apply ONE exact substitution to a stylesheet, or refuse.
 *
 * ── WHY THIS IS A FILE AND NOT `node -e` INSIDE THE BATTERY ─────────────────
 * It was `node -e '...'` first, and the quoting cost more time than the mutation
 * logic. Three separate ways it broke, all silent or near-silent:
 *
 *   * a `\n` in an ANCHOR had to mean "this file's own line ending", so the
 *     script needs the two-character sequence backslash-n to survive the shell;
 *   * the script printed a message containing an APOSTROPHE (`case's`), which
 *     terminated the single-quoted shell string and turned valid JavaScript into
 *     `syntax error near unexpected token '('`;
 *   * an interpolated heredoc was worse — Git-Bash eats quotes and backslashes,
 *     and a mangled script fails as a SyntaxError whose exit code 2 is
 *     indistinguishable from the legitimate "mutation did not apply" refusal.
 *
 * A separate file has none of those problems: the shell passes it a path and two
 * environment variables and interprets nothing else. The battery stays readable,
 * and the mutation logic becomes something that can be run by hand to diagnose a
 * case, which is what one wants at 1am when a case reports SURVIVED.
 *
 * ── CONTRACT ────────────────────────────────────────────────────────────────
 *   KF_FILE  path to the stylesheet (default: src/styles/motion.css)
 *   KF_OLD   the exact text to find
 *   KF_NEW   what to replace it with
 *
 * In KF_OLD / KF_NEW, a literal backslash-n means "one line ending", and a
 * literal backslash-t means two spaces. The line ending is detected from the file
 * (CRLF vs LF) rather than assumed, because this stylesheet is CRLF on Windows
 * and LF in CI and an anchor must match in both.
 *
 * Exit 0  one occurrence replaced
 * Exit 2  zero or more than one occurrence — NOTHING was written
 */
const fs = require("node:fs");

const file = process.env.KF_FILE || "src/styles/motion.css";
const raw = fs.readFileSync(file, "utf8");

// Any CRLF means the file is CRLF throughout. True of every stylesheet here, and
// the assumption the repository's CRLF-trap record is about.
const EOL = raw.includes("\r\n") ? "\r\n" : "\n";

const decode = (s) =>
  String(s)
    .split("\\n")
    .join(EOL)
    .split("\\t")
    .join("  ");

const old = decode(process.env.KF_OLD);
const neu = decode(process.env.KF_NEW);

const hits = raw.split(old).length - 1;

if (hits !== 1) {
  console.error(
    `MUTATION DID NOT APPLY (hits=${hits}, eol=${EOL === "\r\n" ? "CRLF" : "LF"})`
  );
  console.error(`  anchor: ${JSON.stringify(old)}`);
  if (hits === 0) {
    console.error("  The anchor does not occur in the file at all.");
    console.error("  Either it is stale, or it spans lines and the newlines do");
    console.error("  not match — use a literal backslash-n for a line break.");
  } else {
    console.error("  The anchor occurs more than once, so the mutation would");
    console.error("  change an unintended rule. Make it longer or more specific.");
  }
  process.exit(2);
}

fs.writeFileSync(file, raw.replace(old, neu));
console.log(`  applied (1 hit, ${EOL === "\r\n" ? "CRLF" : "LF"})`);
process.exit(0);
