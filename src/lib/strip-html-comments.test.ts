/**
 * strip-html-comments.test.ts — proves the HTML comment stripper actually works.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * `scripts/build/strip-html-comments.mjs` removes ~18 KB of HTML comments from
 * the production build (MEASURED 2026-09-29: 18,412 B = 8.6% of `dist/index.html`).
 * A stripper is exactly the kind of code that fails SILENTLY in two directions:
 *
 *   1. It stops stripping (two real off-by-one bugs did this — see the source),
 *      so the page quietly goes back to being 5x a partner site's weight and
 *      nothing goes red.
 *   2. It strips TOO MUCH, eating `<!--astro:end-->` and breaking every
 *      `client:*` island in the browser only — a green build would prove nothing.
 *
 * Neither failure is visible from the build's exit code, so both are pinned here.
 */

import { describe, expect, it } from 'vitest';
import { stripComments, KEEP } from '../../scripts/build/strip-html-comments.mjs';

describe('stripComments', () => {
  it('removes an authored comment between elements', () => {
    expect(stripComments('<div>a<!-- why -->b</div>')).toBe('<div>ab</div>');
  });

  it('removes a multi-line comment', () => {
    expect(stripComments('<a>1</a><!-- line1\n line2 --><b>2</b>')).toBe('<a>1</a><b>2</b>');
  });

  it('removes several comments in one pass', () => {
    expect(stripComments('<a></a><!--x--><b></b><!--y--><c></c>')).toBe('<a></a><b></b><c></c>');
  });

  it('removes a comment at position 0', () => {
    // Regression guard: `lastIndexOf('<', -1)` clamps to 0, which made a leading
    // comment look like it sat inside a tag. Every leading comment survived.
    expect(stripComments('<!--x--><p>a</p>')).toBe('<p>a</p>');
  });

  it('removes an empty comment', () => {
    expect(stripComments('<p>a<!---->b</p>')).toBe('<p>ab</p>');
  });

  it('removes a comment that is the whole document body', () => {
    expect(stripComments('<!--x-->')).toBe('');
  });

  it('keeps a DOCTYPE', () => {
    expect(stripComments('<!DOCTYPE html><!--x--><p>a</p>')).toBe('<!DOCTYPE html><p>a</p>');
  });
});

describe('stripComments — what must SURVIVE', () => {
  it('keeps the astro:end hydration sentinel', () => {
    // Removing this breaks EVERY client:* island in the browser, with no build
    // error. Astro's runtime does: lastChild.nodeValue === "astro:end" && remove().
    expect(stripComments('<p>x</p><!--astro:end-->')).toBe('<p>x</p><!--astro:end-->');
  });

  it('keeps the astro:start sentinel', () => {
    expect(stripComments('<!--astro:start--><p>x</p>')).toBe('<!--astro:start--><p>x</p>');
  });

  it('keeps the sentinel while still stripping prose around it', () => {
    expect(stripComments('<!-- note --><p>x</p><!--astro:end-->')).toBe('<p>x</p><!--astro:end-->');
  });

  it('keeps an IE conditional comment', () => {
    expect(stripComments('<!--[if IE]>x<![endif]-->')).toBe('<!--[if IE]>x<![endif]-->');
  });

  it('exposes KEEP so the sentinel rule is inspectable, not buried', () => {
    expect(KEEP.some((re) => re.test('astro:end'))).toBe(true);
    expect(KEEP.some((re) => re.test('[if IE]'))).toBe(true);
  });
});

describe('stripComments — what must be LEFT ALONE', () => {
  it('leaves an unterminated comment verbatim', () => {
    // A malformed comment is a symptom worth seeing, not something to erase.
    expect(stripComments('<p>a<!-- oops')).toBe('<p>a<!-- oops');
  });

  it('leaves a `<!--` that sits inside an attribute value', () => {
    expect(stripComments('<p title="a<!--b">t</p>')).toBe('<p title="a<!--b">t</p>');
  });
});
