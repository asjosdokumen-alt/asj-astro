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
