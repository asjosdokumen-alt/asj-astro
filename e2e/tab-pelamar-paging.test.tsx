/**
 * TESTS: TabPelamar — tombol "More" (halaman berikutnya) + filter menjangkau
 * seluruh kandidat.
 *
 * KENAPA DI `e2e/`: `indexer` menghitung SELURUH berkas di bawah `src/**`, jadi
 * `.test.tsx` baru di sana memindahkan counter beku.
 *
 * YANG DIUJI
 * ----------
 * (a) Daftar kandidat diambil per halaman (`PAGE_SIZE` = 20) dan tombol "More"
 * ditampilkan HANYA kalau masih ada baris yang belum tampil:
 *
 *     {shown.length < totalAll && <button onClick={nextPage}>…}
 *
 * `nextPage()` menaikkan `adminPage`, dan `shown` memotong daftar sepanjang
 * `(page+1) * PAGE_SIZE`. Kalau tidak ada yang MENGAMBIL halaman berikutnya,
 * `filtered` tetap sepanjang 20 dan tombolnya tidak pernah muncul — kandidat
 * ke-21 dan seterusnya tidak bisa dijangkau sama sekali dari layar.
 *
 * (b) Filter (kotak cari + gender + usia + JFT) menyaring SELURUH kandidat di
 * server, dan klien tidak menyaring ulang. Lihat blok describe terakhir.
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TabPelamar from '../src/components/admin/TabPelamar';

const h = vi.hoisted(() => ({
  kandidatStore: null as unknown as { set: (v: unknown) => void },
  pageStore: null as unknown as { set: (v: unknown) => void },
  searchStore: null as unknown as { set: (v: unknown) => void },
  fetchMock: null as unknown as ReturnType<typeof vi.fn>,
  reloadMock: null as unknown as ReturnType<typeof vi.fn>,
  nextPageMock: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock('../src/store/adminStore', () => {
  function mockStore(value: unknown) {
    const listeners = new Set<(v: unknown) => void>();
    return {
      get: () => value,
      set: (v: unknown) => { value = v; for (const fn of listeners) fn(v); },
      listen: (fn: (v: unknown) => void) => { listeners.add(fn); return () => listeners.delete(fn); },
      subscribe: (fn: (v: unknown) => void) => { listeners.add(fn); return () => listeners.delete(fn); },
      setKey: vi.fn(),
    };
  }
  const kandidatList = mockStore([]);
  const adminPage = mockStore(0);
  const adminSearch = mockStore('');
  h.kandidatStore = kandidatList as unknown as { set: (v: unknown) => void };
  h.pageStore = adminPage as unknown as { set: (v: unknown) => void };
  h.searchStore = adminSearch as unknown as { set: (v: unknown) => void };
  const fetchMock = vi.fn(async () => {});
  const reloadMock = vi.fn(async () => {});
  const nextPageMock = vi.fn(() => { adminPage.set(Number(adminPage.get()) + 1); });
  h.fetchMock = fetchMock;
  h.reloadMock = reloadMock;
  h.nextPageMock = nextPageMock;
  return {
    kandidatList,
    allKandidatList: mockStore([]),
    kandidatTotal: mockStore(225),
    kandidatLoading: mockStore(false),
    kandidatExhausted: mockStore(false),
    adminSearch,
    adminFilterGender: mockStore('all'),
    adminFilterAge: mockStore('all'),
    adminFilterJft: mockStore('all'),
    adminPage,
    adminSimpleView: mockStore(false),
    PAGE_SIZE: 20,
    setAdminSearch: vi.fn(),
    setAdminFilterGender: vi.fn(),
    setAdminFilterAge: vi.fn(),
    setAdminFilterJft: vi.fn(),
    nextPage: nextPageMock,
    toggleSimpleView: vi.fn(),
    resetPage: vi.fn(),
    openInputModal: vi.fn(),
    openReportModal: vi.fn(),
    fetchKandidatFromAPI: fetchMock,
    reloadKandidatList: reloadMock,
  };
});

vi.mock('../src/components/Toast', () => ({ showToast: vi.fn() }));
vi.mock('../src/lib/apiClient', () => ({ default: { secure: vi.fn(async () => ({ success: true })) } }));
vi.mock('../src/components/admin/InputManualModal', () => ({ default: () => null }));
vi.mock('../src/components/admin/LaporanBulananModal', () => ({ default: () => null }));
vi.mock('../src/components/admin/RirekishoBuilder', () => ({ default: () => null }));
vi.mock('../src/store/i18n', async () => {
  const { atom } = await import('nanostores');
  return { t: (k: string) => k, langStore: atom<'id' | 'jp'>('id'), toggleLang: vi.fn() };
});

/** Satu halaman penuh — 20 baris, seperti hasil `getCandidatesPage` page 1. */
function satuHalaman() {
  return Array.from({ length: 20 }, (_, i) => ({
    id: `KD${i}`,
    nama: `KANDIDAT ${i}`,
    wa: `6281000${i}`,
    idLoker: 'TG658',
    tahapan: 'LIST',
    status: 'OPEN',
    catatan: '',
    gender: 'L',
    usia: '25',
    jft: 'A2',
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.kandidatStore.set(satuHalaman());
  h.pageStore.set(0);
  // Store itu milik modul yang di-mock: nilainya BERTAHAN antar-tes di berkas
  // ini, jadi kriteria harus direset di sini — kalau tidak, tes berikutnya
  // mewarisi "ZZZ" dan mengukur hal yang berbeda.
  h.searchStore.set('');
});

afterEach(cleanup);

describe('TabPelamar — menjangkau kandidat ke-21 dan seterusnya', () => {
  it('tombol "More" muncul saat masih ada kandidat yang belum tampil', async () => {
    render(<TabPelamar />);
    // 225 kandidat di server, 20 tampil ⇒ harus ada cara melihat sisanya.
    expect(screen.queryByText('button.more')).not.toBeNull();
  });

  it('menekan "More" benar-benar MENGAMBIL halaman berikutnya', async () => {
    render(<TabPelamar />);
    fireEvent.click(screen.getByText('button.more'));
    // Menaikkan `adminPage` saja tidak menampilkan apa pun: daftarnya masih 20
    // baris. Halaman berikutnya harus DIAMBIL.
    expect(h.fetchMock).toHaveBeenCalled();
  });
});

// ==========================================
// TESTS: filter pelamar harus menjangkau SELURUH kandidat (2026-10-12)
//
// Keluhan pemilik: *"filter data pelamar tapi kok malah gak muncul"*.
// Sebabnya bukan database, melainkan pembagian kerja yang salah: `filtered`
// menyaring `kandidatList` — yang isinya hanya halaman yang sudah dimuat
// (`PAGE_SIZE` = 20) — dan mengetik di kotak cari TIDAK memicu permintaan baru
// sama sekali. Jadi pelamar ke-21 dan seterusnya selalu 0 baris.
//
// Perbaikannya memindahkan penyaringan ke server (`saringKandidat()`), sehingga
// yang disaring adalah semua baris sebelum dipotong per halaman. Dua tes di
// bawah memaku KEDUA sisi perbaikan itu, dan keduanya merah di kode lama:
//   1. mengubah kriteria harus MEMICU muat ulang ke server;
//   2. klien tidak boleh menyaring ulang baris yang sudah dikirim server.
// ==========================================
describe('TabPelamar — filter menjangkau semua kandidat, bukan 20 baris', () => {
  it('mengubah kotak cari memicu muat ulang ke server', async () => {
    vi.useFakeTimers();
    try {
      render(<TabPelamar />);
      // Kode lama: ini hanya mengubah atom `adminSearch`; daftarnya tetap 20
      // baris yang sudah dimuat dan tidak ada permintaan baru.
      h.searchStore.set('AGUS');
      await vi.advanceTimersByTimeAsync(400);
      expect(h.reloadMock).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('baris yang SUDAH dikirim server tidak disaring ulang di klien', async () => {
    // Kriteria aktif "ZZZ" tidak cocok dengan satu baris pun. Server tetap
    // mengirim 20 baris — karena server sudah menyaring dengan kriteria yang
    // sama, dan itu berarti 20 baris INI memang yang cocok. Kalau klien
    // menyaring ulang (perilaku lama), layarnya jadi kosong: itulah "tidak
    // muncul" yang dilaporkan pemilik.
    h.searchStore.set('ZZZ');
    render(<TabPelamar />);
    expect(screen.queryAllByText(/KANDIDAT \d+/).length).toBeGreaterThan(0);
  });
});
