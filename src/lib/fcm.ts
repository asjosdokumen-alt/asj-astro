/**
 * fcm.ts — Firebase Cloud Messaging client for Astro/Preact
 * 
 * Loads Firebase SDK from CDN (lazy) — no build-time dependency.
 * Mirrors legacy js/fcm-client.ts exactly.
 */

function getFcmConfig() {
  // Config from PUBLIC_ env vars (Astro) with hardcoded fallbacks
  const g = typeof import.meta !== 'undefined' ? (import.meta as any).env : {};
  return {
    apiKey: g?.PUBLIC_FIREBASE_API_KEY || 'AIzaSyDQVyjXmiF1M5bnwJciIptZTWn8RcnyViE',
    projectId: g?.PUBLIC_FIREBASE_PROJECT_ID || 'khoci-7a81c',
    messagingSenderId: g?.PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '1090676733378',
    appId: g?.PUBLIC_FIREBASE_APP_ID || '1:1090676733378:web:3c0aa57a7ef133fc34925b',
    /**
     * Web Push certificate key pair ("VAPID key") dari Firebase Console →
     * Project settings → Cloud Messaging → Web Push certificates.
     *
     * KENAPA INI BUKAN OPSIONAL (ditemukan 2026-10-19). `getToken()` hanya bisa
     * membuat PushSubscription BARU kalau diberi `vapidKey`. Tanpa kunci itu ia
     * memakai subscription yang SUDAH ADA, dan kalau tidak ada (site data
     * dibersihkan, subscription kedaluwarsa, perangkat baru) pemanggilannya
     * gagal — tanpa gejala yang terlihat, karena kegagalannya hanya masuk
     * console. Bukti dari tabel produksi: token admin terakhir terdaftar
     * 2026-10-09, tidak ada satu pun sejak itu, padahal login terjadi berkali-kali.
     *
     * Sengaja dibaca dari env, bukan di-hardcode: kunci ini pasangan dari
     * service account di sisi server, dan menaruhnya di repo publik membuat
     * siapa pun bisa mendaftarkan perangkat ke project ini.
     */
    vapidKey: g?.PUBLIC_FIREBASE_VAPID_KEY || '',
  };
}

/**
 * Opsi `getToken()` — dipisah supaya bisa diuji tanpa browser.
 *
 * `vapidKey` hanya dikirim kalau ADA: mengirim string kosong membuat SDK
 * mencoba subscribe dengan kunci kosong dan gagal dengan pesan yang lebih
 * membingungkan daripada "tidak ada subscription".
 */
export function fcmTokenOptions<T extends object>(
  registration: T,
  vapidKey: string,
): { serviceWorkerRegistration: T; vapidKey?: string } {
  return vapidKey
    ? { serviceWorkerRegistration: registration, vapidKey }
    : { serviceWorkerRegistration: registration };
}

let messaging: unknown = null;

/** Firebase app instance (loaded from CDN) */
interface FirebaseCompat {
  apps: unknown[];
  initializeApp: (config: Record<string, string>) => void;
  messaging: () => unknown;
}

/**
 * Initialize Firebase App & Messaging.
 * Called asynchronously when PWA loads.
 */
export async function initFCM(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[FCM] Browser does not support Push Notification.');
    return;
  }

  try {
    const w = window as unknown as Record<string, unknown>;
    if (!w.firebase) {
      // Firebase CDN imports — these set window.firebase as a side effect
      await (globalThis as any).__firebase_import_app || ((globalThis as any).__firebase_import_app = await import(/* @vite-ignore */ 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js'));
      await (globalThis as any).__firebase_import_msg || ((globalThis as any).__firebase_import_msg = await import(/* @vite-ignore */ 'https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js'));
    }

    const fb = w.firebase as FirebaseCompat;
    const apps = fb.apps || [];
    if (!apps.length) {
      fb.initializeApp(getFcmConfig());
    }

    messaging = fb.messaging();

    // Capture notifications when app is in foreground
    const m2 = messaging as Record<string, unknown>;
    const onMessageFn = m2.onMessage as (cb: (payload: Record<string, unknown>) => void) => void;
    onMessageFn.call(m2, (payload: Record<string, unknown>) => {
      console.log('[FCM] Foreground message:', payload);
      const data = (payload.data || {}) as Record<string, string>;
      const notif = (payload.notification || {}) as Record<string, string>;
      const title = data.title || notif.title || 'Notifikasi Baru';
      const body = data.body || notif.body || '';
      if (typeof window !== 'undefined' && typeof (window as unknown as Record<string, unknown>).showToast === 'function') {
        ((window as unknown as Record<string, unknown>).showToast as (msg: string, type: string) => void)(`${title}: ${body}`, 'info');
      }
    });

    console.log('[FCM] Firebase Messaging initialized.');
  } catch (err) {
    console.error('[FCM] Init failed:', err);
  }
}

/**
 * Request notification permission and register FCM token with backend.
 * @param userId - The logged-in user's ID (admin or kandidat WA)
 * @returns what happened — `'registered'` only when a token reached the backend.
 *   The value is returned rather than only logged because a silent failure here
 *   is indistinguishable, from the operator's side, from "no notification was
 *   sent": the device simply never appears in `fcm_tokens`.
 */
export type FcmRegisterResult =
  | 'registered'
  | 'unsupported'
  | 'no-messaging'
  | 'permission-denied'
  | 'no-sw'
  | 'no-token'
  | 'error';

export async function requestNotificationPermission(userId: string): Promise<FcmRegisterResult> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  if (!messaging) await initFCM();
  if (!messaging) return 'no-messaging';

  try {
    if (await Notification.requestPermission() !== 'granted') {
      console.warn('[FCM] Notification permission denied.');
      return 'permission-denied';
    }

    // Wait for Service Worker registration
    let reg = navigator.serviceWorker.getRegistration();
    for (let i = 0; i < 10 && !(await reg); i++) {
      await new Promise(r => setTimeout(r, 500));
      reg = navigator.serviceWorker.getRegistration();
    }

    const registration = await reg;
    if (!registration) {
      console.warn('[FCM] Service Worker not registered — skipping token.');
      return 'no-sw';
    }

    const m = messaging as Record<string, unknown>;
    const getTokenFn = m.getToken as (opts: Record<string, unknown>) => Promise<string>;

    // Tanpa subscription yang sudah ada, `vapidKey` WAJIB. Lebih baik berhenti
    // dengan alasan yang jelas daripada membiarkan SDK melempar TypeError dari
    // dalam dan tertelan catch di bawah.
    const vapidKey = getFcmConfig().vapidKey;
    const existing = await registration.pushManager?.getSubscription?.();
    if (!existing && !vapidKey) {
      // Dilempar, bukan `console.warn`: catch di bawah sudah mencatatnya, dan
      // pesannya harus sampai ke orang yang membuka console dengan alasan yang
      // bisa ditindaklanjuti, bukan "TypeError: undefined".
      throw new Error(
        'Tidak ada PushSubscription dan PUBLIC_FIREBASE_VAPID_KEY kosong — token tidak bisa dibuat. ' +
        'Ambil kuncinya di Firebase Console → Project settings → Cloud Messaging → Web Push certificates.',
      );
    }

    // KENAPA .call(m, ...): `getToken` diekstrak dari objek messaging,
    // sehingga `this`-nya hilang. Firebase compat SDK butuh `this._delegate`
    // di dalam `getToken`. Tanpa .call() terjadi:
    //   TypeError: Cannot read properties of undefined (reading '_delegate')
    const token = await getTokenFn.call(m, fcmTokenOptions(registration, vapidKey));

    if (token) {
      console.log('[FCM] Token obtained:', token);
      // Register token with backend via apiClient
      const { apiClient } = await import('./apiClient');
      await apiClient('registerFcmToken', [userId, token, navigator.userAgent]);
      console.log('[FCM] Token registered with backend.');
      return 'registered';
    }
    console.warn('[FCM] Failed to get registration token.');
    return 'no-token';
  } catch (err) {
    console.error('[FCM] Permission request failed:', err);
    return 'error';
  }
}
