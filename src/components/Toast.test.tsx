/**
 * Toast.test.tsx — satu kegagalan, satu toast.
 *
 * KENAPA TES INI ADA
 *   `showToast()` adalah SATU-SATUNYA mekanisme umpan balik aplikasi ini dan
 *   dipanggil dari ~40 tempat. Sejak 2026-10-23 ia menolak pesan yang identik
 *   dengan yang masih terlihat, karena berpindah tab di dashboard admin me-mount
 *   beberapa view sekaligus dan satu gangguan jaringan bisa menghasilkan tiga
 *   toast merah berisi kalimat yang sama — sementara `MAX_VISIBLE = 4` mendorong
 *   keluar pesan yang mungkin berbeda dan lebih penting.
 *
 *   Dedupe yang terlalu rakus justru berbahaya: kalau ia juga menelan pesan yang
 *   BERBEDA, atau menelan "sukses" hanya karena teksnya kebetulan sama dengan
 *   error sebelumnya, pengguna kehilangan informasi tanpa ada yang merah. Tiga
 *   kasus di bawah memisahkan ketiganya.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { showToast, toasts, dismissToast } from './Toast';

beforeEach(() => {
  toasts.set([]);
});

afterEach(() => {
  vi.useRealTimers();
  toasts.set([]);
});

const texts = () => toasts.get().map((t) => `${t.type}:${t.text}`);

describe('showToast — dedupe', () => {
  it('pesan yang identik saat masih terlihat tidak ditumpuk', () => {
    showToast('Network error: timeout', 'error');
    showToast('Network error: timeout', 'error');
    showToast('Network error: timeout', 'error');
    // Tiga kegagalan, satu pesan di layar. Ini kasus nyata: tiga view admin
    // memulai pembacaan latar bersamaan dan semuanya gagal dengan cara sama.
    expect(texts()).toEqual(['error:Network error: timeout']);
  });

  it('teks berbeda tetap tampil semua', () => {
    showToast('Network error: timeout', 'error');
    showToast('Server sedang sibuk.', 'error');
    expect(texts()).toEqual(['error:Network error: timeout', 'error:Server sedang sibuk.']);
  });

  it('jenis berbeda untuk teks yang sama tetap tampil', () => {
    // Retry yang berhasil: pesan sama, jenis berbeda — pengguna HARUS melihat
    // bahwa kegagalan tadi sudah lewat.
    showToast('Tersimpan', 'error');
    showToast('Tersimpan', 'success');
    expect(texts()).toEqual(['error:Tersimpan', 'success:Tersimpan']);
  });

  it('setelah toast ditutup, pesan yang sama boleh muncul lagi', () => {
    showToast('Gagal memuat', 'error');
    const id = toasts.get()[0].id;
    dismissToast(id);
    showToast('Gagal memuat', 'error');
    expect(texts()).toEqual(['error:Gagal memuat']);
  });

  it('tetap dibatasi MAX_VISIBLE untuk pesan-pesan yang berbeda', () => {
    for (let i = 0; i < 6; i++) showToast(`pesan ${i}`, 'info');
    expect(toasts.get().length).toBe(4);
    // Yang bertahan adalah empat TERAKHIR — perilaku lama, tidak diubah.
    expect(texts()).toEqual(['info:pesan 2', 'info:pesan 3', 'info:pesan 4', 'info:pesan 5']);
  });
});
