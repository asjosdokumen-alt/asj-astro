/**
 * overlay-root.ts — Single portal container for modals, drawers and toasts.
 *
 * WHY A SHARED ROOT
 * -----------------
 * Overlays used to be rendered in-place with ad-hoc `z-[200]` / `z-[90]`
 * values, so stacking depended on where each component happened to sit in
 * the DOM. Everything now mounts into one container whose z-index is
 * controlled in a single place, and stacking inside it follows DOM order.
 *
 * ⚠ ASTRO ISLAND CAVEAT
 * ---------------------
 * Every island in this app is mounted with `client:only="preact"`, so there
 * is no server-rendered HTML to reconcile and portals are safe. If any
 * island is ever switched to `client:load` / `client:idle` / `client:visible`,
 * this must be SSR-guarded (the document does not exist during SSR).
 */

const ROOT_ID = 'asj-overlay-root';

/**
 * Sits above BottomNav (z-90) and all page content, but below the print
 * overlay and any modal that must cover everything.
 *
 * `#global-loader` (z-9999) used to be named here. It was removed on
 * 2026-11-09: it was `display:none !important` with nothing that ever showed
 * it, so it never actually covered anything — see the note in BaseLayout.astro.
 */
const ROOT_Z_INDEX = 1000;

export function getOverlayRoot(): HTMLElement {
  if (typeof document === 'undefined') {
    throw new Error(
      '[overlay-root] getOverlayRoot() is client-only. If you are seeing ' +
        'this during SSR, an island was switched to a server-rendered ' +
        'client: directive — see the caveat in overlay-root.ts.'
    );
  }

  let el = document.getElementById(ROOT_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = ROOT_ID;
    // `position: relative` + z-index creates the stacking context so
    // children stack by DOM order instead of leaking into page z-indexes.
    el.style.position = 'relative';
    el.style.zIndex = String(ROOT_Z_INDEX);
    document.body.appendChild(el);
  }
  return el;
}
