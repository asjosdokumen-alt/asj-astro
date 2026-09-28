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
  /* ── `active`, not `value !== null` ────────────────────────────────────
     The first version of this hook was written against ONE call site —
     `LokerTable`, which passes an object that becomes `null` when closed — and
     it seeded state with `useState(value ?? null)` and tested `held !== null`.
     For a BOOLEAN call site that is wrong in a way nothing visible reports:
     `??` falls through only on null/undefined, so `false ?? null` is `false`,
     and `held !== null` is then TRUE. Every boolean overlay would report
     `present` while closed, i.e. render permanently.

     `useOverlayPresence.test.tsx` pins this: the closed-boolean case is the
     FIRST assertion, and it failed on the original implementation with
     `expected 'present=true;closing=true' to be 'present=false;closing=false'`.

     So presence is decided by TRUTHINESS, which is the only reading that is
     correct for both shapes (`false` and `null` are both "closed", and any
     object is "open"). The retained value stays typed `T`, because a boolean
     call site still needs nothing but the flags while an object call site
     needs the object back. */
  const active = Boolean(value);
  const [retained, setRetained] = useState<T | null>(null);

  useEffect(() => {
    if (active) {
      setRetained(value as T);
      return;
    }
    if (exitMs <= 0) {
      setRetained(null);
      return;
    }
    const timer = setTimeout(() => setRetained(null), exitMs);
    return () => clearTimeout(timer);
  }, [active, value, exitMs]);

  /* `held` IS DERIVED, NOT READ STRAIGHT FROM STATE — and that is load-bearing,
     not a shortcut. Reading only the retained state makes the hook lag ONE
     render behind the value it is opening on: `present` is still false on the
     render where the caller's boolean flips true. For a self-gating modal
     (`LoginModal`, `InputManualModal`, `PamfletModal` — mounted unconditionally,
     `if (!present) return null`) that render returns null, so `containerRef`
     is null — and `useOverlay`'s role effect, which fires on the `open`
     TRANSITION, therefore runs with no node, writes nothing, and never fires
     again because `open` is already true.

     MEASURED, and it is why this is derived: with the state-reading version,
     `LoginModal.test.tsx > keeps role="dialog" and aria-modal on a SECOND open`
     failed with `expected null to be 'dialog'` — the dialog lost its role on
     reopen, which is the exact defect that file was written to prevent. */
  const held = active ? (value as T) : retained;

  return {
    present: held !== null,
    held,
    // A held value with nothing incoming == we are in the exit window.
    closing: held !== null && !active,
  };
}
