# Provenance: ct-full.tmp.txt (archived 2026-09-27)

**What it is.** A full-run log of the WCAG contrast gate (`e2e/test-contrast.mjs`,
or its unreleased predecessor) captured on 2026-09-27 during the Stage-4 audit
work. 373 lines, ~46 KB. Untracked, and not matched by any `.gitignore` rule
(`ct-full.tmp.txt` does not match `.gitignore:155 *.tmp-*`, because the suffix
is `.txt`, not the leading `.tmp-` prefix).

**Why it was archived rather than kept in the tree.** It is STALE and
MISLEADING. Its failures do not describe the current app:

- `span.marquee-item  "PENGUMUMAN UJI KONTRAS: pendaftaran batc"  fg=rgb(31,29,28) bg=rgb(199,0,54)`
  — the string `PENGUMUMAN UJI KONTRAS` no longer exists anywhere under `src/`.
  It was synthetic fixture text injected to prove the gate could fail. The real
  `.marquee-item` failure it reported (`#1f1d1c` on `rgb(199,0,54)` = 2.78:1) is
  now FIXED, and the fix is documented in `src/styles/global.css` §(marquee) —
  grep `marquee-item` in that file, around line 1617.

- `span.hidden.sm:inline  "Detail"  fg=rgb(2,6,24) bg=rgb(180,83,9)  = 4.01:1`
  — these are the OLD computed numbers, produced before the gate learnt to
  confirm a computed miss against a real pixel sample. The current gate skips
  text it cannot measure rather than reporting a computed-only verdict; the
  amber button it flagged measures 5.02:1 (PASS) under the corrected method.

So a reader who finds this file and runs `grep FAIL` would believe the tree is
red when it is not. That is the specific harm: a stale log that looks like
evidence.

**Where it came from, if you need it back.** It predates commit `36712a9`
("fix(a11y): add a WCAG AA contrast gate, and fix the two misses it found") —
it is the "before" picture, i.e. the gate output that motivated that commit.
It has no value as a current measurement and some value as a historical one,
which is why it was preserved rather than deleted.

**How to re-run the real thing** (reproduces, in seconds, what this file
records in a stale snapshot):

    npm run build
    node server.cjs            # serves dist/ on :4321; the gate requires THIS harness
    node e2e/test-contrast.mjs # the gate itself — authoritative

**Decision of record.** Raised as action item #4 in
`deliverables/gstack/design-review-hero-parallax-2026-09-27.md:200`, flagged
"P2, kapan saja, owner = Anda". Resolved 2026-09-27 by moving it to
`F:/tmp/ct-full.tmp.txt` (outside the repo). Deletion was NOT chosen: the repo
is public and the file is untracked, so a move is reversible and a delete would
not be. Nothing in the build, the test suites, or any gate reads this file —
verified before archiving. If you want it gone entirely, delete it from
`F:/tmp/`; it will not come back.
