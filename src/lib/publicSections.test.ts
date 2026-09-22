/**
 * publicSections.test.ts — the guard the old inline tab script never had.
 *
 * The behaviour under test is small on purpose. What it replaces was not: two
 * `is:inline` blocks that swapped six Tailwind classes each, in two files, with
 * no test anywhere and panel ids that had already diverged between them
 * (`public-loker-section` vs `section-loker`). A misspelled class in that code
 * left the tab looking functional while the colour stopped changing, and
 * `verify-classes` cannot catch it because a misspelled utility that still
 * resembles a utility is still a valid candidate string.
 *
 * WHAT THIS FILE PINS THAT A "DOES IT SWAP" TEST WOULD MISS
 * --------------------------------------------------------
 * 1. The module writes the `hidden` ATTRIBUTE, never a class. `applyPublicSection`
 *    is asserted to leave `className` untouched, so a future edit cannot quietly
 *    reintroduce class swapping — which is the whole defect being removed.
 * 2. A deep link is honoured on first paint (`#layanan` opens layanan), and an
 *    unknown hash (`#tentang`, a section that does not exist yet) falls back to
 *    the default instead of hiding everything.
 * 3. Tab clicks use `replaceState`, so Back does not walk through tabs.
 * 4. Teardown actually unbinds.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PUBLIC_SECTION,
  PUBLIC_SECTION_IDS,
  type PublicSectionRoot,
  applyPublicSection,
  bindPublicSections,
  isPublicSectionId,
  publicSectionState,
  resolvePublicSection,
} from './publicSections';

function fixture(): PublicSectionRoot {
  document.body.innerHTML = [
    '<div id="tabs">',
    '  <button data-public-tab="loker">Loker</button>',
    '  <button data-public-tab="layanan">Layanan</button>',
    '</div>',
    '<div data-public-panel="loker">LOKER</div>',
    '<div data-public-panel="layanan" hidden>LAYANAN</div>',
  ].join('\n');
  // Bind the WHOLE body, not `#tabs`: the panels are siblings of the tab list,
  // exactly as they are in the page. Binding the tab list alone would scope the
  // applier to a subtree that contains no panels — which is what the first run
  // of this suite caught, and why the applier takes a root at all.
  return document.body;
}

function panel(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-public-panel="${id}"]`);
  if (!el) throw new Error(`fixture: panel "${id}" missing`);
  return el;
}

function tab(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-public-tab="${id}"]`);
  if (!el) throw new Error(`fixture: tab "${id}" missing`);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

describe('resolvePublicSection', () => {
  it('falls back to the default when there is no hash at all', () => {
    expect(resolvePublicSection('')).toBe(DEFAULT_PUBLIC_SECTION);
    expect(DEFAULT_PUBLIC_SECTION).toBe('loker');
  });

  it('reads a bare and a prefixed hash the same way', () => {
    expect(resolvePublicSection('#layanan')).toBe('layanan');
    expect(resolvePublicSection('layanan')).toBe('layanan');
  });

  it('ignores case and surrounding whitespace', () => {
    expect(resolvePublicSection('#  LaYaNaN  ')).toBe('layanan');
  });

  it('falls back to the default for a section that does not exist yet', () => {
    // `#tentang` is a real anchor in docs/LANDING_PAGE_SPEC.md but not a section
    // of THIS switcher. It must not resolve to "show nothing".
    expect(resolvePublicSection('#tentang')).toBe(DEFAULT_PUBLIC_SECTION);
    expect(resolvePublicSection('#')).toBe(DEFAULT_PUBLIC_SECTION);
  });

  it('accepts every declared id and rejects anything else', () => {
    for (const id of PUBLIC_SECTION_IDS) expect(isPublicSectionId(id)).toBe(true);
    expect(isPublicSectionId('tentang')).toBe(false);
  });
});

describe('publicSectionState', () => {
  it('marks exactly one panel visible', () => {
    const state = publicSectionState('layanan');
    const visible = PUBLIC_SECTION_IDS.filter((id) => state.panels[id]);
    expect(visible).toEqual(['layanan']);
  });

  it('reports the requested section as active', () => {
    expect(publicSectionState('loker').active).toBe('loker');
  });
});

describe('applyPublicSection', () => {
  it('hides the inactive panel with the hidden ATTRIBUTE', () => {
    fixture();
    applyPublicSection(publicSectionState('layanan'), document);

    expect(panel('loker').hidden).toBe(true);
    expect(panel('layanan').hidden).toBe(false);
  });

  it('never writes a class — the defect this module exists to remove', () => {
    fixture();
    applyPublicSection(publicSectionState('layanan'), document);

    expect(panel('loker').className).toBe('');
    expect(panel('layanan').className).toBe('');
    expect(tab('loker').className).toBe('');
    expect(tab('layanan').className).toBe('');
  });

  it('marks the pressed tab with aria-pressed', () => {
    fixture();
    applyPublicSection(publicSectionState('layanan'), document);

    expect(tab('loker').getAttribute('aria-pressed')).toBe('false');
    expect(tab('layanan').getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps both tabs in the tab order', () => {
    fixture();
    applyPublicSection(publicSectionState('layanan'), document);

    // A roving tabindex would be correct only with role="tab" plus arrow keys.
    // Without that contract it is a keyboard trap, so it must not appear.
    expect(tab('loker').hasAttribute('tabindex')).toBe(false);
    expect(tab('layanan').hasAttribute('tabindex')).toBe(false);
  });

  it('leaves a panel it does not recognise visible', () => {
    document.body.innerHTML = '<div data-public-panel="masa-depan">X</div>';
    applyPublicSection(publicSectionState('layanan'), document);

    expect(panel('masa-depan').hidden).toBe(false);
  });
});

describe('bindPublicSections', () => {
  it('starts on the default section when there is no hash', () => {
    const root = fixture();
    const off = bindPublicSections(root);

    expect(panel('loker').hidden).toBe(false);
    expect(panel('layanan').hidden).toBe(true);
    off();
  });

  it('opens the panel named by a deep link on first paint', () => {
    const root = fixture();
    window.history.replaceState(null, '', '#layanan');
    const off = bindPublicSections(root);

    expect(panel('layanan').hidden).toBe(false);
    expect(panel('loker').hidden).toBe(true);
    off();
  });

  it('swaps panels when a tab is clicked', () => {
    const root = fixture();
    const off = bindPublicSections(root);

    tab('layanan').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(panel('layanan').hidden).toBe(false);
    expect(panel('loker').hidden).toBe(true);
    off();
  });

  it('rewrites the hash without pushing a history entry per click', () => {
    const root = fixture();
    const off = bindPublicSections(root);
    const before = window.history.length;

    tab('layanan').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(window.location.hash).toBe('#layanan');

    tab('loker').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(window.location.hash).toBe('#loker');

    // `location.hash = …` would have added two entries; Back would then walk
    // through tabs instead of leaving the page.
    expect(window.history.length).toBe(before);
    off();
  });

  it('follows a hashchange', () => {
    const root = fixture();
    const off = bindPublicSections(root);

    window.history.replaceState(null, '', '#layanan');
    window.dispatchEvent(new Event('hashchange'));

    expect(panel('layanan').hidden).toBe(false);
    off();
  });

  it('stops responding after teardown', () => {
    const root = fixture();
    const off = bindPublicSections(root);
    off();

    tab('layanan').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(panel('layanan').hidden).toBe(true);

    window.history.replaceState(null, '', '#layanan');
    window.dispatchEvent(new Event('hashchange'));
    expect(panel('layanan').hidden).toBe(true);
  });

  it('does not bind twice when mounted twice', () => {
    const root = fixture();
    const offA = bindPublicSections(root);
    const offB = bindPublicSections(root);
    const spy = vi.spyOn(window.history, 'replaceState');

    tab('layanan').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // One click, one URL write. Two live binders would write twice.
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    offA();
    offB();
  });
});
