/**
 * useOverlayPresence.ts — keep an overlay MOUNTED for one exit transition
 *
 * WHY THIS EXISTS (added 2026-09-28, "Tingkat 2")
 * -----------------------------------------------
 * Every overlay in this repo is conditionally rendered:
 *
 *   {selectedJob && <LokerDetailModal … />}
 *
 * So the node is removed on the SAME frame the state flips. MEASURED on that
 * pattern: after `element.remove()` there is no frame left to animate — the
 * exit cannot be expressed in CSS at all, because there is no element. Entry
 * animation needs no help (motion.css §5b uses `@starting-style`, which fires
 * on first render); EXIT needs the node to survive for the duration of the
 * transition.
 *
 * This hook owns exactly that one fact and nothing else: given a value that
 * goes null, it keeps reporting the LAST value for `exitMs`, so the caller can
 * keep rendering the overlay while CSS animates it out.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * - It does not touch `useOverlay`. That hook is used by 28 files and its
 *   contract is asserted by `overlay-contract.test.tsx`; a presence concern
 *   bolted onto it would change all 28 at once. This is opt-in per call site.
 * - It does not decide the duration. `exitMs` is the caller's, and it must
 *   EXCEED the exit transition in `motion.css` §5b — see `OVERLAY_EXIT_MS`.
 * - It does not animate anything. It returns flags; the CSS does the rest.
 *
 * THE ONE TRAP: the retained value is not a nicety.
 * The naive version keeps a boolean and lets the caller read its own state:
 *
 *   {mounted && <Modal job={selectedJob} />}   // selectedJob is null by now
 *
 * `onClose` sets `selectedJob` to null, so during the exit window the modal
 * would re-render with `job === null` and throw on `job.status`. Retaining the
 * value is what makes the exit possible at all.
 */
import { useEffect, useState } from 'preact/hooks';

/**
 * Exit window for a modal overlay, in milliseconds.
 *
 * MUST EXCEED the exit transition declared in `motion.css` §5b
 * (`--dur-hover`, 180 ms). Cut this below the transition and the node is
 * removed mid-flight, which looks exactly like the exit animation being
 * broken. 60 ms of headroom absorbs a slow frame on a mid-range phone.
 */
export const OVERLAY_EXIT_MS = 240;

export interface OverlayPresence<T> {
  /** Render the overlay while true. */
  present: boolean;
  /** The last non-null value — pass THIS to the overlay, not your own state. */
  held: T | null;
  /** True during the exit window: the overlay should animate out. */
  closing: boolean;
}

/**
 * @param value   the state that opens the overlay; `null`/falsy starts the exit
 * @param exitMs  how long to keep it mounted after that; 0 unmounts immediately
 *                (the pre-existing behaviour, for call sites not yet migrated)
 */
export function useOverlayPresence<T>(
  value: T | null | undefined,
  exitMs: number = OVERLAY_EXIT_MS,
): OverlayPresence<T> {
  const [held, setHeld] = useState<T | null>(value ?? null);

  useEffect(() => {
    if (value) {
      // Opening (or re-opening during an exit): adopt it and cancel any timer.
      setHeld(value);
      return;
    }
    if (exitMs <= 0) {
      setHeld(null);
      return;
    }
    const timer = setTimeout(() => setHeld(null), exitMs);
    return () => clearTimeout(timer);
  }, [value, exitMs]);

  return {
    present: held !== null,
    held,
    // `held` non-null with no incoming value == we are in the exit window.
    closing: held !== null && !value,
  };
}
