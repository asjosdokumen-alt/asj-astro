import { describe, expect, it, beforeEach, vi } from 'vitest';

// ─── Why this test exists ─────────────────────────────────────────────────────
//
// `theme.ts` shipped a bug that no test could see, because the module's
// behaviour only exists in a browser: its `themeStore.subscribe` callback fired
// on load and on every toggle and called `bannerStore.set(...)` unconditionally.
// The visible result was that a user's explicit banner choice was overwritten
// before it could be observed — `setBanner()` was, in practice, dead.
//
// The bug is invisible from the value alone: `bannerStore.decode` maps anything
// unrecognised (including "absent") to TOKYO, so `bannerStore.get() === 'TOKYO'`
// cannot distinguish "the theme put it there" from "the user picked it". Hence
// the separate `bannerExplicitStore` flag that these tests pin.
//
// The module runs browser-guarded code on import, so jsdom is required and the
// import is dynamic after the DOM exists.

type ThemeModule = typeof import('./theme');

let theme: ThemeModule;

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  theme = await import('./theme');
});

describe('banner follows the theme until the user picks one', () => {
  it('moves the banner to SAKURA when the theme goes light', () => {
    theme.setTheme('light');
    expect(theme.bannerStore.get()).toBe('SAKURA');
  });

  it('moves the banner to TOKYO when the theme goes dark', () => {
    theme.setTheme('light');
    theme.setTheme('dark');
    expect(theme.bannerStore.get()).toBe('TOKYO');
  });

  it('reports that the banner is following the theme by default', () => {
    expect(theme.bannerFollowsTheme()).toBe(true);
  });
});

describe('an explicit banner choice survives a theme change', () => {
  it('keeps INTER_VIP when the theme is toggled afterwards', () => {
    // This is the exact regression: before the fix the subscriber clobbered
    // INTER_VIP on the next toggle, so it could never survive.
    theme.setBanner('INTER_VIP');
    theme.setTheme('light');
    expect(theme.bannerStore.get()).toBe('INTER_VIP');

    theme.setTheme('dark');
    expect(theme.bannerStore.get()).toBe('INTER_VIP');
  });

  it('lets the user keep SAKURA on a dark theme', () => {
    // Deliberate: "follow the mode" is the DEFAULT, not a constraint. A user who
    // wants sakura artwork with dark UI must be able to have it.
    theme.setBanner('SAKURA');
    theme.setTheme('dark');
    expect(theme.bannerStore.get()).toBe('SAKURA');
  });

  it('stops reporting that the banner follows the theme', () => {
    theme.setBanner('TOKYO');
    expect(theme.bannerFollowsTheme()).toBe(false);
  });

  it('persists the explicit flag, so a reload does not lose the choice', () => {
    theme.setBanner('INTER_VIP');
    expect(localStorage.getItem('asj_theme_explicit')).toBe('1');
  });
});

describe('clearing the choice hands control back to the theme', () => {
  it('re-follows the theme after clearBannerChoice()', () => {
    theme.setTheme('dark');
    theme.setBanner('SAKURA');
    expect(theme.bannerFollowsTheme()).toBe(false);

    theme.clearBannerChoice();
    expect(theme.bannerFollowsTheme()).toBe(true);
    // Following a dark theme means TOKYO.
    expect(theme.bannerStore.get()).toBe('TOKYO');
  });
});

describe('theme changes fire asj-theme-change', () => {
  it('notifies listeners so header and footer stay in step', () => {
    // The footer (Footer.astro) and the header (App.tsx) both repaint by
    // listening for this event. If it stopped firing, the two surfaces would
    // silently disagree — which is the bug this whole change is about.
    const seen: string[] = [];
    const on = () => seen.push(theme.bannerStore.get());
    window.addEventListener('asj-theme-change', on);
    try {
      theme.setTheme('light');
      theme.setBanner('INTER_VIP');
    } finally {
      window.removeEventListener('asj-theme-change', on);
    }
    expect(seen.length).toBeGreaterThanOrEqual(2);
  });
});
