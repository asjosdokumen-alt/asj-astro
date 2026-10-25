/**
 * TESTS: `/wawancara` ditutup untuk publik — kartu pemberitahuan, bukan gerbang.
 *
 * KENAPA DI `e2e/`: `indexer` menghitung SELURUH berkas di bawah `src/**`, jadi
 * `.test.tsx` baru di sana memindahkan counter beku. `e2e/**\/*.test.tsx` masuk
 * proyek `frontend` (jsdom), jadi tidak ada counter yang bergerak.
 *
 * LATAR BELAKANG
 * --------------
 * Pemilik 2026-10-25: "untuk wawancara mending kita tolak dulu, biar untuk
 * internal dulu". Sebelumnya halaman publik menampilkan gerbang login, jadi
 * kandidat bisa masuk dan membuka bank soal 177 pertanyaan.
 *
 * YANG DIUJI
 * ----------
 * (a) Tanpa sesi, halaman berhenti di kartu "belum dibuka": TIDAK ada kolom
 *     password, TIDAK ada tombol Masuk. Ini yang mencegah kandidat mengetik
 *     nomor + password lalu menunggu sia-sia.
 * (b) Sesi ADMIN tetap bisa memakai fiturnya. Penjaganya ada di server
 *     (`requireAdmin` di surfaces/ai.ts); kalau kartu ini sampai menutup admin
 *     juga, panel admin di TabPelamar kehilangan satu-satunya jalan masuk.
 */
import { render, screen, cleanup } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MensetsuForm from '../src/components/candidate/MensetsuForm';
import { authStore } from '../src/store/authReactive';

/* Gerbang/panel memanggil API; test ini tidak menguji jaringan. Dibuat
   gagal-keras supaya berisik kalau ada jalur yang tidak sengaja menembak. */
vi.mock('../src/lib/apiClient', () => ({
  apiClient: vi.fn(() => {
    throw new Error('apiClient dipanggil di test tampilan');
  }),
}));

describe('/wawancara ditutup untuk publik', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('tanpa sesi: kartu "belum dibuka", dan TIDAK ada gerbang login', () => {
    render(<MensetsuForm />);

    expect(screen.getByTestId('mensetsu-tutup')).toBeTruthy();
    /* Inti dari penutupan: tidak ada jalan untuk mengetik kredensial. */
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(document.querySelector('input[type="tel"]')).toBeNull();
    expect(screen.queryByTestId('mensetsu-gate-daftar')).toBeNull();
  });

  it('sesi admin tetap sampai ke panelnya (kartu penutup tidak muncul)', () => {
    authStore.set({
      role: 'admin',
      name: 'admin',
      wa: '081234567890',
      sessionToken: 'uji-admin',
      refreshToken: '',
      isLoggedIn: true,
      lastChecked: Date.now(),
    });

    render(<MensetsuForm />);

    expect(screen.queryByTestId('mensetsu-tutup')).toBeNull();
  });
});
