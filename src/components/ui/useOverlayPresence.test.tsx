// ==========================================
// TESTS: useOverlayPresence — the exit-window contract (2026-09-28)
//
// WHY THIS EXISTS
//   The hook shipped in `dbc47f8` ("Tingkat 2") with exactly ONE call site
//   migrated: `LokerTable`, which passes an OBJECT (`selectedJob`). Rolling it
//   out to the other ~30 overlays means passing BOOLEANS — `showPasswordModal`,
//   `showESign`, `showPemberkasan`, … — and the hook as written cannot carry
//   them:
//
//     const [held, setHeld] = useState(value ?? null);
//     present: held !== null
//
//   `false ?? null` is `false`, NOT null, because `??` only falls through on
//   null/undefined. So `held` starts as `false` and `held !== null` is TRUE —
//   the hook reports "present" for an overlay that has never been opened.
//   `closing` is wrong the same way (`held !== null && !value` => `true`).
//
//   That failure is invisible in the one migrated call site (an object value
//   does become null) and would have been invisible in review too: every
//   boolean call site would simply render its modal permanently, and the
//   symptom would look like "the modal never closes", not like a hook bug.
//
// WHAT THIS LOCKS DOWN
//   `present` must mean "there is something to render", for BOTH value shapes,
//   and `closing` must be true ONLY during the exit window.
//
// HOW THIS COULD LIE
//   Asserting only the `true` direction passes on a hook that is permanently
//   present — which is the actual bug. So the FIRST case here is the closed
//   state, and it is asserted before anything is opened.
// ==========================================
import { cleanup, render } from '@testing-library/preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OVERLAY_EXIT_MS, useOverlayPresence } from './useOverlayPresence';

function Probe<T>({ value }: { value: T | null }) {
  const p = useOverlayPresence(value);
  return <span data-testid="probe">{`present=${p.present};closing=${p.closing}`}</span>;
}

function read(): string {
  const el = document.querySelector('[data-testid="probe"]');
  if (!el) throw new Error('probe did not render');
  return el.textContent ?? '';
}

const CLOSED = 'present=false;closing=false';

describe('useOverlayPresence', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // ── Boolean call sites: the shape this file was added for ──────────────
  it('a boolean that has NEVER been opened is not present', () => {
    render(<Probe value={false} />);
    expect(read()).toBe(CLOSED);
  });

  it('opening a boolean is present and not closing', () => {
    const { rerender } = render(<Probe value={false} />);
    rerender(<Probe value={true} />);
    expect(read()).toBe('present=true;closing=false');
  });

  it('closing a boolean stays present, marks closing, then unmounts', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Probe value={true} />);
    rerender(<Probe value={false} />);

    // The exit window: still rendered, and flagged so CSS can animate it out.
    expect(read()).toBe('present=true;closing=true');

    act(() => {
      vi.advanceTimersByTime(OVERLAY_EXIT_MS + 1);
    });
    expect(read()).toBe(CLOSED);
  });

  it('re-opening during the exit window cancels the unmount', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Probe value={true} />);
    rerender(<Probe value={false} />);
    expect(read()).toBe('present=true;closing=true');

    rerender(<Probe value={true} />);
    expect(read()).toBe('present=true;closing=false');

    // The timer from the aborted exit must not fire later.
    act(() => {
      vi.advanceTimersByTime(OVERLAY_EXIT_MS + 1);
    });
    expect(read()).toBe('present=true;closing=false');
  });

  // ── Object call sites: the shape LokerTable already uses ───────────────
  it('a null object is not present, and a set object is', () => {
    const { rerender } = render(<Probe value={null as { id: string } | null} />);
    expect(read()).toBe(CLOSED);

    rerender(<Probe value={{ id: 'a' }} />);
    expect(read()).toBe('present=true;closing=false');

    rerender(<Probe value={null} />);
    expect(read()).toBe('present=true;closing=true');
  });

  it('exitMs of 0 unmounts immediately (the pre-migration behaviour)', () => {
    function Zero() {
      const p = useOverlayPresence(true, 0);
      return <span data-testid="probe">{`present=${p.present};closing=${p.closing}`}</span>;
    }
    render(<Zero />);
    expect(read()).toBe('present=true;closing=false');
  });
});
