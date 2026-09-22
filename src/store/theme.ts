/**
 * theme.ts — Single source of truth for dark/light theme (Nanostores)
 *
 * WHY THIS EXISTS
 * ---------------
 * There were three independent `toggleTheme()` implementations
 * (App.tsx, public/LokerTable.tsx, forms/FormToolbar.tsx), each holding
 * its own `isDark` useState. Toggling from one left the others stale —
 * the header banner and the moon/sun icon would disagree with the page
 * you actually toggled from.
 *
 * This module owns the theme. Components read `themeStore` and call
 * `toggleTheme()`; nobody keeps local state.
 *
 * MIGRATION NOTE (dual-write)
 * ---------------------------
 * We write `data-theme` (new token system, see styles/theme.css).
 * The legacy `.light` class has been removed — all light-mode styles
 * now flow through semantic CSS variables defined in theme.css.
 */
import { persistentAtom } from '@nanostores/persistent';

export type ThemeMode = 'dark' | 'light';
export type BannerTheme = 'SAKURA' | 'TOKYO' | 'INTER_VIP';

/**
 * Default theme.
 *
 * OWNER DECISION 2026-09-20: the landing page ships LIGHT, with the pink sakura
 * palette, to match the approved design mockup. Dark mode is KEPT — it is a
 * supported mode reached through the toggle, not a removed feature — it is only
 * the first-paint default that changed.
 *
 * This constant exists because the default was previously the literal 'dark' in
 * FOUR independent places (this store, `decode` below, BaseLayout's inline
 * restore script, and the tests). Changing one and not the others produces a
 * page that flashes dark and then settles light, which is exactly the class of
 * bug this file was created to kill. Keep them in sync:
 *   1. `theme.ts`          DEFAULT_THEME (below) + `decode`
 *   2. `BaseLayout.astro`  the inline restore script — MUST stay inline
 *   3. the banner default, which follows the theme on first load
 */
export const DEFAULT_THEME: ThemeMode = 'light';

/** Legacy key used by BaseLayout.astro's restore script — keep in sync. */
const STORAGE_KEY = 'asjTheme';
const BANNER_KEY = 'asj_theme';

export const themeStore = persistentAtom<ThemeMode>(STORAGE_KEY, DEFAULT_THEME, {
  encode: (v) => v,
  decode: (v) => (v === 'light' ? 'light' : v === 'dark' ? 'dark' : DEFAULT_THEME),
});

/**
 * Banner artwork follows the mode: light → SAKURA, dark → TOKYO.
 *
 * The default is derived from DEFAULT_THEME rather than written as a literal, so
 * flipping the default theme cannot leave the banner pointing at the artwork for
 * the other mode — which would flash the wrong picture on first paint.
 */
export const bannerStore = persistentAtom<BannerTheme>(
  BANNER_KEY,
  DEFAULT_THEME === 'light' ? 'SAKURA' : 'TOKYO',
  {
    encode: (v) => v,
    decode: (v): BannerTheme =>
      v === 'SAKURA' || v === 'INTER_VIP' ? v : 'TOKYO',
  },
);

/**
 * Whether the user has explicitly chosen banner artwork.
 *
 * WHY THIS EXISTS (it is not redundant with bannerStore)
 * -----------------------------------------------------
 * `bannerStore.get()` can never tell you whether the user chose the value,
 * because `decode` turns anything unrecognised — including "absent" — into
 * `TOKYO`. So "is this an explicit pick?" is unanswerable from the value alone,
 * and the previous code's unconditional `bannerStore.set()` on every theme
 * change was the symptom of trying to answer it anyway: any explicit choice was
 * clobbered on the next toggle, and could not survive a reload.
 *
 * This flag is set only by `setBanner()` (a user action). While it is false the
 * banner follows the theme; once true, the user's pick wins and the theme no
 * longer moves it.
 */
const BANNER_EXPLICIT_KEY = 'asj_theme_explicit';

export const bannerExplicitStore = persistentAtom<boolean>(BANNER_EXPLICIT_KEY, false, {
  encode: (v) => (v ? '1' : '0'),
  decode: (v) => v === '1',
});

/** True when the banner is currently following the theme rather than a user pick. */
export function bannerFollowsTheme(): boolean {
  return !bannerExplicitStore.get();
}

/**
 * Apply the theme to the DOM. Call this on load and on every change.
 * Exported so the inline restore script can be mirrored from TS.
 */
export function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  root.setAttribute('data-theme', mode);
}

/** Flip the theme. This is the ONLY place that should mutate it. */
export function toggleTheme() {
  const next: ThemeMode = themeStore.get() === 'light' ? 'dark' : 'light';
  setTheme(next);
}

export function setTheme(mode: ThemeMode) {
  themeStore.set(mode);
}

/** Set banner artwork as an explicit user choice; the theme stops moving it. */
export function setBanner(theme: BannerTheme) {
  bannerExplicitStore.set(true);
  bannerStore.set(theme);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('asj-theme-change'));
}

/** Drop the explicit choice so the banner follows the theme again. */
export function clearBannerChoice() {
  bannerExplicitStore.set(false);
  bannerStore.set(themeStore.get() === 'light' ? 'SAKURA' : 'TOKYO');
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('asj-theme-change'));
}

/** Initialise from persisted state. Safe to call more than once. */
export function initTheme() {
  applyTheme(themeStore.get());
}

if (typeof window !== 'undefined') {
  // React to store changes from any component.
  themeStore.subscribe((mode) => {
    applyTheme(mode);
    // Move the banner with the theme ONLY while the user has not chosen one.
    // Unconditionally setting here is what made `setBanner()` a no-op: the
    // subscriber ran on load and on every toggle, so an explicit INTER_VIP was
    // overwritten before anyone could see it. See bannerExplicitStore.
    if (bannerFollowsTheme()) bannerStore.set(mode === 'light' ? 'SAKURA' : 'TOKYO');
    window.dispatchEvent(new Event('asj-theme-change'));
  });

  // Cross-tab sync: persistentAtom writes localStorage, mirror the DOM.
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) applyTheme(themeStore.get());
  });

  initTheme();
}
