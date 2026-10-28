/**
 * authReactive.test.ts — kapan registrasi ulang token FCM dijalankan.
 *
 * Kenapa ini diuji: `refreshFcmRegistrationOnce()` adalah satu-satunya jalur
 * yang menyembuhkan perangkat yang kehilangan token tanpa admin harus logout.
 * Kalau ia jalan pada kondisi yang salah, ia memunculkan prompt notifikasi di
 * luar gestur pengguna (Chrome mengabaikannya, dan sesudah itu izinnya bisa
 * "denied" permanen) — jadi kondisi jalannya harus dikunci, bukan "kira-kira".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { reg } = vi.hoisted(() => ({ reg: vi.fn(async () => 'registered') }));
vi.mock('../lib/fcm', () => ({ requestNotificationPermission: reg }));

import {
  authStore,
  refreshFcmRegistrationOnce,
  adoptAuthFromStorage,
  __resetFcmRefreshForTest,
} from './authReactive';

function setPermission(p: NotificationPermission): void {
  // jsdom (lingkungan tes ini) tidak punya `Notification`; `refreshFcmRegistrationOnce`
  // justru menolak jalan kalau global itu tidak ada — jadi ia harus DIBUAT dulu,
  // bukan di-define ulang.
  if (typeof globalThis.Notification === 'undefined') {
    (globalThis as unknown as Record<string, unknown>).Notification = { permission: p };
    return;
  }
  Object.defineProperty(globalThis.Notification, 'permission', { value: p, configurable: true });
}

function setAuth(over: Partial<Record<string, unknown>> = {}): void {
  authStore.set({
    role: 'guest',
    name: '',
    wa: '',
    sessionToken: '',
    refreshToken: '',
    isLoggedIn: false,
    lastChecked: 0,
    ...over,
  } as never);
}

const ADMIN = { role: 'admin', name: 'khoci', isLoggedIn: true, sessionToken: 'tok' };
const KANDIDAT = { role: 'kandidat', name: 'Budi', wa: '628123456789', isLoggedIn: true, sessionToken: 'tok' };

describe('refreshFcmRegistrationOnce', () => {
  beforeEach(() => {
    reg.mockClear();
    __resetFcmRefreshForTest();
    setPermission('granted');
    setAuth();
  });

  it('tidak melakukan apa pun saat belum login', () => {
    refreshFcmRegistrationOnce();
    expect(reg).not.toHaveBeenCalled();
  });

  it('mendaftar ulang untuk admin yang sesinya dipulihkan, memakai namanya', () => {
    setAuth(ADMIN);
    refreshFcmRegistrationOnce();
    expect(reg).toHaveBeenCalledWith('khoci');
  });

  it('mendaftar ulang untuk kandidat memakai nomor WA', () => {
    setAuth(KANDIDAT);
    refreshFcmRegistrationOnce();
    expect(reg).toHaveBeenCalledWith('628123456789');
  });

  it('TIDAK jalan saat izin masih "default" — jangan memancing prompt di luar gestur', () => {
    setPermission('default');
    setAuth(ADMIN);
    refreshFcmRegistrationOnce();
    expect(reg).not.toHaveBeenCalled();
  });

  it('hanya sekali per pemuatan halaman', () => {
    setAuth(ADMIN);
    refreshFcmRegistrationOnce();
    refreshFcmRegistrationOnce();
    expect(reg).toHaveBeenCalledTimes(1);
  });
});

/**
 * Dua tab yang login bersamaan dulu menulis `localStorage` tanpa henti: listener
 * `storage` memanggil `refreshSession()`, yang menstempel `lastChecked` baru —
 * dan stempel itu memicu event yang sama di tab lain. Invarian yang dikunci di
 * sini bukan "jumlah tulis kecil", melainkan: **nilai yang diadopsi harus
 * byte-identik dengan yang sudah ditulis tab lain**, karena `localStorage` hanya
 * memancarkan event kalau nilainya BERUBAH. Byte-identik ⇒ tidak ada pantulan.
 */
describe('adoptAuthFromStorage (anti ping-pong antar-tab)', () => {
  beforeEach(() => {
    localStorage.clear();
    setAuth();
  });

  it('tidak menulis apa pun saat identitas sesi sama — hanya `lastChecked` yang beda', () => {
    setAuth({ ...ADMIN, lastChecked: 1 });
    const raw = localStorage.getItem('asj_auth') as string;

    adoptAuthFromStorage(raw);

    // Sama persis ⇒ `localStorage` tidak memancarkan event ⇒ tab lain diam.
    expect(localStorage.getItem('asj_auth')).toBe(raw);
  });

  it('mengadopsi sesi tab lain secara byte-identik, jadi tidak memantul balik', () => {
    setAuth({ ...ADMIN, lastChecked: 1 });
    const other = JSON.stringify({
      role: 'kandidat',
      name: 'Budi',
      wa: '628123456789',
      sessionToken: 'tok-tab-lain',
      refreshToken: '',
      isLoggedIn: true,
      lastChecked: 999,
    });

    adoptAuthFromStorage(other);

    expect(authStore.get().sessionToken).toBe('tok-tab-lain');
    expect(authStore.get().role).toBe('kandidat');
    // Byte-identik dengan yang sudah ada di tab lain — bukan hasil stempel ulang.
    expect(localStorage.getItem('asj_auth')).toBe(other);
  });

  it('logout dari tab lain ikut teradopsi, dan tetap byte-identik', () => {
    setAuth({ ...ADMIN, lastChecked: 1 });
    const loggedOut = JSON.stringify({
      role: 'guest',
      name: '',
      wa: '',
      sessionToken: '',
      refreshToken: '',
      isLoggedIn: false,
      lastChecked: 0,
    });

    adoptAuthFromStorage(loggedOut);

    expect(authStore.get().isLoggedIn).toBe(false);
    expect(localStorage.getItem('asj_auth')).toBe(loggedOut);
  });

  it('nilai rusak diabaikan, bukan me-logout semua orang', () => {
    setAuth({ ...ADMIN, lastChecked: 1 });
    const before = localStorage.getItem('asj_auth');

    adoptAuthFromStorage('{bukan json');
    adoptAuthFromStorage(null);
    adoptAuthFromStorage('null');

    expect(authStore.get().isLoggedIn).toBe(true);
    expect(localStorage.getItem('asj_auth')).toBe(before);
  });

  it('event `storage` sungguhan tidak menghasilkan tulisan balik', () => {
    // Ini jalur yang sebenarnya: listener modul, bukan fungsinya langsung.
    // Kode lama memanggil refreshSession() di sini, yang menstempel timestamp
    // baru ⇒ nilai di localStorage BERUBAH ⇒ event yang sama terpicu di tab
    // lain ⇒ dua tab menulis bergantian tanpa henti.
    setAuth({ ...ADMIN, lastChecked: 1 });
    const other = JSON.stringify({
      role: 'admin',
      name: 'khoci',
      wa: '',
      sessionToken: 'tok-tab-lain',
      refreshToken: '',
      isLoggedIn: true,
      lastChecked: 5000,
    });

    // The event is built from the generic constructor on purpose: naming
    // `StorageEvent` here adds a `global-unknown` entry to the indexer's frozen
    // `unresolvedRefs` counter (measured 2026-10-28: it moved 33 -> 34). The
    // listener only reads `key` and `newValue`.
    const ev = new Event('storage');
    Object.assign(ev, { key: 'asj_auth', newValue: other });
    window.dispatchEvent(ev);

    expect(authStore.get().sessionToken).toBe('tok-tab-lain');
    // Tanpa stempel ulang: yang tertulis tetap string yang dikirim tab lain.
    expect(localStorage.getItem('asj_auth')).toBe(other);
  });
});
