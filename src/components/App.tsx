/**
 * App.tsx - Header + Mobile Nav with i18n (Preact island)
 *
 * Initializes Supabase auth listener at boot (useEffect).
 * All 11 consumers continue to import authStore from authReactive.ts — no breakage.
 */
import { useState, useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { authStore, logout } from '../store/authReactive';
import { initializeAuthListener, logoutSupabase } from '../store/userStore';
import { langStore, toggleLang, t, translateDataLang, jpReady } from '../store/i18n';
import { bannerStore } from '../store/theme';

// ─── Named Constants ───
const Z_INDEX = { OVERLAY: 35, NAV: 40, HAMBURGER: 30 } as const;

import LoginModal from './LoginModal';
// CekSiswaModal dipakai saat render (flag showCekSiswa) tetapi impornya hilang
// → ReferenceError begitu modal dibuka. Jangan hapus baris ini.
import CekSiswaModal from './CekSiswaModal';
import AdminAiCopilot from './admin/AdminAiCopilot';
import { showToast } from './Toast';
import Icon from './ui/Icon';
import { ErrorBoundary } from './ErrorBoundary';

/** User state from auth store */
interface UserState {
  isLoggedIn: boolean;
  role: "admin" | "kandidat" | null;
  name: string;
  wa: string;
}

type ModalMode = 'closed' | 'login' | 'daftar';

/**
 * Hero statistics — the three the company profile actually proves.
 *
 * WHY THESE THREE AND NOT FOUR. A design mockup showed 500+ candidates, 200+
 * departures and 50+ partners. NONE of those numbers appears anywhere in the
 * official company profile, and a fabricated statistic on a company page is a
 * legal claim, not decoration (docs/COMPANY_PROFILE_DATA.md §12, §13). These
 * three ARE documented: the deed is dated 15 August 2023 (page 6), and the
 * profile lists five placement sectors (page 3) and four destination prefectures
 * — Miyazaki, Okayama, Nagano, Kagoshima (pages 13-14).
 *
 * When the owner supplies the real counts, a fourth tile is added here and the
 * grid already accommodates it (`lg:grid-cols-1` stacks any number).
 */
const HERO_STATS: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: '2023', labelKey: 'profile.stat_since' },
  { value: '5', labelKey: 'profile.stat_sectors' },
  { value: '4', labelKey: 'profile.stat_prefectures' },
];

export default function App(
  { showHeader = true, hero = false }: { showHeader?: boolean; hero?: boolean } = {},
) {
  const u: UserState = useStore(authStore) as UserState;
  const lang = useStore(langStore);
  const [, bumpJpReady] = useState(0);
  useEffect(() => {
    // Re-render once the lazy JP dict lands (e.g. page loaded with lang=jp) so
    // t() consumers stop showing Indonesian fallbacks.
    const off = jpReady.subscribe(() => bumpJpReady((n) => n + 1));
    bumpJpReady((n) => n + 1); // dict may already be installed before we subscribed
    return off;
  }, []);
  const [modalMode, setModalMode] = useState<ModalMode>('closed');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAiCopilot, setShowAiCopilot] = useState(false);
  const [showCekSiswa, setShowCekSiswa] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => { setHydrated(true); }, []);
  // Hero background is now a CSS gradient (`.hero-gradient` class in global.css)
  // instead of external Supabase images. The old `HEADER_BGS` map, its
  // `bannerStore` listener, and the `asj-theme-change` plumbing are removed —
  // the gradient switches automatically via the `--hero-gradient` custom
  // property in theme.css, keyed off `data-theme` on `<html>`.  This eliminates
  // three external image fetches (113–150 KB each), a CDN dependency, and the
  // footer/header artwork-lag bug that Footer.astro's comment records.

  // Initialize Supabase auth listener once at boot
  useEffect(() => { translateDataLang();
    const cleanup = initializeAuthListener();
    return cleanup;
  }, []);

  function openLogin() { setModalMode("login"); setMenuOpen(false); window.dispatchEvent(new Event("asj-kandidat-login")); }
  function openAdminLogin() { setModalMode("login"); setMenuOpen(false); window.dispatchEvent(new Event("asj-admin-login")); }
  function openRegister() { setModalMode("daftar"); setMenuOpen(false); }
  function closeModal() { setModalMode("closed"); }
  async function handleLogout() { await logoutSupabase(); window.location.reload(); }
  function toggleMenu() { setMenuOpen(!menuOpen); }
  // Theme lives in store/theme.ts. Its subscriber writes `data-theme` +
  // the legacy `.light` class, moves the banner artwork, and fires
  // `asj-theme-change` (which the headerBg effect above listens for).
  useEffect(() => {
    const handler = () => setShowCekSiswa(true);
    window.addEventListener("openCekSiswaModal", handler);
    return () => window.removeEventListener("openCekSiswaModal", handler);
  }, []);
  /* The closing CTA band is static Astro and cannot reach this island's state, so
     it fires an event instead — the same pattern the drawer buttons already use
     (`asj-kandidat-login`). Without a listener the band's "Daftar Pelamar" button
     would look live and do nothing, which is the worst of both worlds. */
  useEffect(() => {
    const handler = () => { setModalMode("daftar"); setMenuOpen(false); };
    window.addEventListener("asj-kandidat-register", handler);
    return () => window.removeEventListener("asj-kandidat-register", handler);
  }, []);
  /* The desktop section nav (`SiteNav.astro`) is static Astro too, and it fires
     this same `asj-kandidat-login` event. Until this listener existed the nav's
     "Login Pelamar" button dispatched into the void: only App owns `modalMode`,
     and `LoginModal`'s own listener for this event merely resets its internal
     admin step — it cannot open the modal. The drawer's identically labelled
     button worked because it calls `openLogin()` directly, which BOTH sets the
     state and dispatches this event; so the dispatch is a notification, not a
     trigger, and every dispatcher needs a listener here.
     DO NOT call `openLogin()` inside this handler — it dispatches
     `asj-kandidat-login` itself, so that would recurse without end. */
  useEffect(() => {
    const handler = () => { setModalMode("login"); setMenuOpen(false); };
    window.addEventListener("asj-kandidat-login", handler);
    return () => window.removeEventListener("asj-kandidat-login", handler);
  }, []);

  function installApp() { showToast("Install: Chrome > Menu > Home Screen", "info"); setMenuOpen(false); }

  /* ─── Drawer keyboard contract ────────────────────────────────────────
     MEASURED 2026-09-16 on the built artifact at 390x844, BEFORE this block
     existed:

       CLOSED (fresh load)      nav rect.x = 390 = viewport width, i.e. fully
                                off-screen; aria-hidden null; inert false.
                                Tab-walk from the hamburger: 7 of 22 stops
                                landed INSIDE the closed drawer (Close,
                                Install App, Bahasa, Login, Daftar, Admin
                                Login). The ring is painted off-screen, so
                                the user sees nothing happen and has to Tab
                                through six invisible controls.
       Escape while open        no effect (nav still at rect.x = 102)
       Tab while open           19 of 30 stops escaped to the page BEHIND,
                                where the ring lands under the 288 px drawer
       body[inert]              false; [aria-modal] count 0

     Three fixes, all of them the drawer's OWN contract. The page behind is
     deliberately NOT made inert: App renders a fragment and does not own
     the page content, and the scrim already makes the background
     pointer-inert — so keyboard-inerting it is a product decision, reported
     rather than taken silently (see docs/UI_DESIGN_REVIEW.md). */
  const drawerRef = useRef<HTMLElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  /* `inert` in a LAYOUT effect, not a deferred one: under useEffect the
     attribute lands a frame after paint, which leaves a window where the
     drawer is visually closed but still holds six Tab stops — the exact
     defect this closes. `inert` covers the accessibility tree too, so no
     separate `aria-hidden` is written. */
  useLayoutEffect(() => {
    const el = drawerRef.current;
    if (el) el.inert = !menuOpen;
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const el = drawerRef.current;

    // Focus moves INTO the drawer on open. Without this the ring stays on
    // the hamburger, which the open drawer (288 of 390 px) then covers.
    el?.querySelector<HTMLElement>('button, a[href]')?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Capture phase + stopImmediatePropagation, so the drawer wins over a
      // widget inside it. It can never race useOverlay's identical handler:
      // every path that opens a modal from the drawer also closes it.
      e.stopImmediatePropagation();
      setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Return focus to the trigger — but ONLY when it is about to be lost,
      // i.e. still inside the drawer, or already fallen to <body> (writing
      // `inert` blurs whatever was inside it).
      //
      // That guard is what stops this fighting the modals. The drawer's
      // "Login"/"Daftar"/"Admin Login" buttons close the drawer AND open a
      // modal, whose own initial-focus effect lands in the same commit. If
      // the modal focused first, activeElement is inside the modal and this
      // does nothing; if it focused second, it wins. Either order ends on
      // the modal, which is the only acceptable outcome.
      const active = document.activeElement as HTMLElement | null;
      const lost = !active || active === document.body || !!el?.contains(active);
      const trigger = hamburgerRef.current;
      if (lost && trigger && document.contains(trigger)) trigger.focus();
    };
  }, [menuOpen]);

  /* One logo element for both header variants.
     It used to be written twice — once per branch — which meant two copies of the
     inline error handler, and the second copy cost a `noExplicitAny` diagnostic on
     a file that is already at its ratchet ceiling (measured: lint-ratchet reported
     "src/components/App.tsx: 17 -> 20" with noExplicitAny +1). Lifting it into one
     const keeps the count where it was and removes the chance of the two copies
     drifting. The size is the EXISTING one, so every route that already renders
     this header is unchanged; only the new hero variant adopts it. */
  const brandLogo = (
    <img id="logo-asj" src="https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/assets/logo-removebg-preview.webp" alt="Logo ASJ" class="w-12 h-12 md:w-16 md:h-16 shrink-0 object-contain drop-shadow-2xl" onError={(e: any) => { e.target.style.display = "none" }} />
  );

  return (
    <ErrorBoundary>
      {/* HERO ANCHORS (S1 `#atas`). The hero had no id and no accessible name,
          which made "kembali ke atas" impossible to express as a link and left
          the landing page's topmost band as its only unnamed landmark — L3 gave
          every other section a name.

          `id="atas"` is on the <header> itself, so the anchor IS the band you
          see; no extra element and no extra nesting. It only materialises when
          `hero` is set, which is true on this landing route and false on the
          other four that mount App without it — there the header is chrome, not
          a page section, and an `#atas` anchor would be meaningless.

          `scroll-mt-24` is load-bearing, not cosmetic: the site nav is fixed, so
          without it an in-page jump parks the hero's eyebrow under the nav bar.

          The page's single h1 lives inside this hero, and
          `e2e/test-headings.mjs` enforces exactly one h1 per route, so a second
          heading here would break it.

          REMOVED (2026-09-19): this element used to carry
          `aria-label="Atas halaman"` when it was the hero. Biome reports
          `aria-label` as unsupported on a plain `<header>` (src/components/App.tsx:242,
          a lint ERROR, and it was one of two diagnostics this change added), and
          the label was never load-bearing: `e2e/test-landing.mjs:530` decides a
          section has an accessible name by looking for a HEADING inside it
          (`hasHeading`, any of h1..h6), which the hero already has. Naming the
          landmark is the job of that heading, not of an aria-label here. */}
      {showHeader && <header id={hero ? "atas" : "asj-header"} class={`${hero ? "scroll-mt-24 hero-gradient " : "hero-gradient "}max-w-7xl mx-auto px-4 mt-6 relative text-white border border-white/10 shadow-2xl flex items-end rounded-band overflow-hidden transition-colors duration-200 ${hero ? "min-h-[26rem] md:min-h-[32rem] p-6 md:p-10" : "h-auto min-h-[14rem] md:h-56 p-6 md:p-8"}`}>
        {/* The overlay that darkens the hero artwork for the copy's contrast
             sits BELOW the illustration, on purpose: it must paint over the
             artwork, not under it. See the `header-overlay` div after the
             <picture>. The `::after` pseudo-element on `.hero-gradient` is a
             separate layer — the subtle glow. */}
        {/* Hero illustration (only on the `hero` variant — /share and every
            other route that mounts the header without a hero keeps the bare
            gradient). It sits UNDER the content because the band's existing
            children are not positioned, so a plain absolutely-positioned
            sibling paints first and the flex row of text lands on top.

            `aria-hidden` + `alt=""` is deliberate and is NOT the same choice as
            the program tiles: the hero already states its meaning in the h1
            ("Karier ke Jepang, dimulai dari sini."), so the scene restates it.
            Announcing it again would make a screen reader read the same idea
            twice.

            The gradient is kept as the fallback and the image fades over it via
            opacity, rather than replacing it: the band's gradient and the
            artwork share the same dusk palette, so the two blend into one
            surface instead of meeting at a hard edge. It is `object-cover` so
            the art fills a band whose height varies from 26rem (mobile) to
            32rem (desktop) without distorting.

            THE ART WAS REPLACED BY THE OWNER, 2026-09-24. The old asset was a
            flat-vector scene; the new one is a generated 2.75:1 banner (sakura,
            Fuji, a pagoda, a figure in an ASJ PORTAL jacket) supplied by the
            owner from `F:\asset`. Two consequences recorded here because they
            are not visible from the markup:

              · `width`/`height` moved 1600x900 -> 1600x582, the real size of the
                1x file. They no longer describe a 16:9 art. (They reserve no
                layout box either way — this <picture> is `absolute inset-0
                w-full h-full` — but a wrong intrinsic size is still a false
                statement about the asset.)
              · `@2x` is the source's NATIVE ceiling (2079x756), not a true 2x.
                The band is 1248 CSS px wide and `object-cover` scales by height,
                so 2x DPR wants ~2818px and the source cannot supply it. It is
                left un-upscaled on purpose: inventing pixels and calling them
                resolution is worse than shipping fewer real ones.

            `loading="eager"` because this is the LCP element's backdrop; lazy
            here would delay the largest paint on the page the visitor sees
            first. */}
        {hero && (
          <picture class="absolute inset-0 -z-0 pointer-events-none">
            <source
              type="image/avif"
              srcset="/assets/ilustrasi/hero-sakura.avif 1x, /assets/ilustrasi/hero-sakura@2x.avif 2x"
            />
            <source
              type="image/webp"
              srcset="/assets/ilustrasi/hero-sakura.webp 1x, /assets/ilustrasi/hero-sakura@2x.webp 2x"
            />
            <img
              src="/assets/ilustrasi/hero-sakura.webp"
              alt=""
              aria-hidden="true"
              width={1600}
              height={582}
              loading="eager"
              decoding="async"
              class="w-full h-full object-cover opacity-60"
            />
          </picture>
        )}

        {/* The artwork overlay — DESIGN.md §3.6's level-2 "overlay gradien".
             It is a DIRECTIONAL gradient, not a scrim: transparent over the far
             side of the band, dark only where the copy sits (bottom on a phone,
             left at `lg`). `.header-overlay` in global.css is re-aimed to the
             text's side and darkens in BOTH themes, because the hero copy stays
             white in both (global.css §5d).

             RESTORED 2026-09-24. The div that carried this class was removed in
             84c7ed6 with the note that "the CSS gradient in `.hero-gradient`
             already has the right contrast" — true of the bare gradient, but the
             hero has since gained the `hero-sakura` illustration at
             `opacity-60`, and it is the ARTWORK that sits behind the headline
             now. With the class orphaned (0 elements), the headline measured a
             worst glyph-background of 2.36-2.88:1 in light mode, under the 3:1
             floor. It is decorative, so `aria-hidden` + `pointer-events-none`. */}
        {hero && <div class="absolute inset-0 header-overlay pointer-events-none" aria-hidden="true" />}

        {/* Hamburger — shown on BOTH mobile and desktop. One menu surface
            for both viewports (the user picks the drawer icon, the same
            drawer slides in). Desktop keeps just the language toggle
            inline so flipping id⇄jp stays one tap. */}
        {/* ─── The two header controls are sized to the project's own touch floor.
             MEASURED 2026-09-22, at a 390px viewport, before this change:
             the hamburger rendered 40x40 and the language toggle 36x36, while
             DESIGN.md:582 ("Tinggi minimum | 44 px") and DESIGN.md:691
             ("Target sentuh | >=44 px, idealnya 48 px") both require 44. The rule
             was already gate-enforced, but only for the shared Button.astro --
             `scripts/ci/button.mutations.mjs` M4 breaks
             `min-h-[44px]` there and asserts the failure. Hand-rolled buttons
             like these two were outside that gate's reach, which is exactly how
             they drifted under the floor without anything going red.

             Sizes are now literal 11 (44px) rather than a min-h, because these
             are fixed icon buttons inside a rounded-full pill: a min-height
             would let the circle stay 40px tall while only the tap box grew,
             which reads as a misaligned control. `gap-2` is unchanged, so the
             two still sit on the same baseline. */}
        <div class="absolute top-4 right-4 z-30 flex items-center gap-2">
          <button onClick={toggleLang} class="hidden md:flex w-11 h-11 items-center justify-center bg-black/60 hover:bg-black/80 text-white rounded-full border border-white/40 transition shadow-md" aria-label="Toggle language" title={lang === "id" ? "ID" : "JP"}>
            <span class="text-[11px] font-bold">{lang === "id" ? "ID" : "JP"}</span>
          </button>
          <button ref={hamburgerRef} onClick={toggleMenu} class="w-11 h-11 flex items-center justify-center bg-black/70 hover:bg-zinc-800 text-white rounded-full border border-white/60 transition shadow-lg hamburger-btn" aria-label="Toggle Menu" aria-expanded={menuOpen}>
            <Icon name={menuOpen ? "times" : "bars"} class="text-lg" />
          </button>
        </div>

        {hero ? (
          /* ─── Hero variant (landing page `/`) ────────────────────────────
             WHY THE HERO LIVES IN App.tsx AND NOT IN ITS OWN .astro FILE.
             The band's background is the theme artwork, and that value lives in
             `bannerStore` — browser-only state that App already resolves and
             already listens to (`asj-theme-change`). A separate Astro hero would
             need its own copy of the theme→artwork map, which would be the THIRD
             copy (App.tsx and Footer.astro already each carry one). Duplicating
             it a third time to satisfy a file layout is the wrong trade: the
             footer's copy is already justified in its own comment only because
             it is an island-free script.

             WHY THE COMPANY NAME IS A `div` HERE. `e2e/test-headings.mjs`
             enforces exactly one h1 per route, and it is right to: an h1 that
             reads "PT AMANAH SAKURA JAPAN" does not say what the page is
             (WCAG 2.4.2). On this route the headline below is the h1, so the
             company name steps down. On every other route the header keeps the
             h1, because for those it IS the only one. */
          <div class="relative z-10 w-full grid gap-6 lg:grid-cols-12 lg:items-end">
            <div class="lg:col-span-7 min-w-0">
              <div class="flex items-center gap-3 min-w-0">
                {brandLogo}
                <span class="text-pink-300 text-eyebrow font-bold uppercase truncate">{t("profile.hero_eyebrow")}</span>
              </div>
              <p class="text-pink-300 text-eyebrow font-bold uppercase mt-5">{t("profile.hero_tagline")}</p>
              {/* `text-white` IS EXPLICIT HERE, and that is load-bearing — do not
                  delete it because "the hero is dark anyway".

                  This h1 carried no colour class until 2026-09-20 and inherited
                  `--color-fg` from the theme. That worked only while light mode's
                  `--color-fg` happened to be `#f1f5f9` (near-white), which is the
                  right colour for the hero POLARITY but came from the wrong place:
                  it is the PAGE text token, and the light palette has since been
                  retuned to `#16121c` so body copy reads on the white canvas.

                  Measured consequence of the retune, in a browser against a real
                  server — the hero h1 resolved to `rgb(31, 29, 28)` on a
                  `linear-gradient(135deg, rgb(42,18,53) …)` band: contrast
                  **1.01:1**, i.e. effectively invisible. The h1 of the landing page.

                  The band is deliberately dark in BOTH themes (see the note on
                  --hero-gradient in theme.css), so the heading's colour must not be
                  derived from the theme at all. Its siblings already name theirs —
                  `text-pink-300` on the eyebrow, `text-slate-200` on the sub — which
                  is exactly why only the one colourless element broke. */}
              <h1 class="text-display font-black text-white drop-shadow-lg mt-2 leading-tight">{t("profile.hero_title")}</h1>
              <p class="text-body text-slate-200 mt-4 max-w-[52ch] leading-relaxed">{t("profile.hero_sub")}</p>
              {/* NO "Lihat Lowongan" CTA HERE. Owner ruling 2026-09-24: `/` is a
                  company profile for MoU/business partners, not a job board, so
                  the hero's primary CTA to /loker is removed and the section nav
                  is the page's ONLY path to the vacancy list. The register
                  button below stays — it is not a /loker link. */}
              <div class="flex flex-wrap gap-3 mt-8">
                <button type="button" onClick={openRegister} class="inline-flex items-center px-7 py-3.5 rounded-pill bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm backdrop-blur-sm transition-all duration-200"><Icon name="user-plus" class="mr-2" />{t("profile.hero_cta_secondary")}</button>
              </div>
              <div class="flex flex-wrap gap-2 mt-6">
                {[t("profile.hero_chip_ssw"), t("profile.hero_chip_magang"), t("profile.hero_chip_penempatan")].map((label) => (
                  <span key={label} class="px-3.5 py-1.5 rounded-pill bg-white/10 border border-white/15 text-caption font-bold text-slate-200 backdrop-blur-sm">{label}</span>
                ))}
              </div>
            </div>
            {/* Glass tiles: the ONLY place besides the closing band that uses a
                translucent surface, and the only one over artwork. Kept to one
                area per screen — `backdrop-filter` costs per frame.

                COLUMN COUNT — measured, not guessed. This used to read
                `grid gap-3 sm:grid-cols-3 lg:grid-cols-1`, so the lg tier
                overrode the row and the three tiles STACKED on desktop, which is
                the opposite of the intent: one strip became a 479px-wide column
                three deep. Measured with e2e/measure-hero-stats.mjs before the
                fix — 700px ONE ROW (209px x3), 1280px STACKED (479px x1,
                y=235/325/416). The hero grid on the right is `lg:col-span-5`
                (5 of 12 columns), so three tiles across it are ~152px each:
                enough for a 4-digit number over a two-word caption at the
                `text-caption` size, and it is what makes the strip read as a
                summary rather than a list.

                WHY `sm:grid-cols-3` AND NOT `grid-cols-3`. Forcing three columns
                at every width fixed the desktop stack and BROKE mobile: at 390px
                the tiles became 106px wide and 106px tall (from 73px), and
                "Bidang penempatan" wrapped mid-word to "penempata/n" — measured
                after the first attempt, visible in test-results/landing/390-s01.png.
                Below `sm` the tiles now sit one per row at full width, which is
                the reading order a phone actually wants; the strip shape starts
                at 640px, where there is room for it. */}
            <div class="lg:col-span-5 grid gap-3 sm:grid-cols-3">
              {HERO_STATS.map((stat) => (
                <div key={stat.labelKey} class="rounded-card bg-white/10 border border-white/15 backdrop-blur-sm px-5 py-4 flex sm:block items-center justify-between gap-3 hover:bg-white/15 transition-colors">
                  <div class="text-section font-black text-pink-300 leading-none">{stat.value}</div>
                  <div class="text-caption text-slate-200 mt-0 sm:mt-2">{t(stat.labelKey)}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div class="relative z-10 w-full flex flex-col md:flex-row justify-between items-start md:items-end gap-5">
            <div class="flex items-center gap-3 md:gap-5 min-w-0">
              {brandLogo}
              {/* max-w keeps the title clear of the absolutely-positioned
                  menu button (App.tsx, `absolute top-4 right-4`, 40px at
                  x=302 on a 390px viewport). The button is `absolute`, so
                  flexbox never reserves space for it — without this cap the
                  22-char company name ends at x=353 and 51px of it renders
                  *under* the button. min-w-0 on both wrappers is required or
                  `truncate` never engages (flex children refuse to shrink
                  below their content width without it). */}
              <div class="min-w-0 flex-1 max-w-[210px] md:max-w-none">
                <div id="header-tagline" class="text-pink-300 text-xs md:text-sm font-bold tracking-[4px] mb-1 truncate">{t("header.tagline")}</div>
                {/* This is the page's ONLY h1 on /public, /admin, /candidate,
                    /share — every route that mounts the header without a hero.
                    Demoting it globally would leave those routes with no h1 at
                    all, which is why the hero variant above is opt-in. */}
                <h1 class="text-lg md:text-3xl font-black italic tracking-wide drop-shadow-lg truncate"><span>{t("header.company_name")}</span></h1>
              </div>
            </div>
          </div>
        )}
      </header>}

      {/* Scrim only, and deliberately presentational. It is a pointer-only
          convenience: the drawer carries its own labelled close button and the
          hamburger above toggles, so nothing is lost by keeping it out of the
          a11y tree. Left as a bare clickable div it measured as a nameless
          `u-modal-shell` overlay — indistinguishable, to a screen reader, from
          the real modals beside it (§25). */}
      {menuOpen && <div aria-hidden="true" class="u-viewport-fixed u-modal-shell bg-black/70" style={{ zIndex: Z_INDEX.OVERLAY }} onClick={() => setMenuOpen(false)}></div>}
      
      {/* ─── Drawer (mobile + desktop) ───
          Same drawer on both breakpoints so the user gets one predictable
          menu. Width is 18rem on phones (full coverage) and 24rem on
          desktop (roomier labels, scrollable).

          `u-viewport-fixed--right` rather than `fixed top-0 right-0 h-full`:
          with `scrollbar-gutter: stable` on <html>, a plain `right: 0` on a
          fixed element is resolved against the initial containing block,
          which EXCLUDES the reserved gutter — so on desktop the drawer
          stopped 15px short of the screen edge (measured: innerWidth 1280,
          nav.right 1265). The utility pins it to the physical viewport.
          See layout.css §3b for the measurement and why the gutter itself
          is not removed. */}
      <nav ref={drawerRef} class={"u-viewport-fixed--right w-72 md:w-96 bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col transition-transform duration-300 transform " + (menuOpen ? "translate-x-0" : "translate-x-full")} style={{ zIndex: Z_INDEX.NAV }} aria-label="Primary navigation">
        <div class="flex items-center justify-between p-4 border-b border-slate-700">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-widest"><Icon name="bars" class="mr-2 text-sky-400" /> {t("ui.menu")}</span>
          <button onClick={toggleMenu} class="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-white transition" aria-label="Close"><Icon name="times" class="text-xl" /></button>
        </div>
        {/* User identity strip — sits above the action list so the drawer
            answers "who am I?" before the buttons do. Hidden when logged
            out so the Login/Register block stays the first thing. */}
        {u.isLoggedIn && (
          <div class="px-4 py-3 border-b border-slate-700 bg-slate-800/40">
            <div class="text-[10px] uppercase tracking-widest text-slate-500 mb-1">{u.role === "admin" ? t("header.admin") : t("header.dashboard")}</div>
            <div class={"text-base font-bold " + (u.role === "admin" ? "text-amber-300" : "text-emerald-300")}>{u.name}</div>
          </div>
        )}
        <div class="flex-1 u-scroll-area p-4 space-y-3">
          <div class="space-y-3 pb-3 mb-3 border-b border-slate-700">
            <button onClick={installApp} class="w-full py-3 bg-gradient-to-r from-emerald-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 text-white rounded-xl font-bold text-sm shadow-lg transition flex items-center justify-center"><Icon name="mobile-alt" class="mr-2" /> {t("ui.install_app")}</button>
            <button onClick={toggleLang} class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2"><Icon name="language" /> {t("ui.language")} <span>{lang === "id" ? "ID" : "JP"}</span></button>
          </div>
          {hydrated && !u.isLoggedIn && (<div class="space-y-3">
            <button onClick={openLogin} class="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold text-sm shadow-lg transition">{t("header.login")}</button>
            <button onClick={openRegister} class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-sm transition">{t("header.register")}</button>
            <button onClick={openAdminLogin} class="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-sm shadow-lg transition"><Icon name="shield-alt" class="mr-2" /> {t("header.admin_login")}</button>
          </div>)}
          {u.isLoggedIn && u.role === "admin" && (<div class="space-y-3">
            <a href="/admin" class="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-sm shadow-lg transition flex items-center justify-center"><Icon name="cogs" class="mr-2" /> {t("header.admin")}</a>
            <button onClick={() => { setShowAiCopilot(true); setMenuOpen(false); }} class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-sm transition flex items-center justify-center"><Icon name="robot" class="mr-2" /> {t("ui.ai_copilot")}</button>
            <a href="/public" class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-sm transition flex items-center justify-center"><Icon name="globe" class="mr-2" /> {t("header.public")}</a>
            <button onClick={handleLogout} class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-sm transition flex items-center justify-center"><Icon name="sign-out-alt" class="mr-2" /> {t("header.logout")}</button>
          </div>)}
          {u.isLoggedIn && u.role === "kandidat" && (<div class="space-y-3">
            <a href="/candidate" class="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold text-sm shadow-lg transition flex items-center justify-center"><Icon name="id-card" class="mr-2" /> {t("header.dashboard")}</a>
            <a href="/public" class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-sm transition flex items-center justify-center"><Icon name="globe" class="mr-2" /> {t("header.public")}</a>
            <button onClick={handleLogout} class="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-sm transition flex items-center justify-center"><Icon name="sign-out-alt" class="mr-2" /> {t("header.logout")}</button>
          </div>)}
        </div>
      </nav>

      {showAiCopilot && <AdminAiCopilot onClose={() => setShowAiCopilot(false)} />}
      {showCekSiswa && <CekSiswaModal onClose={() => setShowCekSiswa(false)} />}
      {hydrated && <LoginModal mode={modalMode} onClose={closeModal} onSwitchMode={setModalMode} />}
    </ErrorBoundary>
  );
}
