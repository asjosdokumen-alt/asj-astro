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
 * Core fetch wrapper — routes actions to surface-specific endpoints
 */
export async function apiClient<T = ApiResponse>(
  action: string,
  args: unknown[] = [],
  options: { requireAuth?: boolean; onSessionInvalid?: 'logout' | 'throw' } = {}
): Promise<T> {
  const { requireAuth = true, onSessionInvalid = 'logout' } = options;

  // PR3: identity flip since the last call (logout/login) → clear stale reads.
  invalidateOnIdentityFlip();

  // SWR-lite: return cached result for read-only actions
  if (CACHEABLE_READS.has(action)) {
    const cached = getCached(action, args);
    if (cached) return cached as T;
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
      throw new Error('HTTP ' + res.status + ': ' + res.statusText);
    }

    const data: ApiResponse<T> = await res.json();

    if (data.sessionInvalid) {
      // `onSessionInvalid: 'throw'` — pembaca yang sudah punya gerbang sendiri
      // (mis. panel admin) menangani sesi mati secara lokal; hanya `throw` yang
      // terjadi, tanpa toast/logout/redirect global. Jawaban sessionInvalid juga
      // TIDAK di-cache (throw terjadi sebelum setCache) — memang benar begitu.
      if (onSessionInvalid === 'logout') {
        showToast('Sesi expired. Silakan login kembali.', 'error');
        logout();
        window.location.href = '/';
      }
      throw new Error('Session expired');
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
      const msg = `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s (${action})`;
      showToast('Network error: ' + msg, 'error');
      throw new Error(msg);
    }
    const message = err instanceof Error ? err.message : String(err);
    if (message === 'No valid session' || message === 'Session expired') throw err;
    showToast('Network error: ' + (message || 'Unknown'), 'error');
    throw err;
  } finally {
    // Always clear, on every path — success, HTTP error, abort and rethrow.
    // Without this the timer outlives the request and can abort a LATER call
    // that reused the module-level controller identity by accident.
    clearTimeout(timeoutId);
  }
}

/**
 * Convenience methods for common patterns
 */
export const api = {
  call: apiClient,
  get(action: string, args: unknown[] = []) {
    return apiClient(action, args, { requireAuth: false });
  },
  secure(action: string, args: unknown[] = [], options: { onSessionInvalid?: 'logout' | 'throw' } = {}) {
    return apiClient(action, args, { requireAuth: true, ...options });
  },
};

export default api;
