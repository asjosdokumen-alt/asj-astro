// ==========================================
// TESTS: InputManualModal — label/control wiring (a11y, 2026-09-16)
//
// WHY THIS EXISTS
// ---------------
// This modal had NO test at all: `TabPelamar.test.tsx` mocks it away
// (`vi.mock('./InputManualModal', () => ({ default: () => null }))`), so nothing
// had ever rendered it. Its 14 `a11y/noLabelWithoutControl` diagnostics were paid
// down in one pass, and — as in TabTambah — they were NOT all one defect:
//
//   * 13 ordinary control labels -> `for=` + `id=`
//   *  1 group label ("Dokumen Lainnya") sitting above a COLUMN-HEADER ROW
//      -> `<fieldset>` + `<legend>`. A `<label>` names exactly ONE control and
//      there is no single control to name here, so `for=` was never available.
//
// ── THE DEFECT THE LINT RULE STRUCTURALLY CANNOT SEE ──────────────────────────
// Paying those 14 down left the rows unnamed. Each row's `<select>` is described
// only by a neighbouring column-header `<span>`, which associates with nothing.
// `noLabelWithoutControl` cannot flag it because the rule triggers on a `<label>`
// that dangles — and here there is no `<label>` at all. The linter went green
// while the control stayed nameless.
//
// So the group fix is only half the job, and this file pins the other half:
// every row control must carry its own accessible name, and those names must be
// DISTINCT per row. A single shared name ("Jenis Dokumen" on all three rows)
// would satisfy "has a name" and still leave a screen-reader user unable to tell
// the rows apart — which is why the distinctness assertion is here and not a
// count.
//
// The distinctness check needs a SECOND row to have anything to compare: with one
// row, a dropped row index is invisible. That is the same lesson as the
// education/job "+" buttons in `e2e/test-labels.mjs` — one unit cannot expose a
// per-unit bug.
//
// It deliberately does NOT assert a label COUNT: the lint rule counts source
// LOCATIONS while the user meets rendered labels, so pinning a number here would
// be a second, weaker copy of the ratchet. What matters is the wiring.
// ==========================================
import { render, cleanup, waitFor, fireEvent, act } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import InputManualModal from './InputManualModal';
import { inputModalOpen } from '../../store/adminStore';
import { t } from '../../store/i18n';

vi.mock('../Toast', () => ({ showToast: vi.fn() }));
vi.mock('../../lib/cloudinary', () => ({ uploadToCloudinary: vi.fn() }));

beforeEach(() => {
  inputModalOpen.set(true);
});
afterEach(() => {
  inputModalOpen.set(false);
  cleanup();
});

/** Render and wait until the form has actually painted. */
async function renderModal() {
  const utils = render(<InputManualModal />);
  await waitFor(() => {
    expect(utils.container.querySelectorAll('label').length).toBeGreaterThan(0);
  });
  return utils.container;
}

/** The "Dokumen Lainnya" group — the only fieldset in this modal. */
function docFieldset(root: Element) {
  const fs = root.querySelector('fieldset');
  expect(fs, 'the extra-docs group is not a <fieldset>').toBeTruthy();
  return fs as Element;
}

describe('InputManualModal — label/control wiring', () => {
  it('every <label for=...> resolves to an element that exists', async () => {
    const root = await renderModal();

    const dangling: string[] = [];
    for (const label of root.querySelectorAll('label')) {
      const target = label.getAttribute('for');
      if (!target) continue;
      if (!document.getElementById(target)) dangling.push(target);
    }

    expect(dangling).toEqual([]);
  });

  it('no label is left with neither for= nor a wrapped control', async () => {
    const root = await renderModal();

    const orphans = [...root.querySelectorAll('label')]
      .filter((l) => !l.getAttribute('for') && !l.querySelector('input, select, textarea'))
      .map((l) => (l.textContent || '').trim().slice(0, 40));

    expect(orphans).toEqual([]);
  });

  it('the extra-docs group is a <fieldset> with a non-empty <legend>', async () => {
    const root = await renderModal();

    // Exactly one on purpose: this modal has one group. A second group should
    // make someone read this comment, not silently widen the assertion.
    expect(root.querySelectorAll('fieldset').length).toBe(1);

    // The failure this catches: a <fieldset> whose <legend> was emptied. It
    // renders fine and leaves the group with no accessible name.
    const name = (docFieldset(root).querySelector('legend')?.textContent || '').trim();
    expect(name).not.toBe('');
  });

  it('the controls the labels name are the ones the form actually binds', async () => {
    await renderModal();

    // Spot-check both ends of the wiring, so a `for=` that resolves to the WRONG
    // element (two fields sharing an id) is caught — "resolves to something" is
    // not the same as "resolves to the right thing".
    for (const [id, tag] of [
      ['im-cari', 'INPUT'],
      ['im-nama', 'INPUT'],
      ['im-wa', 'INPUT'],
      ['im-gender', 'SELECT'],
      ['im-pendidikan', 'SELECT'],
      ['im-pas', 'INPUT'],
      ['im-ssw', 'INPUT'],
    ] as const) {
      const el = document.getElementById(id);
      expect(el, `#${id} does not exist`).toBeTruthy();
      expect(el?.tagName).toBe(tag);
    }

    // The file inputs are the ones that must NOT silently become text inputs.
    expect((document.getElementById('im-pas') as HTMLInputElement).type).toBe('file');
    expect((document.getElementById('im-wa') as HTMLInputElement).type).toBe('tel');
  });

  it('every row control in the group has its own accessible name, distinct per row', async () => {
    const root = await renderModal();

    const namesOf = (fs: Element) =>
      [...fs.querySelectorAll('select')].map((s) => (s.getAttribute('aria-label') || '').trim());

    // Row 1 exists on mount.
    const one = namesOf(docFieldset(root));
    expect(one.length).toBe(1);
    expect(one[0], 'row 1 <select> has no accessible name').not.toBe('');

    // Add a SECOND row: with one row a dropped index is unobservable, so the
    // distinctness assertion below could not fail.
    const addBtn = [...docFieldset(root).querySelectorAll('button')].find((b) =>
      (b.textContent || '').includes(t('button.add'))
    );
    expect(addBtn, 'the "+" button for a new document row was not found').toBeTruthy();
    fireEvent.click(addBtn as Element);

    await waitFor(() => {
      expect(docFieldset(root).querySelectorAll('select').length).toBe(2);
    });

    const two = namesOf(docFieldset(root));
    for (const [i, n] of two.entries()) {
      expect(n, `row ${i + 1} <select> has no accessible name`).not.toBe('');
    }
    // The failure this catches: a row index dropped from the name, so all rows
    // announce identically. "Has a name" passes; a user still cannot tell the
    // rows apart.
    expect(new Set(two).size, `row names are not distinct: ${JSON.stringify(two)}`).toBe(two.length);
  });
});

// ==========================================
// TESTS: the dialog semantics survive a REOPEN (2026-09-24)
//
// WHY THIS EXISTS. `InputManualModal` is mounted UNCONDITIONALLY —
// `TabPelamar.tsx:255` renders `<InputManualModal />` with no props — and it
// reads `open` from the `inputModalOpen` atom. Its render guard used to sit
// ABOVE the `useOverlay` call (`if (!open) return null;` before the hook), so
// while the modal was closed the hook never ran. Measured in a real browser
// against the served build, opening/close/opening:
//   OPEN #1  role="dialog" aria-modal="true"  focus INSIDE
//   OPEN #2  role=null     aria-modal=null    focus NOT inside
// The FIRST open is correct, which is why every existing check above (and the
// one-open sweep in e2e/test-dialog.mjs) is green on this defect.
//
// The atom is the right lever here BECAUSE the defect is a hooks-order bug:
// the component stays mounted across close/reopen, so `open` toggling between
// renders is exactly the sequence that broke it. A fresh `render()` per open
// would never reproduce it.
// ==========================================
describe('InputManualModal — dialog semantics survive a reopen', () => {
  const overlay = () => document.querySelector('.u-modal-shell');

  it('keeps role="dialog" and aria-modal on a SECOND open', async () => {
    inputModalOpen.set(false);
    render(<InputManualModal />);
    await waitFor(() => expect(overlay()).toBeNull());

    await act(async () => { inputModalOpen.set(true); }); // OPEN #1
    await waitFor(() => {
      expect(overlay()?.getAttribute('role')).toBe('dialog');
      expect(overlay()?.getAttribute('aria-modal')).toBe('true');
    });

    await act(async () => { inputModalOpen.set(false); }); // close — the hook must run here too
    await waitFor(() => expect(overlay()).toBeNull());

    await act(async () => { inputModalOpen.set(true); }); // OPEN #2 — the one the defect breaks
    await waitFor(() => {
      expect(overlay()?.getAttribute('role'), 'role lost on reopen').toBe('dialog');
      expect(overlay()?.getAttribute('aria-modal'), 'aria-modal lost on reopen').toBe('true');
    });
  });
});
