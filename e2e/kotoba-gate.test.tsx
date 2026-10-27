/**
 * TESTS: siapa yang boleh membuka minigame kosakata `/kotoba`.
 *
 * KENAPA DI `e2e/`: `indexer` menghitung SELURUH berkas di bawah `src/**`, jadi
 * `.test.tsx` baru di sana memindahkan counter beku. `e2e/**\/*.test.tsx` masuk
 * proyek `frontend` (jsdom) dan tidak menggerakkan counter apa pun.
 *
 * YANG DIUJI (tiga tingkat yang sama dengan `/wawancara`)
 * -----------------------------------------------------
 *   (a) belum login        ⇒ gerbang login, TIDAK ada permainan, dan TIDAK ada
 *                            kartu "khusus siswa" (status belum diketahui —
 *                            jangan menuduh sebelum tahu);
 *   (b) login, bukan siswa ⇒ kartu "khusus siswa ASJ", bukan permainan;
 *   (c) login, siswa ASJ   ⇒ permainan benar-benar dirender;
 *   (d) admin              ⇒ tanpa gerbang (dipakai panel admin).
 *
 * (c) dan (d) ada supaya (a)/(b) tidak bisa hijau hanya karena SEMUA diblokir —
 * gerbang yang tidak pernah membuka apa pun juga akan lulus dua tes pertama.
 *
 * Penjaga sebenarnya di server (`e2e/kotoba-guard.test.ts`); berkas ini menjaga
 * perilaku yang terlihat, supaya kartu dan guard tidak berbeda pendapat.
 */
import { render, screen, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import KotobaGame from '../src/components/candidate/KotobaGame';
import { authStore } from '../src/store/authReactive';

/* `vi.hoisted` wajib: `vi.mock` diangkat ke atas `const`. */
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/lib/apiClient', () => ({ apiClient: apiMock }));

/** Bank mini — cukup untuk membuktikan permainan dirender. */
const BANK_SISWA = {
  success: true,
  isVip: true,
  jumlah: 4,
  bab: [1],
  kosakata: [
    { b: 1, pos: 'noun', k: '私', h: 'わたし', r: 'watashi', id: 'Saya' },
    { b: 1, pos: 'noun', k: '学生', h: 'がくせい', r: 'gakusei', id: 'Pelajar' },
    { b: 1, pos: 'noun', k: '先生', h: 'せんせい', r: 'sensei', id: 'Guru' },
    { b: 1, pos: 'noun', k: '医者', h: 'いしゃ', r: 'isha', id: 'Dokter' },
    { b: 1, pos: 'noun', k: '病院', h: 'びょういん', r: 'byouin', id: 'Rumah sakit' },
  ],
};

const TOLAK_NON_SISWA = { success: false, isVip: false, message: 'khusus siswa ASJ' };

/** Kanji → arti, untuk menemukan tombol jawaban yang BENAR di tes ronde. */
const ARTI: Record<string, string> = Object.fromEntries(
  BANK_SISWA.kosakata.map((v) => [v.k, v.id]),
);

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

describe('/kotoba — siswa ASJ saja', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.mockReset();
    apiMock.mockResolvedValue(BANK_SISWA);
    /* Status auth bocor antar-tes kalau tidak direset: `authStore` adalah atom
       modul, bukan state komponen. */
    authStore.set({
      role: 'guest',
      name: '',
      wa: '',
      sessionToken: '',
      refreshToken: '',
      isLoggedIn: false,
      lastChecked: 0,
    });
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('tanpa sesi: gerbang login, bukan permainan dan bukan kartu "khusus siswa"', () => {
    render(<KotobaGame />);

    expect(document.querySelector('input[type="password"]')).toBeTruthy();
    expect(document.querySelector('input[type="tel"]')).toBeTruthy();
    /* Tab mode hanya ada di permainan. */
    expect(screen.queryByText('Flashcard')).toBeNull();
    /* Status siswa belum diketahui sebelum login — jangan menuduh. */
    expect(screen.queryByTestId('kotoba-khusus-vip')).toBeNull();
  });

  it('kandidat login yang bukan siswa: kartu "khusus siswa ASJ", permainan tidak dirender', async () => {
    loginSebagai('kandidat');
    apiMock.mockResolvedValue(TOLAK_NON_SISWA);

    render(<KotobaGame />);

    await waitFor(() => expect(screen.getByTestId('kotoba-khusus-vip')).toBeTruthy());
    expect(screen.queryByText('Flashcard')).toBeNull();
    /* Pesan "bank kosong" akan menyalahkan data, padahal statusnya yang kurang. */
    expect(screen.queryByText(/Bank kosakata kosong/)).toBeNull();
  });

  it('kandidat login yang siswa ASJ: permainan benar-benar dirender', async () => {
    loginSebagai('kandidat');

    render(<KotobaGame />);

    await waitFor(() => expect(screen.getByText('Flashcard')).toBeTruthy());
    expect(screen.queryByTestId('kotoba-khusus-vip')).toBeNull();
    /* Satu soal pilihan ganda = empat tombol jawaban. Tanpa ini, "dirender"
       bisa berarti cangkang kosong yang tidak bisa dimainkan. */
    await waitFor(() => {
      const opsi = [...document.querySelectorAll('button')].filter((b) =>
        b.className.includes('rounded-control border text-left'),
      );
      expect(opsi.length).toBe(4);
    });
  });

  it('admin: tanpa gerbang login (dipakai panel admin)', async () => {
    loginSebagai('admin');

    render(<KotobaGame />);

    expect(document.querySelector('input[type="password"]')).toBeNull();
    await waitFor(() => expect(screen.getByText('Flashcard')).toBeTruthy());
  });

  /* ── Bentuk ronde ──────────────────────────────────────────────────────
     Pemilik 2026-10-27: "kok cuma 5 ronde ya gak kek game html yg asli
     sampai nyawanya mati". Dua tes di bawah mengunci KEDUA arah, dan keduanya
     perlu: kalau hanya "berjalan >10 soal" yang diuji, ronde yang tidak pernah
     berakhir sama sekali akan lulus. */

  it('ronde TIDAK berhenti setelah 10 soal — berjalan sampai nyawa habis', async () => {
    loginSebagai('kandidat');
    render(<KotobaGame />);
    await waitFor(() => expect(screen.getByTestId('kotoba-soal')).toBeTruthy());

    /* Jawab BENAR dua belas kali — lebih dari batas 10 soal yang dulu dipakai. */
    for (let i = 0; i < 12; i++) {
      const kana = screen.getByTestId('kotoba-soal').textContent || '';
      const arti = ARTI[kana];
      expect(arti, `soal tak dikenal: ${kana}`).toBeTruthy();
      const tombol = [...document.querySelectorAll('button')]
        .filter((b) => b.className.includes('rounded-control border text-left'))
        .find((b) => b.querySelector('span')?.textContent === arti);
      expect(tombol, `opsi "${arti}" tidak ada`).toBeTruthy();
      tombol?.click();
      /* Jeda 750 ms antar soal (yang benar) — beri ruang lebih. */
      await new Promise((r) => setTimeout(r, 900));
    }

    expect(screen.queryByTestId('kotoba-hasil')).toBeNull();
    expect(screen.getByTestId('kotoba-soal')).toBeTruthy();
  }, 30000);

  it('ronde BERAKHIR saat nyawa habis — tiga jawaban salah', async () => {
    loginSebagai('kandidat');
    render(<KotobaGame />);
    await waitFor(() => expect(screen.getByTestId('kotoba-soal')).toBeTruthy());

    for (let i = 0; i < 3; i++) {
      const kana = screen.getByTestId('kotoba-soal').textContent || '';
      const arti = ARTI[kana];
      const salah = [...document.querySelectorAll('button')]
        .filter((b) => b.className.includes('rounded-control border text-left'))
        .find((b) => b.querySelector('span')?.textContent !== arti);
      salah?.click();
      await new Promise((r) => setTimeout(r, 1600));
    }

    await waitFor(() => expect(screen.getByTestId('kotoba-hasil')).toBeTruthy());
  }, 30000);
});
