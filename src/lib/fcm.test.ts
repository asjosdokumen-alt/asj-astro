/**
 * fcm.test.ts — opsi `getToken()`.
 *
 * Kenapa diuji: `getToken()` hanya bisa membuat PushSubscription BARU kalau
 * diberi `vapidKey`. Tanpa kunci itu ia memakai subscription yang sudah ada,
 * dan kalau tidak ada ia gagal — tanpa gejala yang terlihat. Bukti produksi
 * 2026-10-19: token admin terakhir terdaftar 2026-10-09, tidak ada sejak itu.
 *
 * Yang dijaga di sini bukan "kunci ada di env", melainkan BENTUK objeknya:
 * kunci kosong TIDAK boleh dikirim sebagai `vapidKey: ''`, karena SDK akan
 * mencoba subscribe dengan kunci kosong dan gagal dengan pesan yang lebih
 * membingungkan daripada "tidak ada subscription".
 */
import { describe, expect, it } from 'vitest';
import { fcmTokenOptions } from './fcm';

const reg = { scope: '/' };

describe('fcmTokenOptions', () => {
  it('mengirim vapidKey saat tersedia, bersama registration yang sama', () => {
    const opts = fcmTokenOptions(reg, 'BExampleVapidKey');
    expect(opts.vapidKey).toBe('BExampleVapidKey');
    expect(opts.serviceWorkerRegistration).toBe(reg);
  });

  it('TIDAK mengirim vapidKey kosong — biar SDK memakai subscription yang ada', () => {
    const opts = fcmTokenOptions(reg, '');
    expect('vapidKey' in opts).toBe(false);
    expect(opts.serviceWorkerRegistration).toBe(reg);
  });
});
