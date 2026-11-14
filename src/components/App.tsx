/**
 * App.tsx - Header + Mobile Nav with i18n (Preact island)
 *
 * Initializes Supabase auth listener at boot (useEffect).
 * All 11 consumers continue to import authStore from authReactive.ts — no breakage.
 */
import { useState, useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { authStore, refreshFcmRegistrationOnce } from '../store/authReactive';
import { initializeAuthListener, logoutSupabase } from '../store/userStore';
import { toggleLang, t, translateDataLang, useLang } from '../store/i18n';
import { bannerStore } from '../store/theme';
import { REVIEW_SOURCE } from '../lib/testimonials';

/* STACKING ORDER COMES FROM THE THEME SCALE (theme.css `@theme`), NOT A SECOND
   PRIVATE COPY. This file used to carry its own `Z_INDEX` map (scrim 35,
   drawer 40, hamburger 30), which contradicted the theme's scale and put the
   drawer's scrim BELOW any `z-sticky` element (50): a sticky section bar stayed
   bright on top of the dimmed page and could paint over the drawer itself. The
   scrim now uses `z-scrim` (95) and the drawer `z-drawer` (100) — both above
   sticky page content, drawer above scrim — so the next sticky element cannot
   reproduce the defect. */

/**
 * The header banner artwork (non-hero variant), restored 2026-09-25.
 *
 * WHY THIS IS BACK. The non-hero header (`/public`, `/loker`, `/share`, …) had
 * lost its banner: `bannerStore` was imported and never read, so every route
 * except the hero on `/` rendered a bare `hero-gradient` with no artwork.
 *
 * WHY THE PATHS ARE LOCAL NOW (2026-10-14). These two files used to be fetched
 * from Supabase Storage with the rest of the brand art. Storage serves public
 * objects `Cache-Control: no-cache`, so every page view re-downloaded them and
 * the Free-tier Cached Egress quota blew past 100%. They now sit in
 * `public/assets/`, served by Netlify with a year-long immutable cache, and are
 * resized to what the header actually needs (`1200px` → `800/900px`) — measured
 * 112.858 + 143.094 B → 49.350 + 70.590 B. Same artwork, same URIs for callers,
 * a fraction of the bytes. `LayananSection.astro` uses the same two files.
 *
 * The filenames deliberately differ from the legacy `sakra_banner` /
 * `dark_tokyo_banner` spelling: those names only ever existed in the Supabase
 * bucket, and nothing local referenced them. Do not "restore" the old names —
 * `/assets/sakra_banner.webp` 404s.
 *
 * WHY THE MAP DEFAULT IS TOKYO. `BannerTheme` also has `INTER_VIP`; anything
 * that is not `SAKURA` resolves to the Tokyo artwork, matching the legacy
 * default. `bannerStore` is a `persistentAtom`, so flipping the theme swaps the
 * artwork — which is the whole reason the store exists.
 */
const BANNER_ART = {
  SAKURA: '/assets/banner-sakura.webp',
  TOKYO: '/assets/banner-tokyo.webp',
} as const;

import LoginModal from './LoginModal';
// CekSiswaModal dipakai saat render (flag showCekSiswa) tetapi impornya hilang
// → ReferenceError begitu modal dibuka. Jangan hapus baris ini.
import CekSiswaModal from './CekSiswaModal';
import type { ComponentType } from 'preact';
import { showToast } from './Toast';
import Icon from './ui/Icon';
import { useOverlayPresence } from './ui/useOverlayPresence';
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
 * three ARE documented: the deed is dated 15 August 2023 (page 6).
 *
 * CORRECTED 2026-10-30 — "5 BIDANG" AND "4 PREFEKTUR" WERE THE FOUNDING
 * FOOTPRINT, NOT THE CURRENT ONE. Owner, verbatim: "5 bidang penempatan itu
 * pas awal berdiri. kita mah semua bidang penempatan dan seluruh prefektur di
 * jepang kan kerjasama sama mitra so nya ada banyak." The document's five
 * sectors (page 3) and four dated interview banners (pages 13-14) are still
 * true as EVIDENCE; presenting them as the total was the error, and it
 * understated the company on the one strip a partner reads first.
 *
 *   - sectors  : "Semua" — a word, because the honest count is not a number.
 *                The company places through partner LPKs, so the field list is
 *                open-ended (SSW + magang), and any digit here would be a
 *                ceiling the owner never claimed.
 *   - prefectures: "47", Japan's own count (1 都 + 1 道 + 2 府 + 43 県).
 *
 * BOTH VALUES COME FROM THE DICTIONARY (`*_value`), not from this array, and
 * that is deliberate: the same two strings are printed again in the Penempatan
 * section, and `companyProfile.test.ts` asserts every copy carries the same
 * digits. A constant exported from here would have needed a new module (a new
 * `.ts` file moves the indexer's frozen counters) or a `companyProfile.ts`
 * import (which would pull the whole company profile into this island's
 * bundle). Two checked dictionary entries are the cheap, honest middle.
 */
const HERO_STATS: ReadonlyArray<{ value?: string; valueKey?: string; labelKey: string }> = [
  { value: '2023', labelKey: 'profile.stat_since' },
  { valueKey: 'profile.stat_sectors_value', labelKey: 'profile.stat_sectors' },
  { valueKey: 'profile.stat_prefectures_value', labelKey: 'profile.stat_prefectures' },
];

/**
 * ── DAFTAR ISI DI DRAWER (2026-11-14) ───────────────────────────────────────
 *
 * Halaman `/` sekarang 18 seksi dan ±24 layar. Satu-satunya navigasi adalah
 * menu ini, dan isinya hanya Lowongan + Login/Daftar — tidak ada satu pun
 * tautan ke seksi. Jadi pengunjung yang ingin kembali ke "Legalitas" harus
 * menggulir dari atas.
 *
 * ENAM TUJUAN, BUKAN DELAPAN BELAS. Delapan belas baris di drawer adalah
 * daftar isi yang sama melelahkannya dengan menggulir; enam grup adalah enam
 * keputusan. "Bukti & legalitas" sengaja jadi salah satu dari enam — itu yang
 * mengubah bukti dari kebetulan menjadi tujuan yang bisa dituju.
 *
 * KENAPA DI DRAWER, BUKAN RAIL MELAYANG DI KANAN. Rail 150 px hanya muat di
 * viewport ≥ 1600 px (konten `max-w-7xl` menyisakan 160 px di 1600, 80 px di
 * 1440), jadi di layar pemilik sendiri ia tidak akan muncul. Drawer bekerja di
 * semua lebar, dan itu juga tempat owner menaruh navigasi ("dari menu
 * hamburger", 2026-09-25) — bukan pita yang menempel di bawah hero, yang
 * justru sudah dihapus atas keputusan owner.
 *
 * `href` menunjuk id seksi yang SUDAH ada dan sudah dijaga `e2e:landing`
 * ("every in-page link resolves to a real element"), jadi tidak ada anchor
 * mati yang bisa lolos.
 */
const SECTION_LINKS: ReadonlyArray<{ href: string; key: string }> = [
  { href: '#alur', key: 'profile.nav_flow' },
  { href: '#layanan', key: 'profile.nav_services' },
  { href: '#legalitas', key: 'profile.nav_proof' },
  { href: '#tim', key: 'profile.nav_team' },
  { href: '#artikel', key: 'profile.nav_articles' },
  { href: '#kontak', key: 'profile.nav_contact' },
];

/**
 * Split a headline into per-word spans wrapped in an overflow mask, so each
 * word can rise out of nothing (motion.css §10). Whitespace is preserved as
 * TEXT nodes, not as spans, because the browser must stay free to wrap the
 * line — the mask spans are `inline-block` and a space between two of them
 * is a legal break point, exactly as between two words in plain text.
 *
 * `--word-i` counts WORDS only. Using the array index would count the spaces
 * too (split with a capture group alternates word, space, word …), which
 * would double every delay and make a six-word headline take 456ms to
 * finish instead of 228ms.
 */
function splitHeadline(text: string) {
  let wordIndex = 0;
  return text.split(/(\s+)/).map((part, i) => {
    if (!part.trim()) return part;
    const index = wordIndex++;
    return (
      <span key={`w${i}`} class="u-word-mask">
        <span class="u-word" style={{ '--word-i': index }}>
          {part}
        </span>
      </span>
    );
  });
}

export default function App(
  {
    showHeader = true,
    hero = false,
    proof,
  }: {
    showHeader?: boolean;
    hero?: boolean;
    /**
     * ── PITA BUKTI DI HERO (2026-11-14) ────────────────────────────────────
     * Nomor pendaftaran PT dioper dari `LEGAL_FACTS` (index.astro), BUKAN
     * ditulis ulang di sini. Halaman ini sudah punya dua salinan nomor izin
     * (companyProfile.ts dan markup #legalitas); salinan ketiga di dalam
     * island adalah salinan yang tidak akan ikut diperbarui saat nomornya
     * berubah — kelas kesalahan yang sudah pernah terjadi pada
     * `CONTACT_MAPS_URL`.
     *
     * Opsional: rute lain memakai App tanpa hero, dan tanpa pita.
     */
    proof?: { regno?: string };
  } = {},
) {
  const u: UserState = useStore(authStore) as UserState;
  // useLang() re-renders once the lazy JP dict lands (e.g. a cold load with
  // lang=jp) so every t() consumer in this subtree stops showing the Indonesian
  // fallback — the same subscription every island root needs.
  const lang = useLang();
  // Banner artwork follows the persisted banner theme (light → SAKURA,
  // dark → TOKYO). Subscribing here is what makes a theme flip swap the
  // non-hero header's picture; without it the import was dead and every
  // non-hero route rendered a bare gradient.
  //
  // ⚠ WHY AN IMPERATIVE SYNC IS STILL NEEDED (MEASURED 2026-09-25).
  // `useStore(bannerStore)` DOES re-render on every *change* after hydration —
  // toggling the theme in-page swaps the <img> src correctly. It does NOT fix
  // the FIRST paint: the page is server-rendered with the SAKURA default (the
  // server has no `localStorage`), and on hydration Preact REUSES that SSR
  // <img> without patching its `src`, because the client's first render also
  // produced a vnode whose props Preact considers already-present. With a
  // persisted dark theme the header therefore stayed on `sakra_banner.webp`
  // after reload. Adding a `key` did not help (Preact ignores key diffs on the
  // hydration commit). The measured fix is to write the correct src once the
  // island is live: the effect below runs on mount (fixing the first paint) and
  // again on every `banner` change (covering later flips), so it also makes the
  // subscription's re-render robust against the same no-op diff.
  const banner = useStore(bannerStore);
  const bannerSrc = banner === 'SAKURA' ? BANNER_ART.SAKURA : BANNER_ART.TOKYO;
  const bannerImgRef = useRef<HTMLImageElement | null>(null);
  /**
   * ── THE HEADLINE ARRIVES WORD BY WORD (2026-11-13) ──────────────────────
   * Owner's note: "font interactif cursornya belum maksimal ... transisinya
   * kurang". The hero h1 was the last element on the page still appearing as
   * one block: it is server-rendered, so by the time anything else animated
   * the headline had already been painted in full.
   *
   * The words are split at RENDER time rather than by a DOM splitter, for
   * two reasons measured in this file's own history:
   *   1. The h1 exists in the server HTML (`grep -c '<h1' dist/index.html`
   *      is 1), so a post-hydration splitter would flash the finished
   *      headline and then hide it again.
   *   2. The text comes from `t("profile.hero_title")`, which re-renders on
   *      a language change. A DOM splitter's spans would be destroyed by
   *      that re-render; JSX spans are simply rebuilt.
   *
   * `is-visible` is added one frame after mount so the transition has a
   * frame to start from — adding it in the same commit would paint the final
   * state with no animation. Without JS the class is never added, but the
   * hidden state lives behind `html.js-reveal` (motion.css §10), which is
   * also absent — so the headline is simply visible.
   */
  const [heroIn, setHeroIn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setHeroIn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const heroTitle = t('profile.hero_title');

  useLayoutEffect(() => {
    const el = bannerImgRef.current;
    if (el && el.getAttribute('src') !== bannerStore.get()) {
      el.setAttribute('src', bannerStore.get() === 'SAKURA' ? BANNER_ART.SAKURA : BANNER_ART.TOKYO);
    }
  }, [banner]);
  const [modalMode, setModalMode] = useState<ModalMode>('closed');
  const [menuOpen, setMenuOpen] = useState(false);
  /* Nav that follows the page — see the effect below for the measurement that
     decides when it detaches from the band. */
  const headerRef = useRef<HTMLElement | null>(null);
  /**
   * ── THE HERO CLIP'S OWN REF (2026-11-11, ditunda 2026-11-14) ────────────
   * Sejak 14 Nov klip TIDAK lagi `autoplay` — ia dimulai oleh efek di bawah
   * setelah `load` + 1,2 detik, supaya 520 KB mp4 tidak ikut di layar pertama.
   * Konsekuensinya `playing` kini selalu datang SETELAH hidrasi, jadi listener
   * di dalam efek tidak bisa lagi melewatkan event pertama.
   *
   * Pemeriksaan "sudah berjalan" di bawah TETAP ADA dan bukan sisa: kalau
   * `play()` dipanggil sebelum efek sempat berlangganan (atau browser
   * memulihkan pemutaran dari bfcache), `playing` sudah lewat dan `is-live`
   * tidak akan pernah dipasang — klip berjalan di belakang lapisan
   * `opacity: 0`, persis kegagalan yang terukur 2026-11-11.
   */
  const heroVidRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const v = heroVidRef.current;
    if (!v) return;
    const go = () => {
      v.classList.add('is-live');
      /* `display: none`, not `opacity: 0`: `.hero-art` carries the `hero-drift`
         animation, and an animation beats an inline style. Two layers at 60%
         would also add up to a brighter band than the still alone. */
      const pic = v.closest('.hero-vidwrap')?.previousElementSibling;
      if (pic instanceof HTMLElement) pic.style.display = 'none';
    };

    /* ── KLIP HERO DITUNDA (2026-11-14) ──────────────────────────────────
       `autoplay` membuat browser mengunduh mp4 520 KB SEBELUM siapa pun
       melihat hero. Terukur 14 Nov: 741 KB video di muatan awal (32% total),
       520 KB di antaranya klip ini — untuk gerak 5 detik yang tidak diminta.
       Posternya sudah ada, sudah jadi LCP (668 ms), dan tampil lebih dulu.

       Jadi klip mulai SETELAH layar pertama selesai: `load` + 1,2 detik.
       `preload="none"` di elemen membuat unduhan benar-benar tertunda sampai
       `play()` dipanggil, bukan sekadar ditunda oleh JS.

       `prefers-reduced-motion`: klip TIDAK PERNAH dimulai. Pengguna yang
       meminta gerak dikurangi mendapat still, bukan video yang menunggu. */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      v.addEventListener('playing', go);
      return () => v.removeEventListener('playing', go);
    }

    let timer = 0;
    const start = () => {
      v.preload = 'auto';
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    };
    const schedule = () => {
      timer = window.setTimeout(start, 1200);
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });

    if (!v.paused && v.readyState >= 2) go();
    v.addEventListener('playing', go);
    return () => {
      v.removeEventListener('playing', go);
      window.removeEventListener('load', schedule);
      window.clearTimeout(timer);
    };
  }, []);
  const [navFixed, setNavFixed] = useState(false);
  const [showAiCopilot, setShowAiCopilot] = useState(false);
  const [showCekSiswa, setShowCekSiswa] = useState(false);
  /* Exit window (2026-09-28) — see `useOverlayPresence`. LoginModal is NOT
     here: it is mounted unconditionally and owns its own presence. */
  const cekSiswaP = useOverlayPresence(showCekSiswa);
  const aiCopilotP = useOverlayPresence(showAiCopilot);
  /**
   * Admin AI copilot, loaded only when it is actually opened.
   *
   * It used to be a static import. `App` is the island the LANDING page
   * hydrates with `client:load`, so every anonymous visitor downloaded an
   * admin-only widget (11.6 KB) they can never open — and it was part of the
   * 453 KB island graph measured in the built output. The component is only
   * mounted when `aiCopilotP.present` (an admin clicked the button), which is
   * exactly the moment the chunk is worth fetching.
   */
  const [Copilot, setCopilot] = useState<ComponentType<{ onClose: () => void; closing?: boolean }> | null>(null);
  useEffect(() => {
    if (!aiCopilotP.present || Copilot) return;
    let alive = true;
    void import('./admin/AdminAiCopilot').then((mod) => {
      if (alive) setCopilot(() => mod.default);
    });
    return () => { alive = false; };
  }, [aiCopilotP.present, Copilot]);
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
    // Self-heal token FCM: sesi yang dipulihkan dari localStorage tidak pernah
    // melewati login, jadi tanpa ini perangkat yang kehilangan langganan push
    // tidak akan pernah mendaftar lagi. Tidak memunculkan prompt: hanya jalan
    // kalau izin sudah `granted`.
    refreshFcmRegistrationOnce();
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

  /**
   * ── PWA INSTALL: THE REAL PROMPT, NOT A TOAST (2026-11-11) ───────────────
   * Owner: "perasaan dulu bisa langsung install pwa nya kenapa sekarang cuma
   * petunjuk untuk instal".
   *
   * The button never had a prompt behind it — it always showed a toast, and the
   * only way to install was Chrome's own address-bar affordance, which appears
   * only when the app is installable. So there was nothing to regress: the
   * feature the owner remembers was never wired to this button.
   *
   * `beforeinstallprompt` fires once, after Chrome has decided the app is
   * installable, and it is the ONLY way to open the native sheet from our own
   * UI. It must be `preventDefault()`ed (otherwise Chrome shows its own
   * mini-infobar and the event is spent) and the event kept until the user asks.
   * iOS never fires it — Safari has no programmatic install — so the fallback
   * stays, but it now names the iOS steps instead of telling an iPhone to open
   * Chrome's menu.
   */
  const [installEvt, setInstallEvt] = useState<Event | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) setInstalled(true);
    } catch {
      /* matchMedia is absent in some test environments; the listener still works */
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function installApp() {
    setMenuOpen(false);
    const evt = installEvt as unknown as
      | { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
      | null;
    if (evt) {
      await evt.prompt();
      const choice = await evt.userChoice;
      if (choice.outcome === 'accepted') showToast('ui.install_started', 'success');
      setInstallEvt(null);
      return;
    }
    const ua = navigator.userAgent;
    const isIos =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    showToast(isIos ? 'ui.install_how_ios' : 'ui.install_how_android', 'info');
  }

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

  /* THE MENU MUST NOT SCROLL AWAY (owner, 2026-11-10: "sudah sampai scroll bawah
     harus kudu scroll atas lagi … menunya pojok kanan atas gak ikut").
     ---------------------------------------------------------------------------
     The hamburger lives INSIDE the header band, which is an ordinary block, so
     it leaves the viewport the moment the band does — and on `/loker` and
     `/public` that band is 224px tall, i.e. the menu is gone after one swipe.

     WHY A STATE FLIP AND NOT `position: sticky`: `sticky` is bounded by its
     parent's box, so a sticky child of a 224px band stops moving at 224px and
     scrolls away with it. `fixed` is the only value that is relative to the
     viewport — and the band does not create a containing block for it (no
     `transform`, `filter` or `backdrop-filter` anywhere in the chain; `overflow:
     clip` on `.hero-band` does not clip a fixed descendant, whose containing
     block is the viewport).

     WHY ONE BUTTON AND NOT A SECOND FLOATING COPY: a duplicate would be a second
     tab stop, a second `aria-expanded`, and two nodes that can disagree about
     whether the drawer is open. The single node moves; the drawer state stays
     exactly where it was.

     THE THRESHOLD IS THE HEADER'S OWN BOTTOM, not a magic scroll number: the
     button must detach BEFORE it slides under the top edge, which is when the
     band's bottom passes the button's own resting slot (12px + 44px = 56px).
     Measuring the element instead of assuming 224px is what keeps this correct
     on `/` (full-height hero), on `/loker`/`/public` (14rem band), and at 320px
     where the band is taller.

     `requestAnimationFrame` coalescing: scroll fires far more often than the
     answer can change, and this runs on the landing page — the one route where
     main-thread time is already the Lighthouse lever. `setNavFixed` with the
     same value bails out without a render. */
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      const band = headerRef.current;
      if (!band) return;
      setNavFixed(band.getBoundingClientRect().bottom < 56);
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /* `inert` in a LAYOUT effect, not a deferred one: under useEffect the
     attribute lands a frame after paint, which leaves a window where the
     drawer is visually closed but still holds six Tab stops — the exact
     defect this closes. `inert` covers the accessibility tree too, so no
     separate `aria-hidden` is written. */
  useLayoutEffect(() => {
    const el = drawerRef.current;
    if (el) el.inert = !menuOpen;
    /* BACKGROUND SCROLL LOCK, and it matters more now than it used to.
       ---------------------------------------------------------------------
       The menu can be opened from ANY scroll position since 2026-11-10 (it
       follows the page), so a swipe that lands on the scrim no longer just
       nudges a page the user is looking at from the top — it can leave them
       thousands of pixels away from where they opened the drawer, with no
       visual trace of what moved.

       On `<html>`, not `<body>`: `overflow: hidden` on body alone does not stop
       the viewport from scrolling when `html` is the scrolling element, which is
       the case here. `scrollbar-gutter: stable` (layout.css) is what makes this
       free — the gutter is already reserved, so removing the scrollbar does not
       shift the layout by 15px.

       Restored from the PREVIOUS inline value rather than cleared to '', so a
       value set by something else (a modal that locks too) is not clobbered. */
    if (menuOpen) {
      const html = document.documentElement;
      const previous = html.style.overflow;
      html.style.overflow = 'hidden';
      return () => {
        html.style.overflow = previous;
      };
    }
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
     this header is unchanged; only the new hero variant adopts it.

     LOCAL FILE AS OF 2026-09-30, and the error handler went with the hotlink.
     This pointed at
     `…supabase.co/storage/v1/object/public/asj-files/assets/logo-removebg-preview.webp`
     — 66.140 B, 500x500, drawn at 48/64 px, so **7,8x more pixels than any screen
     could show**, fetched from a third-party CDN on EVERY page. `Footer.astro` had
     already made exactly this swap, and recorded the reasoning: `/icons/logo-asj.webp`
     is the same emblem WITH an alpha channel, so it drops onto the header gradient
     with no white box, and it is already committed and already published — no new
     asset, no new §11.2 decision. Verified by rendering both side by side before the
     swap, not assumed from the name.
     `onError` was there so a failed CDN fetch would not show a broken icon; a file
     that ships with the build cannot fail that way, and silently hiding the brand
     mark is the wrong behaviour for it.      Removing it also drops one `any`. */
  const brandLogo = (
    /* `srcset` 96w/256w, diukur 2026-11-07: berkas ini 29 KB (256x256) sementara
       ia digambar 48 px (HP) / 64 px (md+) — 4x lebih lebar dari yang bisa
       ditampilkan di layar 1x. Varian 96 px = 5 KB. `sizes` mengikuti kelas
       Tailwind-nya (w-12 = 48px, md:w-16 = 64px), jadi layar 2x tetap memilih
       256w dan tidak ada yang jadi buram. */
    <img
      id="logo-asj"
      src="/icons/logo-asj.webp"
      srcset="/icons/logo-asj-96.webp 96w, /icons/logo-asj.webp 256w"
      sizes="(min-width: 768px) 64px, 48px"
      alt="Logo ASJ"
      class="w-12 h-12 md:w-16 md:h-16 shrink-0 object-contain drop-shadow-2xl"
    />
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
      {/* ─── THE TWO HEADER VARIANTS ARE NOW TWO SEPARATE CLASS STRINGS ───
          Owner request 2026-09-27: the landing hero becomes a full-bleed,
          one-screen band (the reference is a short with a full-screen
          illustrated scene, an oversized serif headline and a scroll-driven
          parallax). Splitting the string is a FIX, not a tidy-up: it used to
          be one common string with a swapped tail, so the hero's geometry
          could only be reached by editing text that five other routes also
          render. Those routes (`/loker`, `/public`, `/admin`, `/candidate`,
          `/share`) mount this header WITHOUT `hero` and must keep the
          `max-w-7xl … rounded-band min-h-[14rem] md:h-56` chrome box exactly
          as it is — including the title-clipping fix recorded in the
          non-hero branch below (the `max-w-[210px]` cap removal, 672d2f1).
          Two strings means a change to one cannot leak into the other.

          HERO (`/` only) — full-bleed, one screen tall:
            · no `max-w-7xl` / `mx-auto` / `px-4` / `mt-6` → edge to edge
            · no `rounded-band` / `border` / `shadow-2xl`  → no card edges
            · NO `overflow-hidden` — `.hero-band` (global.css) supplies
              `overflow: clip` instead. This is load-bearing, not cosmetic:
              `hidden` establishes a SCROLL CONTAINER, and
              `animation-timeline: view()` resolves against the subject's
              nearest scroll container, so the parallax planes in motion.css
              §9e would freeze at a single offset while the stylesheet looked
              completely correct. `clip` clips the same pixels and creates no
              scroll container. It is also what stops the oversized planes
              from painting over the next section.
            · `.hero-band` supplies `min-height: 100svh` — `svh` and not
              `vh`, because on a phone `vh` is measured against the LARGEST
              viewport and the band would be taller than the screen, parking
              the CTA under the address bar. */}
      {showHeader && <header ref={headerRef} id={hero ? "atas" : "asj-header"} class={hero ? "hero-band scroll-mt-24 hero-gradient relative text-white flex items-end p-6 md:p-10" : "hero-gradient max-w-7xl mx-auto px-4 mt-6 relative text-white border border-white/10 shadow-2xl flex items-end rounded-band overflow-hidden transition-colors duration-200 h-auto min-h-[14rem] md:h-56 p-6 md:p-8"}>
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
          <>
          <picture class="hero-art hero-layer -z-0 pointer-events-none">
            {/* ── VARIAN PORTRAIT UNTUK HP (ditambahkan 2026-11-09) ──────────
                MEASURED pada 390px: kotak hero 408x1023 (rasio 0,398) sedangkan
                artwork-nya 2,75:1. `object-cover` menutup dengan skala 2,7x lalu
                memotong, sehingga yang terlihat hanya **14,5% lebar** di TENGAH
                gambar — yaitu langit kosong. Fuji ada di ~35% dan perempuan di
                ~65%, jadi di HP keduanya hilang: yang tampil hanya kabut bokeh
                setengah blur, seharga 172 KB.

                Varian ini memotong wilayah yang SAMA dengan yang ada di belakang
                judul pada desktop — cabang sakura, langit, dan pegunungan di
                kejauhan — bukan memotong tengah. Rasionya 0,45, sedikit lebih
                lebar daripada kotak 0,40 supaya `cover` hanya memangkas sisi,
                tidak pernah memotong atas/bawah.

                DUA PERCOBAAN YANG DITOLAK, dan alasannya terukur:
                · pusat gambar (keadaan sebelum ini) -> hanya langit kosong;
                · wajah perempuan (~65% lebar) -> di 390px wajah raksasa terpotong
                  di dahi, tepat di belakang logo dan judul. Ia BERSIANG dengan
                  teks, bukan melatarinya.
                Sakura + langit memberi latar yang tenang, dan itu juga yang
                dilihat pembaca desktop di balik headline.

                Hasil: 172 KB -> **44 KB**, dan yang tampil adalah bagian artwork
                yang memang dimaksud komposisinya. Sumber tetap
                `ChatGPT Image … 08_31_36 PM.png` (2079x756) — itu memang resolusi
                tertinggi yang ada; tidak ada piksel tambahan yang bisa diklaim.

                `media` 639px: di atas itu kotak hero melebar (0,56 di 600px,
                0,65 di 700px) dan artwork lanskap kembali masuk akal. Di bawah
                640 ia selalu sempit (~0,39-0,45), jadi crop portrait yang tepat. */}
            <source
              media="(max-width: 639px)"
              type="image/avif"
              srcset="/assets/ilustrasi/hero-sakura-816.avif"
            />
            <source
              media="(max-width: 639px)"
              type="image/webp"
              srcset="/assets/ilustrasi/hero-sakura-816.webp"
            />
            <source
              type="image/avif"
              srcset="/assets/ilustrasi/hero-sakura-asj.avif 1x, /assets/ilustrasi/hero-sakura-asj@2x.avif 2x"
            />
            <source
              type="image/webp"
              srcset="/assets/ilustrasi/hero-sakura-asj.webp 1x, /assets/ilustrasi/hero-sakura-asj@2x.webp 2x"
            />
            <img
              src="/assets/ilustrasi/hero-sakura-asj.webp"
              alt=""
              aria-hidden="true"
              width={1600}
              height={582}
              loading="eager"
              decoding="async"
              class="w-full h-full object-cover opacity-60 u-alive"
              style="--alive-dur:13s;--alive-scale-from:1.03;--alive-scale:1.1;--alive-x0:-1.1%;--alive-y0:0.7%;--alive-x:1.2%;--alive-y:-0.9%"
            />
          </picture>
          {/* ── KLIP HERO (2026-11-11) ─────────────────────────────────────
              Owner minta hero-nya "video gerak tipis". Klip 5 detik ini
              di-generate dari potongan 16:9 artwork yang SAMA (model video
              menolak rasio 2,75:1 — dua percobaan gagal), lalu dipotong 60 px
              di atas untuk membuang watermark "AI 生成" milik model.

              PEMBUNGKUS, bukan video telanjang. `.hero-art` + `.hero-layer`
              membawa geometri parallax DAN animasi `hero-drift`, yang antara
              lain menganimasikan `opacity` (1 → 0,5 saat band keluar layar).
              Animasi mengalahkan inline style, jadi menaruh `is-live` langsung
              di elemen ber-animasi itu mustahil: terukur, opasitas klip
              mengikuti kurva scroll (0,75) bukan 0,6 yang diminta. Pembungkus
              yang hanyut, video di dalamnya yang punya opasitas sendiri.

              `<picture>` di atasnya di-`display:none`-kan (bukan opacity 0,
              karena alasan yang sama) begitu klip hidup — dua lapis 60% akan
              saling menambah terang. */}
          <div class="hero-art hero-layer hero-vidwrap pointer-events-none" aria-hidden="true">
            <video
              ref={heroVidRef}
              class="hero-vid"
              src="/assets/ilustrasi/hero-sakura-asj-loop.mp4"
              poster="/assets/ilustrasi/hero-sakura-asj.webp"
              muted
              loop
              playsInline
              preload="none"
              tabIndex={-1}
            />
          </div>
          </>
        )}

        {/* ─── The NEAR parallax plane (motion.css §9e) ──────────────────
             A second copy of the band's own `--hero-glow` token, re-positioned
             and enlarged, drifting further than the artwork above it.

             The depth cue is the DIFFERENCE IN RATE (it travels ~2.75x as far,
             so it reads as closer to the camera). It also travels the opposite
             way, and that part is an aesthetic choice rather than a principle —
             two planes moving the same way at different speeds is the textbook
             parallax. See the full note in motion.css §9e; it is stated there
             because the earlier version of both comments dressed the direction
             up as a law of perception, which it is not.

             WHY IT IS IN THE UPPER-RIGHT (`background-position: 80% 30%`, set
             in CSS). The hero copy sits at the bottom-left and the
             `.header-overlay` scrim exists to hold its contrast. A pink bloom
             behind a white headline raises the backdrop's luminance and eats
             exactly that contrast — and because this plane drifts, it would
             carry that bloom in and out of the copy's row across the scroll
             range. Keeping it up and right keeps the contrast independent of
             scroll position.

             It is placed AFTER the <picture> so it paints over the artwork and
             BEFORE `.header-overlay` so the scrim still wins — all three are
             positioned with no z-index (or `z-0`), so tree order is the paint
             order. Pure gradient: no image, no filter, no `backdrop-filter`,
             so a scroll-linked transform on it stays on the compositor.

             `pointer-events-none` for the same reason the artwork and the
             overlay carry it: it covers the whole band and must never
             intercept a click meant for the CTA. */}
        {hero && (
          <div class="u-hero-fx" aria-hidden="true">
            <div
              class="u-sheen-bar"
              style="--fx-dur:9.5s;--fx-delay:-2.5s;--fx-sheen:rgb(253 164 175 / 0.14)"
            />
            <svg
              class="w-full h-full"
              viewBox="0 0 1600 582"
              preserveAspectRatio="xMidYMid slice"
              aria-hidden="true"
              focusable="false"
            >
              <ellipse
                class="u-fx-petal"
                cx="190"
                cy="68"
                rx="11"
                ry="6.5"
                fill="#fda4af"
                style="--fx-dur:7.4s;--fx-delay:-0.8s;--fx-mid-x:95px;--fx-mid-y:150px;--fx-end-x:210px;--fx-end-y:330px;--fx-alpha:0.85"
              />
              <ellipse
                class="u-fx-petal"
                cx="340"
                cy="42"
                rx="9.5"
                ry="5.5"
                fill="#fecdd3"
                style="--fx-dur:8.6s;--fx-delay:-3.4s;--fx-mid-x:120px;--fx-mid-y:170px;--fx-end-x:260px;--fx-end-y:360px;--fx-alpha:0.8"
              />
              <ellipse
                class="u-fx-petal"
                cx="540"
                cy="58"
                rx="8.5"
                ry="5"
                fill="#fb7185"
                style="--fx-dur:9.2s;--fx-delay:-5.9s;--fx-mid-x:85px;--fx-mid-y:165px;--fx-end-x:185px;--fx-end-y:345px;--fx-alpha:0.75"
              />
              <ellipse
                class="u-fx-petal"
                cx="880"
                cy="52"
                rx="9"
                ry="5"
                fill="#fecdd3"
                style="--fx-dur:8.1s;--fx-delay:-2.1s;--fx-mid-x:-70px;--fx-mid-y:145px;--fx-end-x:-155px;--fx-end-y:320px;--fx-alpha:0.78"
              />
              <ellipse
                class="u-fx-petal"
                cx="1210"
                cy="74"
                rx="10.5"
                ry="6"
                fill="#fda4af"
                style="--fx-dur:7.8s;--fx-delay:-4.7s;--fx-mid-x:-90px;--fx-mid-y:160px;--fx-end-x:-190px;--fx-end-y:340px;--fx-alpha:0.85"
              />
              <ellipse
                class="u-fx-petal"
                cx="1450"
                cy="88"
                rx="11"
                ry="6"
                fill="#fecdd3"
                style="--fx-dur:8.9s;--fx-delay:-6.5s;--fx-mid-x:-110px;--fx-mid-y:155px;--fx-end-x:-230px;--fx-end-y:335px;--fx-alpha:0.82"
              />
              <circle
                class="u-fx-orb"
                cx="1235"
                cy="275"
                r="24"
                fill="#fde68a"
                style="--fx-dur:5.4s;--fx-delay:-1.2s;--fx-dx:14px;--fx-dy:-18px;--fx-alpha-min:0.18;--fx-alpha-max:0.46"
              />
              <circle
                class="u-fx-orb"
                cx="740"
                cy="220"
                r="16"
                fill="#fda4af"
                style="--fx-dur:6.2s;--fx-delay:-3.8s;--fx-dx:-16px;--fx-dy:-14px;--fx-alpha-min:0.15;--fx-alpha-max:0.42"
              />
              <circle
                class="u-fx-orb"
                cx="1090"
                cy="185"
                r="13"
                fill="#fbcfe8"
                style="--fx-dur:4.9s;--fx-delay:-2.6s;--fx-dx:12px;--fx-dy:-16px;--fx-alpha-min:0.2;--fx-alpha-max:0.5"
              />
              <circle
                class="u-fx-sparkle"
                cx="645"
                cy="118"
                r="3.2"
                fill="#fff1f2"
                style="--fx-dur:2.7s;--fx-delay:-0.5s"
              />
              <circle
                class="u-fx-sparkle"
                cx="815"
                cy="96"
                r="2.8"
                fill="#fef3c7"
                style="--fx-dur:3.3s;--fx-delay:-1.9s"
              />
              <circle
                class="u-fx-sparkle"
                cx="1165"
                cy="132"
                r="3.4"
                fill="#fef08a"
                style="--fx-dur:2.9s;--fx-delay:-2.4s"
              />
              <circle
                class="u-fx-sparkle"
                cx="1330"
                cy="168"
                r="2.8"
                fill="#ffe4e6"
                style="--fx-dur:3.5s;--fx-delay:-1.1s"
              />
            </svg>
          </div>
        )}
        {hero && <div class="hero-haze hero-layer pointer-events-none" aria-hidden="true" />}

        {/* Non-hero header artwork — RESTORED 2026-09-25 (owner item 3).
             Every route except `/` mounts the header without the hero, and this
             band was left with a bare gradient. It now carries the theme-driven
             banner from the legacy `asj-files` path; `bannerSrc` flips with
             `bannerStore` (SAKURA ⇄ TOKYO), which is what a theme change should
             visibly do.

             Same geometry contract as the hero picture: `absolute inset-0 -z-0`
             so it paints UNDER the (unpositioned) flex children, `object-cover`
             so the band's varying height never distorts the art, and
             `opacity-60` so the band's gradient still reads through it — the
             two share a palette and must not meet at a hard edge. `aria-hidden`
             + `alt=""` because it is decorative: the header's own text carries
             the meaning, exactly as the hero-branch comment explains.

             No `srcset`/`width`/`height`: the legacy asset is a single remote
             file with no @2x sibling, and asserting an intrinsic box we do not
             know would be a false statement about it (same reasoning the hero
             comment records for its own size change). `loading="lazy"` — unlike
             the hero, this band is not the LCP element on these routes. */}
        {!hero && (
          <img
            ref={bannerImgRef}
            src={bannerSrc}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            class="absolute inset-0 -z-0 pointer-events-none w-full h-full object-cover opacity-60"
          />
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
             floor. It is decorative, so `aria-hidden` + `pointer-events-none`.

             ⚠ NOW APPLIED TO BOTH VARIANTS, 2026-09-25. It used to be
             `{hero && …}` because only the hero carried artwork. The non-hero
             header now carries the theme banner too (item 3), so the overlay is
             no longer conditioned on `hero` — gating it on the hero would leave
             the non-hero header's white copy sitting directly on the artwork.
             MEASURED on `/public` 1280, glyph row sampled with the header text
             hidden so only the backdrop is read: dark 9.64:1; light varies with
             the banner artwork as it paints — 12.8:1 over the bare gradient down
             to **3.35:1** once a bright `sakra_banner.webp` petal lands behind
             the copy. All clear the 3:1 floor, the light one by design margin.
             NOTE the light figure depends on global.css §5d's band SELF-match
             rule as well as this overlay: without it the non-hero h1 inherited
             §5b's `#1f1d1c` and measured **1.21:1** against this same backdrop
             (it was ALREADY 1.10:1 at HEAD, before the banner — a pre-existing
             defect this task surfaced and fixes). See the §5d comment. */}
        <div class="absolute inset-0 header-overlay pointer-events-none" aria-hidden="true" />

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
        {/* `fixed` once the band's bottom passes this button's resting slot —
            see the effect above. Same node, same state, only the containing
            block changes. `z-40` sits above page content (the old `z-30`) and
            still below the scrim (95) / drawer (100), so the layering against
            the open menu is exactly what it was.

            ── OFFSET DIPINDAH KE `.header-controls` (2026-11-14) ────────────
            Sebelumnya `top-4 right-4` (16 px) / `top-3 right-3` (12 px) —
            dan di iPhone itu BERARTI di bawah notch. `BaseLayout.astro` sudah
            memakai `viewport-fit=cover`, jadi `env(safe-area-inset-*)` hidup
            dan pojok kanan atas layar benar-benar tertutup sudut membulat +
            area status. Terukur di 390×844: tombol 44×44 mulai 16 px dari
            tepi. Owner: "terlalu pojok kanan atas jadi susah di pencet".
            Offset sekarang `env(safe-area-inset-*) + 1rem` (lihat global.css),
            jadi di perangkat ber-notch tombol turun ke bawah notch, bukan
            menempel di sudut fisik layar. */}
        <div class={`header-controls ${navFixed ? "fixed z-40" : "absolute z-30"} flex items-center gap-2`}>
          {/* ⚠ NO `text-white` HERE, AND THAT IS THE FIX (2026-11-10).
              `.hamburger-btn` already owns this chip's colours in both themes
              (`global.css` §hamburger: black 70% + white icon on the dark
              themes, frosted white + `#1f1d1c` icon in light). The `text-white`
              utility silently overrode the light half: the shim's
              `:where([data-theme="light"]) :where(.hero-gradient…) .text-white`
              is specificity 0,2,0 and beats the `.hamburger-btn` colour (0,1,0),
              and it keeps matching after the button goes `fixed` because CSS
              follows the DOM, not the box. MEASURED light theme: chip
              `rgba(255,255,255,0.65)` with icon `rgb(255,255,255)` — a white
              hamburger on a white chip. No gate could see it: `e2e:contrast`
              measures TEXT, and this control's label is an SVG glyph. Removing
              the utility lets `.hamburger-btn` do the job it was written for.

              ── 44 → 48 px + HIT AREA 64 px (2026-11-14) ──────────────────
              DESIGN.md:691 menulis ">=44 px, idealnya 48 px"; tombol ini
              berhenti di angka minimum. `w-12 h-12` = 48 px, dan
              `.hamburger-btn::after` (global.css) menambah 8 px transparan di
              tiap sisi → area ketuk 64 px tanpa mengubah ukuran visual
              lingkaran. Ikon naik `text-lg` → `text-xl` supaya sasaran
              terbaca sebagai tombol, bukan titik. */}
          <button type="button" ref={hamburgerRef} onClick={toggleMenu} class="w-12 h-12 flex items-center justify-center bg-black/70 hover:bg-zinc-800 rounded-full border border-white/60 transition shadow-lg hamburger-btn" aria-label="Toggle Menu" aria-expanded={menuOpen}>
            <Icon name={menuOpen ? "times" : "bars"} class="text-xl" />
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
                {/* `truncate` DIGANTI `min-w-0` + wrap (2026-11-10).
                    MEASURED `e2e:responsive` 320px: the brand line clipped by
                    4px (scrollWidth 201 vs clientWidth 197) on `/` and `/404`.
                    The available width here is `container − logo − gap`, so it
                    moves with whatever the logo renders as — a clipped-by-4px
                    budget is not a budget, it is a race. `truncate` hid the
                    overflow behind an ellipsis instead of preventing it, and
                    "PT AMANAH SAKURA…" is the company's own name.
                    Wrapping cannot overflow at any width and needs no magic
                    number. */}
                <span class="text-pink-300 text-eyebrow font-bold uppercase min-w-0 leading-tight" data-lang="profile.hero_eyebrow">{t("profile.hero_eyebrow")}</span>
              </div>
              <p class="text-pink-300 text-eyebrow font-bold uppercase mt-5" data-lang="profile.hero_tagline">{t("profile.hero_tagline")}</p>
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
              {/* ─── The DISPLAY headline — serif, and the ONLY user of the
                     display face (theme.css `--font-display`) ───
                  Owner request 2026-09-27, from a reference short: a
                  full-screen hero with an oversized SERIF display headline.
                  `font-display` swaps Inter for Instrument Serif (20.5 KB,
                  latin, one weight — see BaseLayout.astro and theme.css).

                  `font-normal` IS NOT OPTIONAL. The family ships weight 400
                  ONLY, so leaving the old `font-black` would ask the browser
                  to SYNTHESISE a 900 — a smeared fake on a high-contrast
                  serif, which is the worst possible face to fake bold on.
                  The hierarchy this loses is bought back by SIZE: the
                  display tier was retuned to a 72 px ceiling (theme.css
                  `--text-display`).

                  `leading-tight` was REMOVED at the same time. It (1.25) was
                  overriding the `text-display` token's own leading, so the
                  token's line-height was dead on this element; a display
                  serif wants the tighter 1.02 the token now carries, and
                  having one owner for the leading is the point of the token.

                  The `text-white` note below still applies unchanged — the
                  band is dark in BOTH themes, so the colour must not come
                  from the theme. */}
              <h1 class={`text-display font-display font-normal text-white drop-shadow-lg mt-2 u-words${heroIn ? ' is-visible' : ''}`}>{splitHeadline(heroTitle)}</h1>
              <p class="text-body text-slate-200 mt-4 max-w-[52ch] leading-relaxed">{t("profile.hero_sub")}</p>
              {/* NO "Lihat Lowongan" CTA HERE. Owner ruling 2026-09-24: `/` is a
                  company profile for MoU/business partners, not a job board, so
                  the hero's primary CTA to /loker is removed and the section nav
                  is the page's ONLY path to the vacancy list. The register
                  button below stays — it is not a /loker link. */}
              <div class="flex flex-wrap items-center gap-3 mt-8">
                {/* ── SATU TOMBOL YANG BERTERIAK (2026-11-14) ─────────────────
                    Sebelum ini satu-satunya aksi di hero adalah tombol
                    `bg-white/10` berbingkai tipis — gaya yang dibaca sebagai
                    SEKUNDER di mana-mana, dipakai untuk aksi TERPENTING di
                    halaman. Ia juga `<button onClick={openRegister}>`, bukan
                    tautan: tidak bisa dibuka di tab baru, tidak bisa dibagikan,
                    dan tidak terindeks.

                    Sekarang primer = isi pink dengan teks gelap (kontras ±10:1
                    di atas artwork gelap) dan `href="/apply"`. Tombol kedua
                    sengaja tetap hantu: ia pintu untuk audiens lain (mitra),
                    bukan saingan. */}
                <a
                  href="/apply"
                  class="inline-flex items-center px-7 py-3.5 rounded-pill bg-pink-300 hover:bg-pink-200 text-[#2a0f1d] font-bold text-sm transition shadow-lg shadow-pink-300/25"
                >
                  <Icon name="user-plus" class="mr-2" />
                  {t("profile.hero_cta_secondary")}
                  <Icon name="arrow-right" class="ml-2" />
                </a>
                {/* PINTU MITRA. Halaman ini menyebut dirinya company profile
                    untuk mitra MoU (owner 2026-09-24) tetapi tidak punya satu
                    pun jalur untuk mereka. Satu tombol hantu sudah cukup. */}
                <a
                  href="#kontak"
                  class="inline-flex items-center px-7 py-3.5 rounded-pill bg-white/10 hover:bg-white/20 border border-white/25 text-white font-bold text-sm backdrop-blur-sm transition"
                >
                  <Icon name="handshake" class="mr-2" />
                  {t("profile.hero_cta_partner")}
                </a>
              </div>

              <div class="flex flex-wrap gap-2 mt-5">
                {[t("profile.hero_chip_ssw"), t("profile.hero_chip_magang"), t("profile.hero_chip_penempatan")].map((label) => (
                  <span key={label} class="px-3 py-1 rounded-pill bg-white/10 border border-white/15 text-caption font-bold text-slate-200 backdrop-blur-sm">{label}</span>
                ))}
              </div>

              {/* ── TIGA ANGKA TURUN DARI KOTAK KACA (2026-11-14) ─────────────
                  Sebelumnya ketiganya kotak kaca `backdrop-blur` di kolom kanan
                  (lg:col-span-5). Di 1440, judul dua baris + tiga kotak membuat
                  hero punya DUA pusat perhatian, dan artwork di belakangnya tidak
                  pernah mendapat ruang. Bentuknya sekarang strip rambut di bawah
                  CTA: angka yang sama, di layar yang sama, tanpa berteriak — dan
                  `backdrop-filter` hilang dari hero (biaya per frame).

                  ⚠ DOM-nya SENGAJA tetap `parent > [nilai, label]` dengan label
                  sebagai `<div>` daun. `e2e/test-landing.mjs` (L8.4) mencari tile
                  lewat teks label yang PERSIS, lalu membaca `children[0]` sebagai
                  nilainya. Mengubah urutan, atau membungkus label dengan
                  `<span>`, membuat gate itu melaporkan 0/3 tile. */}
              <div class="mt-7 pt-6 border-t border-white/15 flex flex-wrap gap-x-12 gap-y-5">
                {HERO_STATS.map((stat) => (
                  <div key={stat.labelKey} class="flex flex-col">
                    <div class="text-section font-display text-white leading-none">{stat.valueKey ? t(stat.valueKey) : stat.value}</div>
                    <div class="text-caption uppercase tracking-[0.12em] text-slate-400 mt-2">{t(stat.labelKey)}</div>
                  </div>
                ))}
              </div>

              {/* ── PITA BUKTI DI TEPI BAWAH HERO (2026-11-14) ────────────────
                  Rating tinggal di #testimoni (layar ke-19) dan nomor
                  pendaftaran di #legalitas (layar ke-9). Keduanya bukti yang
                  bisa diperiksa orang lain — dan keduanya datang terlambat.

                  Pita ini memindahkan RINGKASANNYA ke layar pertama. Tidak ada
                  angka baru: rating dibaca dari `REVIEW_SOURCE`, nomor
                  pendaftaran dioper dari `LEGAL_FACTS` lewat prop `proof`
                  (satu sumber, bukan salinan ketiga di dalam island).

                  ⚠ SATU BINTANG, BUKAN LIMA. Lima bintang penuh di samping
                  4,8 adalah klaim palsu — tidak ada ulasan 5,0 yang mewakili
                  rata-rata. Aturan yang sama dipakai strip agregat #testimoni.

                  ⚠ LEBARNYA MENGIKUTI KOLOM TEKS (7/12), BUKAN SELURUH BAND.
                  Itu disengaja: garis rambut selebar layar akan memotong
                  artwork tepat di tengah, dan pita ini memang milik kolom teks
                  — bukan footer band. */}
              <div class="mt-7 pt-5 border-t border-white/15 flex flex-wrap items-center gap-x-6 gap-y-2 text-caption text-slate-300">
                {REVIEW_SOURCE.rating !== null && REVIEW_SOURCE.count !== null ? (
                  <span class="inline-flex items-center gap-2">
                    <span class="text-amber-300" aria-hidden="true">
                      ★
                    </span>
                    <b class="text-white font-bold">
                      {REVIEW_SOURCE.rating.toFixed(1).replace('.', ',')}
                    </b>
                    <span aria-hidden="true" class="text-white/25">
                      ·
                    </span>
                    <span>
                      {REVIEW_SOURCE.count} {t("profile.hero_proof_reviews")}
                    </span>
                  </span>
                ) : null}
                {proof?.regno ? (
                  <span class="inline-flex items-center gap-2">
                    <span class="text-white/45">{t("profile.legal_regno")}</span>
                    <b class="text-white font-bold font-mono tracking-tight">{proof.regno}</b>
                  </span>
                ) : null}
                <a
                  href="#legalitas"
                  class="inline-flex min-h-[44px] items-center gap-1.5 text-pink-300 hover:text-pink-200 font-bold underline-offset-4 hover:underline transition"
                >
                  {t("profile.hero_proof_check")}
                  <Icon name="arrow-right" class="text-xs" />
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div class="relative z-10 w-full flex flex-col md:flex-row justify-between items-start md:items-end gap-5">
            <div class="flex items-center gap-3 md:gap-5 min-w-0 w-full md:w-auto">
              {brandLogo}
              {/* The title takes whatever width the row gives it. There is NO
                  width cap, and that is a measured decision, not an omission.

                  ⚠ `w-full` ON THE GROUP IS LOAD-BEARING. The row is
                  `items-start`, so a flex child does NOT stretch — without
                  `w-full` the group sizes to its CONTENT, which is wider than
                  the row at small widths, so the box grows past the container
                  and `truncate` never engages. Measured 2026-09-27: without
                  `w-full` the h1 box ran to x=351 on a 320px viewport.

                  REPLACES `max-w-[210px]`, WHICH PROTECTED NOTHING. That cap
                  was added because the title box (x ends 287) and the menu
                  button (x starts 244) overlap HORIZONTALLY at 320px. But they
                  do not overlap VERTICALLY, and never did: the button is
                  `absolute top-4` (y 41..85) while the title sits at the bottom
                  of the header via the header's own `items-end` (y 195..223 at
                  320px; 138..218 on /admin). Measured across 3 routes x 6
                  widths (320/360/390/414/768/1280) — **18 of 18 have zero
                  vertical overlap**, so no text ever rendered under the button.

                  The old comment claimed "51px renders *under* the button",
                  which is an x-only comparison. Do not re-add a cap on that
                  reasoning; compare the two RECTANGLES, not their x-ranges.

                  Measured effect of removing it (`h1 clientWidth/scrollWidth`,
                  and the full name is 274px):
                    320px  210 -> 211   360px  210 -> 251
                    390px  210 -> 281 (FULL)   414px  210 -> 305 (FULL)
                    /admin 320 -> 271 (FULL), 768 -> 671 (FULL)
                  So the company name is now complete from 390px up instead of
                  permanently ellipsised. No horizontal overflow at any width.

                  `truncate` STAYS and `App.header.test.tsx` still enforces it
                  ("memotong judul dengan elipsis, bukan melipatnya"); wrapping
                  was tried as `line-clamp-2` on 2026-09-25 and reverted. */}
              <div class="min-w-0 flex-1">
                <div id="header-tagline" class="text-pink-300 text-xs md:text-sm font-bold tracking-[4px] mb-1 truncate">{t("header.tagline")}</div>
                {/* This is the page's ONLY h1 on /public, /admin, /candidate,
                    /share — every route that mounts the header without a hero.
                    Demoting it globally would leave those routes with no h1 at
                    all, which is why the hero variant above is opt-in.

                    ⚠ `truncate` STAYS, AND `App.header.test.tsx` ENFORCES IT
                    ("memotong judul dengan elipsis, bukan melipatnya"). This was
                    TRIED as `line-clamp-2` on 2026-09-25 to stop the company name
                    rendering as "PT AMANAH SAKUR…" on a phone, and the test caught
                    it. Measured before reverting, at /loker:
                      · 390px  line-clamp-2 -> title ends x=281, button starts 314, clears by 27px
                      · 360px  line-clamp-2 -> title ends x=281, button starts 284, OVERLAPS
                      · 320px  line-clamp-2 -> title ends x=281, button starts 244, OVERLAPS by 43px
                      · `truncate` at the same widths -> the BOX is the same 210px, so
                        it overlaps at 360/320 too. Wrapping bought nothing there.
                    So the ellipsis is not what protects the button — the
                    `max-w-[210px]` cap is, and that cap is simply too wide below
                    ~370px. Making the cap responsive is a real change with its own
                    risk, so it is REPORTED rather than smuggled in under a UX
                    sweep. Do not swap this class without re-running the measured
                    comparison above. */}
                <h1 class="text-lg md:text-3xl font-black italic tracking-wide drop-shadow-lg truncate"><span data-lang="header.company_name">{t("header.company_name")}</span></h1>
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
          the real modals beside it (§25).

          `.js-scrim` IS LOAD-BEARING — do not remove it. The light-theme shim
          in global.css remaps `bg-black/NN` to a pale surface for cards, and it
          exempts real scrims via `:not(.inset-0)`. This scrim gets its geometry
          from `.u-viewport-fixed`, NOT `inset-0`, so it slipped the exemption
          and was repainted OPAQUE. MEASURED light-theme, drawer open: computed
          background was `rgb(239,233,239)` (opacity 1) hiding the whole page;
          dark theme was correct at `oklab(0 0 0 / 0.7)`. `.js-scrim` is the
          explicit, named opt-out for exactly this case. */}
      {menuOpen && <div aria-hidden="true" class="u-viewport-fixed u-modal-shell bg-black/70 js-scrim z-scrim" onClick={() => setMenuOpen(false)}></div>}
      
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
      <nav ref={drawerRef} class={"u-viewport-fixed--right z-drawer w-72 md:w-96 bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col transition-transform duration-300 transform " + (menuOpen ? "translate-x-0" : "translate-x-full")} aria-label="Primary navigation">
        <div class="flex items-center justify-between p-4 border-b border-slate-700">
          <span class="text-xs font-bold text-slate-500 uppercase tracking-widest"><Icon name="bars" class="mr-2 text-sky-400" /> {t("ui.menu")}</span>
          <button type="button" onClick={toggleMenu} class="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-white transition" aria-label="Close"><Icon name="times" class="text-xl" /></button>
        </div>
        {/* User identity strip — sits above the action list so the drawer
            answers "who am I?" before the buttons do. Hidden when logged
            out so the Login/Register block stays the first thing. */}
        {u.isLoggedIn && (
          <div class="px-4 py-3 border-b border-slate-700 bg-slate-800/40">
            <div class="text-[11px] uppercase tracking-widest text-slate-500 mb-1">{u.role === "admin" ? t("header.admin") : t("header.dashboard")}</div>
            <div class={"text-base font-bold " + (u.role === "admin" ? "text-amber-300" : "text-emerald-300")}>{u.name}</div>
          </div>
        )}
        <div class="flex-1 u-scroll-area p-4 space-y-3">
          <div class="space-y-3 pb-3 mb-3 border-b border-slate-700">
            {/* ─── THE SITE'S ONLY PATH TO `/loker` ───
                Owner ruling 2026-09-25 removed the entire band below the hero
                (the announcement marquee, the live-vacancy count strip and the
                `<SiteNav />` section bar). That bar's "Lowongan" item was the
                ONLY `href="/loker"` anywhere in `src/**` — measured, every other
                hit is prose and `Footer.astro` links four fragments only. So the
                link moves here, where the owner said it belongs ("dari menu
                hamburger").

                WHY IT SITS ABOVE THE AUTH BLOCK AND NOT INSIDE IT. Every other
                link in this drawer is behind a role check (`u.isLoggedIn &&`), so
                a logged-out visitor would have had no path to the vacancies at
                all — the page would look like it has no job list. This is the
                always-visible block, so it renders for everyone.

                `profile.nav_loker` is deliberately the SAME key the deleted bar
                used: it is the same link with the same word, and re-keying it
                would orphan the translations for no gain. It is now the key's
                only consumer, so it must NOT be cleaned up as a nav orphan. */}
            <a href="/loker" class="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded-xl font-bold text-sm transition flex items-center justify-center"><Icon name="briefcase" class="mr-2 text-sky-400" /> {t("profile.nav_loker")}</a>

            {/* ── DAFTAR ISI HALAMAN (2026-11-14) ─────────────────────────────
                Lihat catatan `SECTION_LINKS` di atas untuk alasannya. Hanya
                dirender di rute yang memasang hero (`/`): di /loker, /admin,
                /candidate, anchor ini tidak punya tujuan.

                `onClick={toggleMenu}` WAJIB. Drawer ini `position: fixed` dan
                menutupi 288 px kanan layar; tanpa menutupnya, tautan akan
                menggulir halaman DI BELAKANG drawer yang masih terbuka — dan
                pengunjung melihat drawer kosong yang tidak bergerak. */}
            {hero ? (
              <nav aria-label={t("profile.nav_sections")} class="pt-3 mt-3 border-t border-slate-700">
                <div class="text-[11px] uppercase tracking-widest text-slate-500 mb-2">
                  {t("profile.nav_sections")}
                </div>
                <ul class="space-y-0.5">
                  {SECTION_LINKS.map((s) => (
                    <li key={s.href}>
                      <a
                        href={s.href}
                        onClick={toggleMenu}
                        class="flex min-h-[44px] items-center justify-between px-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 text-sm transition"
                      >
                        <span>{t(s.key)}</span>
                        <Icon name="arrow-right" class="text-xs text-slate-600" />
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
            {/* Gradient CTA — `from-emerald-700 to-sky-700`, hover DARKENS
                (`hover:from-emerald-800 hover:to-sky-800`), NOT the old
                lightening step (measured 2026-09-27).
                White on this pair's stops, floor 4.5:1 at text-sm/700 (normal):
                  emerald-600 3.77  FAIL   emerald-500 2.54  FAIL (worse)
                  sky-600     4.10  FAIL   sky-500     2.77  FAIL
                  emerald-700 5.48  PASS   emerald-800 7.68  PASS
                  sky-700     5.93  PASS   sky-800     7.56  PASS
                The old `hover:from-emerald-500 hover:to-sky-500` was the WORST
                state on the page (2.54:1) — lightening a gradient always cuts
                white-text contrast, so the hover must darken instead. Measured
                on the built 404 page, which uses the same pair: 3.71:1 before. */}
            {!installed && (<button type="button" onClick={installApp} class="w-full py-3 bg-gradient-to-r from-emerald-700 to-sky-700 hover:from-emerald-800 hover:to-sky-800 text-white rounded-xl font-bold text-sm shadow-lg transition flex items-center justify-center"><Icon name="mobile-alt" class="mr-2" /> {t("ui.install_app")}</button>)}
            <button type="button" onClick={toggleLang} aria-label="Toggle language" class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2"><Icon name="language" /> {t("ui.language")} <span>{lang === "id" ? "ID" : "JP"}</span></button>
          </div>
          {hydrated && !u.isLoggedIn && (<div class="space-y-3">
            {/* ─── `data-nav-login` MOVED HERE FROM THE DELETED SECTION BAR ───
                The attribute is a TEST HOOK, not styling: `e2e/test-dialog.mjs`
                uses it to open the login modal twice and prove the modal keeps
                its `role`/`aria-modal`/focus on the SECOND open. It used to sit
                on `SiteNav.astro`'s login button; when the owner deleted the
                whole band below the hero (2026-09-25) that button went with it
                and the gate died on `waiting for locator('[data-nav-login]')`.
                The hook moves to the navigation's login affordance — which is
                this one now — rather than the gate being weakened, so the
                second-open contract keeps its proof.

                THE GATE MUST OPEN THE DRAWER FIRST: this button is inside
                `translate-x-full` until the hamburger is clicked, and Playwright
                refuses to click an element it cannot see. */}
            <button type="button" data-nav-login onClick={openLogin} class="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold text-sm shadow-lg transition">{t("header.login")}</button>
            <button type="button" onClick={openRegister} class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-sm transition">{t("header.register")}</button>
            <button type="button" onClick={openAdminLogin} class="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-sm shadow-lg transition"><Icon name="shield-alt" class="mr-2" /> {t("header.admin_login")}</button>
          </div>)}
          {u.isLoggedIn && u.role === "admin" && (<div class="space-y-3">
            <a href="/admin" class="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-sm shadow-lg transition flex items-center justify-center"><Icon name="cogs" class="mr-2" /> {t("header.admin")}</a>
            <button type="button" onClick={() => { setShowAiCopilot(true); setMenuOpen(false); }} class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-sm transition flex items-center justify-center"><Icon name="robot" class="mr-2" /> {t("ui.ai_copilot")}</button>
            <a href="/public" class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-sm transition flex items-center justify-center"><Icon name="globe" class="mr-2" /> {t("header.public")}</a>
            <button type="button" onClick={handleLogout} class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-sm transition flex items-center justify-center"><Icon name="sign-out-alt" class="mr-2" /> {t("header.logout")}</button>
          </div>)}
          {u.isLoggedIn && u.role === "kandidat" && (<div class="space-y-3">
            <a href="/candidate" class="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold text-sm shadow-lg transition flex items-center justify-center"><Icon name="id-card" class="mr-2" /> {t("header.dashboard")}</a>
            <a href="/public" class="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-sm transition flex items-center justify-center"><Icon name="globe" class="mr-2" /> {t("header.public")}</a>
            <button type="button" onClick={handleLogout} class="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-sm transition flex items-center justify-center"><Icon name="sign-out-alt" class="mr-2" /> {t("header.logout")}</button>
          </div>)}
        </div>
      </nav>

      {aiCopilotP.present && Copilot && <Copilot onClose={() => setShowAiCopilot(false)} closing={aiCopilotP.closing} />}
      {cekSiswaP.present && <CekSiswaModal onClose={() => setShowCekSiswa(false)} closing={cekSiswaP.closing} />}
      {hydrated && <LoginModal mode={modalMode} onClose={closeModal} onSwitchMode={setModalMode} />}
    </ErrorBoundary>
  );
}
