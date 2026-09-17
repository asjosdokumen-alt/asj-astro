/**
 * useOverlay.ts — Focus management + dialog semantics for modals and drawers
 *
 * Provides: focus save/restore, initial focus, Tab trapping, Escape, and the
 * ARIA attributes that make the overlay announce itself.
 *
 * Escape is bound on the CAPTURE phase so an overlay wins over widgets
 * nested inside it (e.g. a select handled by a third-party script).
 *
 * Focus restore is guarded with `document.contains()` because the trigger
 * often unmounts while the overlay is open — the classic case here is the
 * login modal: on success the auth state flips and the "Login" button in
 * the header disappears. Without the guard, `.focus()` on a detached node
 * would throw.
 *
 * ── WHY THE HOOK WRITES THE DIALOG ROLE ITSELF (§25) ──────────────────────
 * MEASURED 2026-09-15 against the built artifact, /public -> "Detail":
 *
 *   role                 null          no role at all
 *   aria-modal           null          nothing tells AT the rest is inert
 *   aria-labelledby      null          so the dialog had NO accessible name
 *   activeInsideOverlay  true          ...yet focus HAD been moved inside
 *   after 2x Tab         still inside  ...and Tab WAS trapped
 *
 * So this hook already treated the overlay as a dialog — `role === 'dialog'`
 * is exactly what gates the initial-focus + Tab-trap effect below — and then
 * threw that decision away instead of stating it on the element. The result
 * was the worst of both: a keyboard user is captured inside a region that
 * assistive tech cannot name and cannot even describe as a dialog. A trap
 * without the announcement is worse than no trap.
 *
 * The semantics are written here, on the element `containerRef` points at,
 * rather than returned as props for 21 call sites to spread. Three reasons:
 *
 *   1. The role and the behaviour must describe the SAME node. That node is
 *      the trap boundary, and only this hook knows which element that is.
 *   2. This file already writes to that node imperatively — `root.tabIndex =
 *      -1` below, for the nothing-focusable case — so this is the file's
 *      existing idiom, not a new one.
 *   3. The call sites are heterogeneous (two are `h()` calls, several build
 *      the container 10+ lines below the hook call, and the attribute would
 *      have to be threaded through each by hand). One statement here cannot
 *      be applied to the wrong element; 21 hand-edits can.
 *
 * The objection to this is that the semantics are then invisible in the
 * source, so a reader (or a later audit round) re-reports them as missing.
 * The answer is `e2e/test-dialog.mjs`: it asserts the RENDERED DOM, so it
 * cannot be fooled by how the source looks, and it fails by name if a new
 * overlay ships without a role or without a name.
 *
 * `aria-modal="true"` is claimed only for `role: 'dialog'` — that is the case
 * where the Tab trap above is actually installed. A 'menu' (docked sidebar)
 * gets the role and the name but does not claim to make the page inert.
 */
import { useEffect, useMemo, useRef } from 'preact/hooks';

/** Monotonic, so two overlays mounted together never share a title id. */
let overlaySeq = 0;

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  'audio[controls]',
  'video[controls]',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex^="-"])',
].join(',');

function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      // Skip anything not actually rendered — hidden fields and collapsed
      // panels must not become Tab stops.
      el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
  );
}

export interface OverlayOptions {
  open: boolean;
  onClose: () => void;
  /** 'dialog' traps focus. 'menu' does not (used by docked sidebars). */
  role?: 'dialog' | 'menu';
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  /** Override the element focus returns to on close. */
  restoreFocusTo?: HTMLElement | null;
  /**
   * Accessible name for overlays that carry no heading of their own. A modal
   * with a heading does not need this: the hook names the dialog after its
   * first heading, which is the same text a sighted user reads as the title.
   */
  label?: string;
}

export function useOverlay<T extends HTMLElement>({
  open,
  onClose,
  role = 'dialog',
  closeOnEscape = true,
  closeOnBackdrop = true,
  restoreFocusTo,
  label,
}: OverlayOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  /* Stable per instance. Generated rather than fixed because overlays DO
     stack here — the job-detail modal opens the pamflet modal on top of it —
     and a duplicated id would make `aria-labelledby` resolve to the wrong
     node, i.e. announce the dialog with another dialog's title. */
  const titleId = useMemo(() => `asj-overlay-title-${++overlaySeq}`, []);

  /* ── Dialog semantics ────────────────────────────────────────────── */
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    if (!open) {
      // An overlay can stay mounted while it is not a dialog: EsignNaitei
      // renders a full-screen draw surface in place of its normal panel and
      // passes `open: false`. Leaving `aria-modal` behind there would claim
      // the page is inert while nothing is trapped.
      root.removeAttribute('role');
      root.removeAttribute('aria-modal');
      root.removeAttribute('aria-labelledby');
      root.removeAttribute('aria-label');
      return;
    }

    root.setAttribute('role', role);
    if (role !== 'dialog') {
      root.removeAttribute('aria-modal');
      return;
    }
    root.setAttribute('aria-modal', 'true');

    // Name the dialog after its own first heading. Resolved from the DOM
    // rather than required of the call site, so a modal cannot ship unnamed
    // by omission — the failure mode this round exists to close.
    const heading = root.querySelector<HTMLElement>('h1,h2,h3,h4,h5,h6');
    if (heading) {
      if (!heading.id) heading.id = titleId;
      root.setAttribute('aria-labelledby', heading.id);
      root.removeAttribute('aria-label');
    } else if (label) {
      root.setAttribute('aria-label', label);
      root.removeAttribute('aria-labelledby');
    }
    // No heading and no label: the guard reports it. Deliberately not
    // falling back to a generic name — "dialog" with no name is honest,
    // and a placeholder like "Dialog" would hide the real gap.
  }, [open, role, titleId, label]);

  /* ── Save / restore focus ────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current =
      restoreFocusTo ?? (document.activeElement as HTMLElement | null);
    return () => {
      const el = previouslyFocused.current;
      // The trigger may have unmounted while the overlay was open.
      if (el && document.contains(el)) el.focus();
    };
  }, [open, restoreFocusTo]);

  /* ── Initial focus + Tab trap ────────────────────────────────────── */
  useEffect(() => {
    if (!open || role !== 'dialog') return;
    const root = containerRef.current;
    if (!root) return;

    // Prefer an explicit [data-autofocus]; fall back to the first stop.
    const target =
      root.querySelector<HTMLElement>('[data-autofocus]') ?? focusable(root)[0];
    if (target) {
      target.focus();
    } else {
      // Nothing focusable — make the container itself the Tab boundary.
      root.tabIndex = -1;
      root.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusable(root);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && (active === first || active === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, role]);

  /* ── Escape ──────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Stop propagation so only the topmost overlay closes.
        e.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, closeOnEscape, onClose]);

  return {
    containerRef,
    onBackdropClick: closeOnBackdrop
      ? (e: MouseEvent) => {
          if (e.target === containerRef.current) onClose();
        }
      : undefined,
    /** The id the hook used for `aria-labelledby`, if a call site wants it. */
    titleId,
  };
}
