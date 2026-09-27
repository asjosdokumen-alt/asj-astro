/**
 * App.tsx header — layout guards.
 *
 * WHY THIS EXISTS
 * ---------------
 * The header title was rendering 51 px *underneath* the menu button on a
 * 390 px viewport: the `<h1>` ("PT AMANAH SAKURA JAPAN", 268 px at 18px/black)
 * ended at x=353 while the button — `absolute top-4 right-4`, 40×40 — starts at
 * x=302. Measured with Playwright on `/` and `/public`.
 *
 * Two things make this a *silent* failure rather than a visible bug:
 *   1. `header.company_name` is a literal 22-char string in BOTH dictionaries
 *      (`i18n.ts`, `i18n-jp.ts`). Adding a word — "…JAPAN CO., LTD." — widens
 *      the collision with no code change and no signal.
 *   2. jsdom has no layout engine, so a "does it overlap?" assertion is not
 *      available here. What *is* testable is the structural contract that makes
 *      the overlap impossible: the title wrapper must be allowed to shrink
 *      (`min-w-0`) and must clip (`truncate`), and must be capped on the
 *      breakpoint where the button overlaps. The button being `absolute` is the
 *      root cause — flexbox never reserves space for it — so the cap is load
 *      bearing and its removal is exactly the regression to catch.
 *
 * A rendering test cannot replace the measured check. Re-run the Playwright
 * assertion after touching this header (see docs/UI_DESIGN_REVIEW.md §11.1):
 *   h1.right < 302 at 390 px  AND  h1.scrollWidth > h1.clientWidth
 *
 * MOCKING STRATEGY: the real `i18n` / `theme` modules are used so this test
 * breaks if their public surface changes. Only modules with network access or
 * browser globals are stubbed.
 */
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/apiClient', () => ({
  default: { call: vi.fn(async () => ({ success: true })), invalidateCache: vi.fn() },
}));
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })), getSession: vi.fn(async () => ({ data: { session: null } })) } },
  isSupabaseConfigured: vi.fn(() => false),
}));
vi.mock('../lib/notifications', () => ({ requestNotificationPermission: vi.fn(async () => {}) }));
vi.mock('./ui/Icon', () => ({ default: () => null }));
vi.mock('./modals/CekSiswaModal', () => ({ default: () => null }));
vi.mock('./admin/AdminAiCopilot', () => ({ default: () => null }));
vi.mock('./modals/LoginModal', () => ({ default: () => null }));

import App from './App';

afterEach(cleanup);

function titleWrapper(): HTMLElement {
  const h1 = document.querySelector('h1');
  if (!h1) throw new Error('header h1 not rendered');
  return h1.parentElement as HTMLElement;
}

describe('header — judul tidak boleh menimpa tombol menu', () => {
  it('membungkus judul dengan wadah yang boleh menyusut', () => {
    render(<App />);
    // Without `min-w-0` a flex child refuses to shrink below its content
    // width, so `truncate` never engages and the text runs under the button.
    expect(titleWrapper().className).toContain('min-w-0');
  });

  it('tidak membatasi lebar judul dengan angka tetap', () => {
    // A fixed `max-w-[Npx]` is a GUESS at the button's footprint, and measured
    // 2026-09-27 it was wrong in BOTH directions: at 320px the box ran to x=287
    // while the button began at x=244 (43px rendered underneath it), and at
    // 390/414/430 it wasted width — only 210px of a 274px name was shown.
    render(<App />);
    expect(titleWrapper().className).not.toMatch(/max-w-\[\d+px\]/);
  });

  it('tidak memesan ruang tombol dengan padding di baris induk', () => {
    // The button (`absolute top-4`, y 41..85) and the title (bottom of the
    // header via `items-end`, y 195..223) are VERTICALLY DISJOINT — measured
    // 18/18 across 3 routes x 6 widths. A right-padding reserve would therefore
    // buy nothing and cost title width, which is what an earlier attempt at
    // this fix did (320px: 151px shown instead of 211px).
    render(<App />);
    const row = titleWrapper().parentElement?.parentElement as HTMLElement;
    expect(row.className).not.toMatch(/pr-\[\d+px\]/);
  });

  it('membiarkan grup judul meregang — atau truncate tidak pernah bekerja', () => {
    // The row is `items-start`, so a flex child does NOT stretch. Measured
    // 2026-09-27: without `w-full` the group sized to its CONTENT — wider than
    // the row at 320px — so the box grew past the container to x=351 and
    // `truncate` never engaged. This is the half of the fix that is invisible
    // in the class list of the title itself.
    render(<App />);
    const group = titleWrapper().parentElement as HTMLElement;
    expect(group.className).toContain('w-full');
  });

  it('memotong judul dengan elipsis, bukan melipatnya', () => {
    render(<App />);
    const h1 = document.querySelector('h1') as HTMLElement;
    expect(h1.className).toContain('truncate');
  });

  it('memotong tagline juga — teksnya berubah tiap bahasa', () => {
    render(<App />);
    const tagline = document.getElementById('header-tagline');
    expect(tagline).not.toBeNull();
    expect(tagline!.className).toContain('truncate');
  });

  it('tidak membiarkan logo ikut terjepit saat judul menyusut', () => {
    render(<App />);
    const logo = document.getElementById('logo-asj');
    expect(logo).not.toBeNull();
    // Without shrink-0 the logo is the first thing flex squeezes.
    expect(logo!.className).toContain('shrink-0');
  });
});

describe('drawer — tombol tutup harus jadi target sentuh yang layak', () => {
  it('berukuran minimal 44x44, bukan ikon dengan p-1', () => {
    // Was `p-1` + `text-xl` → 24×32 measured, the smallest target in the app
    // and the only way out of the drawer besides the backdrop. §11.3.
    render(<App />);
    const close = document.querySelector('nav[aria-label="Primary navigation"] button[aria-label="Close"]');
    expect(close).not.toBeNull();
    expect(close!.className).toContain('w-11');
    expect(close!.className).toContain('h-11');
  });
});

describe('bahasa — toggle HANYA di dalam drawer, bukan di header', () => {
  /** The header bar is the `absolute top-4 right-4` flex row in App.tsx. */
  function headerBar(): HTMLElement | null {
    const hamburger = document.querySelector('button[aria-label="Toggle Menu"]');
    return (hamburger?.parentElement as HTMLElement | null) ?? null;
  }

  it('menghapus tombol bahasa dari header sepenuhnya', () => {
    // Owner ruling: the JP switch must live ONLY in the drawer. We assert the
    // button is ABSENT (not merely `hidden`) — a `hidden` control is one
    // utility-class edit from reappearing, whereas absent markup cannot come
    // back by accident. This is the regression the old `hidden md:flex`
    // header button represented.
    render(<App />);
    const bar = headerBar();
    expect(bar).not.toBeNull();
    expect(bar?.querySelector('button[aria-label="Toggle language"]')).toBeNull();
    // …and the hamburger must survive — removing the sibling must not have
    // taken the menu control with it.
    expect(bar?.querySelector('button[aria-label="Toggle Menu"]')).not.toBeNull();
  });

  it('menyediakan toggle bahasa di dalam drawer (satu-satunya jalan masuk)', () => {
    // The drawer copy is now the ONLY entry point, so it must exist and must
    // be wired to the shared toggle. Its visible text carries the language
    // code, so we key on the drawer nav rather than the header.
    render(<App />);
    const drawer = document.querySelector('nav[aria-label="Primary navigation"]');
    expect(drawer).not.toBeNull();
    const langBtn = drawer?.querySelector('button[aria-label="Toggle language"]');
    expect(langBtn).not.toBeNull();
  });
});
