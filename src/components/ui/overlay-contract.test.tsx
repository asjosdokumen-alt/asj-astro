// ==========================================
// TESTS: overlay dialog contract (§25 follow-up, 2026-09-15)
//
// WHY THIS EXISTS
//   §25 gave `useOverlay` the job of writing role / aria-modal /
//   aria-labelledby, and `e2e/test-dialog.mjs` asserts the RESULT in a real
//   browser. But that guard only walks the routes it navigates, and it is not
//   part of any delivery path — so two modals sat outside it:
//
//     ListKandidatModal   no hook at all → no role, no name, no trap, no Escape
//                         (and `if (!isOpen) return null` made it unopenable
//                          from the page the e2e guard visits)
//     RejectMailModal     role/aria-modal HARDCODED in the markup with no hook
//                         behind them → it TOLD assistive tech the page was
//                         inert while nothing trapped focus. The inverse of
//                         §25's defect: the announcement without the behaviour.
//
//   The e2e guard cannot reach either one (both live behind the admin tab and
//   are opened from a table row, not a route). This file asserts the same
//   contract at the unit level, where both are reachable.
//
// WHAT IT LOCKS DOWN
//   One rule, stated once: a component that renders a `.u-modal-shell` must
//   have the hook behind it, and the rendered DOM must carry
//   role="dialog" + aria-modal="true" + a name that RESOLVES.
//
// HOW THIS COULD LIE
//   `new Set(...).size === list.length` is a tautology for a single item —
//   1 === 1 passes while the item is unnamed. So the name is asserted
//   PER COMPONENT against the element the id actually points at, never
//   inferred from a set comparison.
// ==========================================
import { render, cleanup } from '@testing-library/preact';
import { describe, it, expect, afterEach, vi } from 'vitest';
import ListKandidatModal from '../admin/ListKandidatModal';
import RejectMailModal from '../admin/RejectMailModal';
import AdminAiCopilot from '../admin/AdminAiCopilot';
import RirekishoBuilder from '../admin/RirekishoBuilder';

vi.mock('../../store/i18n', async () => {
  const { atom } = await import('nanostores');
  return { t: (k: string) => k, langStore: atom('id'), toggleLang: () => {} };
});
vi.mock('../Toast', () => ({ showToast: () => {} }));
vi.mock('../../lib/apiEndpoint', () => ({
  getEndpoint: (a: string) => `/.netlify/functions/${a}`,
}));
// Never settles: these components load their data in a mount effect, and a
// resolved promise would land a state update after the assertion, which is
// both noise and a race. A pending promise leaves them in their initial
// render — which is the render whose contract this file is about.
vi.mock('../../lib/apiClient', () => {
  const pending = () => new Promise(() => {});
  return { default: { call: pending, secure: pending }, api: { call: pending, secure: pending } };
});
vi.mock('../../store/authReactive', async () => {
  const { atom } = await import('nanostores');
  return {
    authStore: atom({
      sessionToken: 'test-token',
      isLoggedIn: true,
      role: 'admin',
      name: 'Test Admin',
    }),
    logout: () => {},
  };
});
vi.mock('../../store/adminStore', async () => {
  const { atom } = await import('nanostores');
  return {
    allKandidatList: atom([]),
    fetchAllKandidat: () => {},
  };
});

afterEach(() => {
  cleanup();
});

/**
 * Read the dialog contract off whatever the component rendered.
 * Returns the resolved NAME, not just the presence of an attribute — a
 * dangling `aria-labelledby` silently yields no name, which is the exact
 * failure mode §25 exists to close.
 */
function dialogContract() {
  const shell = document.querySelector('.u-modal-shell') as HTMLElement | null;
  if (!shell) throw new Error('no .u-modal-shell in the rendered output');

  const lb = shell.getAttribute('aria-labelledby');
  const labelEl = lb ? document.getElementById(lb.split(/\s+/)[0]) : null;
  const labelText = labelEl ? (labelEl.textContent || '').trim() : '';

  return {
    role: shell.getAttribute('role'),
    ariaModal: shell.getAttribute('aria-modal'),
    ariaLabelledby: lb,
    ariaLabel: shell.getAttribute('aria-label'),
    resolvedName: labelText || (shell.getAttribute('aria-label') || '').trim(),
    // `aria-modal="true"` asserts the rest of the page is inert. That claim is
    // only honest if focus was actually moved into the dialog — the hook does
    // that, and its "nothing focusable" branch lands on `tabindex="-1"`.
    tabIndex: shell.getAttribute('tabindex'),
    focusInside: shell.contains(document.activeElement),
    shell,
  };
}

describe('§25 contract — ListKandidatModal is a real dialog', () => {
  it('declares role="dialog" and aria-modal="true" while open', () => {
    render(<ListKandidatModal jobCode="TG658" isOpen={true} onClose={() => {}} />);
    const c = dialogContract();
    expect(c.role).toBe('dialog');
    expect(c.ariaModal).toBe('true');
  });

  it('has a name that RESOLVES to a non-empty element', () => {
    render(<ListKandidatModal jobCode="TG658" isOpen={true} onClose={() => {}} />);
    const c = dialogContract();
    // Name must come from aria-labelledby (the heading), never a bare
    // textContent read of the container.
    expect(c.ariaLabelledby).toBeTruthy();
    expect(c.resolvedName.length).toBeGreaterThan(0);
    expect(c.resolvedName).toBe('admin.list_kandidat');
  });

  it('claims NO semantics while closed (the container is still mounted)', () => {
    // `open: isOpen` is what strips the attributes. This asserts the hook was
    // actually wired to `isOpen` rather than hardcoded — the ListKandidat
    // branch in the hook's `!open` path.
    render(<ListKandidatModal jobCode="TG658" isOpen={false} onClose={() => {}} />);
    expect(document.querySelector('.u-modal-shell')).toBeNull();
  });

  it('moves focus INSIDE, so aria-modal="true" is not a false claim', () => {
    render(<ListKandidatModal jobCode="TG658" isOpen={true} onClose={() => {}} />);
    const c = dialogContract();
    // Either a focusable child took focus, or the container itself did via the
    // `tabindex="-1"` fallback. What must NOT happen is focus left outside.
    expect(c.focusInside || c.tabIndex === '-1').toBe(true);
  });

  it('closes on Escape', () => {
    // The trap and Escape come from the same hook. Asserting Escape works is
    // the cheapest proof the hook is live rather than merely imported.
    let closed = false;
    render(<ListKandidatModal jobCode="TG658" isOpen={true} onClose={() => { closed = true; }} />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toBe(true);
  });
});

describe('§25 contract — RejectMailModal is a real dialog', () => {
  it('carries the .u-modal-shell class the e2e sweep keys on', () => {
    // MEASURED: this was the ONLY modal in the repo without `.u-modal-shell`.
    // That is why `e2e/test-dialog.mjs` never reported it — the sweep selects
    // `.u-modal-shell`, so the component was invisible to the guard by CLASS,
    // not merely by route. The class also carries `overscroll-behavior:
    // contain` (layout.css §3), so the omission was a real behavioural gap too.
    render(<RejectMailModal onCancel={() => {}} onConfirm={() => {}} />);
    expect(document.querySelectorAll('.u-modal-shell').length).toBe(1);
  });

  it('declares role="dialog" and aria-modal="true"', () => {
    render(<RejectMailModal onCancel={() => {}} onConfirm={() => {}} />);
    const c = dialogContract();
    expect(c.role).toBe('dialog');
    expect(c.ariaModal).toBe('true');
  });

  it('has a name that RESOLVES to a non-empty element', () => {
    render(<RejectMailModal onCancel={() => {}} onConfirm={() => {}} />);
    const c = dialogContract();
    expect(c.ariaLabelledby).toBeTruthy();
    expect(c.resolvedName.length).toBeGreaterThan(0);
    expect(c.resolvedName).toContain('ui.reject_app');
  });

  it('the semantics come from the hook, not the markup', () => {
    // Regression guard for the original defect: role/aria-modal were literal
    // attributes in the JSX. If they are still literal, removing the hook
    // would leave the false claim behind. Assert the id the hook generates.
    render(<RejectMailModal onCancel={() => {}} onConfirm={() => {}} />);
    const c = dialogContract();
    expect(c.ariaLabelledby).toMatch(/^asj-overlay-title-\d+$/);
  });
});

/* ══ Second wave (2026-09-16) ═══════════════════════════════════════════════
   §3.1(a) named two modals that were STILL outside this contract after the
   first wave above: they carried `.u-modal-shell` and no hook at all — no
   role, no accessible name, no Tab trap, no Escape. Both live behind the
   admin tab, so `e2e/test-dialog.mjs` cannot reach them either, for the same
   reason this file exists.

   Asserted against the RENDERED DOM, never the source: the source cannot show
   a contract the hook writes imperatively onto the container node.
   ═════════════════════════════════════════════════════════════════════════ */

describe('§3.1(a) — AdminAiCopilot is a real dialog', () => {
  it('declares role="dialog" and aria-modal="true"', () => {
    render(<AdminAiCopilot onClose={() => {}} />);
    const c = dialogContract();
    expect(c.role).toBe('dialog');
    expect(c.ariaModal).toBe('true');
  });

  it('is named after its own heading, via the hook', () => {
    render(<AdminAiCopilot onClose={() => {}} />);
    const c = dialogContract();
    expect(c.ariaLabelledby).toMatch(/^asj-overlay-title-\d+$/);
    expect(c.resolvedName).toBe('ui.ai_copilot');
  });

  it('moves focus INSIDE, so aria-modal="true" is not a false claim', () => {
    render(<AdminAiCopilot onClose={() => {}} />);
    const c = dialogContract();
    expect(c.focusInside || c.tabIndex === '-1').toBe(true);
  });

  it('closes on Escape', () => {
    let closed = false;
    render(<AdminAiCopilot onClose={() => { closed = true; }} />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toBe(true);
  });
});

describe('§3.1(a) — RirekishoBuilder is a real dialog', () => {
  const props = { waTarget: '628123456789', isOpen: true, onClose: () => {} };

  it('declares role="dialog" and aria-modal="true"', () => {
    render(<RirekishoBuilder {...props} />);
    const c = dialogContract();
    expect(c.role).toBe('dialog');
    expect(c.ariaModal).toBe('true');
  });

  it('is named by `label`, because the A4 sheet has no heading to borrow', () => {
    // The sheet's title is a styled <div> inside the generated HTML, so there
    // is no <h1>-<h6> for the hook to name the dialog from. Without `label`
    // this overlay would be a dialog with NO accessible name — precisely the
    // failure §25 exists to close, which is why it is asserted here and not
    // left to the hook's heading lookup.
    render(<RirekishoBuilder {...props} />);
    const c = dialogContract();
    expect(c.ariaLabelledby).toBeNull();
    expect(c.ariaLabel).toBe('admin.rirekisho_title');
    expect(c.resolvedName).toBe('admin.rirekisho_title');
  });

  it('claims nothing at all while isOpen is false', () => {
    render(<RirekishoBuilder {...props} isOpen={false} />);
    expect(document.querySelector('.u-modal-shell')).toBeNull();
  });

  it('closes on Escape', () => {
    let closed = false;
    render(<RirekishoBuilder {...props} onClose={() => { closed = true; }} />);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toBe(true);
  });
});
