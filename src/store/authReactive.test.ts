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
