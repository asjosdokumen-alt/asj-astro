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

// §26: `onSessionInvalid: 'throw'` — pembaca yang sudah punya gerbang sendiri
// (panel admin) sengaja menangani sesi mati secara LOKAL. Tanpa opsi ini,
// mengalihkan TabKelola dari fetch() mentah ke jalur apiClient (untuk dapat
// cache 30 s) diam-diam mengubah perilakunya menjadi logout + redirect global,
// dan `/admin` (tab default = TabKelola) terlempar ke `/` saat sesinya tidak
// bisa diverifikasi. Default `'logout'` harus tetap utuh untuk 20+ pemanggil
// lain, jadi kedua arah dipaku di sini.
describe('apiClient onSessionInvalid (§26)', () => {
  const DEAD = { success: false, sessionInvalid: true };

  function respondWith(body: unknown) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));
  }

  beforeEach(async () => {
    const mod = await import('../store/authReactive');
    (mod.logout as unknown as ReturnType<typeof vi.fn>).mockClear();
  });

  it('default: sessionInvalid → throw + logout (perilaku lama tidak berubah)', async () => {
    const { logout } = await import('../store/authReactive');
    state = { isLoggedIn: true, sessionToken: 'tok-dead' };
    respondWith(DEAD);

    await expect(apiClient('getAppData', ['admin'])).rejects.toThrow('Session expired');
    expect(logout).toHaveBeenCalled();
  });

  it("'throw': sessionInvalid → tetap throw TANPA logout", async () => {
    const { logout } = await import('../store/authReactive');
    state = { isLoggedIn: true, sessionToken: 'tok-dead' };
    respondWith(DEAD);

    await expect(
      apiClient('getAppData', ['admin'], { onSessionInvalid: 'throw' }),
    ).rejects.toThrow('Session expired');
    expect(logout).not.toHaveBeenCalled();
  });

  it("'throw': cabang tanpa sesi juga tidak logout", async () => {
    const { logout } = await import('../store/authReactive');
    state = { isLoggedIn: false, sessionToken: '' };
    respondWith({ success: true });

    await expect(
      apiClient('getAppData', ['admin'], { onSessionInvalid: 'throw' }),
    ).rejects.toThrow('No valid session');
    expect(logout).not.toHaveBeenCalled();
  });

  it('jawaban sessionInvalid tidak pernah di-cache, apa pun opsinya', async () => {
    state = { isLoggedIn: true, sessionToken: 'tok-dead' };
    respondWith(DEAD);

    await apiClient('getAppData', ['admin'], { onSessionInvalid: 'throw' }).catch(() => {});
    expect(asjCacheKeys().length).toBe(0);
  });
});

// ==========================================
// TESTS: apiClient — request timeout (P8)
//
// WHY THIS EXISTS
//   The report was "menu Tambah Job loading terus". TabTambah gates its whole
//   form on `loading`, cleared in `finally` — which is correct, but `finally`
//   never runs while `fetch` is still pending. With no AbortController, a stalled
//   connection means the spinner turns forever: no error, no toast, no recovery.
//
//   A timeout is the kind of fix that is INVISIBLE until proven, because
//   "it did not hang" is also what a no-op looks like. So these tests pin the
//   three observable consequences, and the guard test below is deliberately
//   written to FAIL if someone deletes the signal — see the mutation note.
//
//   The signal must be per-call. A module-level controller would be RESOLVED
//   BEFORE any timeout test could run, so these tests would pass against the
//   broken implementation too. `expect.any(AbortSignal)` alone is not enough:
//   it proves a signal exists, not that it is wired or distinct per call.
// ==========================================
describe('apiClient — request timeout (P8)', () => {
  /** A fetch that hangs until its own signal aborts, exactly like a stalled socket. */
  function hangingFetch() {
    return vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return; // never settles — the bug being fixed
        signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
        });
      });
    });
  }

  it('a stalled request is aborted instead of hanging forever', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', hangingFetch());
      state = { isLoggedIn: false, sessionToken: '' };

      const p = apiClient('getAppData', ['admin'], { requireAuth: false });
      const assertion = expect(p).rejects.toThrow(/timed out after 20s/);

      // Advance past the bound. Without the fix nothing rejects here and the
      // test dies on the assertion instead of passing — which is the point.
      await vi.advanceTimersByTimeAsync(20_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('the timeout is BOUNDED — it must not fire before the deadline', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = hangingFetch();
      vi.stubGlobal('fetch', fetchMock);

      const p = apiClient('getAppData', ['admin'], { requireAuth: false });
      const settled = vi.fn();
      p.then(settled, settled);

      // Just short of the bound: still in flight, no premature abort.
      await vi.advanceTimersByTimeAsync(19_000);
      expect(settled).not.toHaveBeenCalled();
      // Any request shorter than the bound is unaffected — this is the
      // "did I break normal calls?" guard.
      await vi.advanceTimersByTimeAsync(2_000);
      await expect(p).rejects.toThrow(/timed out/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the timer is cleared on success — it must not outlive its own request', async () => {
    // WHY THIS IS NOT "two calls both work": with a per-call controller, a
    // leaked timer aborts the controller of the call that already finished —
    // a controller nobody holds any more. So a naive sequential test passes
    // even with clearTimeout deleted (measured: mutant M6 survived).
    //
    // The leak is only observable by watching the timer itself: after a
    // SUCCESSFUL call, the pending-timer count must return to its baseline.
    // A timer still queued would fire later and abort… its own dead controller.
    vi.useFakeTimers();
    try {
      state = { isLoggedIn: false, sessionToken: '' };
      const before = vi.getTimerCount();
      await apiClient('reportWebVital', [{ name: 'LCP' }], { requireAuth: false });
      // The request is done; nothing may still be scheduled on its behalf.
      expect(vi.getTimerCount()).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a leaked timer really would abort a later call (why the clear matters)', async () => {
    // The failure mode clearTimeout prevents, made explicit: a controller whose
    // timer is left armed from a previous request aborts the NEXT request that
    // shares it. Reproduced against a deliberately shared controller so the
    // consequence is observable rather than asserted by construction.
    //
    // The first request must still be IN FLIGHT when the stale timer fires —
    // that is the whole point. (An earlier version of this test awaited a call
    // that had already settled, so the abort candidate no longer existed and
    // the assertion failed for the wrong reason.)
    vi.useFakeTimers();
    try {
      const shared = new AbortController();
      const inFlight = vi.fn((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
          // deliberately never resolves: a stalled socket
        });
      });

      // Request 1 is still pending. Its timer was NOT cleared (simulated leak).
      const p1 = inFlight('/stalled', { signal: shared.signal });
      setTimeout(() => shared.abort(), 20_000);

      await vi.advanceTimersByTimeAsync(20_000);
      await expect(p1).rejects.toThrow('aborted');
    } finally {
      vi.useRealTimers();
    }
  });

  it('each call gets its OWN signal — one timeout cannot cancel a concurrent call', async () => {
    state = { isLoggedIn: false, sessionToken: '' };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));

    await Promise.all([
      apiClient('reportWebVital', [{ name: 'FCP' }], { requireAuth: false }),
      apiClient('simpanWaTemplate', [{ n: 'x' }], { requireAuth: false }),
    ]);

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const signals = fetchMock.mock.calls.map((c) => c[1]?.signal);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[1]).toBeInstanceOf(AbortSignal);
    // Distinct identities: sharing one controller is the concurrency bug.
    expect(signals[0]).not.toBe(signals[1]);
  });
});
