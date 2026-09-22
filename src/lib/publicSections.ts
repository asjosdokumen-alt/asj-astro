/**
 * publicSections.ts — the public page's section switcher, expressed as STATE.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The same tab machinery was written twice, in `src/pages/index.astro` and
 * `src/pages/public.astro`, and the two copies had already DRIFTED. Measured
 * before this file existed:
 *
 *   index.astro    panels  public-loker-section / public-layanan-section
 *                  active  bg-sky-600 text-white shadow-md
 *                  idle    bg-transparent text-slate-400
 *   public.astro   panels  section-loker / section-layanan
 *                  active  bg-sky-600 text-white shadow-md
 *                  idle    text-slate-400            <- no bg-transparent
 *
 * Two files, two panel-id schemes, two class lists. Adding a third tab meant
 * editing six `classList` calls in each file, and NOTHING guarded those lists:
 * a typo in a class name leaves the tab "working" (the panel still swaps) while
 * the colour silently stops changing, and `verify-classes` cannot see it because
 * a misspelled utility that still looks like a utility is still a candidate.
 *
 * WHAT THIS MODULE IS
 * -------------------
 * A pure state resolver plus ONE DOM applier. It returns state, never classes:
 * there is no Tailwind class name anywhere in this file, by design — that is the
 * property that makes it testable without a browser.
 *
 * The markup carries `data-public-tab` / `data-public-panel`, and the applier
 * writes exactly two things: the `hidden` ATTRIBUTE on panels, and `aria-pressed`
 * on tabs. The active styling is then a stock Tailwind variant in the markup
 * (`aria-pressed:bg-sky-700`), so there is no class list to drift.
 *
 * WHY `hidden` AND NOT THE `hidden` UTILITY CLASS
 * -----------------------------------------------
 * The old code swapped `hidden`/`block` utilities. A class swap cannot be
 * asserted as a state, and the two mechanisms are NOT interchangeable. Measured
 * in `node_modules/tailwindcss/preflight.css:396` (tailwindcss 4.3.3):
 *
 *   [hidden]:where(:not([hidden='until-found'])) { display: none !important }
 *
 * The ATTRIBUTE is therefore strictly stronger than any display utility — a
 * stray `block` cannot un-hide a hidden panel. That is the property worth
 * having, so panels carry no display class and the attribute is the only lever.
 *
 * ⚠ ACTIVE-STATE CONTRAST — read before changing the variant
 * ----------------------------------------------------------
 * Use `aria-pressed:bg-sky-700`, NOT the -600 tier. The codebase darkens a
 * sky-600 background for white text through a `:where(html)` rule in global.css.
 * Any `aria-pressed:` variant resolves to a class PLUS an attribute selector
 * (specificity 0,2,0), which outranks that correction — so a -600 variant would
 * render raw Tailwind sky-600 (`#0284c7`, white on it measured 4.02:1) and fail
 * WCAG AA for normal text. The -700 tier is the value the correction already
 * maps to (`#0369a1`, 5.93:1), so variant and correction agree instead of
 * fighting.
 *
 * KNOWN TRADE-OFF (accepted, temporary)
 * -------------------------------------
 * This is a bundled `<script>`, so it is deferred, where the old `is:inline`
 * block ran at parse position. On a `#layanan` deep link the loker panel can
 * therefore paint for one frame before the swap. `docs/LANDING_PAGE_SPEC.md` L2
 * replaces this whole mechanism with real anchors, which are server-renderable
 * and remove the trade-off entirely; re-solving it here would be work thrown
 * away in the next phase.
 */

/** The public page's sections, in tab order. */
export const PUBLIC_SECTION_IDS = ['loker', 'layanan'] as const;

export type PublicSectionId = (typeof PUBLIC_SECTION_IDS)[number];

/** Which section a visitor with no hash lands on. */
export const DEFAULT_PUBLIC_SECTION: PublicSectionId = 'loker';

/** Visibility of every panel for one active section. Exactly one is `true`. */
export interface PublicSectionState {
  active: PublicSectionId;
  panels: Record<PublicSectionId, boolean>;
}

const TAB_ATTR = 'data-public-tab';
const PANEL_ATTR = 'data-public-panel';

/**
 * What can be bound. `ParentNode` is NOT enough: it declares `querySelectorAll`
 * but not `addEventListener` (that comes from `EventTarget`), so typing the
 * parameter as `ParentNode` compiles in the reader's head and fails `tsc`.
 * `Document` and `Element` are both, which is exactly what is needed.
 */
export type PublicSectionRoot = Document | Element;

/**
 * One live binder per root. Astro can re-run a page script (client-side
 * navigation, an island remount), and a second binder would double every
 * listener — two `replaceState` writes per click and a state that flickers.
 * A later `bind` on the same root replaces the earlier one.
 */
const binders = new WeakMap<PublicSectionRoot, () => void>();

export function isPublicSectionId(value: string): value is PublicSectionId {
  return (PUBLIC_SECTION_IDS as readonly string[]).includes(value);
}

/**
 * Map a location hash onto a section. Anything unrecognised — including a hash
 * for a section that does not exist yet, e.g. `#tentang` — resolves to the
 * default rather than to "nothing", so the page always shows something.
 */
export function resolvePublicSection(hash: string): PublicSectionId {
  const bare = String(hash ?? '')
    .replace(/^#/, '')
    .trim()
    .toLowerCase();
  return isPublicSectionId(bare) ? bare : DEFAULT_PUBLIC_SECTION;
}

/** The complete visibility state for one active section. */
export function publicSectionState(active: PublicSectionId): PublicSectionState {
  const panels = {} as Record<PublicSectionId, boolean>;
  for (const id of PUBLIC_SECTION_IDS) panels[id] = id === active;
  return { active, panels };
}

/**
 * Write a state onto the DOM. Two attributes, nothing else — no class names, so
 * the styling stays in the markup where Tailwind can see it.
 *
 * DELIBERATELY NOT `tabindex="-1"` ON THE INACTIVE TAB. That is the reflex for a
 * tab list, but it is only correct together with `role="tab"` AND arrow-key
 * navigation. Writing the roving tabindex without the keyboard contract takes
 * the inactive tab out of the tab order with no way back — WCAG 2.1.1, Keyboard.
 * These stay ordinary toggle buttons in the tab order.
 */
export function applyPublicSection(state: PublicSectionState, root: PublicSectionRoot): void {
  for (const el of root.querySelectorAll<HTMLElement>(`[${PANEL_ATTR}]`)) {
    const id = el.getAttribute(PANEL_ATTR) ?? '';
    // A panel whose id is not a known section is left visible: hiding it would
    // make content disappear with no way for the visitor to reach it.
    if (!isPublicSectionId(id)) continue;
    el.hidden = !state.panels[id];
  }

  for (const el of root.querySelectorAll<HTMLElement>(`[${TAB_ATTR}]`)) {
    const id = el.getAttribute(TAB_ATTR) ?? '';
    if (!isPublicSectionId(id)) continue;
    el.setAttribute('aria-pressed', String(id === state.active));
  }
}

/**
 * Wire the tabs to clicks, the hash, and `hashchange`. Returns a teardown
 * function so a test (or an island remount) can unbind without leaking
 * listeners. Calling it twice on the same root replaces the earlier binder
 * rather than stacking a second set of listeners.
 */
export function bindPublicSections(root?: PublicSectionRoot): () => void {
  const scope: PublicSectionRoot | null =
    root ?? (typeof document === 'undefined' ? null : document);
  if (!scope) return () => {};

  // Exactly one live binder per root — see the `binders` note above.
  binders.get(scope)?.();

  const win: Window | null = typeof window === 'undefined' ? null : window;

  const show = (hash: string, syncUrl: boolean) => {
    const active = resolvePublicSection(hash);
    applyPublicSection(publicSectionState(active), scope);
    // `replaceState`, not `location.hash =`: assigning the hash would push a
    // history entry per tab click and make the Back button walk through tabs.
    if (syncUrl && win) win.history.replaceState(null, '', `#${active}`);
  };

  const onClick = (event: Event) => {
    const target = event.target as Element | null;
    const tab = target?.closest(`[${TAB_ATTR}]`) ?? null;
    if (!tab) return;
    event.preventDefault();
    show(tab.getAttribute(TAB_ATTR) ?? '', true);
  };

  const onHashChange = () => show(win?.location.hash ?? '', false);

  scope.addEventListener('click', onClick);
  win?.addEventListener('hashchange', onHashChange);

  // Initial paint state: the markup already renders the default, so this only
  // matters for a deep link.
  show(win?.location.hash ?? '', false);

  const off = () => {
    scope.removeEventListener('click', onClick);
    win?.removeEventListener('hashchange', onHashChange);
    // Only the CURRENT binder clears the registry; a stale teardown must not
    // evict the binder that replaced it.
    if (binders.get(scope) === off) binders.delete(scope);
  };
  binders.set(scope, off);
  return off;
}
