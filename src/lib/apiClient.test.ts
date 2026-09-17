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
// Mocked above (vi.mock is hoisted), so this is the spy, not the real toast.
import { showToast } from '../components/Toast';

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

// ==========================================
// TESTS: the server's error message survives (2026-09-17)
//
// `if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + res.statusText)`
// threw away the only place the reason exists. The functions return
// `{ success:false, error:"Nomor ini belum terdaftar" }` WITH a real http status
// (non-negotiable #6: never 200 + success:false), so the status line is a
// category and the body is the explanation. Losing it is why 23 call sites kept
// their own `fetch` — the client was not a drop-in replacement for them, so
// converting them would have traded a specific message for a generic one.
//
// Both halves of the contract are pinned:
//   - a JSON error body is surfaced verbatim (`error`, then `message`)
//   - anything else falls back to the status line, because a CDN 502 is HTML and
//     a parse failure must not replace one error with a more confusing one
// ==========================================
describe('apiClient — server error message is surfaced, not paraphrased', () => {
  const opts = { requireAuth: false } as const;

  function nonOk(body: string, status = 400, type = 'application/json') {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status, headers: { 'Content-Type': type } })),
    );
  }

  it("uses the body's `error` field as the thrown message", async () => {
    state = { isLoggedIn: false, sessionToken: '' };
    nonOk(JSON.stringify({ success: false, error: 'Nomor ini belum terdaftar di sistem ASJ.' }));
    await expect(apiClient('cekDataPelamar', [{}], opts)).rejects.toThrow(
      'Nomor ini belum terdaftar di sistem ASJ.',
    );
  });

  it('falls back to `message` when there is no `error` field', async () => {
    state = { isLoggedIn: false, sessionToken: '' };
    nonOk(JSON.stringify({ message: 'Rate limit terlampaui' }), 429);
    await expect(apiClient('cekDataPelamar', [{}], opts)).rejects.toThrow('Rate limit terlampaui');
  });

  it('falls back to the status line when the body is not JSON (a CDN 502 is HTML)', async () => {
    state = { isLoggedIn: false, sessionToken: '' };
    nonOk('<html><body>Bad Gateway</body></html>', 502, 'text/html');
    await expect(apiClient('cekDataPelamar', [{}], opts)).rejects.toThrow('HTTP 502');
  });

  it('falls back to the status line when the error field is blank', async () => {
    state = { isLoggedIn: false, sessionToken: '' };
    nonOk(JSON.stringify({ success: false, error: '   ' }), 500);
    await expect(apiClient('cekDataPelamar', [{}], opts)).rejects.toThrow('HTTP 500');
  });
});

// ==========================================
// TESTS: `silent` — suppress the toast, never the throw (2026-09-17)
//
// Added so the remaining raw-fetch call sites can be converted without
// double-reporting. Several of them own their error presentation — a contextual
// "Gagal upload <jenis>." that says WHICH document failed, which the client
// cannot know. Converting those without this option would show two toasts for
// one failure, which is a regression dressed up as consistency.
//
// The contract is deliberately one-sided: `silent` removes the TOAST and
// nothing else. The call still throws, and the thrown message still carries the
// server's own text, so a caller that owns its UI loses no information.
// ==========================================
describe('apiClient — silent suppresses the toast, never the throw', () => {
  const fail = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: false, error: 'Gagal simpan berkas' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

  it('does not toast, and still throws the server message', async () => {
    state = { isLoggedIn: false, sessionToken: '' };
    fail();
    (showToast as unknown as ReturnType<typeof vi.fn>).mockClear();
    await expect(
      apiClient('simpanBerkasTahapan', [{}], { requireAuth: false, silent: true }),
    ).rejects.toThrow('Gagal simpan berkas');
    expect(showToast).not.toHaveBeenCalled();
  });

  it('still toasts by default — silent is opt-in, not a new default', async () => {
    state = { isLoggedIn: false, sessionToken: '' };
    fail();
    (showToast as unknown as ReturnType<typeof vi.fn>).mockClear();
    await expect(apiClient('simpanBerkasTahapan', [{}], { requireAuth: false })).rejects.toThrow(
      'Gagal simpan berkas',
    );
    expect(showToast).toHaveBeenCalled();
  });
});

// ==========================================
// TESTS: `force` — bypass the read cache, and REFRESH it (2026-09-17)
//
// `getAppData` is in CACHEABLE_READS, so converting a caller that must see fresh
// data after a WRITE would serve it a payload up to 30 s old and make the user's
// own action look like it did nothing. The concrete case: `fetchMailFromAPI` is
// called after marking a message read or deleted.
//
// The contract has two halves and both are asserted, because a "bypass" that
// forgot to write back would leave every other caller refetching:
//   1. a forced call does NOT return the cached value;
//   2. the fresh value REPLACES the cache entry, so the next ordinary call gets
//      the new data without a second request.
// ==========================================
describe('apiClient — force bypasses the read cache but refreshes it', () => {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

  it('returns the FRESH value, and the cache holds it afterwards', async () => {
    state = { isLoggedIn: true, sessionToken: 'tok-force' };

    // Prime the cache with 'first'.
    vi.stubGlobal('fetch', vi.fn(async () => json({ success: true, tag: 'first' })));
    const first = (await apiClient('getAppData', ['admin'], { onSessionInvalid: 'throw' })) as {
      tag: string;
    };
    expect(first.tag).toBe('first');

    // Same action+args, but forced: must hit the network and return 'second'.
    const fetchMock = vi.fn(async () => json({ success: true, tag: 'second' }));
    vi.stubGlobal('fetch', fetchMock);
    const forced = (await apiClient('getAppData', ['admin'], {
      onSessionInvalid: 'throw',
      force: true,
    })) as { tag: string };
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(forced.tag).toBe('second');

    // Half two: the cache was REFRESHED, not merely skipped — an ordinary call
    // now returns the new value without fetching again.
    const after = (await apiClient('getAppData', ['admin'], { onSessionInvalid: 'throw' })) as {
      tag: string;
    };
    expect(after.tag).toBe('second');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ==========================================
// TESTS: `sessionInvalid` arrives as HTTP 400, not 200 (2026-09-17)
//
// The dead-session verdict used to be read ONLY on the 2xx path. The backend
// reports an expired session as `{ success:false, sessionInvalid:true }`, and the
// function wrapper maps `success === false` to HTTP 400 — measured against
// production with a bogus token:
//
//   getDrafCvMaster      -> 400  success=false sessionInvalid=true
//   updateKandidatSuper  -> 400  success=false sessionInvalid=true
//
// so the 2xx branch was unreachable for a real expiry and `onSessionInvalid` —
// including its `'logout'` default — did nothing. These three cases pin the fix,
// and the third is the CONTROL that keeps it honest: a 400 that is an ordinary
// error must still surface the SERVER'S message and must not log anyone out.
// ==========================================
describe('apiClient — a dead session arrives as HTTP 400', () => {
  function respondWithStatus(body: unknown, status: number) {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
  }

  beforeEach(async () => {
    const mod = await import('../store/authReactive');
    (mod.logout as unknown as ReturnType<typeof vi.fn>).mockClear();
    (showToast as unknown as ReturnType<typeof vi.fn>).mockClear();
  });

  it('400 + sessionInvalid, default → pesan kanonik + logout', async () => {
    const { logout } = await import('../store/authReactive');
    state = { isLoggedIn: true, sessionToken: 'tok-dead' };
    respondWithStatus({ success: false, sessionInvalid: true, message: 'Sesi tidak valid' }, 400);

    await expect(apiClient('getAppData', ['admin'])).rejects.toThrow('Session expired');
    expect(logout).toHaveBeenCalled();
  });

  it("400 + sessionInvalid, 'throw' → pesan kanonik TANPA logout", async () => {
    const { logout } = await import('../store/authReactive');
    state = { isLoggedIn: true, sessionToken: 'tok-dead' };
    respondWithStatus({ success: false, sessionInvalid: true, message: 'Sesi tidak valid' }, 400);

    await expect(
      apiClient('getAppData', ['admin'], { onSessionInvalid: 'throw' }),
    ).rejects.toThrow('Session expired');
    expect(logout).not.toHaveBeenCalled();
  });

  it('KONTROL: 400 TANPA sessionInvalid tetap memunculkan pesan SERVER, tanpa logout', async () => {
    const { logout } = await import('../store/authReactive');
    state = { isLoggedIn: true, sessionToken: 'tok-live' };
    respondWithStatus({ success: false, error: 'Nomor ini belum terdaftar' }, 400);

    // Kalau ini ikut menjadi 'Session expired', cabang baru itu menelan error
    // biasa — dan itu lebih buruk daripada bug yang diperbaikinya.
    await expect(apiClient('getAppData', ['admin'])).rejects.toThrow('Nomor ini belum terdaftar');
    expect(logout).not.toHaveBeenCalled();
  });
});

// ==========================================
// TESTS: opsi `signal` — batal dari pemanggil vs timeout kita (2026-09-17)
//
// Komponen yang membatalkan permintaan saat unmount butuh ini, dan sebelum ada
// opsi `signal` ia harus mempertahankan `fetch`-nya sendiri.
//
// Yang dipaku: abort DARI PEMANGGIL adalah pembatalan, bukan kegagalan — ia
// melempar `AbortError` apa adanya dan TIDAK memunculkan toast. Timeout 20 detik
// milik klien tetap kegagalan dan tetap bicara. Menyamakan keduanya akan membuat
// setiap unmount memunculkan toast "timed out" palsu.
//
// Tes kedua adalah KONTROL-nya: `AbortError` tanpa `signal` dari pemanggil harus
// TETAP menjadi timeout + toast. Tanpa itu, tes pertama tidak membuktikan apa pun
// selain "klien menelan semua AbortError".
// ==========================================
describe('apiClient — opsi `signal`', () => {
  /** fetch yang benar-benar menghormati signal, seperti fetch asli. */
  function fetchThatHonoursSignal() {
    return vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const s = init.signal as AbortSignal;
          const bail = () =>
            reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
          if (s.aborted) return bail();
          s.addEventListener('abort', bail);
        }),
    );
  }

  beforeEach(() => {
    (showToast as unknown as ReturnType<typeof vi.fn>).mockClear();
  });

  it('abort dari pemanggil → AbortError dilempar apa adanya, TANPA toast', async () => {
    state = { isLoggedIn: true, sessionToken: 'tok-abort' };
    vi.stubGlobal('fetch', fetchThatHonoursSignal());

    const ac = new AbortController();
    const p = apiClient('getAppData', ['admin'], {
      onSessionInvalid: 'throw',
      signal: ac.signal,
    });
    ac.abort();

    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('KONTROL: AbortError TANPA signal pemanggil tetap timeout + toast', async () => {
    state = { isLoggedIn: true, sessionToken: 'tok-timeout' };
    // Menolak dengan AbortError walau tidak ada yang membatalkan: inilah bentuk
    // yang dihasilkan timer internal.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          Promise.reject(
            Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
          ),
      ),
    );

    await expect(apiClient('getAppData', ['admin'], { onSessionInvalid: 'throw' })).rejects.toThrow(
      /timed out after/,
    );
    expect(showToast).toHaveBeenCalled();
  });
});
