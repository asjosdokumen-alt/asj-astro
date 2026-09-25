/**
 * BaseLayout — the falling-sakura layer's contract.
 *
 * WHAT THIS FILE IS DEFENDING
 * ---------------------------
 * The layer was RESTORED 2026-09-25 (owner request, item 6) after shipping as
 * dead code: the container `#sakura-particles` existed in `BaseLayout.astro`
 * but nothing ever removed its `hidden` class, so zero petals rendered in
 * every theme. The failure modes below are exactly the ones that made the
 * dead-code state possible, plus the ones the legacy implementation
 * deliberately guards against:
 *
 *  1. The container loses `pointer-events: none` (or it is dropped from the
 *     stylesheet) → the full-viewport layer swallows every click on the page.
 *     Legacy comment: "pointer-events-none sehingga tidak mengganggu baca
 *     maupun klik" (`js/init/theme.ts:115`).
 *  2. The generator is not gated on the theme → petals fall in DARK mode too.
 *     Legacy: `setSakuraParticles(theme === 'SAKURA')`.
 *  3. The one-shot guard is removed → the layer grows by 30 nodes on every
 *     theme toggle (legacy `SAKURA_PETALS_CREATED`).
 *  4. `sakuraFall2` is referenced by the generator but not defined → ~45% of
 *     petals animate with no keyframes and freeze at their start frame.
 *  5. A second pair of keyframes drifts from the first.
 *
 * WHY SOURCE ASSERTIONS AND NOT A RENDER
 * --------------------------------------
 * Same reason as `JapanTexture.test.ts`: this repo has NO `.astro` render
 * harness (vitest has no Astro plugin, so importing a `.astro` file fails with
 * "content contains invalid JS syntax"). The established convention is to read
 * the component's source and assert the invariants. The RUNTIME behaviour
 * (petal count in the DOM, `pointer-events` computed, the animation actually
 * advancing) is verified separately in a real browser, because a jsdom test
 * cannot run a CSS animation and would only be asserting the source again.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutRaw = readFileSync(join(process.cwd(), 'src/layouts/BaseLayout.astro'), 'utf8');
const motionRaw = readFileSync(join(process.cwd(), 'src/styles/motion.css'), 'utf8');

/**
 * Normalise line endings before ANY region-based assertion touches the text.
 * `.gitattributes` does not pin these to LF, so they check out as CRLF on
 * Windows — the same trap `JapanTexture.test.ts` and `button.test.ts` document.
 */
const layout = layoutRaw.replace(/\r\n/g, '\n');
const motion = motionRaw.replace(/\r\n/g, '\n');

/** The `<script>` block that owns the petal generator (the last one in body). */
const sakuraScript = (() => {
  const marker = 'Sakura petals — the falling-leaves layer';
  const start = layout.indexOf(marker);
  expect(start, 'the sakura script header was not found in BaseLayout.astro').toBeGreaterThan(-1);
  return layout.slice(start);
})();

/** The §2 block of motion.css — the petals' CSS, from the container rule on. */
const petalCss = (() => {
  const start = motion.indexOf('#sakura-particles {');
  expect(start, 'the #sakura-particles rule was not found in motion.css').toBeGreaterThan(-1);
  // Stop at the next section banner (or EOF) so the reduced-motion assertions
  // cannot be satisfied by an unrelated later block.
  const end = motion.indexOf('══', start + 1);
  return end > start ? motion.slice(start, end) : motion.slice(start);
})();

describe('sakura layer — one container, gated on the light theme', () => {
  it('renders the container once, hidden by default', () => {
    // The `hidden` default is what stops a dark-theme visitor from seeing
    // petals for the split second before the script runs.
    expect(layout).toContain('id="sakura-particles"');
    expect(layout).toMatch(/id="sakura-particles"[^>]*\bhidden\b/);
  });

  it('toggles the layer ONLY for the light theme', () => {
    // Odd, deliberate spelling: the comparison must read `=== 'light'`.
    // A `!==` or a truthiness check would show petals in dark mode.
    expect(sakuraScript).toMatch(/mode\s*===\s*'light'/);
    expect(sakuraScript).toContain("classList.remove('hidden')");
    expect(sakuraScript).toContain("classList.add('hidden')");
  });

  it('subscribes to the single theme store rather than keeping its own state', () => {
    expect(sakuraScript).toContain("from '../store/theme'");
    expect(sakuraScript).toContain('themeStore.subscribe');
    expect(sakuraScript).toContain('themeStore.get()');
  });
});

describe('sakura layer — 30 petals, built once', () => {
  it('generates exactly 30 petals', () => {
    expect(sakuraScript).toMatch(/const\s+PETAL_COUNT\s*=\s*30\b/);
    expect(sakuraScript).toMatch(/i\s*<\s*PETAL_COUNT/);
  });

  it('guards creation with a one-shot flag so a toggle cannot duplicate it', () => {
    // Without this the layer grows 30 -> 60 -> 90 on repeated theme toggles.
    expect(sakuraScript).toMatch(/let\s+petalsCreated\s*=\s*false/);
    expect(sakuraScript).toMatch(/if\s*\([^)]*petalsCreated\s*\)\s*return/);
    expect(sakuraScript).toMatch(/petalsCreated\s*=\s*true/);
  });

  it('assigns the negative animation delay that populates the sky from frame one', () => {
    // Legacy: `-Math.random() * 24`. A POSITIVE delay would leave the sky
    // empty for up to 24s after load.
    expect(sakuraScript).toMatch(/animationDelay\s*=\s*-\s*Math\.random\(\)\s*\*\s*24/);
  });

  it('picks both fall tracks, and both are defined', () => {
    // The generator names `sakuraFall2` for ~45% of petals. If the keyframe
    // is missing those petals have no animation and freeze on their start
    // frame — a regression this file exists to catch.
    expect(sakuraScript).toContain("'sakuraFall2'");
    expect(sakuraScript).toContain("'sakuraFall'");
    expect(petalCss).toMatch(/@keyframes\s+sakuraFall\s*\{/);
    expect(petalCss).toMatch(/@keyframes\s+sakuraFall2\s*\{/);
  });
});

describe('sakura layer — decoration that can never intercept input', () => {
  it('the container is pointer-inert', () => {
    expect(petalCss).toMatch(/#sakura-particles\s*\{[^}]*pointer-events:\s*none/);
  });

  it('the container is aria-hidden', () => {
    expect(layout).toMatch(/id="sakura-particles"[^>]*aria-hidden="true"/);
  });

  it('sits at the legacy z-index, below every control in the app', () => {
    // `z-index: 1` matches `src/main.css:1961`. The app's own lowest control
    // layer is the hamburger's `z-30` (App.tsx), so atmosphere can never cover
    // chrome. (The scale lives in theme.css `@theme`; App.tsx no longer keeps a
    // private copy.)
    expect(petalCss).toMatch(/#sakura-particles\s*\{[^}]*z-index:\s*1\s*;/);
  });
});

describe('sakura layer — reduced motion keeps them falling, slowly', () => {
  it('overrides the global clamp with a fixed 12s infinite cadence', () => {
    // Legacy `src/main.css:2127`: the global `*` clamp would set these to
    // 0.01ms / 1 iteration and stop the petals dead. The override restores
    // `12s` / `infinite`, which is the legacy intent — "less motion", not
    // "no motion" for a slow ambient layer.
    const reduce = petalCss.slice(petalCss.indexOf('prefers-reduced-motion'));
    expect(reduce).toMatch(/\.sakura-petal\s*\{[^}]*animation-duration:\s*12s\s*!important/);
    expect(reduce).toMatch(/animation-iteration-count:\s*infinite\s*!important/);
  });

  it('motion.css no longer hides the layer under reduced motion', () => {
    // The old `#sakura-particles { display: none !important }` in §8 removed
    // the petals outright, contradicting the §2 override. It was deleted.
    //
    // Asserted over COMMENT-STRIPPED css: the §2 block above legitimately
    // names the deleted rule while explaining why it was wrong, and a check
    // that reads comments fails on the documentation of the rule it enforces.
    const cssOnly = motion.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(cssOnly).not.toMatch(/#sakura-particles\s*\{[^}]*display:\s*none/);
  });
});
