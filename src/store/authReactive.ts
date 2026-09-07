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
  requestNotificationPermission(name || 'ADMIN').catch(() => {});
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
  requestNotificationPermission(wa).catch(() => {});
}

/** Logout — clears everything */
export function logout() {
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



/** Listen for cross-tab changes */
let sessionCheckInterval: ReturnType<typeof setInterval> | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'asj_auth') {
      refreshSession();
    }
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
