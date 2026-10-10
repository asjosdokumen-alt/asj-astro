/**
 * TESTS: TabPelamar — tombol "More" (halaman berikutnya).
 *
 * KENAPA DI `e2e/`: `indexer` menghitung SELURUH berkas di bawah `src/**`, jadi
 * `.test.tsx` baru di sana memindahkan counter beku.
 *
 * YANG DIUJI
 * ----------
 * Daftar kandidat diambil per halaman (`PAGE_SIZE` = 20) dan tombol "More"
 * ditampilkan HANYA kalau masih ada baris yang belum tampil:
 *
 *     {shown.length < filtered.length && <button onClick={nextPage}>…}
 *
 * `nextPage()` menaikkan `adminPage`, dan `shown` memotong daftar sepanjang
 * `(page+1) * PAGE_SIZE`. Kalau tidak ada yang MENGAMBIL halaman berikutnya,
 * `filtered` tetap sepanjang 20 dan tombolnya tidak pernah muncul — kandidat
 * ke-21 dan seterusnya tidak bisa dijangkau sama sekali dari layar.
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TabPelamar from '../src/components/admin/TabPelamar';

const h = vi.hoisted(() => ({
  kandidatStore: null as unknown as { set: (v: unknown) => void },
  pageStore: null as unknown as { set: (v: unknown) => void },
  fetchMock: null as unknown as ReturnType<typeof vi.fn>,
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
  h.kandidatStore = kandidatList as unknown as { set: (v: unknown) => void };
  h.pageStore = adminPage as unknown as { set: (v: unknown) => void };
  const fetchMock = vi.fn(async () => {});
  const nextPageMock = vi.fn(() => { adminPage.set(Number(adminPage.get()) + 1); });
  h.fetchMock = fetchMock;
  h.nextPageMock = nextPageMock;
  return {
    kandidatList,
    allKandidatList: mockStore([]),
    kandidatTotal: mockStore(225),
    kandidatLoading: mockStore(false),
    kandidatExhausted: mockStore(false),
    adminSearch: mockStore(''),
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
    reloadKandidatList: vi.fn(async () => {}),
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
