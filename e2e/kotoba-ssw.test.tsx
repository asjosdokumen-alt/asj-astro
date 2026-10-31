/**
 * TESTS: modul latihan per bidang SSW di `/kotoba`.
 *
 * KENAPA ADA
 * ----------
 * `e2e/kotoba-bank.test.ts` menjaga ISI bank bidang, dan
 * `e2e/kotoba-guard.test.ts` menjaga SIAPA yang boleh menerimanya. Tidak ada
 * satu pun yang membuktikan bahwa tombol "Bidang Kerja" benar-benar memuat
 * bank itu dan bahwa daftar kata berganti saat bidangnya diganti. Tanpa tes
 * ini, seluruh fitur bisa terpasang di server tapi tidak pernah tersentuh
 * siswa — dan semua gate tetap hijau.
 *
 * YANG DIUJI
 * ----------
 *   (a) tab SSW memicu `getBankSsw` (bukan memakai bank buku);
 *   (b) kedua bidang muncul di pemilih, dan kata bidang pertama tampil di kamus;
 *   (c) mengganti bidang mengganti daftar katanya — bukan hanya labelnya;
 *   (d) tab buku tetap memakai `getBankKotoba` dan tidak memanggil SSW.
 *
 * KENAPA DI `e2e/`: `.test.tsx` di `src/` memindahkan counter beku `indexer`;
 * berkas di `e2e/` tidak dihitung (R13f-bis), dan `.tsx` di sini masuk proyek
 * `frontend` (jsdom) tanpa perlu didaftarkan di `exclude`.
 */
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import KotobaGame from '../src/components/candidate/KotobaGame';
import { authStore } from '../src/store/authReactive';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../src/lib/apiClient', () => ({ apiClient: apiMock }));

/** Bank buku mini — cukup untuk membuktikan permainan dirender. */
const BANK_BUKU = {
  success: true,
  isVip: true,
  jumlah: 5,
  bab: [1],
  kosakata: [
    { b: 1, pos: 'noun', k: '私', h: 'わたし', r: 'watashi', id: 'Saya' },
    { b: 1, pos: 'noun', k: '学生', h: 'がくせい', r: 'gakusei', id: 'Pelajar' },
    { b: 1, pos: 'noun', k: '先生', h: 'せんせい', r: 'sensei', id: 'Guru' },
    { b: 1, pos: 'noun', k: '医者', h: 'いしゃ', r: 'isha', id: 'Dokter' },
    { b: 1, pos: 'noun', k: '病院', h: 'びょういん', r: 'byouin', id: 'Rumah sakit' },
  ],
};

/**
 * Dua bidang. Kata sengaja dipilih yang TIDAK ada di bank buku di atas, supaya
 * "kata bidang tampil" tidak bisa lulus hanya karena bank buku ikut tergambar.
 */
const BANK_SSW = {
  success: true,
  isVip: true,
  jumlah: 8,
  bidang: [
    {
      id: 'kaigo',
      nama: 'Perawatan Lansia (Kaigo)',
      namaJp: '介護',
      ringkas: 'Membantu lansia mandi, makan, dan berpindah posisi.',
      kata: [
        { b: 0, pos: 'noun', k: '車椅子', h: 'くるまいす', r: 'kurumaisu', id: 'Kursi roda' },
        { b: 0, pos: 'noun', k: 'おむつ', h: 'おむつ', r: 'omutsu', id: 'Popok' },
        { b: 0, pos: 'noun', k: '転倒', h: 'てんとう', r: 'tentou', id: 'Terjatuh' },
        { b: 0, pos: 'verb', k: '見守ります', h: 'みまもります', r: 'mimamorimasu', id: 'Mengawasi' },
      ],
    },
    {
      id: 'inshokuhin',
      nama: 'Pengolahan Makanan',
      namaJp: '飲食料品製造業',
      ringkas: 'Mengolah, memanaskan, dan mengemas produk makanan.',
      kata: [
        { b: 0, pos: 'noun', k: '食材', h: 'しょくざい', r: 'shokuzai', id: 'Bahan makanan' },
        { b: 0, pos: 'noun', k: '加熱', h: 'かねつ', r: 'kanetsu', id: 'Pemanasan' },
        { b: 0, pos: 'noun', k: '冷凍', h: 'れいとう', r: 'reitou', id: 'Pembekuan' },
        { b: 0, pos: 'noun', k: '検品', h: 'けんぴん', r: 'kenpin', id: 'Inspeksi produk' },
      ],
    },
  ],
};

function loginSebagaiSiswa() {
  authStore.set({
    role: 'kandidat',
    name: 'Budi',
    wa: '081234567890',
    sessionToken: 'uji-siswa',
    refreshToken: '',
    isLoggedIn: true,
    lastChecked: Date.now(),
  });
}

/**
 * Ganti bidang lewat event `change` yang benar-benar dikirim ke elemennya.
 *
 * `fireEvent.change()` dari @testing-library/preact TIDAK sampai ke listener
 * Preact di elemen ini (diukur 2026-10-31: handler tidak terpanggil, dan
 * `addEventListener('change')` yang dipasang di tes pun tidak berbunyi).
 * Bukan bug produk — di peramban, memilih opsi pada `<select>` mengirim
 * `change` secara native. Yang perlu dicatat: tes yang memakai `fireEvent.change`
 * di sini akan HIJAU tanpa pernah mengubah apa pun, jadi bentuk di bawah yang
 * dipakai.
 */
function pilihBidang(id: string) {
  const sel = screen.getByLabelText('Pilih bidang kerja') as HTMLSelectElement;
  sel.value = id;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('/kotoba — modul latihan per bidang SSW', () => {
  beforeEach(() => {
    localStorage.clear();
    apiMock.mockReset();
    apiMock.mockImplementation((action: string) =>
      Promise.resolve(action === 'getBankSsw' ? BANK_SSW : BANK_BUKU),
    );
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

  it('tab "Bidang Kerja" memuat bank SSW, bukan memakai bank buku', async () => {
    loginSebagaiSiswa();
    render(<KotobaGame />);

    /* Tunggu permainan benar-benar siap: tab mode hanya muncul setelah bank
       buku tiba. */
    await waitFor(() => expect(screen.getByText('Flashcard')).toBeTruthy());
    expect(apiMock).toHaveBeenCalledWith('getBankKotoba', expect.anything(), expect.anything());

    fireEvent.click(screen.getByText('Bidang Kerja (SSW)'));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('getBankSsw', expect.anything(), expect.anything()),
    );
    /* Pemilih bidang muncul, dan bidang pertama sudah terpilih. */
    await waitFor(() => expect(screen.getByLabelText('Pilih bidang kerja')).toBeTruthy());
    expect(screen.getByText(/介護/)).toBeTruthy();
  });

  it('kamus menampilkan kata bidang, dan berganti saat bidangnya diganti', async () => {
    loginSebagaiSiswa();
    render(<KotobaGame />);
    await waitFor(() => expect(screen.getByText('Flashcard')).toBeTruthy());

    fireEvent.click(screen.getByText('Bidang Kerja (SSW)'));
    await waitFor(() => expect(screen.getByLabelText('Pilih bidang kerja')).toBeTruthy());

    fireEvent.click(screen.getByText('Kamus'));

    /* Kata kaigo tampil... */
    await waitFor(() => expect(screen.getByText('車椅子')).toBeTruthy());
    expect(screen.getByText('Kursi roda')).toBeTruthy();
    /* ...dan kata buku TIDAK ikut, karena pool-nya satu sumber. */
    expect(screen.queryByText('私')).toBeNull();

    /* Ganti bidang: daftar kata harus ikut berganti, bukan hanya namanya. */
    pilihBidang('inshokuhin');

    await waitFor(() => expect(screen.getByText('食材')).toBeTruthy());
    expect(screen.getByText('Bahan makanan')).toBeTruthy();
    expect(screen.queryByText('車椅子')).toBeNull();
  });

  it('kembali ke tab buku memakai bank buku lagi, tanpa memanggil SSW dua kali', async () => {
    loginSebagaiSiswa();
    render(<KotobaGame />);
    await waitFor(() => expect(screen.getByText('Flashcard')).toBeTruthy());

    fireEvent.click(screen.getByText('Bidang Kerja (SSW)'));
    await waitFor(() => expect(screen.getByLabelText('Pilih bidang kerja')).toBeTruthy());

    const panggilanSsw = apiMock.mock.calls.filter((c) => c[0] === 'getBankSsw').length;
    expect(panggilanSsw).toBe(1);

    fireEvent.click(screen.getByText('Buku (Bab 1–50)'));
    fireEvent.click(screen.getByText('Kamus'));

    await waitFor(() => expect(screen.getByText('私')).toBeTruthy());
    /* Bank SSW sudah di memori: berpindah bolak-balik tidak boleh menembak
       server lagi. Kalau ini gagal, efek pemuat kehilangan penjaganya. */
    expect(apiMock.mock.calls.filter((c) => c[0] === 'getBankSsw').length).toBe(1);
  });
});
