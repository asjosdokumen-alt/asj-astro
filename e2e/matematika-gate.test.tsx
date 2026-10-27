/**
 * TESTS: siapa yang boleh membuka simulasi matematika `/matematika`, dan apakah
 * permainannya benar-benar bisa dimainkan setelah pintunya terbuka.
 *
 * KENAPA DI `e2e/`: `indexer` menghitung SELURUH berkas di bawah `src/**`, jadi
 * `.test.tsx` baru di sana memindahkan counter beku. `e2e/**\/*.test.tsx` masuk
 * proyek `frontend` (jsdom) dan tidak menggerakkan counter apa pun.
 *
 * YANG DIUJI (tiga tingkat yang sama dengan `/wawancara` dan `/kotoba`)
 * -------------------------------------------------------------------
 *   (a) belum login        ⇒ gerbang login, TIDAK ada lobi, dan TIDAK ada kartu
 *                            "khusus siswa" (status belum diketahui — jangan
 *                            menuduh sebelum tahu);
 *   (b) login, bukan siswa ⇒ kartu "khusus siswa ASJ", bukan lobi;
 *   (c) login, siswa ASJ   ⇒ lobi dirender, dan satu ronde bisa diselesaikan
 *                            sampai layar hasil;
 *   (d) admin              ⇒ tanpa gerbang (dipakai panel admin).
 *
 * (c) dan (d) ada supaya (a)/(b) tidak bisa hijau hanya karena SEMUA diblokir —
 * gerbang yang tidak pernah membuka apa pun juga akan lulus dua tes pertama.
 *
 * Penjaga sebenarnya di server (`e2e/matematika-guard.test.ts`); berkas ini
 * menjaga perilaku yang terlihat, supaya kartu dan guard tidak berbeda pendapat.
 */
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MatematikaGame from '../src/components/candidate/MatematikaGame';
import { authStore } from '../src/store/authReactive';

/* `vi.hoisted` wajib: `vi.mock` diangkat ke atas `const`. */
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/lib/apiClient', () => ({ apiClient: apiMock }));

/** Bank mini — cukup untuk membuktikan lobi dan satu ronde berjalan. */
const BANK_SISWA = {
  success: true,
  isVip: true,
  jumlah: 1,
  kategori: [
    { id: 'kraepelin', jp: '計算テスト', soal: 3, detik: 90 },
    { id: 'kabataku', jp: '基礎数学', soal: 3, detik: 240 },
    { id: 'deret', jp: '数列', soal: 3, detik: 300 },
    { id: 'satuan', jp: '単位換算', soal: 3, detik: 240 },
    { id: 'logika', jp: '判断推理', soal: 3, detik: 300 },
    { id: 'cerita', jp: '現場応用', soal: 3, detik: 420 },
  ],
  cerita: [
    {
      kode: 'C001',
      tag: 'TARGET PRODUKSI',
      diff: 'easy',
      q: 'Dua belas baut per menit selama 15 menit. Berapa baut?',
      ans: 180,
      unit: 'baut',
      exp: '12 × 15 = 180 baut.',
    },
  ],
};

const TOLAK_NON_SISWA = { success: false, isVip: false, message: 'khusus siswa ASJ' };

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

/** Tombol berdasarkan teks persisnya — `getByText` mengembalikan elemen teks. */
function tombol(label: string): HTMLButtonElement {
  const el = screen.getByText(label);
  return (el.closest('button') ?? el) as HTMLButtonElement;
}

describe('/matematika — siswa ASJ saja', () => {
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

  it('tanpa sesi: gerbang login, bukan lobi dan bukan kartu "khusus siswa"', () => {
    render(<MatematikaGame />);

    expect(document.querySelector('input[type="password"]')).toBeTruthy();
    expect(document.querySelector('input[type="tel"]')).toBeTruthy();
    /* Judul lobi hanya ada di dalam permainan. */
    expect(screen.queryByText('Pilih modul tes')).toBeNull();
    /* Status siswa belum diketahui sebelum login — jangan menuduh. */
    expect(screen.queryByTestId('matematika-khusus-vip')).toBeNull();
  });

  it('kandidat login yang bukan siswa: kartu "khusus siswa ASJ", lobi tidak dirender', async () => {
    loginSebagai('kandidat');
    apiMock.mockResolvedValue(TOLAK_NON_SISWA);

    render(<MatematikaGame />);

    await waitFor(() => expect(screen.getByTestId('matematika-khusus-vip')).toBeTruthy());
    expect(screen.queryByText('Pilih modul tes')).toBeNull();
    /* Pesan "bank kosong" akan menyalahkan data, padahal statusnya yang kurang. */
    expect(screen.queryByText(/Bank soal kosong/)).toBeNull();
  });

  it('meminta bank lewat aksi server yang bergerbang, bukan bank lokal', async () => {
    loginSebagai('kandidat');

    render(<MatematikaGame />);

    await waitFor(() => expect(apiMock).toHaveBeenCalled());
    const [aksi, args] = apiMock.mock.calls[0] as [string, unknown[]];
    expect(aksi).toBe('getBankMatematika');
    expect(args).toEqual(['081234567890']);
  });

  it('kandidat login yang siswa ASJ: lobi dirender dengan enam modul', async () => {
    loginSebagai('kandidat');

    render(<MatematikaGame />);

    await waitFor(() => expect(screen.getByText('Pilih modul tes')).toBeTruthy());
    expect(screen.queryByTestId('matematika-khusus-vip')).toBeNull();
    expect(screen.getByText('Soal cerita pabrik')).toBeTruthy();
    expect(screen.getByText('Konversi satuan')).toBeTruthy();
    expect(screen.getByText('Penalaran & perbandingan')).toBeTruthy();
  });

  it('satu ronde bisa dimainkan sampai layar hasil', async () => {
    loginSebagai('kandidat');
    render(<MatematikaGame />);
    await waitFor(() => expect(screen.getByText('Mulai tes')).toBeTruthy());

    fireEvent.click(tombol('Mulai tes'));

    /* Modul bawaan = kraepelin → numpad, bukan pilihan ganda. */
    await waitFor(() => expect(screen.getByText('Kirim jawaban')).toBeTruthy());

    for (let i = 0; i < 3; i++) {
      fireEvent.click(tombol('7'));
      await waitFor(() => expect(tombol('Kirim jawaban').disabled).toBe(false));
      fireEvent.click(tombol('Kirim jawaban'));
      /* 420 ms jeda antar soal (mode ujian melanjutkan otomatis). */
      await new Promise((r) => setTimeout(r, 700));
    }

    await waitFor(() => expect(screen.getByText('Evaluasi soal & jawaban')).toBeTruthy());
    expect(screen.getByText('Benar / total')).toBeTruthy();
  }, 20000);

  it('admin: tanpa gerbang login (dipakai panel admin)', async () => {
    loginSebagai('admin');

    render(<MatematikaGame />);

    expect(document.querySelector('input[type="password"]')).toBeNull();
    await waitFor(() => expect(screen.getByText('Pilih modul tes')).toBeTruthy());
  });
});
