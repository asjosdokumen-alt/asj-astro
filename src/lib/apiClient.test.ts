// ==========================================
// TESTS: apiClient — cache keyed by session identity (playbook Day 1–30 PR3)
//
// The SWR-lite read cache used to be keyed by (action, args) only. sessionStorage
// survives an in-tab account switch, so a cached getAppData('kandidat')/'admin'
// payload (PII, candidate rows) was served to whoever logged in next in the
// same tab. Invariant pinned here:
//   1. Same action+args + different session → separate cache entries (a
//      logged-out call never serves a logged-in payload and vice versa).
//   2. Login/logout flip clears the whole asj_cache_ set.
//   3. Cache keys carry a tag OF the token, never the token itself.
// ==========================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type AuthState = { isLoggedIn?: boolean; sessionToken?: string };
let state: AuthState = { isLoggedIn: false, sessionToken: '' };

vi.mock('../store/authReactive', () => ({
  authStore: {
    get: () => state,
    set: () => {},
    listen: () => () => {},
  },
  logout: vi.fn(),
}));
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
  isSupabaseConfigured: () => false,
}));
vi.mock('../components/Toast', () => ({ showToast: vi.fn() }));

import { apiClient } from './apiClient';

const RESP = { success: true, jobs: [{ code: 'TG1', nama: 'KANDIDAT PII' }] };

function asjCacheKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (k && k.startsWith('asj_cache_')) keys.push(k);
  }
  return keys;
}

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(RESP), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  state = { isLoggedIn: false, sessionToken: '' };
});

describe('apiClient cache — session identity keying (PR3)', () => {
  it('same action+args, different session → fetch kedua TIDAK dilayani cache sesi lama', async () => {
    state = { isLoggedIn: true, sessionToken: 'tok-kandidat-A' };
    await apiClient('getAppData', ['kandidat'], { requireAuth: false });
    expect(fetch).toHaveBeenCalledTimes(1);

    // Cache hit untuk sesi yang sama
    await apiClient('getAppData', ['kandidat'], { requireAuth: false });
    expect(fetch).toHaveBeenCalledTimes(1);

    // Sesi lain (user B login di tab yang sama) → cache TIDAK dipakai
    state = { isLoggedIn: true, sessionToken: 'tok-kandidat-B' };
    await apiClient('getAppData', ['kandidat'], { requireAuth: false });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('logout → cache dikosongkan; anon tidak melihat payload sesi lama', async () => {
    state = { isLoggedIn: true, sessionToken: 'tok-admin-1' };
    await apiClient('getAppData', ['admin'], { requireAuth: false });
    expect(asjCacheKeys().length).toBeGreaterThan(0);

    state = { isLoggedIn: false, sessionToken: '' };
    await apiClient('getAppData', ['admin'], { requireAuth: false });
    expect(fetch).toHaveBeenCalledTimes(2); // bukan cache hit

    const anonKeys = asjCacheKeys();
    expect(anonKeys.every((k) => !k.includes('tok-'))).toBe(true);
  });

  it('login flip juga mengosongkan cache anon', async () => {
    await apiClient('getJobsPublic', [], { requireAuth: false });
    expect(asjCacheKeys().length).toBe(1);

    state = { isLoggedIn: true, sessionToken: 'tok-baru' };
    await apiClient('getJobsPublic', [], { requireAuth: false });
    expect(fetch).toHaveBeenCalledTimes(2); // anon cache tidak terpakai
    expect(asjCacheKeys().length).toBe(1); // satu entri baru, milik sesi baru
  });

  it('kunci cache memuat tag dari token — bukan token mentah', async () => {
    state = { isLoggedIn: true, sessionToken: 'SECRET-SESSION-TOKEN-VALUE' };
    await apiClient('getAppData', ['kandidat'], { requireAuth: false });
    const keys = asjCacheKeys();
    expect(keys.length).toBe(1);
    expect(keys[0]).not.toContain('SECRET-SESSION-TOKEN-VALUE');
    // tag beda token → beda kunci
    state = { isLoggedIn: true, sessionToken: 'SECRET-SESSION-TOKEN-OTHER' };
    await apiClient('getAppData', ['kandidat'], { requireAuth: false });
    expect(asjCacheKeys().length).toBe(2);
  });

  it('aksi non-cacheable tetap mengosongkan cache (P5 regression guard)', async () => {
    state = { isLoggedIn: true, sessionToken: 'tok-x' };
    await apiClient('getAppData', ['kandidat'], { requireAuth: false });
    expect(asjCacheKeys().length).toBe(1);

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));
    await apiClient('submitApply', ['x'], { requireAuth: false });
    expect(asjCacheKeys().length).toBe(0);
  });
});
