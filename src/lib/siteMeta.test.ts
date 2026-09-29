/**
 * siteMeta.test.ts — pins the origin handling of the discovery metadata.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 * `siteMeta.ts` feeds `canonical`, `hreflang` and the JSON-LD block. Its whole
 * design rests on one behaviour that is invisible in a normal build: **when the
 * origin is unknown it must emit NOTHING.** If that regresses, the site starts
 * publishing a guessed or relative canonical URL, and this project's host has
 * already moved twice — a wrong canonical points crawlers at a frozen site,
 * which is a real defect that no build error would reveal.
 *
 * The second behaviour worth pinning is that the JSON-LD carries no counts.
 * `COMPANY_PROFILE_DATA.md` §8/§12 ban publishing invented figures, and
 * structured data is a place they could be added where no visible gate looks.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  siteOrigin,
  absoluteUrl,
  hreflangAlternates,
  organizationJsonLd,
  jsonLdScript,
} from './siteMeta';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('siteOrigin', () => {
  it('returns null when PUBLIC_SITE_URL is unset', () => {
    vi.stubEnv('PUBLIC_SITE_URL', '');
    expect(siteOrigin()).toBeNull();
  });

  it('returns null for a bare word, so a bad origin never becomes an href', () => {
    vi.stubEnv('PUBLIC_SITE_URL', 'example.com');
    expect(siteOrigin()).toBeNull();
  });

  it('accepts an absolute http origin and strips trailing slashes', () => {
    vi.stubEnv('PUBLIC_SITE_URL', 'https://example.com///');
    expect(siteOrigin()).toBe('https://example.com');
  });
});

describe('absoluteUrl', () => {
  it('returns null with no origin', () => {
    expect(absoluteUrl('/x', null)).toBeNull();
  });

  it('joins origin and path', () => {
    expect(absoluteUrl('/x', 'https://e.com')).toBe('https://e.com/x');
  });

  it('adds the leading slash when the path lacks one', () => {
    expect(absoluteUrl('x', 'https://e.com')).toBe('https://e.com/x');
  });
});

describe('hreflangAlternates', () => {
  it('emits nothing when the origin is unknown', () => {
    expect(hreflangAlternates({ id: '/', jp: '/?lang=jp' }, null)).toEqual([]);
  });

  it('emits id, jp and x-default with absolute urls', () => {
    const out = hreflangAlternates({ id: '/', jp: '/?lang=jp' }, 'https://e.com');
    expect(out).toEqual([
      { hreflang: 'id', href: 'https://e.com/' },
      { hreflang: 'jp', href: 'https://e.com/?lang=jp' },
      { hreflang: 'x-default', href: 'https://e.com/' },
    ]);
  });

  it('uses `id`, matching the lang attribute the layout emits', () => {
    // A mismatch between `hreflang` and the html lang attribute is a
    // contradiction a crawler has to resolve. BaseLayout emits lang="id".
    const out = hreflangAlternates({ id: '/', jp: '/?lang=jp' }, 'https://e.com');
    expect(out.some((a) => a.hreflang === 'id')).toBe(true);
    expect(out.some((a) => a.hreflang === 'id-ID')).toBe(false);
  });
});

describe('organizationJsonLd', () => {
  const base = {
    name: 'PT Test',
    description: 'd',
    streetAddress: 's',
    telephone: 't',
    email: 'e',
    latitude: 1,
    longitude: 2,
  };

  it('returns null without an origin, so no half-formed entity ships', () => {
    expect(organizationJsonLd({ ...base, origin: null })).toBeNull();
  });

  it('declares the educational type and a stable id', () => {
    const ld = organizationJsonLd({ ...base, origin: 'https://e.com' });
    expect(ld?.['@type']).toBe('EducationalOrganization');
    expect(ld?.['@id']).toBe('https://e.com/#organization');
  });

  it('carries NO counts — the anti-fabrication rule, enforced here', () => {
    // Structured data is a smuggling route for invented figures. §8/§12 ban
    // candidate/departure/partner totals, so this block must never grow one.
    const ld = organizationJsonLd({
      ...base,
      origin: 'https://e.com',
      sameAs: ['https://x'],
    });
    const serialised = JSON.stringify(ld);
    for (const banned of ['numberOfEmployees', 'aggregateRating', 'reviewCount', 'ratingValue']) {
      expect(serialised).not.toContain(banned);
    }
  });

  it('omits logo and sameAs keys entirely when not supplied', () => {
    const ld = organizationJsonLd({ ...base, origin: 'https://e.com' });
    expect(ld).not.toHaveProperty('logo');
    expect(ld).not.toHaveProperty('sameAs');
  });
});

describe('jsonLdScript', () => {
  it('returns null for a null document', () => {
    expect(jsonLdScript(null)).toBeNull();
  });

  it('escapes `<` so a value cannot close the script block early', () => {
    const out = jsonLdScript({ '@type': 'X', name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(out).toContain('\\u003c');
  });

  it('still round-trips to the original value', () => {
    const value = { '@type': 'X', name: 'a<b' };
    const out = jsonLdScript(value) as string;
    expect(JSON.parse(out)).toEqual(value);
  });
});
