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
import {
  fetchPublicJobs,
  getPublicData,
  parsePublicJobs,
  publicDataUrl,
  publicJobsUrl,
} from './publicData';

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

/**
 * `fetchPublicJobs` — the BUILD-TIME reader behind the server-rendered table.
 *
 * The regression it guards is not hypothetical. On 2026-10-24 the live site was
 * measured with `<table` count 0 on /loker and /public: the old build-time query
 * was answering `42501 permission denied`, the catch swallowed it, and the
 * fallback had never rendered once. The replacement reads the public endpoint
 * instead — so the things worth pinning are the ways a fetch can "succeed" and
 * still be useless.
 */
function stubResponse(opts: {
  ok?: boolean;
  status?: number;
  contentType?: string;
  body?: unknown;
}) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string) => {
    calls.push(String(url));
    return {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-type'
            ? (opts.contentType ?? 'application/json; charset=utf-8')
            : null,
      },
      json: async () => opts.body,
    } as unknown as Response;
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return { fn, calls };
}

const JOB = {
  code: 'J-001',
  pekerjaan: 'Kaigo',
  kategori: 'KAIGO',
  lokasi: 'Tokyo',
  gender: 'WANITA',
  kuota: '5',
  status: 'OPEN',
};

describe('publicJobsUrl', () => {
  it('menggabungkan origin absolut dengan URL payload yang sudah ada', () => {
    expect(publicJobsUrl('https://contoh.test')).toBe(`https://contoh.test${publicDataUrl()}`);
  });

  it('membuang slash akhir supaya tidak lahir `//.netlify`', () => {
    expect(publicJobsUrl('https://contoh.test///')).toBe(`https://contoh.test${publicDataUrl()}`);
  });
});

describe('parsePublicJobs', () => {
  it('memakai `code` — nama kunci di PAYLOAD, bukan `code_job` di PostgREST', () => {
    const rows = parsePublicJobs({ success: true, jobs: [JOB] });
    expect(rows).toHaveLength(1);
    expect(rows[0].code).toBe('J-001');
    expect(rows[0].pekerjaan).toBe('Kaigo');
  });

  it('tetap menerima `code_job` kalau payload kelak kembali ke nama kolom', () => {
    const { code: _drop, ...rest } = JOB;
    const rows = parsePublicJobs({ jobs: [{ ...rest, code_job: 'J-002' }] });
    expect(rows[0].code).toBe('J-002');
  });

  it('membatasi jumlah baris (tabel statis = cuplikan, bukan seluruh DB)', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ ...JOB, code: `J-${i}` }));
    expect(parsePublicJobs({ jobs: many }, 50)).toHaveLength(50);
    expect(parsePublicJobs({ jobs: many }, 0)).toHaveLength(0);
  });

  it('mengosongkan nilai null/undefined, bukan mencetak "null"', () => {
    const rows = parsePublicJobs({ jobs: [{ code: 'J-1', pekerjaan: null, kuota: undefined }] });
    expect(rows[0].pekerjaan).toBe('');
    expect(rows[0].kuota).toBe('');
  });

  it('payload tanpa array `jobs` menghasilkan daftar kosong', () => {
    expect(parsePublicJobs(null)).toEqual([]);
    expect(parsePublicJobs({})).toEqual([]);
    expect(parsePublicJobs({ jobs: 'bukan array' })).toEqual([]);
  });

  it('memakai `jobs`, bukan `dbJobs` — yang dirender island adalah `jobs`', () => {
    const rows = parsePublicJobs({
      jobs: [JOB],
      dbJobs: [JOB, { ...JOB, code: 'J-999' }],
    });
    expect(rows).toHaveLength(1);
  });
});

describe('fetchPublicJobs', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('tanpa origin tidak melakukan request sama sekali', async () => {
    const { fn } = stubResponse({ body: { jobs: [JOB] } });
    expect(await fetchPublicJobs(null)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it('200 JSON menghasilkan baris tabel', async () => {
    const { calls } = stubResponse({ body: { success: true, jobs: [JOB] } });
    const rows = await fetchPublicJobs('https://contoh.test');
    expect(rows).toHaveLength(1);
    expect(calls[0]).toBe(`https://contoh.test${publicDataUrl()}`);
  });

  it('200 tapi HTML (halaman 404 host yang di-rename) TIDAK dianggap data', async () => {
    // Ini kegagalan yang sudah pernah terjadi di repo ini: tiga target proxy
    // menunjuk host mati dan setiap panggilan API menerima HALAMAN 404 dengan
    // status 200. `res.ok` saja tidak cukup — karena itu ada cek content-type.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { fn } = stubResponse({ contentType: 'text/html; charset=utf-8', body: { jobs: [JOB] } });
    expect(await fetchPublicJobs('https://contoh.test')).toEqual([]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('text/html');
  });

  it('status non-2xx menghasilkan daftar kosong dan alasannya dicatat', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubResponse({ ok: false, status: 404, body: {} });
    expect(await fetchPublicJobs('https://contoh.test')).toEqual([]);
    expect(warn.mock.calls[0][0]).toContain('404');
  });

  it('kegagalan jaringan tidak melempar — build tetap jalan dengan tabel kosong', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    await expect(fetchPublicJobs('https://contoh.test')).resolves.toEqual([]);
  });
});
