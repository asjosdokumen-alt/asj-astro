/**
 * scripts/lib/sql-ddl.mjs — pure SQL-text helpers for the migration runner.
 *
 * Zero imports ON PURPOSE. These functions only inspect SQL text, so they must
 * stay importable by tests without dragging `pg` (and the rest of the runner)
 * into the module graph — vitest chokes transforming that combination.
 */

/**
 * Remove comments from SQL, leaving everything else byte-identical.
 *
 * WHY THIS EXISTS
 *   The runner's non-transactional probe used to be /CONCURRENTLY/i against
 *   the RAW file text. Migration 017 therefore ran WITHOUT its BEGIN/COMMIT
 *   wrapper and WITHOUT the advisory lock — not because of any DDL in it, but
 *   because its header explains that it deliberately avoids CREATE INDEX
 *   CONCURRENTLY. One line of prose silently changed how the file executed.
 *   A comment must never be able to do that.
 *
 *   Single-quoted strings, double-quoted identifiers and dollar-quoted bodies
 *   are copied through byte-identical, so a `--` or `/*` inside them is never
 *   mistaken for a comment. Literal CONTENTS are handled one stage later, by
 *   hasConcurrentDdl's blankLiterals pass — see the note there.
 *   An unterminated literal or comment is treated as running to end-of-file,
 *   the way Postgres reads it, so this can never loop forever or drop
 *   executable statements.
 *
 * @param {string} sql
 * @returns {string} SQL with every comment replaced by whitespace
 */
export function stripSqlComments(sql) {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    // -- line comment: -- to end of line. The newline itself is kept. --------
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    // -- block comment: Postgres NESTS these, so depth, not "first */". -----
    if (ch === '/' && sql[i + 1] === '*') {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2; }
        else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2; }
        else i++;
      }
      out += ' ';
      continue;
    }
    // -- dollar-quoted body: $tag$ ... $tag$ (tag may be empty: $$ ... $$). -
    if (ch === '$') {
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (tag) {
        const close = tag[0];
        const end = sql.indexOf(close, i + close.length);
        if (end === -1) { out += sql.slice(i); break; }
        out += sql.slice(i, end + close.length);
        i = end + close.length;
        continue;
      }
    }
    // -- single-quoted string; '' is an escaped quote, not a close. ---------
    if (ch === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue; }
          j++;
          break;
        }
        j++;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }
    // -- double-quoted identifier. -----------------------------------------
    if (ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') { j += 2; continue; }
          j++;
          break;
        }
        j++;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Blank the CONTENTS of string literals and quoted identifiers, preserving
 * both delimiters and the span length.
 *
 * WHY A SECOND STAGE
 *   A migration may legitimately carry the word CONCURRENTLY inside DATA — a
 *   note row, a template body, a comment that survived to runtime. That is not
 *   DDL, so it must not classify the migration as non-transactional.
 *
 *   Dollar-quoted bodies are deliberately NOT blanked: those are CODE (function
 *   and procedure bodies), and `EXECUTE 'CREATE INDEX CONCURRENTLY …'` inside
 *   one is real non-transactional DDL that will run. Blanking those would hide
 *   it. Literal contents become spaces, which can only ever REMOVE words from
 *   the probe's view — it can never manufacture a false positive.
 *
 *   Runs AFTER stripSqlComments, so no comment can be mistaken for a literal
 *   and no literal can swallow a comment marker.
 *
 * @param {string} sql comment-free SQL
 * @returns {string} SQL with literal/identifier contents replaced by spaces
 */
function blankLiterals(sql) {
  let out = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < n) {
        if (sql[j] === quote) {
          if (sql[j + 1] === quote) { j += 2; continue; }
          j++;
          break;
        }
        j++;
      }
      // Delimiters stay (so the shape of the statement is still readable);
      // only the contents are blanked.
      out += quote + ' '.repeat(Math.max(0, j - i - 2)) + quote;
      i = j;
      continue;
    }
    if (ch === '$') {
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (tag) {
        const close = tag[0];
        const end = sql.indexOf(close, i + close.length);
        if (end === -1) { out += sql.slice(i); break; }
        out += sql.slice(i, end + close.length);
        i = end + close.length;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Does this migration contain non-transactional DDL?
 *
 * Two stages, in order: comments are removed, then literal contents are
 * blanked. Word-bounded on purpose: `CONCURRENTLY` as part of a longer
 * identifier is not the keyword. Failing to detect a real one is the SAFE
 * direction — the migration then runs inside a transaction and Postgres
 * rejects it loudly, instead of losing atomicity silently the way a comment
 * once did.
 *
 * @param {string} sql
 * @returns {boolean} true when the executable SQL uses CONCURRENTLY
 */
export function hasConcurrentDdl(sql) {
  return /\bCONCURRENTLY\b/i.test(blankLiterals(stripSqlComments(sql)));
}
