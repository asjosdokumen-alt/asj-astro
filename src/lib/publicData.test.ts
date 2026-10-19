/**
 * publicData.test.ts — the payload's transport, which is an EGRESS decision.
 *
 * The public payload is ~113 KB of PostgREST JSON, identical for every
 * anonymous visitor. The server labels it `s-maxage=60` so the CDN can absorb
 * repeat visits, but **Netlify caches GET/HEAD only**. A POST is forwarded to
 * the function every single time — so reverting this call to POST would look
 * completely harmless (the page still works) while restoring one full database
 * read per visit. That is the regression this suite exists to catch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPublicData, publicDataUrl } from './publicData';

const realFetch = globalThis.fetch;

function stubFetch(payload: unknown = { success: true, jobs: [] }) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return { json: async () => payload } as unknown as Response;
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return { fn, calls };
}

describe('getPublicData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('memakai GET — CDN Netlify hanya menyimpan GET/HEAD', async () => {
    const { calls } = stubFetch();
    await getPublicData();
    expect(calls).toHaveLength(1);
    expect(calls[0].init?.method).toBe('GET');
    // A body would make the browser send a POST-shaped request and the CDN
    // would never store it; `GET` + `body` is also a TypeError in fetch.
    expect(calls[0].init?.body).toBeUndefined();
  });

  it('mengirim action/payload lewat query string yang diparse wrapper', async () => {
    const { calls } = stubFetch();
    await getPublicData();
    const url = new URL(calls[0].url, 'https://example.test');
    expect(url.pathname).toBe('/.netlify/functions/get-app-data');
    expect(url.searchParams.get('action')).toBe('getAppData');
    expect(JSON.parse(url.searchParams.get('payload') || '[]')).toEqual(['public']);
  });

  it('single-flight: dua pemanggil bersamaan hanya menghasilkan satu request', async () => {
    const { fn } = stubFetch();
    const [a, b] = await Promise.all([getPublicData(), getPublicData()]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('setelah selesai, pemanggilan berikutnya mengambil data baru', async () => {
    const { fn } = stubFetch();
    await getPublicData();
    await getPublicData();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('publicDataUrl stabil (dipakai juga oleh pemanggil lain)', () => {
    expect(publicDataUrl()).toContain('action=getAppData');
    expect(publicDataUrl()).toBe(publicDataUrl());
  });
});
