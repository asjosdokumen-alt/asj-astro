/**
 * TESTS: gerbang login `/wawancara` — jalan keluar untuk nomor yang belum terdaftar.
 *
 * KENAPA DI `e2e/`: `indexer` menghitung SELURUH berkas di bawah `src/**`, jadi
 * `.test.tsx` baru di sana memindahkan counter beku. `e2e/**\/*.test.tsx` masuk
 * proyek `frontend` (jsdom), jadi tidak ada counter yang bergerak.
 *
 * YANG DIUJI, DAN KENAPA
 * ----------------------
 * Pemilik membagikan tautan `/wawancara` lewat WhatsApp dengan instruksi
 * "masukkan nomor WA dan 4 digit terakhir". Untuk kandidat yang nomornya BELUM
 * terdaftar, gerbang ini dulu buntu: satu-satunya pesan adalah "Password salah
 * atau akun tidak ditemukan.", dan pendaftaran hanya ada di menu atas yang
 * tidak mereka cari. Terukur 2026-10-25: dari 226 kandidat, ~135 tidak bertanda
 * VIP dan tidak punya alasan untuk tahu harus ke mana.
 *
 * Pesan galatnya SENGAJA tetap tidak dibedakan antara "nomor tidak ada" dan
 * "password salah" (S9, anti-enumerasi). Karena itu jalan keluarnya bukan teks
 * yang membocorkan status nomor, melainkan TAUTAN yang selalu ada:
 * "Belum punya akun? Daftar". Yang diuji di sini: tautan itu ada, dan ia
 * benar-benar MEMBUKA pendaftaran (event `asj-kandidat-register` yang
 * didengarkan `App.tsx`), bukan tombol mati.
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MensetsuForm from '../src/components/candidate/MensetsuForm';

/* `MensetsuForm` memanggil API begitu gerbangnya lewat; test ini hanya menguji
   GERBANG, jadi apiClient dibuat gagal-keras supaya test berisik kalau nanti
   ada yang tidak sengaja memuat bank soal. */
vi.mock('../src/lib/apiClient', () => ({
  apiClient: vi.fn(() => {
    throw new Error('apiClient dipanggil padahal test ini hanya menguji gerbang');
  }),
}));

describe('gerbang /wawancara', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('menampilkan tautan "Daftar" dan tautan itu MEMBUKA pendaftaran', () => {
    const didengar = vi.fn();
    window.addEventListener('asj-kandidat-register', didengar);

    render(<MensetsuForm />);

    const daftar = screen.getByTestId('mensetsu-gate-daftar');
    expect(daftar).toBeTruthy();

    fireEvent.click(daftar);

    /* Event inilah yang didengarkan `App.tsx` (`setModalMode('daftar')`).
       Tanpa ini tombolnya tampak hidup tapi tidak membuka apa pun — persis
       kelas bug yang dikomentari di App.tsx untuk `asj-kandidat-login`. */
    expect(didengar).toHaveBeenCalledTimes(1);
    window.removeEventListener('asj-kandidat-register', didengar);
  });

  it('tidak menampilkan lencana VIP sebelum statusnya diketahui', () => {
    render(<MensetsuForm />);
    /* Status datang dari server bersama bank soal; sebelum itu lencana harus
       TIDAK ada. Lencana "Belum VIP" yang muncul lalu berubah jadi "Siswa
       Resmi ASJ" adalah informasi yang salah, bukan sekadar kosmetik. */
    expect(screen.queryByText('ui.badge_official')).toBeNull();
    expect(screen.queryByText('wawancara.belum_vip')).toBeNull();
  });
});
