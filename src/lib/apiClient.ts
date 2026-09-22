/**
 * apiClient.ts — Centralized API wrapper with auto-inject session token
 *
 * Routes actions to surface-specific Netlify functions via apiEndpoint.ts.
 * Unknown actions fall back to bridge-links (catch-all).
 *
 * Surface-specific routing enables concurrent scaling:
 * auth requests don't block AI processing, public reads don't contend with writes.
 */
import { authStore, logout } from '../store/authReactive';
import { supabase, isSupabaseConfigured } from './supabase';
import { showToast } from '../components/Toast';
import { getEndpoint } from './apiEndpoint';

/** SWR-lite cache — sessionStorage with TTL (matching legacy api-client.ts) */
const READ_CACHE_TTL_MS = 30 * 1000; // 30 seconds freshness
const CACHEABLE_READS = new Set([
  'getAppData', 'cekDataPelamar', 'getMasterDataByWa',
  'getDrafCvMaster', 'getShareData', 'getJobsPublic',
  'getJadwalList', 'getConfigDropdown', 'getWaTemplates',
  'getAgendaAdmin', 'getApplicantDetail',
]);

// PR3 (playbook Day 1–30): cache keys must carry session identity, not just
// (action, args) — sessionStorage survives in-tab account switches, so a
// cached kandidat/admin read used to be served to the next user of the same
// tab. The tag is a short hash OF the token (never the token itself); the
// whole cache is also dropped on every login/logout flip (subscribe below).
function tokenTag(): string {
  try {
    const t = authStore.get().sessionToken;
    if (!t) return 'anon';
    let h = 0x811c9dc5; // FNV-1a 32-bit
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return 's' + h.toString(36) + (t.length % 97);
  } catch {
    return 'anon';
  }
}

function getCacheKey(action: string, args: unknown[]): string {
  return 'asj_cache_' + tokenTag() + '_' + action + ':' + JSON.stringify(args || []);
}
function getCached(action: string, args: unknown[]): unknown | null {
  try {
    const hitStr = sessionStorage.getItem(getCacheKey(action, args));
    if (hitStr) {
      const hit = JSON.parse(hitStr);
      if (Date.now() - hit.at < READ_CACHE_TTL_MS) return hit.value;
      sessionStorage.removeItem(getCacheKey(action, args));
    }
  } catch {}
  return null;
}
function setCache(action: string, args: unknown[], value: unknown): void {
  try {
    sessionStorage.setItem(getCacheKey(action, args), JSON.stringify({ at: Date.now(), value }));
  } catch {}
}
function invalidateCache(action?: string): void {
  try {
    const prefix = action ? 'asj_cache_' + tokenTag() + '_' + action + ':' : 'asj_cache_';
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(prefix)) sessionStorage.removeItem(key);
    }
  } catch {}
}

// PR3: drop the whole read cache when the session identity flips (logout OR
// login). Checked lazily on each apiClient call instead of subscribing to
// authStore — the only reader of this cache is apiClient itself, so
// invalidating at call time is observably identical and avoids depending on
// store subscription shape (several test double stores only expose get/set).
let lastSeenIdentity: boolean | null = null;
function invalidateOnIdentityFlip(): void {
  try {
    const identity = authStore.get().isLoggedIn;
    if (lastSeenIdentity !== null && identity !== lastSeenIdentity) {
      invalidateCache();
    }
    lastSeenIdentity = identity;
  } catch { /* store unavailable — nothing to invalidate */ }
}

const FALLBACK_ENDPOINT = '/.netlify/functions/bridge-links';

// P7 fix: Cache Supabase token to avoid extra round trip on every API call.
let cachedToken: string | null = null;
let tokenCachedAt = 0;
const TOKEN_CACHE_TTL_MS = 60_000; // 60s — shorter than session lifetime

// P6 fix: Track write generation to detect stale-cache race.
// When a non-cacheable action runs, bump the generation. A stale read
// that finishes after the write will see the bumped generation and
// refuse to cache its now-stale result.
let writeGeneration = 0;

// P8 fix: upper bound on every request. See the comment at the fetch below —
// without this, a stalled connection held the caller's spinner forever.
const REQUEST_TIMEOUT_MS = 20_000;

interface ApiResponse<T = any> {
  success: boolean;
  sessionInvalid?: boolean;
  error?: string;
  message?: string;
  data?: T;
  [key: string]: unknown;
}

/**
 * The Error this client throws for a non-2xx answer — the server's own verdict,
 * carried alongside its message.
 *
 * `message` is the part every existing caller already used, and it is unchanged.
 * The extra fields exist because a message cannot express "the AI provider is
 * down": that arrives as `code: 'AI_UNAVAILABLE'` on a 503, and three surfaces
 * (AiCvForm, SiswaBaruForm, AdminAiCopilot) render AiUnavailableBanner from it.
 * While the code was dropped here, those callers had no way to see it except by
 * keeping their own `fetch` — which is exactly why they never moved.
 */
export interface ApiError extends Error {
  /** HTTP status the server answered with. */
  status?: number;
  /** Server error code, e.g. `AI_UNAVAILABLE`, `VALIDATION_FAILED`. */
  code?: string;
  /** Seconds the server asked the caller to wait, when it said so. */
  retryAfter?: number;
}

function apiError(
  message: string,
  extra: { status: number; code?: string; retryAfter?: number },
): ApiError {
  const err = new Error(message) as ApiError;
  err.status = extra.status;
  if (extra.code) err.code = extra.code;
  if (extra.retryAfter !== undefined) err.retryAfter = extra.retryAfter;
  return err;
}

/**
 * Get the freshest session token — checks Supabase first if configured.
 */
async function getFreshToken(): Promise<string> {
  // P7 fix: Return cached token if still fresh, avoiding a round trip per request.
  const now = Date.now();
  if (cachedToken && now - tokenCachedAt < TOKEN_CACHE_TTL_MS) return cachedToken;

  if (isSupabaseConfigured()) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        cachedToken = session.access_token;
        tokenCachedAt = now;
        return cachedToken;
      }
    } catch { /* fall through */ }
  }
  return authStore.get().sessionToken;
}

/**
 * One place for the dead-session verdict, so the two call sites cannot drift.
 *
 * A session that has expired is reported by the backend as
 * `{ success:false, sessionInvalid:true, message:'Sesi … tidak valid' }`, and the
 * function wrapper maps `success === false` to **HTTP 400**
 * (netlify-wrapper.ts). Measured against production on 2026-09-17: both
 * `getDrafCvMaster` and `updateKandidatSuper` answer **400 + sessionInvalid** with
 * a bogus token. The `success:true` variant exists too (catalog/service.ts) and
 * arrives as 200.
 *
 * So the signal has to be honoured on BOTH paths. Until this was added, the
 * check lived only on the 2xx path, which meant `onSessionInvalid` — including
 * its `'logout'` default — never fired for a real expiry: the user stayed
 * "logged in" holding a dead token and simply saw an error.
 */
function sessionInvalidVerdict(onSessionInvalid: 'logout' | 'throw'): never {
  if (onSessionInvalid === 'logout') {
    showToast('Sesi expired. Silakan login kembali.', 'error');
    logout();
    window.location.href = '/';
  }
  throw new Error('Session expired');
}

/**
 * Core fetch wrapper — routes actions to surface-specific endpoints
 */
export async function apiClient<T = ApiResponse>(
  action: string,
  args: unknown[] = [],
  options: {
    requireAuth?: boolean;
    onSessionInvalid?: 'logout' | 'throw';
    /**
     * Suppress the client's own error toast.
     *
     * For callers that OWN their error presentation — a contextual message
     * ("Gagal upload <jenis>."), a field-level error, a retry affordance. The
     * client still THROWS, so the caller catches and can read `err.message`,
     * which now carries the server's own message. Without this, converting such
     * a caller means the user sees TWO toasts for ONE failure: the client's and
     * the caller's.
     *
     * Deliberately narrow: it affects only the network/HTTP error toast below.
     * A logout on `onSessionInvalid` is a global action, not this caller's
     * message to own, so it still reports.
     */
    silent?: boolean;
    /**
     * Skip the read cache for THIS call, and refresh it with the result.
     *
     * Needed by callers that must see fresh data even though their action is in
     * CACHEABLE_READS — the case that forced this option: `fetchMailFromAPI` is
     * called AFTER marking a message read or deleted, and a 30 s stale payload
     * there makes the admin's own write look like it did nothing.
     *
     * It is a bypass, not an invalidation: the fresh value is still written to
     * the cache, so the next ordinary caller benefits instead of refetching.
     */
    force?: boolean;
    /**
     * The caller's own cancellation, combined with this call's timeout.
     *
     * A component that aborts on unmount has to be able to cancel an in-flight
     * request. Until this option existed it had to keep its own `fetch` to do so,
     * and `CandidateProfileModal` was the last site held open on purpose rather
     * than forgotten.
     *
     * The distinction that matters: an abort from HERE is not a failure. It is a
     * cancellation the caller asked for, so it rethrows an `AbortError` and never
     * toasts. Our own timeout IS a failure and still says so. Conflating the two
     * would make every unmount pop a spurious "timed out" toast.
     *
     * Combined with an `abort` listener rather than `AbortSignal.any()`, which is
     * too new for the older Android browsers this app still serves.
     */
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const {
    requireAuth = true,
    onSessionInvalid = 'logout',
    silent = false,
    force = false,
    signal,
  } = options;

  // PR3: identity flip since the last call (logout/login) → clear stale reads.
  invalidateOnIdentityFlip();

  // SWR-lite: return cached result for read-only actions
  if (CACHEABLE_READS.has(action)) {
    // `force` skips the READ only. The fresh value is still written below, so a
    // forced call REFRESHES the cache for everyone instead of bypassing it —
    // which is what a post-write refresh actually wants.
    if (!force) {
      const cached = getCached(action, args);
      if (cached) return cached as T;
    }
  } else {
    // P5 fix: write actions never match cache keys (only CACHEABLE_READS are
    // cached), so clear the whole asj_cache_ prefix — targeted invalidation
    // was a silent no-op that left stale reads for 30s TTL.
    invalidateCache();
    // P6 fix: Bump generation so any in-flight reads skip caching stale data.
    writeGeneration++;
  }

  // P6 fix: Capture generation at request start for stale-cache detection.
  const genAtStart = writeGeneration;

  const { isLoggedIn } = authStore.get();
  const sessionToken = await getFreshToken();

  if (requireAuth && (!isLoggedIn || !sessionToken)) {
    if (onSessionInvalid === 'logout') {
      showToast('Sesi tidak valid. Silakan login kembali.', 'error');
      logout();
      window.location.href = '/';
    }
    throw new Error('No valid session');
  }

  // Route to surface-specific endpoint
  const endpoint = getEndpoint(action);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionToken) headers['Authorization'] = 'Bearer ' + sessionToken;

  const body = JSON.stringify({ action, payload: args, sessionToken });

  // A fresh controller per call: a module-level one would be shared across
  // concurrent requests, so one timeout would abort every other in-flight call.
  const controller = new AbortController();

  // The caller's signal cancels the request too. Remember WHY we aborted, so the
  // catch below can tell a cancellation apart from our own timeout — see the
  // note on the `signal` option.
  let callerAborted = false;
  const onCallerAbort = () => {
    callerAborted = true;
    controller.abort();
  };
  if (signal) {
    if (signal.aborted) onCallerAbort();
    else signal.addEventListener('abort', onCallerAbort, { once: true });
  }

  // P8 fix — the request had NO upper bound, so a stalled connection left the
  // caller's spinner turning forever with no error and no way out. That is the
  // "menu Tambah Job loading terus" report: TabTambah gates its whole form on
  // `loading`, which only clears in `finally` — correct, but `finally` never
  // runs while `fetch` is still pending.
  //
  // The legacy api-client.ts this was ported from had the same hole (three raw
  // `fetch` calls, zero AbortController), so this is inherited, not introduced.
  // Absence of a timer is invisible in code review precisely because it is an
  // absence — which is why it survived the port.
  //
  // 20s is chosen against real behaviour, not taste: the measured p100 for
  // getAppData is ~1s, and Netlify Functions default to a 10s synchronous
  // limit, so a request still open at 20s is dead, not slow.
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const opts = (signal: AbortSignal) => ({ method: 'POST', headers, body, signal });

  try {
    let res = await fetch(endpoint, opts(controller.signal));

    // If surface endpoint returns 404, retry with bridge-links fallback
    if (res.status === 404 && endpoint !== FALLBACK_ENDPOINT) {
      res = await fetch(FALLBACK_ENDPOINT, opts(controller.signal));
    }

    if (!res.ok) {
      // SURFACE THE SERVER'S OWN MESSAGE, don't paraphrase the status line.
      //
      // This used to throw `HTTP 400: Bad Request` and nothing else, which threw
      // away the reason the caller actually needs. The functions return errors
      // as `{ success:false, error:"Nomor ini belum terdaftar" }` with a REAL
      // http status (non-negotiable #6: never 200 + success:false), so the body
      // is the only place that message exists — the status line is a category,
      // not an explanation. Every caller that wanted the real message had to
      // keep its own `fetch` to get it, which is how 23 call sites ended up
      // outside this client in the first place.
      //
      // Best-effort parse on purpose: a non-JSON body is normal here (a CDN 502
      // is HTML), and a parse failure must not replace one error with a
      // different, more confusing one.
      let detail = '';
      let sessionInvalid = false;
      let code = '';
      let retryAfter: number | undefined;
      try {
        const body = (await res.json()) as {
          error?: unknown;
          message?: unknown;
          sessionInvalid?: unknown;
          code?: unknown;
          retryAfter?: unknown;
        } | null;
        const raw = body && (body.error ?? body.message);
        if (typeof raw === 'string' && raw.trim()) detail = raw.trim();
        sessionInvalid = body?.sessionInvalid === true;
        // The code rides alongside the message, not instead of it. A caller that
        // only wants text keeps reading `.message` and sees no change.
        if (typeof body?.code === 'string' && body.code.trim()) code = body.code.trim();
        if (typeof body?.retryAfter === 'number') retryAfter = body.retryAfter;
      } catch {
        /* not JSON — fall through to the status line */
      }
      // THE DEAD SESSION ARRIVES HERE, not on the 2xx path — see
      // sessionInvalidVerdict() above for the measured proof. Checking only the
      // 2xx path made `onSessionInvalid` a no-op in practice.
      if (sessionInvalid) sessionInvalidVerdict(onSessionInvalid);
      throw apiError(detail || `HTTP ${res.status}: ${res.statusText}`, {
        status: res.status,
        code,
        retryAfter,
      });
    }

    const data: ApiResponse<T> = await res.json();

    if (data.sessionInvalid) {
      // `onSessionInvalid: 'throw'` — pembaca yang sudah punya gerbang sendiri
      // (mis. panel admin) menangani sesi mati secara lokal; hanya `throw` yang
      // terjadi, tanpa toast/logout/redirect global. Jawaban sessionInvalid juga
      // TIDAK di-cache (throw terjadi sebelum setCache) — memang benar begitu.
      //
      // Jalur ini untuk varian `success:true, sessionInvalid:true`
      // (catalog/service.ts), yang memang datang sebagai 200.
      sessionInvalidVerdict(onSessionInvalid);
    }

    if (CACHEABLE_READS.has(action)) {
      // P6 fix: Only cache if no write happened during the fetch.
      if (genAtStart === writeGeneration) {
        setCache(action, args, data);
      }
    }
    return data as T;
  } catch (err: unknown) {
    // An abort surfaces as a DOMException named 'AbortError' with a message the
    // user cannot act on ("The operation was aborted"). Name the real cause so
    // the toast says what happened rather than leaking a browser string.
    if (err instanceof Error && err.name === 'AbortError') {
      // Two very different causes, and conflating them is a real bug: a component
      // that aborts on unmount would pop "timed out". A caller-initiated abort is
      // a cancellation, so it is rethrown as-is for the caller to ignore.
      if (callerAborted) throw err;
      const msg = `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s (${action})`;
      if (!silent) showToast('Network error: ' + msg, 'error');
      throw new Error(msg);
    }
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'No valid session' || message === 'Session expired') throw err;
    // `silent` callers own their error UI; the throw below still carries the
    // server's message (see the !res.ok branch above), so nothing is lost.
    if (!silent) showToast('Network error: ' + (message || 'Unknown'), 'error');
    throw err;
  } finally {
    // Always clear, on every path — success, HTTP error, abort and rethrow.
    // Without this the timer outlives the request and can abort a LATER call
    // that reused the module-level controller identity by accident.
    clearTimeout(timeoutId);
    // The caller's signal outlives this call (it belongs to a component), so the
    // listener must not — otherwise every request leaves one behind on a signal
    // that a long-lived effect keeps reusing.
    if (signal) signal.removeEventListener('abort', onCallerAbort);
  }
}

/**
 * Convenience methods for common patterns
 */
export const api = {
  call: apiClient,
  get(
    action: string,
    args: unknown[] = [],
    options: { silent?: boolean; force?: boolean; signal?: AbortSignal } = {},
  ) {
    return apiClient(action, args, { requireAuth: false, ...options });
  },
  secure(
    action: string,
    args: unknown[] = [],
    options: {
      onSessionInvalid?: 'logout' | 'throw';
      silent?: boolean;
      force?: boolean;
      signal?: AbortSignal;
    } = {},
  ) {
    return apiClient(action, args, { requireAuth: true, ...options });
  },
};

export default api;
