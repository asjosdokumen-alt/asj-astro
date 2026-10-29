/**
 * authReactive.ts — Reactive Auth (Nanostores Persistent)
 *
 * Uses @nanostores/persistent for automatic localStorage sync.
 * Solves: UI kaku, cross-tab sync, XSS mitigation.
 *
 * Pattern: persistentAtom auto-reads/writes localStorage.
 * No manual localStorage.getItem/setItem needed.
 */
import { persistentAtom } from '@nanostores/persistent';
import { requestNotificationPermission } from '../lib/fcm';
import { getEndpoint } from '../lib/apiEndpoint';

export type UserRole = 'guest' | 'admin' | 'kandidat';

export interface AuthState {
  role: UserRole;
  name: string;
  wa: string;
  sessionToken: string;
  refreshToken: string;
  isLoggedIn: boolean;
  lastChecked: number;
}

const DEFAULT_STATE: AuthState = {
  role: 'guest',
  name: '',
  wa: '',
  sessionToken: '',
  refreshToken: '',
  isLoggedIn: false,
  lastChecked: 0,
};

const SESSION_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

/** Persistent auth store — auto-syncs with localStorage('asj_auth') */
// P21 fix: Wrap decode in try/catch to handle corrupt localStorage values.
// Without this, a hand-edited or corrupted value crashes the app at module init.
export const authStore = persistentAtom<AuthState>('asj_auth', DEFAULT_STATE, {
  encode: JSON.stringify,
  decode: (v: string) => {
    try { return JSON.parse(v) as AuthState; } catch { return DEFAULT_STATE; }
  },
});

let fcmRefreshDone = false;

/**
 * Registrasi FCM yang TIDAK menelan sebab kegagalannya.
 *
 * `requestNotificationPermission()` mengembalikan alasan yang sudah diketik
 * (`'no-token'`, `'no-sw'`, `'permission-denied'`, …) DAN mencatat setiap jalur
 * gagal di `lib/fcm.ts` — termasuk pesan VAPID yang bisa ditindaklanjuti saat
 * `PUBLIC_FIREBASE_VAPID_KEY` kosong. Ketiga pemanggil di berkas ini dulu
 * memakai `.catch(() => {})` DAN membuang nilai kembaliannya, jadi satu-satunya
 * cara mengetahui registrasi gagal adalah membuka DevTools di perangkat
 * pengguna. Itu yang diperbaiki di sini: hasilnya tidak lagi dibuang.
 *
 * Terukur 2026-10-21: token terakhir di `fcm_tokens` berasal dari 2026-10-15,
 * sementara admin memakai aplikasi setiap hari — gejalanya persis "notifikasi
 * tidak pernah muncul". Penyebabnya `PUBLIC_FIREBASE_VAPID_KEY` kosong.
 *
 * ⚠ JANGAN menambah `console.warn` di sini. Versi pertama fix ini melakukannya
 * (satu untuk `result`, satu di `.catch`) dan itu SALAH dua kali:
 *   1. `requestNotificationPermission` TIDAK PERNAH menolak — ia menangkap
 *      sendiri di `lib/fcm.ts` dan mengembalikan `'error'`, jadi `.catch` di
 *      sini adalah kode mati;
 *   2. setiap kode hasil sudah dicetak di `lib/fcm.ts` sebagai kalimat, bukan
 *      kode. Log kembar di pemanggil hanya menambah derau, dan `lint-ratchet`
 *      menolaknya (`noConsole` di berkas yang tadinya bersih).
 */
function registerFcm(userId: string): void {
  void requestNotificationPermission(userId);
}

/**
 * Registrasi ulang token FCM saat aplikasi DIBUKA, bukan hanya saat login.
 *
 * KENAPA (2026-10-19): `requestNotificationPermission()` hanya dipanggil dari
 * `loginAsAdmin`/`loginAsKandidat`. Sesi disimpan di localStorage, jadi admin
 * yang tidak pernah logout TIDAK PERNAH mendaftarkan ulang tokennya. Kalau
 * langganan push hilang (site data dibersihkan, aplikasi dipasang ulang, token
 * dirotasi), perangkat itu hilang dari `fcm_tokens` SELAMANYA sampai ia logout.
 * Itu persis yang terukur: token admin terakhir terdaftar 2026-10-09, padahal
 * aplikasinya dipakai terus.
 *
 * Aman dipanggil di boot karena hanya jalan kalau izin SUDAH `granted` —
 * `Notification.requestPermission()` di luar gestur pengguna akan diabaikan
 * (atau memunculkan prompt senyap), jadi kita tidak memancing prompt di sini.
 * Dijalankan sekali per pemuatan halaman.
 */
export function refreshFcmRegistrationOnce(): void {
  if (fcmRefreshDone) return;
  fcmRefreshDone = true;
  const s = authStore.get();
  if (!s.isLoggedIn || !s.sessionToken) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const id = s.role === 'admin' ? s.name || 'ADMIN' : s.wa;
  if (!id) return;
  registerFcm(id);
}

/** Hanya untuk tes: lupakan penanda "sekali per halaman". */
export function __resetFcmRefreshForTest(): void {
  fcmRefreshDone = false;
}

/** Login as admin */
export function loginAsAdmin(name: string, sessionToken: string, refreshToken?: string) {
  const now = Date.now();
  authStore.set({
    role: 'admin',
    name,
    wa: '',
    sessionToken,
    refreshToken: refreshToken || '',
    isLoggedIn: true,
    lastChecked: now,
  });
  // Activate FCM push notifications (non-blocking).
  // Admin register FCM under their name (backend: waRaw || 'ADMIN') —
  // sending the JWT leaked the session token into fcm_tokens.wa.
  registerFcm(name || 'ADMIN');
}

/** Login as kandidat */
export function loginAsKandidat(name: string, wa: string, sessionToken: string, refreshToken?: string) {
  const now = Date.now();
  authStore.set({
    role: 'kandidat',
    name,
    wa,
    sessionToken,
    refreshToken: refreshToken || '',
    isLoggedIn: true,
    lastChecked: now,
  });
  // Activate FCM push notifications (non-blocking)
  registerFcm(wa);
}

/**
 * Fire-and-forget POST to the `logout` action, which bumps the subject's
 * revocation epoch server-side (migration 026).
 *
 * RAW `fetch`, not `apiClient`: `call()` asks `getFreshToken()` for a token
 * first, and `getFreshToken()` is itself what calls `logout()` when a session is
 * dead — routing this through it would recurse. Same reason
 * `refreshSessionToken()` bypasses `call()`.
 *
 * Every failure is swallowed on purpose. The local session is cleared either
 * way, and the server bump is a best-effort kill switch, not a precondition: a
 * logout that blocks on the network is worse than one that occasionally fails.
 * `keepalive` lets the request survive the navigation that follows.
 */
function revokeServerSession(sessionToken: string, refreshToken: string) {
  if (typeof fetch !== 'function') return;
  try {
    void fetch(getEndpoint('logout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout', payload: [refreshToken], sessionToken }),
      signal: AbortSignal.timeout(5_000),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* runtime without AbortSignal.timeout — skip the bump, keep the logout */
  }
}

/** Logout — clears everything */
export function logout() {
  const state = authStore.get();
  // Kill the refresh token BEFORE it leaves the store. Without this, `logout`
  // was purely local: a stolen refresh token stayed valid for its full 7 days
  // (measured 2026-10-29). The refresh token is sent as well because the session
  // token is usually already expired by the time a client logs out.
  if (state.isLoggedIn) void revokeServerSession(state.sessionToken, state.refreshToken);
  authStore.set(DEFAULT_STATE);
}

/** Refresh session — checks expiry and updates activity timestamp. */
// P22 fix: Update lastChecked on each successful check so sessions expire
// after 24h of INACTIVITY, not 24h since login.
export function refreshSession() {
  const state = authStore.get();
  if (state.isLoggedIn && state.lastChecked > 0) {
    if (Date.now() - state.lastChecked > SESSION_MAX_AGE) {
      logout();
    } else {
      // Session still valid — refresh the activity timestamp
      authStore.set({ ...state, lastChecked: Date.now() });
    }
  }
}



/**
 * Adopt a state written by ANOTHER tab — WITHOUT writing one back.
 *
 * WHY THIS IS NOT `refreshSession()`
 * ----------------------------------
 * The `storage` listener used to call `refreshSession()`, which stamps
 * `lastChecked: Date.now()` and therefore writes a DIFFERENT string to
 * `localStorage`. That write fires the same `storage` event in the other tab,
 * whose listener stamps its own timestamp, and so on: with two tabs logged in,
 * the pair write to `localStorage` (and re-render every `authStore` subscriber,
 * `App.tsx` included) in a loop that only stops when one tab closes. There is no
 * throttle in the path — each iteration is one synchronous storage write plus a
 * full notification pass.
 *
 * The fix is a property, not a timer: adopting a value must produce the SAME
 * BYTES the other tab already stored. `JSON.parse` + `authStore.set` does
 * exactly that (same keys, same order ⇒ identical string), and `localStorage`
 * only fires `storage` when the value actually changes — so the echo stops after
 * one hop instead of running forever.
 *
 * Only identity-level changes are adopted. A newer `lastChecked` from another
 * tab is not copied: it carries no information this tab needs, and copying it is
 * precisely the write that caused the loop.
 */
export function adoptAuthFromStorage(raw: string | null): void {
  if (!raw) return;
  let next: AuthState;
  try {
    next = JSON.parse(raw) as AuthState;
  } catch {
    // A corrupt value is not a session. Ignore it rather than logging everyone
    // out from a handler that cannot report what it saw.
    return;
  }
  if (!next || typeof next !== 'object') return;
  const cur = authStore.get();
  if (next.isLoggedIn === cur.isLoggedIn && next.sessionToken === cur.sessionToken) return;
  authStore.set(next);
}

/** Listen for cross-tab changes */
let sessionCheckInterval: ReturnType<typeof setInterval> | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    // NOT refreshSession() — see adoptAuthFromStorage(). The old call wrote a
    // fresh timestamp here, and that write is what ping-ponged between tabs.
    if (e.key === 'asj_auth') adoptAuthFromStorage(e.newValue);
  });

  // P20 fix: Store interval ID so it can be cleared on HMR/remount.
  // Without this, repeated module evaluation accumulates intervals.
  if (sessionCheckInterval) clearInterval(sessionCheckInterval);
  sessionCheckInterval = setInterval(() => {
    const state = authStore.get();
    if (state.isLoggedIn && state.lastChecked > 0) {
      if (Date.now() - state.lastChecked > SESSION_MAX_AGE) {
        logout();
        window.location.reload();
      }
    }
  }, 5 * 60 * 1000);
}
