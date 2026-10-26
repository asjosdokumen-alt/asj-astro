/**
 * TESTS: siapa yang boleh membuka bank soal `/wawancara`.
 *
 * KENAPA DI `e2e/`: `indexer` menghitung SELURUH berkas di bawah `src/**`, jadi
 * `.test.tsx` baru di sana memindahkan counter beku. `e2e/**\/*.test.tsx` masuk
 * proyek `frontend` (jsdom), jadi tidak ada counter yang bergerak.
 *
 * LATAR BELAKANG (dua keputusan pemilik, jangan dibalik tanpa membaca ini)
 * ----------------------------------------------------------------------
 * 2026-10-25: "untuk wawancara mending kita tolak dulu, biar untuk internal
 * dulu" ⇒ halaman berhenti di kartu "belum dibuka" untuk SEMUA non-admin, dan
 * ketiga aksi server jadi `requireAdmin`.
 * 2026-10-26: pemilik menemukan murid VIP-nya (ASJ00188) tetap tidak bisa masuk
 * — kartu penutup itu tidak pernah membaca flag siswa. "Internal" ternyata =
 * SISWA, jadi sekarang tiga tingkat:
 *
 *   1. belum login        ⇒ gerbang login (nomor WA + password);
 *   2. login, bukan siswa ⇒ kartu "khusus siswa ASJ";
 *   3. login, siswa ASJ   ⇒ bank soal.
 *
 * YANG DIUJI DI SINI
 * ------------------
 * (a) tanpa sesi: gerbang login, TIDAK ada lembar soal, TIDAK ada kartu
 *     "khusus siswa" (status belum diketahui — jangan menuduh sebelum tahu).
 * (b) sesi admin: tetap sampai ke panelnya (TabPelamar memakai komponen ini).
 * (c) kandidat login yang server bilang `isVip:false`: kartu "khusus siswa",
 *     bukan bank soal.
 * (d) kandidat login yang server bilang `isVip:true`: lembar soal benar-benar
 *     dirender — tanpa ini, (c) bisa hijau hanya karena semuanya diblokir.
 *
 * Penjaga SEBENARNYA ada di server (`tolakKecualiSiswa` di surfaces/ai.ts);
 * berkas ini menjaga perilaku yang TERLIHAT, supaya kartu dan guard tidak
 * pernah berbeda pendapat.
 */
import { render, screen, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MensetsuForm from '../src/components/candidate/MensetsuForm';
import { authStore } from '../src/store/authReactive';

/* `vi.hoisted` wajib: `vi.mock` diangkat ke atas `const`, jadi variabel biasa
   akan "Cannot access before initialization" saat factory-nya dijalankan. */
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/lib/apiClient', () => ({ apiClient: apiMock }));

/** Satu soal cukup — yang diuji adalah boleh/tidaknya lembar itu muncul. */
const BANK_SISWA = {
  success: true,
  wa: '081234567890',
  isVip: true,
  jumlah: 1,
  tahap: ['Pertanyaan & Pemahaman Diri'],
  soal: [
    {
      kode: 'W01',
      tahap: 'Pertanyaan & Pemahaman Diri',
      urutan: 1,
      jp: 'お名前は何ですか。',
      romaji: 'onamae wa nan desu ka.',
      arti: 'Siapa nama Anda?',
      jawaban_jp: null,
      jawaban_romaji: null,
      jawaban_arti: null,
      kolom_cv: null,
      sinkron_cv: false,
      jawabanku: { jp: '', romaji: '', arti: '' },
    },
  ],
};

const TOLAK_NON_SISWA = {
  success: false,
  isVip: false,
  message: 'Latihan wawancara khusus siswa ASJ (VIP / Kelas LPK).',
};

function loginSebagai(role: 'admin' | 'kandidat') {
  authStore.set({
    role,
    name: role === 'admin' ? 'admin' : 'Budi',
    wa: '081234567890',
    sessionToken: `uji-${role}`,
    refreshToken: '',
    isLoggedIn: true,
    lastChecked: Date.now(),
  });
}

describe('/wawancara — siswa ASJ saja', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.mockReset();
    apiMock.mockResolvedValue(BANK_SISWA);
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('tanpa sesi: gerbang login, bukan lembar soal dan bukan kartu "khusus siswa"', () => {
    render(<MensetsuForm />);

    /* Inti gerbang: kredensial bisa diketik, bank soal belum ada. */
    expect(document.querySelector('input[type="password"]')).toBeTruthy();
    expect(document.querySelector('input[type="tel"]')).toBeTruthy();
    expect(document.querySelector('[data-cetak]')).toBeNull();
    /* Status siswa belum diketahui sebelum login — jangan menuduh. */
    expect(screen.queryByTestId('mensetsu-khusus-vip')).toBeNull();
  });

  it('sesi admin tetap sampai ke panelnya (tanpa gerbang, tanpa kartu)', () => {
    loginSebagai('admin');
    render(<MensetsuForm />);

    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByTestId('mensetsu-khusus-vip')).toBeNull();
  });

  it('kandidat login yang bukan siswa: kartu "khusus siswa ASJ", bank soal tidak dikirim', async () => {
    loginSebagai('kandidat');
    apiMock.mockResolvedValue(TOLAK_NON_SISWA);

    render(<MensetsuForm />);

    await waitFor(() => expect(screen.getByTestId('mensetsu-khusus-vip')).toBeTruthy());
    expect(document.querySelector('[data-cetak]')).toBeNull();
    /* Pesan "Bank soal kosong" akan menyalahkan bank, padahal statusnya yang kurang. */
    expect(screen.queryByText(/Bank soal kosong/)).toBeNull();
  });

  it('kandidat login yang siswa ASJ: lembar soal benar-benar dirender', async () => {
    loginSebagai('kandidat');
    apiMock.mockResolvedValue(BANK_SISWA);

    render(<MensetsuForm />);

    await waitFor(() => expect(document.querySelector('[data-cetak]')).toBeTruthy());
    expect(screen.queryByTestId('mensetsu-khusus-vip')).toBeNull();
  });
});
