/**
 * TESTS: `reloadKandidatList` — memuat ulang daftar kandidat setelah mutasi.
 *
 * KENAPA DI `e2e/`: `indexer` menghitung SELURUH berkas di bawah `src/**`, jadi
 * `.test.ts` baru di sana memindahkan counter beku.
 *
 * BUG YANG DIKUNCI
 * ----------------
 * `fetchKandidatFromAPI()` MENAMBAH ketika halaman aktif bukan 0:
 *
 *     setKandidatList(page === 0 ? k : [...kandidatList.get(), ...k])
 *
 * Jadi memanggilnya untuk menyegarkan daftar saat admin sudah membuka halaman
 * ke-2 (atau lebih) menambahkan halaman itu untuk KEDUA kalinya: barisnya
 * berlipat, dan halaman berikutnya tidak pernah ikut. Yang benar: halaman
 * pertama dimuat dengan MENGGANTI, sisanya ditambahkan berurutan — persis
 * seperti kalau admin memuatnya sendiri sampai kedalaman itu.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSecure } = vi.hoisted(() => ({ mockSecure: vi.fn() }));

vi.mock('../src/lib/apiClient', () => ({
  default: { secure: (...a: unknown[]) => mockSecure(...a) },
}));

const { kandidatList, adminPage, kandidatExhausted, fetchKandidatFromAPI, reloadKandidatList, PAGE_SIZE } =
  await import('../src/store/adminStore');

/** Satu halaman penuh; id-nya memuat nomor halaman server supaya bisa dilacak. */
function halaman(serverPage: number) {
  return Array.from({ length: PAGE_SIZE }, (_, i) => ({
    id: `P${serverPage}-${i}`,
    nama: `NAMA ${serverPage}-${i}`,
    wa: `${serverPage}${i}`,
  }));
}

beforeEach(() => {
  mockSecure.mockReset();
  kandidatList.set([]);
  adminPage.set(0);
  kandidatExhausted.set(false);
  mockSecure.mockImplementation(async (_action: string, args: Array<{ page: number }>) => {
    const page = args[0].page;
    return { success: true, total: 225, candidates: halaman(page) };
  });
});

describe('reloadKandidatList', () => {
  it('menyegarkan pada kedalaman yang sama TANPA menggandakan baris', async () => {
    // Halaman 1, lalu admin menekan "More" sekali (halaman 2 dimuat).
    await fetchKandidatFromAPI();
    adminPage.set(1);
    await fetchKandidatFromAPI();
    expect(kandidatList.get()).toHaveLength(2 * PAGE_SIZE);

    await reloadKandidatList();

    const ids = kandidatList.get().map((k) => k.id);
    expect(ids).toHaveLength(2 * PAGE_SIZE);
    expect(new Set(ids).size, 'tidak boleh ada baris kembar').toBe(ids.length);
    // dan isinya memang halaman 1 + 2, bukan halaman 2 dua kali
    expect(ids.filter((id) => id.startsWith('P1-'))).toHaveLength(PAGE_SIZE);
    expect(ids.filter((id) => id.startsWith('P2-'))).toHaveLength(PAGE_SIZE);
  });

  it('kedalaman tetap: setelah reload admin masih di halaman yang sama', async () => {
    await fetchKandidatFromAPI();
    adminPage.set(1);
    await fetchKandidatFromAPI();
    await reloadKandidatList();
    expect(adminPage.get()).toBe(1);
  });

  it('menandai daftar habis kalau server mengembalikan kurang dari satu halaman', async () => {
    mockSecure.mockImplementation(async () => ({ success: true, total: 5, candidates: halaman(1).slice(0, 5) }));
    await fetchKandidatFromAPI();
    expect(kandidatExhausted.get()).toBe(true);
  });
});
