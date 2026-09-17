/**
 * ui-audit.mjs — measure the UI in a real browser instead of reading CSS
 *
 * WHY THIS EXISTS
 * ---------------
 * Two reviews of this repo were misled by static reading (see
 * .workbuddy-ai/memory/SESSION_LOG.md, 2026-09-13: "dua kali premis dari
 * pembacaan statis menyesatkan. Jalankan UI lalu klik."). A class name
 * appearing in a `class="…"` attribute tells you nothing about whether a
 * rule exists or whether it wins the cascade.
 *
 * This script answers the question directly: it loads the pages in Chromium,
 * reads `getComputedStyle` on real elements, and — crucially — scans the
 * CSSOM for the selector so a *missing* rule is distinguishable from a rule
 * that lost the cascade.
 *
 * It found the defect this script was written for: `.input` / `.label` /
 * `.section-title` / `.glass-panel` / `.fade-in` / `scrollbar-hide` were
 * referenced 86 times across 13 files with NO definition anywhere, so every
 * field rendered as `border: 0px; background: transparent; border-radius: 0px`.
 * See docs/UI_DESIGN_REVIEW.md §2.
 *
 * USAGE
 * -----
 *   # Vite caches the transformed CSS. After editing src/styles/*.css you MUST
 *   # clear it and restart, or you will measure the OLD stylesheet and conclude
 *   # your fix did nothing (this happened once already):
 *   rm -rf node_modules/.vite && npm run dev
 *
 *   npm run ui:audit
 *
 *   # The dev server's dep optimizer can die (esbuild cannot rewrite
 *   # node_modules/.vite under the safe-delete shim, so Preact islands never
 *   # hydrate and every page measures as blank). A production preview avoids
 *   # that path entirely and is the more faithful thing to measure anyway:
 *   npm run build && npx astro preview --port 4330
 *   AUDIT_BASE=http://127.0.0.1:4330 npm run ui:audit
 *
 *   # Both traps above have the same symptom — a page reports zero inputs —
 *   # and the same wrong diagnosis ("the styling broke"). The log distinguishes
 *   # did-not-load / gate-redirect / did-not-hydrate so you never have to guess.
 *
 *   # /ai-cv is gated on a REAL session — give it one, or it will be skipped:
 *   AUDIT_AI_CV_TOKEN='{"sessionToken":"…","isLoggedIn":true,"role":"kandidat",…}' \
 *     npm run ui:audit
 *
 * Measured surfaces: /master, /apply and /admin render under a fabricated
 * session (their gate only reads authStore); /ai-cv needs AUDIT_AI_CV_TOKEN.
 * /admin was added in round 3 — all six light-mode shim gaps found in round 2
 * lived in admin-side components, and it had never been measured before.
 *
 * Writes `.tmp-audit/report.txt`, `.tmp-audit/summary.json`, plus
 * `<page>-<theme>.png` screenshots (all gitignored). Exits non-zero on a real
 * defect: an undefined selector, a page error, a console error, or a page that
 * stayed put yet rendered nothing. A gate redirect is NOT a defect — it is the
 * app refusing a fake session — so it is reported as a skip and does not fail
 * the run.
 *
 * KNOWN NON-DEFECT under `astro preview`: every call to /.netlify/functions/*
 * 404s (Astro's own HTML 404 page), so the app's `res.json()` throws
 * `Unexpected token '<'`. The script recognises that transport signature and
 * does not count it, logging how many it filtered instead of hiding them — a
 * gate that cries wolf on a clean tree is a gate that gets ignored. Counts are
 * in summary.json as both `consoleErrors` (raw) and `realConsoleErrors`.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:4321';
const OUT = '.tmp-audit';

/**
 * `gate` records what each route needs before it will render its body, because
 * that decides whether a fake session is enough:
 *
 *   'store'  — AuthGuard only checks authStore. A fake blob in
 *              localStorage.asj_auth is genuinely sufficient, so the numbers
 *              below are the real page's styling.
 *   'server' — the page re-verifies the session against the backend, so an
 *              unknown token is treated as invalid and the context is logged
 *              out and redirected. Needs AUDIT_AI_CV_TOKEN; without it the
 *              script reports a skip instead of silently measuring '/' .
 *   'none'   — public.
 *
 * `/admin` is 'store', and that is not a guess: measured 2026-09-14, 10 tabs
 * and 158 rows render under a fake admin session, and all six light-mode shim
 * gaps found in round 2 lived in admin-side components — which is exactly why
 * this route is worth carrying here permanently rather than measuring it once
 * with an ad-hoc script.
 */
const PAGES = [
  { name: 'master', path: '/master', gate: 'store' },
  // `gate: 'server'` + `tokenEnv` = this page needs a REAL session, and without
  // one there is nothing honest to report about it. See REAL_TOKENS.
  { name: 'ai-cv', path: '/ai-cv', gate: 'server', tokenEnv: 'AUDIT_AI_CV_TOKEN' },
  { name: 'apply', path: '/apply', gate: 'store' },
  { name: 'admin', path: '/admin', gate: 'store', role: 'admin' },
  // `/candidate` was missing from this list entirely until round 8, which made
  // it the one route nobody could see was unmeasured. Measured before adding it
  // (2026-09-14): with NO session it redirects to '/'; with the fabricated
  // kandidat session it stays put and renders the dashboard shell (6 nav tabs,
  // 0 inputs). So its gate reads the store, exactly like /admin, and the
  // fabricated session does reach it.
  //
  // What this measures is the SHELL. The dashboard's data comes from the
  // backend, which `astro preview` does not serve, so the VIP-only states are
  // still unmeasured and must not be claimed from this entry.
  { name: 'candidate', path: '/candidate', gate: 'store' },
  // The Loker table lives on the landing page, not on a /loker route (there is
  // no such route — probed, 404). It is public, so no session is needed, and it
  // is the surface §11.2's P1 finding is about: only 3 of 10 rows sit above the
  // fold at 900x1200, and the action targets are 28x28. Never a route this
  // audit had looked at before round 3.
  { name: 'loker', path: '/', gate: 'none', warnOnly: true },
];

/** Classes this audit has historically caught as undefined. Extend as needed. */
const WATCHED = [
  'input',
  'label',
  'section-title',
  'glass-panel',
  'fade-in',
  'scrollbar-hide',
  // Added in round 7 at the owner's request. `rt-row` / `rt-full` carried the
  // mobile card layout in LokerTable.tsx for a long time with ZERO rules
  // anywhere (measured: `rt-full` matched no CSSOM rule, and the cell computed
  // to `display: table-cell` at 390x844). They have definitions now (layout.css
  // §3c), so watching them turns "it is defined" into something the gate
  // re-checks on every deploy instead of something a past session asserted once.
  'rt-row',
  'rt-full',
];

/**
 * A fake session so the login gate does not hide the form body.
 *
 * Good enough for /master, /apply, /admin and /candidate, which only check "is
 * someone logged in". NOT good enough for a `gate: 'server'` page.
 *
 * CORRECTED IN ROUND 8. This block used to claim that /ai-cv "re-verifies the
 * session against the backend ... and the context is logged out and redirected
 * to '/'", so that "the script reports that the page was skipped rather than
 * quietly measuring the landing page instead".
 *
 * Measured, the second half of that was FALSE. /ai-cv does not redirect. With
 * no session it renders an in-place "Verifikasi Akun Kandidat" gate — a
 * WhatsApp field and a password field — and the audit counted those 2 inputs,
 * set the verdict to `ok`, and printed `MEASURED 10 surface(s)`. A green run
 * reporting numbers for a page it never reached is the exact silent lie this
 * script exists to prevent, and it was living inside the guard meant to prevent
 * it.
 *
 * The redirect guard could not catch it, because there was no redirect. The fix
 * is not a smarter DOM heuristic — matching a password field would break the
 * day the real page grows one — but a deterministic one: a page that declares
 * `gate: 'server'` is reported `unmeasured-gate` whenever no real token was
 * supplied for it, no matter what rendered.
 */
const REAL_TOKENS = Object.fromEntries(
  PAGES.filter((p) => p.tokenEnv).map((p) => [p.name, process.env[p.tokenEnv] || '']),
);

const REAL_AUTH = process.env.AUDIT_AI_CV_TOKEN || '';

const FAKE_AUTH = REAL_AUTH || JSON.stringify({
  sessionToken: 'audit-fake-token',
  refreshToken: '',
  isLoggedIn: true,
  role: 'kandidat',
  wa: '081234567890',
  name: 'Audit User',
  lastChecked: Date.now(),
});

/**
 * An admin session for /admin.
 *
 * /admin gates on authStore via AuthGuard, so a fabricated blob reaches it
 * (measured 2026-09-14: 10 tabs, 158 rows, 0 page errors). If the caller passes
 * a real AUDIT_AI_CV_TOKEN we reuse it and only raise the role, so the audit
 * runs against a genuine session when one is available; otherwise we build the
 * same shape as FAKE_AUTH with role 'admin'.
 */
function adminAuth(real) {
  if (real) {
    try {
      return JSON.stringify({ ...JSON.parse(real), role: 'admin' });
    } catch {
      // A malformed token is the caller's problem to see, not to hide: fall
      // through to the fabricated admin and let the warning in main() speak.
    }
  }
  return JSON.stringify({
    sessionToken: 'audit-fake-admin',
    refreshToken: '',
    isLoggedIn: true,
    role: 'admin',
    wa: '081234567890',
    name: 'Audit Admin',
    lastChecked: Date.now(),
  });
}

/** Find the first rule whose selector mentions `cls`, across every sheet. */
const RULE_PROBE = (watched) => {
  const found = {};
  for (const cls of watched) found[cls] = null;
  const re = new RegExp('(^|[^\\w-])\\.(' + watched.join('|') + ')([^\\w-]|$)');

  /**
   * Descend into grouping rules (`@media`, `@supports`, `@layer`).
   *
   * This is not a nicety. `rt-row` / `rt-full` are defined ONLY inside
   * `@media (max-width: 767px)` in layout.css, and a walk that visits only
   * top-level `sheet.cssRules` reports them as undefined — a RED gate on a
   * clean tree. Measured 2026-09-14: with the flat walk, `rt-row` and
   * `rt-full` both came back `null` while `input` and `section-title`, which
   * are top-level rules, resolved fine. A gate that cries wolf on a clean tree
   * is a gate that gets ignored, which is the whole reason this script exists.
   *
   * The context string is kept so a hit can say WHERE the rule lives; without
   * it, "`rt-full` is defined" hides that it is defined only on phones.
   */
  const walk = (rules, depth, ctx) => {
    if (!rules || depth > 6) return;
    for (const r of rules) {
      let label = '';
      try { label = r.conditionText || r.name || ''; } catch { label = ''; }
      const here = label ? (ctx ? ctx + ' > ' + label : label) : ctx;
      if (r.selectorText && re.test(r.selectorText)) {
        for (const cls of watched) {
          if (!found[cls] && new RegExp('(^|[^\\w-])\\.' + cls + '([^\\w-]|$)').test(r.selectorText)) {
            found[cls] = (here ? here + ' :: ' : '') + r.selectorText;
          }
        }
      }
      if (r.cssRules) walk(r.cssRules, depth + 1, here);
    }
  };

  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    walk(rules, 0, '');
  }
  return found;
};

const STYLE_PROBE = () => {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      cls: String(el.className || '').slice(0, 80),
      color: cs.color,
      bg: cs.backgroundColor,
      border: cs.borderTopWidth + ' ' + cs.borderTopColor,
      radius: cs.borderRadius,
      fontSize: cs.fontSize,
      text: (el.textContent || '').trim().slice(0, 32),
    };
  };
  const inputs = [...document.querySelectorAll('input, select, textarea')].filter((e) => e.offsetParent);
  const labels = [...document.querySelectorAll('label')].filter((e) => e.offsetParent);
  return {
    inputCount: inputs.length,
    labelCount: labels.length,
    sampleInputs: inputs.slice(0, 3).map(box),
    sampleLabels: labels.slice(0, 3).map(box),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
    // How many top-level nav tabs the page managed to render. /admin hydrates
    // as an island and paints its tab strip from data, so this doubles as the
    // hydration signal on a route that has no inputs of its own.
    tabCount: [...document.querySelectorAll('nav a, nav button, [role="tab"]')].filter(
      (e) => e.offsetParent,
    ).length,
  };
};

async function shoot(browser, theme, log, summary) {
  for (const p of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 1200 } });

    // `gate: 'server'` pages (see PAGES) reject a fabricated token. Sending one
    // anyway does not merely fail to measure the page — it writes a logged-out
    // session and redirects, and a script that then reports numbers for
    // "/ai-cv" is telling a silent lie. So we send storage only for pages that
    // gate on the store, and for the rest we send the theme and nothing else.
    const storePayload = p.gate === 'server'
      ? { asjTheme: theme, asj_lang: 'id' }
      : {
          asjTheme: theme,
          asj_lang: 'id',
          asj_auth: p.role === 'admin' ? adminAuth(REAL_AUTH) : FAKE_AUTH,
        };
    await ctx.addInitScript(
      (payload) => {
        try {
          for (const [k, v] of Object.entries(payload)) localStorage.setItem(k, v);
        } catch { /* storage disabled */ }
      },
      storePayload,
    );

    const page = await ctx.newPage();
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
    });

    /**
     * Backend calls are EXPECTED to fail under `astro preview`.
     *
     * `astro preview` serves static files only; the Netlify functions at
     * /.netlify/functions/* do not exist there, so every call returns Astro's
     * own HTML 404 page and the app's `await res.json()` throws
     * `SyntaxError: Unexpected token '<', "<!doctype "... is not valid JSON`.
     *
     * That is an artefact of the measuring environment, not a defect in the
     * app, and counting it as one makes the gate cry wolf on a clean tree —
     * which is precisely how a gate gets ignored. (Measured 2026-09-14: with
     * this filter off, /admin and / both reported failures whose only cause was
     * the missing functions; `netlify dev` is what serves them for real.)
     *
     * Structural failures are NOT filtered: a genuine `TypeError` from reading
     * a field off an undefined response still counts, because only the
     * transport-level signature is suppressed below.
     */
    const isBackendAbsent = (msg) =>
      /is not valid JSON|Unexpected token '<'|Failed to load resource.*404|ERR_/.test(msg);
    const realConsoleErrors = consoleErrors.filter((m) => !isBackendAbsent(m));
    // Zero inputs has three different causes and conflating them produces a
    // confidently wrong diagnosis. Track the final URL so the warning can tell
    // them apart:
    //   1. the page never loaded at all (server down)      -> chrome-error://
    //   2. the page redirected to an in-app route          -> a gate rejected us
    //   3. the page stayed put but rendered nothing        -> island did not hydrate
    // Case 2 is the app working correctly: /ai-cv re-verifies the session
    // against the backend, apiClient treats an unknown token as invalid, logs
    // out and redirects to '/'. Measuring the landing page while labelling it
    // "/ai-cv" would be a silent lie.
    let finalUrl = BASE + p.path;
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) finalUrl = f.url();
    });
    await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const appliedTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const rules = await page.evaluate(
      new Function('watched', 'return (' + RULE_PROBE.toString() + ')(watched);'),
      WATCHED,
    );
    const styles = await page.evaluate(new Function('return (' + STYLE_PROBE.toString() + ')();'));

    await page.screenshot({ path: `${OUT}/${p.name}-${theme}.png` });

    const undefinedCls = Object.entries(rules || {}).filter(([, v]) => !v).map(([k]) => k);
    const redirected = finalUrl !== BASE + p.path;
    const rendered = styles?.inputCount || styles?.tabCount;

    log.push(`\n=== ${p.name} [${theme}] data-theme=${appliedTheme} gate=${p.gate} ===`);
    log.push(JSON.stringify(
      { ...styles, finalUrl, undefinedSelectors: undefinedCls, errors, consoleErrors },
      null,
      1,
    ));

    // A gate redirect is the app working, and must never be reported as a
    // styling result. Only a page that stayed put counts.
    //
    // ROUND 8: a `gate: 'server'` page is `unmeasured-gate` whenever no real
    // token was supplied for it, and that decision is taken BEFORE looking at
    // what rendered. Deciding it afterwards is what let /ai-cv report `ok` for
    // its own login gate: with no session it does not redirect, it renders the
    // gate in place, so the redirect branch never ran and the two login fields
    // were counted as a measurement of /ai-cv.
    const hasRealToken = p.gate === 'server' && !!REAL_TOKENS[p.name];
    let verdict = 'ok';
    if (p.gate === 'server' && !hasRealToken) {
      verdict = 'unmeasured-gate';
      log.push(
        `-- ${p.name} NOT MEASURED: it needs a REAL session and ${p.tokenEnv} is unset. ` +
        `What rendered here is this page's own login gate` +
        `${redirected ? ` (it redirected to ${finalUrl})` : ' in place'}, NOT the page. ` +
        `The numbers above describe that gate and must not be read as ${p.name}'s ` +
        `styling. Set ${p.tokenEnv} to a real session to include this surface.`,
      );
    } else if (redirected) {
      verdict = 'redirected!';
      log.push(
        `!! ${p.name} redirects to ${finalUrl} even with gate='${p.gate}'. ` +
        `Its gate no longer matches what PAGES says — fix the entry, do not ` +
        `trust the numbers above.`,
      );
    } else if (!rendered) {
      verdict = 'no-render!';
      log.push(`!! ${p.name} rendered ZERO inputs and ZERO tabs — island did not hydrate. Not a styling result.`);
    }

    if (undefinedCls.length) {
      log.push(`!! ${p.name} has ${undefinedCls.length} UNDEFINED selector(s): ${undefinedCls.join(', ')}`);
    }
    if (errors.length || realConsoleErrors.length) {
      log.push(`!! ${p.name} produced ${errors.length} page error(s) and ${realConsoleErrors.length} console error(s).`);
    } else if (consoleErrors.length) {
      log.push(
        `-- ${p.name}: ${consoleErrors.length} console error(s), all attributable to the ` +
        `backend being unreachable here (static preview serves no /.netlify/functions). ` +
        `Not counted. Run under \`netlify dev\` to see them disappear.`,
      );
    }

    // Exit non-zero on a real defect only. `unmeasured-gate` means the surface
    // was never reached — that is a gap in COVERAGE, not a defect in the app,
    // and it must not fail the gate: otherwise AUDIT_AI_CV_TOKEN would become
    // mandatory just to get a green run, and a gate nobody can run is a gate
    // nobody runs. It is reported loudly at the end instead, so that a green run
    // can never be read as "everything was measured".
    const failed = verdict === 'no-render!' || verdict === 'redirected!' ||
      undefinedCls.length > 0 || errors.length > 0 || realConsoleErrors.length > 0;
    if (failed && !p.warnOnly) process.exitCode = 1;

    summary.push({
      page: p.name, theme, gate: p.gate,
      appliedTheme, finalUrl, verdict,
      inputCount: styles?.inputCount ?? null,
      tabCount: styles?.tabCount ?? null,
      undefinedSelectors: undefinedCls,
      pageErrors: errors.length,
      consoleErrors: consoleErrors.length,
      realConsoleErrors: realConsoleErrors.length,
    });
    await ctx.close();
  }
}

// Preflight: if BASE is not serving, every surface fails with chrome-error and
// the report reads as "10 regressions" when the real cause is a dead/wrong
// port. That false red is worse than useless, so fail loudly and early instead.
// (Hit for real when this script defaulted to 4321 while preview ran on 4330.)
try {
  const probe = await fetch(BASE, { signal: AbortSignal.timeout(5000) });
  if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
} catch (err) {
  console.error(
    `\n!! Cannot reach ${BASE} — ${err?.message || err}\n` +
      `!! Start the preview first, or point AUDIT_BASE at the right port:\n` +
      `!!   npx astro preview --port 4321\n` +
      `!!   AUDIT_BASE=http://127.0.0.1:4330 npm run ui:audit\n` +
      `!! Every surface below would report "redirected!" for this reason alone.\n`,
  );
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const log = [];
const summary = [];
mkdirSync(OUT, { recursive: true });
try {
  await shoot(browser, 'light', log, summary);
  await shoot(browser, 'dark', log, summary);
} finally {
  await browser.close();
}
log.push('\nDONE');
const text = log.join('\n');
writeFileSync(`${OUT}/report.txt`, text);
// Machine-readable companion. report.txt is for a human reading a diff; the
// JSON is so a later round can assert on "0 undefined selectors" without
// re-parsing prose, and so the number of measured surfaces is auditable.
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2));
console.log(text);

/**
 * The closing line is a COVERAGE statement, not a victory lap.
 *
 * It used to read `MEASURED ${summary.length} surface(s)` — which counted every
 * surface, including the ones the run had just decided not to measure. On
 * 2026-09-14 that printed "MEASURED 10 surface(s)" while /ai-cv had in fact
 * rendered its login gate, so the one line a reader skims was the one line that
 * overstated what had been checked. Counting only `ok` makes the number mean
 * what it says; the rest are named with the reason.
 */
const okN = summary.filter((s) => s.verdict === 'ok').length;
const gaps = summary.filter((s) => s.verdict === 'unmeasured-gate');
const broke = summary.filter((s) => s.verdict !== 'ok' && s.verdict !== 'unmeasured-gate');

console.log(
  `\nMEASURED ${okN} of ${summary.length} surface(s): ` +
  summary.map((s) => `${s.page}[${s.theme}]=${s.verdict}`).join(' '),
);
if (gaps.length) {
  const envs = [...new Set(gaps.map((s) => PAGES.find((p) => p.name === s.page)?.tokenEnv).filter(Boolean))];
  console.log(
    `NOT MEASURED (${gaps.length}): ${gaps.map((s) => `${s.page}[${s.theme}]`).join(' ')} ` +
    `— these need a real session. Set ${envs.join(' / ') || '(a token)'} and re-run. ` +
    `A green exit here does NOT mean these surfaces were checked.`,
  );
}
if (broke.length) {
  console.log(
    `FAILED (${broke.length}): ${broke.map((s) => `${s.page}[${s.theme}]=${s.verdict}`).join(' ')}`,
  );
}
