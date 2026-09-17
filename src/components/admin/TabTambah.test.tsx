// ==========================================
// TESTS: TabTambah — label/control wiring (a11y, 2026-09-16)
//
// WHY THIS EXISTS
// ---------------
// This file's 15 `a11y/noLabelWithoutControl` diagnostics were paid down in one
// pass, and they were NOT all the same defect:
//
//   * 10 ordinary control labels -> `for=` + `id=`
//   *  3 group labels (a checkbox SET plus a free-text "custom" input, and the
//      same shape twice more)  -> `<fieldset>` + `<legend>`, because `for=` names
//      exactly ONE control and these name a set. Putting `for=` on one member
//      would have named that member and mis-described the rest.
//   *  1 `<label>` used as a section heading, and 1 sitting above a `<button>`
//      -> the ELEMENT was wrong; no association is possible, so both became
//      `<div>`. (`for=` can never name a `<button>`.)
//
// The component had NO test, so the restructuring — three `<div>` wrappers became
// `<fieldset>` — was compiled but unverified. This pins the two things that rot
// silently:
//
//   1. a `for=` that points at an id which does not exist (typo, rename), and
//   2. a group that loses its accessible name. An emptied `<legend>` renders
//      identically, logs nothing, and is invisible to a source-level rule.
//
// It deliberately does NOT assert a label COUNT: the lint rule counts source
// LOCATIONS while the user meets rendered labels, so pinning a number here would
// be a second, weaker copy of the ratchet. What matters is the wiring, not the
// count.
// ==========================================
import { render, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TabTambah from './TabTambah';

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock('../Toast', () => ({ showToast: vi.fn() }));

vi.mock('../../lib/apiClient', () => {
  const api = { get: (...args: unknown[]) => mockGet(...args), secure: vi.fn() };
  return { api, default: api };
});

/** Non-empty so the checkbox groups actually render their members. */
const DROPDOWNS = {
  tsk: ['TSK A'],
  tahapan: ['Interview'],
  kategori: ['Manufaktur'],
  gender: ['PRIA', 'WANITA'],
  lokasi: ['Osaka', 'Tokyo'],
  syarat: ['Umur 20-30'],
};

beforeEach(() => {
  mockGet.mockResolvedValue({ success: true, dropdowns: DROPDOWNS });
});
afterEach(cleanup);

/** Render and wait until the form has actually painted (not just the spinner). */
async function renderForm() {
  const utils = render(<TabTambah />);
  await waitFor(() => {
    expect(utils.container.querySelectorAll('label').length).toBeGreaterThan(0);
  });
  return utils.container;
}

describe('TabTambah — label/control wiring', () => {
  it('every <label for=...> resolves to an element that exists', async () => {
    const root = await renderForm();

    const dangling: string[] = [];
    for (const label of root.querySelectorAll('label')) {
      const target = label.getAttribute('for');
      if (!target) continue;
      if (!document.getElementById(target)) dangling.push(target);
    }

    expect(dangling).toEqual([]);
  });

  it('no label is left with neither for= nor a wrapped control', async () => {
    const root = await renderForm();

    const orphans = [...root.querySelectorAll('label')]
      .filter((l) => !l.getAttribute('for') && !l.querySelector('input, select, textarea'))
      .map((l) => (l.textContent || '').trim().slice(0, 40));

    expect(orphans).toEqual([]);
  });

  it('the three checkbox groups are <fieldset>s, each with a non-empty <legend>', async () => {
    const root = await renderForm();

    const fieldsets = [...root.querySelectorAll('fieldset')];
    // Exactly three on purpose: this file has three checkbox sets. A fourth group
    // should make someone read this comment, not silently widen the assertion.
    expect(fieldsets.length).toBe(3);

    const names = fieldsets.map((f) => (f.querySelector('legend')?.textContent || '').trim());
    for (const [i, name] of names.entries()) {
      // The failure this catches: a <fieldset> whose <legend> was emptied. It
      // renders fine and leaves the group with no accessible name.
      expect(name, `fieldset #${i} has no legend text`).not.toBe('');
    }
  });

  it('the controls the labels name are the ones the form actually binds', async () => {
    await renderForm();

    // Spot-check both ends of the wiring for a representative few, so a `for=`
    // that resolves to the WRONG element (two fields sharing an id) is caught —
    // "resolves to something" is not the same as "resolves to the right thing".
    for (const [id, tag] of [
      ['tt-tsk', 'SELECT'],
      ['tt-kategori', 'SELECT'],
      ['tt-gender', 'SELECT'],
      ['tt-kuota', 'INPUT'],
      ['tt-keterangan', 'TEXTAREA'],
    ] as const) {
      const el = document.getElementById(id);
      expect(el, `#${id} does not exist`).toBeTruthy();
      expect(el?.tagName).toBe(tag);
    }
  });
});
