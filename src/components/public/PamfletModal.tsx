/**
 * PamfletModal.tsx — Full-size pamflet/job-poster zoom overlay.
 * Migrated from legacy js/08_wa_pintar.ts bukaPamflet/tutupPamflet +
 * the #pamfletModal shell (index.html, shared CSS `.modal-content-pamflet`).
 *
 * B05 parity (2026-09-05) root fix: the close button's aria-label was
 * hard-coded English "Close"; legacy localizes it via `data-lang-aria`
 * `public.close` ("Tutup"/"閉じる-family). Now keyed through t().
 *
 * Geometry parity with legacy CSS `.modal-content-pamflet`: overlay
 * `bg-black/90 blur z-9999`, image object-fit contain, width 100%,
 * max-width 700px, max-height 90vh, radius 16px, shadow 0 0 40px black.
 * Legacy closes only via the × button; this port additionally closes on
 * backdrop/Escape (useOverlay) — an accessibility upgrade. The inner
 * container stops propagation so ONLY a true backdrop click closes and
 * the × button fires onClose exactly once (previously any click inside
 * the overlay — image included — closed it, and the × double-fired).
 */
import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { useOverlay } from '../ui/useOverlay';
import { t } from '../../store/i18n';

interface Props { isOpen: boolean; url: string; onClose: () => void; }

export default function PamfletModal({ isOpen, url, onClose }: Props) {
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    setLoaded(false);
    // A cached image can finish loading before Preact attaches onLoad — if it
    // is already complete by the time this effect runs, never spin forever.
    const el = imgRef.current;
    if (el && el.complete) setLoaded(true);
  }, [isOpen, url]);
const { containerRef, onBackdropClick } = useOverlay({ open: isOpen, onClose });

  if (!isOpen || !url || url === "-") return null;

  return h("div", {
    class: "fixed inset-0 u-modal-shell bg-black/90 z-[9999] flex items-center justify-center p-4",
    style: "backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);",
    ref: containerRef, onClick: onBackdropClick,
  },
    h("div", {
      class: "relative w-full max-w-3xl mx-auto flex flex-col items-center",
      onClick: (e: MouseEvent) => e.stopPropagation(),
    },
      h("button", {
        onClick: onClose,
        "aria-label": t("public.close"),
        class: "absolute -top-12 right-0 text-slate-300 hover:text-red-500 text-4xl font-black drop-shadow-md transition transform hover:scale-110 z-10",
      }, "\u00d7"),
      h("img", {
        src: url,
        ref: imgRef,
        alt: "Pamflet",
        onLoad: () => setLoaded(true),
        onError: () => setLoaded(true),
        class: "bg-slate-900 border border-slate-700 rounded-2xl",
        style: `object-fit: contain; width: 100%; max-width: 700px; max-height: 90vh; box-shadow: 0 0 40px rgba(0,0,0,0.9); opacity: ${loaded ? 1 : 0}; transition: opacity 0.3s;`,
      }),
      !loaded ? h("div", { class: "absolute inset-0 flex items-center justify-center" },
        h("div", { class: "w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" })) : null));
}
