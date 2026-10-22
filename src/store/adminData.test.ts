// ==========================================
// TESTS: store/adminData — satu payload admin untuk semua tab
//
// Laporan pemilik 2026-10-22: *"setiap pindah tab muat ulang semuanya ya …
// jadi boros egress dong?"* Enam tab admin membaca potongan dari payload yang
// SAMA (`getAppData('admin')`, ~107 KB), dan masing-masing memanggilnya sendiri
// saat mount.
//
// Invarian yang dipaku di sini:
//   1. Pemanggil berurutan dalam masa segar → SATU tarikan.
//   2. Pemanggil BERSAMAAN → satu tarikan (in-flight digabung), bukan dua.
//   3. `force` benar-benar menarik ulang (dipakai setelah aksi tulis).
//   4. `invalidateAdminData()` membuang cache.
//   5. Jawaban gagal TIDAK di-cache — kalau di-cache, lima menit penuh semua
//      tab menampilkan daftar kosong tanpa mencoba lagi.
// ==========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const secure = vi.fn();
/* Tag sesi dikendalikan tes: `adminData` membandingkan tag saat MENULIS dengan
   tag saat MEMBACA, jadi ganti akun di tab yang sama harus membatalkan cache. */
const h = vi.hoisted(() => ({ token: 'tok-A' }));
vi.mock('../lib/apiClient', () => ({
  default: { secure: (...args: unknown[]) => secure(...args) },
  tokenTag: () => h.token,
}));

import { adminDataPeek, invalidateAdminData, loadAdminData } from './adminData';

const PAYLOAD = { success: true, jobs: [{ code: 'TG1' }], formInbox: [] };

describe('adminData — cache payload admin', () => {
  beforeEach(() => {
    invalidateAdminData();
    secure.mockReset();
    h.token = 'tok-A';
  });

  it('sesi BERBEDA tidak mewarisi cache — satu tab bisa berganti akun', async () => {
    secure.mockResolvedValue(PAYLOAD);
    await loadAdminData();
    expect(adminDataPeek()).toEqual(PAYLOAD);

    // Akun lain di TAB YANG SAMA. Cache ini hidup di tingkat modul, jadi
    // pembersihan cache apiClient saat login/logout tidak menyentuhnya.
    h.token = 'tok-B';
    expect(adminDataPeek()).toBeNull();

    await loadAdminData(); // ⇒ benar-benar menarik ulang, bukan menyajikan milik A
    expect(secure).toHaveBeenCalledTimes(2);
  });

  it('dua tab yang mount berurutan hanya menarik payload SEKALI', async () => {
    secure.mockResolvedValue(PAYLOAD);
    await loadAdminData();
    await loadAdminData();
    expect(secure).toHaveBeenCalledTimes(1);
    expect(adminDataPeek()).toEqual(PAYLOAD);
  });

  it('pemanggil BERSAMAAN digabung jadi satu permintaan', async () => {
    let release: (v: unknown) => void = () => {};
    secure.mockReturnValue(new Promise((res) => { release = res; }));
    const a = loadAdminData();
    const b = loadAdminData();
    release(PAYLOAD);
    await Promise.all([a, b]);
    expect(secure).toHaveBeenCalledTimes(1);
  });

  it('force menarik ulang — dipakai setelah aksi yang mengubah data', async () => {
    secure.mockResolvedValue(PAYLOAD);
    await loadAdminData();
    await loadAdminData({ force: true });
    expect(secure).toHaveBeenCalledTimes(2);
    // Opsi `force` benar-benar diteruskan ke apiClient (yang menembus cache
    // baca 30 s miliknya sendiri).
    expect(secure.mock.calls[1][2]).toMatchObject({ force: true });
  });

  it('invalidate membuang cache, permintaan berikutnya menarik lagi', async () => {
    secure.mockResolvedValue(PAYLOAD);
    await loadAdminData();
    invalidateAdminData();
    expect(adminDataPeek()).toBeNull();
    await loadAdminData();
    expect(secure).toHaveBeenCalledTimes(2);
  });

  it('jawaban GAGAL tidak disimpan', async () => {
    secure.mockResolvedValue({ success: false });
    await loadAdminData();
    expect(adminDataPeek()).toBeNull();
  });

  it('`onSessionInvalid: throw` tetap dikirim (semantik sesi tidak berubah)', async () => {
    secure.mockResolvedValue(PAYLOAD);
    await loadAdminData();
    expect(secure.mock.calls[0][2]).toMatchObject({ onSessionInvalid: 'throw' });
  });
});
