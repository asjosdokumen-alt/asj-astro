/**
 * HistoryTimeline.test.tsx — the About section's history block.
 *
 * WHAT THIS GATE IS FOR, AND WHAT IT CANNOT SEE
 * --------------------------------------------
 * Two separate defects made this component necessary, and they need two
 * different checks:
 *
 *   1. The `sejarah` content did not exist. A rendering gate cannot catch a
 *      MISSING section (nothing to assert against), so that half is pinned in
 *      `src/lib/companyProfile.test.ts` — that file owns the claim "HISTORY has
 *      three milestones with these dates". This file does NOT re-test it.
 *
 *   2. Iterating inside the `.astro` template — which is how it was FIRST
 *      written — silently breaks the indexer's zero-unresolved invariant
 *      (`indexer/src/build.test.ts`): a `.map()` callback parameter in an
 *      `.astro` template is read as a global. That failure is loud but arrives
 *      from a different suite, so this file must fail for a reason of its own
 *      or it is not pulling its weight.
 *
 * So the claim tested HERE is the one neither of the others makes: that the
 * rendered list actually carries every milestone, in order, with its own
 * i18n key on both the term and the description, and that the container is a
 * description list rather than a run of divs.
 *
 * The i18n half is not decoration. `data-lang` keys are what the language
 * toggle reads, and a key present in the component but absent from either
 * dictionary renders as the ORIGINAL language in one mode — a silent,
 * one-language-only failure that no coverage gate catches, because the key
 * does exist, just not in both files.
 *
 * NO `<h1>` AND NO HEADING AT ALL: `e2e/test-headings.mjs` asserts `/` has
 * exactly one `<h1>` and the About section is already under an `<h2>`, so a
 * heading per milestone would be the third level. Asserted below so a later
 * "let's make these headings" refactor fails here rather than in e2e.
 */
import { render, screen, cleanup } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import HistoryTimeline from './HistoryTimeline';

const MILESTONES = [
  { title: { key: 'profile.history_1_title', text: '15 Agustus 2023 — Pendirian' }, body: { key: 'profile.history_1_body', text: 'Akta pendirian.' } },
  { title: { key: 'profile.history_2_title', text: '28 Agustus 2023 — Pengesahan Badan Hukum' }, body: { key: 'profile.history_2_body', text: 'SK Kemenkumham.' } },
  { title: { key: 'profile.history_3_title', text: '2023 — Pelatihan Berbasis Kompetensi' }, body: { key: 'profile.history_3_body', text: 'Pelatihan bahasa Jepang.' } },
];

afterEach(cleanup);

describe('HistoryTimeline', () => {
  it('renders every milestone text, in order', () => {
    const { container } = render(<HistoryTimeline milestones={MILESTONES} />);
    const terms = Array.from(container.querySelectorAll('dt')).map((n) => n.textContent);
    expect(terms).toEqual([
      '15 Agustus 2023 — Pendirian',
      '28 Agustus 2023 — Pengesahan Badan Hukum',
      '2023 — Pelatihan Berbasis Kompetensi',
    ]);
    // The order assertion above is the point: a list rendered in an arbitrary
    // order still shows all three strings, so `toHaveLength(3)` would pass on
    // a broken sort. Equality on the sequence does not.
    expect(container.querySelectorAll('dd')).toHaveLength(3);
  });

  it('emits a description list, so a term is never orphaned from its date', () => {
    const { container } = render(<HistoryTimeline milestones={MILESTONES} />);
    // `?? null` rather than a non-null assertion: `noNonNullAssertion` is a
    // ratchet rule, and the assertion would also be a lie in the failing case —
    // it would let the test continue past a missing list and report the
    // confusing "expected 0 terms" instead of "no <dl>".
    const dl = container.querySelector('dl') ?? null;
    expect(dl).not.toBeNull();
    // Each <dt> must sit in the same wrapper as its <dd> — the visual pairing
    // the CSS depends on. A flat <dl> would render as three dates then three
    // paragraphs with nothing tying them together.
    for (const term of Array.from(dl?.querySelectorAll('dt') ?? [])) {
      expect(term.parentElement?.querySelector('dd')).not.toBeNull();
    }
  });

  it('carries an i18n key on both the term and the description', () => {
    const { container } = render(<HistoryTimeline milestones={MILESTONES} />);
    const keyed = Array.from(container.querySelectorAll('[data-lang]')).map((n) =>
      n.getAttribute('data-lang'),
    );
    expect(keyed).toEqual([
      'profile.history_1_title',
      'profile.history_1_body',
      'profile.history_2_title',
      'profile.history_2_body',
      'profile.history_3_title',
      'profile.history_3_body',
    ]);
  });

  it('renders no heading — the single-h1 rule on / depends on it', () => {
    const { container } = render(<HistoryTimeline milestones={MILESTONES} />);
    expect(container.querySelectorAll('h1, h2, h3, h4, h5, h6')).toHaveLength(0);
  });

  it('renders nothing but an empty list for no milestones', () => {
    // The guard against a future "history is pending owner approval" edit
    // rendering an empty bordered box with a stray heading in it.
    const { container } = render(<HistoryTimeline milestones={[]} />);
    expect(container.querySelector('dl')).not.toBeNull();
    expect(screen.queryAllByRole('definition')).toHaveLength(0);
  });
});
