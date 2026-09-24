/**
 * Toast.tsx — Notification system (Preact)
 *
 * Accessibility
 * -------------
 * This is the app's ONLY user-feedback mechanism (`showToast()` is called
 * from ~40 places), and it used to be a bare <div> with no live region —
 * so "Login gagal" and friends were never announced to screen readers.
 *
 * Two live regions, because politeness matters:
 *   - polite   : success / info / warning
 *   - assertive: errors (role="alert") — these interrupt, which is correct
 *                for a failed action the user is waiting on.
 *
 * Toasts pause their dismiss timer on hover or keyboard focus so nobody has
 * a message vanish while reading it (WCAG 2.2.1 Timing Adjustable).
 *
 * Mounted once in BaseLayout.astro — it used to be duplicated onto 6 of the
 * 9 pages, which made showToast() a silent no-op on ai-cv, master, share.
 */
import { useStore } from '@nanostores/preact';
import { atom } from 'nanostores';
import { useEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import Icon from './ui/Icon';
import { getOverlayRoot } from './ui/overlay-root';
import { langStore, t } from '../store/i18n';

export interface ToastMessage {
  id: number;
  text: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

/** Toast state atom */
export const toasts = atom<ToastMessage[]>([]);
let toastId = 0;

const AUTO_DISMISS_MS = 4000;
const MAX_VISIBLE = 4;

/** Show a toast notification. Signature unchanged — ~40 call sites. */
export function showToast(text: string, type: ToastMessage['type'] = 'info') {
  const id = ++toastId;
  toasts.set([...toasts.get(), { id, text, type }].slice(-MAX_VISIBLE));
  setTimeout(() => {
    toasts.set(toasts.get().filter((t) => t.id !== id));
  }, AUTO_DISMISS_MS);
}

/** Remove a toast immediately (dismiss button). */
export function dismissToast(id: number) {
  toasts.set(toasts.get().filter((t) => t.id !== id));
}

const TONES = {
  success: { box: 'bg-emerald-600 border-emerald-400', icon: 'check-circle' },
  error:   { box: 'bg-red-600 border-red-400',         icon: 'exclamation-circle' },
  info:    { box: 'bg-sky-600 border-sky-400',         icon: 'info-circle' },
  warning: { box: 'bg-amber-600 border-amber-400',     icon: 'exclamation-triangle' },
} as const;

function ToastItem({ toast, paused }: { toast: ToastMessage; paused: boolean }) {
  const _lang = useStore(langStore);
  const tone = TONES[toast.type];
  const [remaining, setRemaining] = useState(AUTO_DISMISS_MS);
  const lastTick = useRef(Date.now());

  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      const left = remaining - (Date.now() - startedAt);
      if (left <= 0) dismissToast(toast.id);
      else setRemaining(left);
    }, Math.min(remaining, 200));
    return () => clearTimeout(timer);
  }, [paused, remaining, toast.id]);

  return (
    <div
      class={`${tone.box} border-l-4 px-4 py-3 rounded-lg shadow-lg animate-slide-in flex items-center gap-3 text-white text-sm font-bold`}
    >
      <Icon name={tone.icon} />
      <span class="flex-1">{t(toast.text)}</span>
      {/* MEASURED (2026-09-25, /admin + /ai-cv at all three widths): this close
          button was 22x28 — `p-1` around a 14px glyph — so the only way to
          dismiss a toast failed WCAG 2.5.8 AA (24x24). min-w/min-h rather than
          padding, so the x stays visually the same size while the target
          becomes 44x44. */}
      <button
        type="button"
        onClick={() => dismissToast(toast.id)}
        class="-mr-1 p-1 min-w-11 min-h-11 inline-flex items-center justify-center rounded hover:bg-white/20 transition"
        aria-label={t("ui.close")}
      >
        <Icon name="times" />
      </button>
    </div>
  );
}

export default function Toast() {
  const $toasts = useStore(toasts);
  const [paused, setPaused] = useState(false);

  if ($toasts.length === 0) return null;

  const errors = $toasts.filter((t) => t.type === 'error');
  const others = $toasts.filter((t) => t.type !== 'error');

  const render = (list: ToastMessage[]) =>
    list.map((t) => <ToastItem key={t.id} toast={t} paused={paused} />);

  return createPortal(
    <div
      class="fixed top-4 right-4 flex flex-col gap-2 w-[min(24rem,calc(100vw-2rem))] pointer-events-none"
      // Above modals: error feedback must stay visible while a dialog
      // (e.g. the login form) is open. See ui/overlay-root.ts.
      style={{ zIndex: 'var(--z-index-toast)' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusIn={() => setPaused(true)}
      onFocusOut={() => setPaused(false)}
    >
      <div class="pointer-events-auto flex flex-col gap-2" role="status" aria-live="polite">
        {render(others)}
      </div>
      <div class="pointer-events-auto flex flex-col gap-2" role="alert" aria-live="assertive">
        {render(errors)}
      </div>
    </div>,
    getOverlayRoot()
  );
}
