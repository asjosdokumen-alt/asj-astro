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
    // `URL` is Netlify's own variable; stubbed empty so this test does not
    // depend on whether the machine or CI happens to export it. Same for
    // NETLIFY_SITE_URL, which the owner keeps in `.env`/`.env.local`.
    vi.stubEnv('URL', '');
    vi.stubEnv('NETLIFY_SITE_URL', '');
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

  // ── Netlify fallback (2026-10-23) ────────────────────────────────────────
  // Measured: canonical/hreflang/og:url/JSON-LD were absent from every built
  // page because PUBLIC_SITE_URL was configured nowhere. Netlify exports `URL`
  // on every build, so production must not depend on a manual variable.
  it('falls back to Netlify `URL` when PUBLIC_SITE_URL is unset', () => {
    vi.stubEnv('PUBLIC_SITE_URL', '');
    vi.stubEnv('URL', 'https://asj.example.netlify.app');
    expect(siteOrigin()).toBe('https://asj.example.netlify.app');
  });

  it('PUBLIC_SITE_URL wins over Netlify `URL`', () => {
    vi.stubEnv('PUBLIC_SITE_URL', 'https://canonical.example');
    vi.stubEnv('URL', 'https://deploy-preview-12--site.netlify.app');
    expect(siteOrigin()).toBe('https://canonical.example');
  });

  it('a MISCONFIGURED PUBLIC_SITE_URL does not silently fall back to `URL`', () => {
    // A typo must stay a loud failure: falling through here would point every
    // canonical tag at a different host than the operator intended.
    vi.stubEnv('PUBLIC_SITE_URL', 'example.com');
    vi.stubEnv('URL', 'https://asj.example.netlify.app');
    expect(siteOrigin()).toBeNull();
  });

  it('rejects a Netlify `URL` that is not an absolute origin', () => {
    vi.stubEnv('PUBLIC_SITE_URL', '');
    vi.stubEnv('URL', 'localhost:8888');
    vi.stubEnv('NETLIFY_SITE_URL', '');
    expect(siteOrigin()).toBeNull();
  });

  // ── NETLIFY_SITE_URL (2026-10-24) ────────────────────────────────────────
  // The owner maintains `NETLIFY_SITE_URL` and NOT `PUBLIC_SITE_URL` (measured:
  // it is in `.env` and `.env.local`, PUBLIC_SITE_URL is nowhere). Before this,
  // a local build resolved to no origin and emitted no canonical at all, while
  // production — which has `URL` — did. Same source tree, two different
  // artifacts.
  it('falls back to NETLIFY_SITE_URL when neither PUBLIC_SITE_URL nor `URL` is set', () => {
    vi.stubEnv('PUBLIC_SITE_URL', '');
    vi.stubEnv('URL', '');
    vi.stubEnv('NETLIFY_SITE_URL', 'https://amanahsakura.netlify.app');
    expect(siteOrigin()).toBe('https://amanahsakura.netlify.app');
  });

  it('Netlify `URL` wins over NETLIFY_SITE_URL — a deploy preview must not claim the primary host', () => {
    vi.stubEnv('PUBLIC_SITE_URL', '');
    vi.stubEnv('URL', 'https://deploy-preview-12--asj.netlify.app');
    vi.stubEnv('NETLIFY_SITE_URL', 'https://amanahsakura.netlify.app');
    expect(siteOrigin()).toBe('https://deploy-preview-12--asj.netlify.app');
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
