/**
 * useOverlay.ts — Focus management for modals and drawers
 *
 * Provides: focus save/restore, initial focus, Tab trapping, Escape.
 *
 * Escape is bound on the CAPTURE phase so an overlay wins over widgets
 * nested inside it (e.g. a select handled by a third-party script).
 *
 * Focus restore is guarded with `document.contains()` because the trigger
 * often unmounts while the overlay is open — the classic case here is the
 * login modal: on success the auth state flips and the "Login" button in
 * the header disappears. Without the guard, `.focus()` on a detached node
 * would throw.
 */
import { useEffect, useRef } from 'preact/hooks';

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
}

export function useOverlay<T extends HTMLElement>({
  open,
  onClose,
  role = 'dialog',
  closeOnEscape = true,
  closeOnBackdrop = true,
  restoreFocusTo,
}: OverlayOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

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
  };
}
