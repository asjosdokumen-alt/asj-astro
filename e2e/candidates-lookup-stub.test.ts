// ==========================================
// TESTS: db/candidates — stub `findCandidates()` harus BERISIK, bukan senyap.
//
// `findCandidates()` SELALU mengembalikan `{ rows: [] }` tanpa menyentuh
// database. Empat belas pemanggil memperlakukannya sebagai fallback terakhir
// untuk kasus "lookup bertarget mengembalikan `undefined`" (= kolom WA/ID tidak
// ada di skema) — mis. `contexts/documents/repository.ts:32,43,59`,
// `contexts/catalog/service.ts:75,160`, `contexts/diagnostics/repository.ts:42`.
//
// Karena hasilnya selalu kosong, semua cabang itu melaporkan "kandidat tidak
// ditemukan" untuk keadaan yang sebenarnya BERBEDA: "lookup tidak bisa
// dijalankan". Dua keadaan itu tidak bisa dibedakan di permukaan, jadi tidak ada
// yang tahu kapan harus memperbaikinya.
//
// Lapisan AI sudah memutuskan soal ini (`_lib/ai/cv.ts`: catat + degradasi).
// Tes ini memaku bahwa stub bersama melakukan hal yang SAMA untuk semua
// pemanggil, tanpa mengubah perilakunya:
//   - barisnya tetap kosong (perilaku TIDAK berubah),
//   - pemanggil tidak menerima sinyal berbeda (masih `[]`, bukan throw),
//   - tapi keadaannya sekarang terlihat di log.
//
// KENAPA DI `e2e/`: lihat catatan di `e2e/ai-cv-submit.test.ts` — tier `e2e`
// hanya menghitung mjs/cjs/js, jadi suite `.ts` di sini tidak menggerakkan
// counter beku yang hanya boleh di-baseline ulang team-lead.
// ==========================================
import { describe, it, expect, vi, afterEach } from 'vitest';

// HOISTED by vitest (`vi.mock`, bukan `vi.doMock`). Hanya lookup bertarget yang
// diganti supaya fallback terakhir pemanggil (`findCandidates()`) benar-benar
// tercapai.
//
// MENGAPA BUKAN `vi.doMock`: versi sebelumnya memakai `vi.doMock` +
// `vi.resetModules()` di dalam badan tes, dan mock itu TIDAK PERNAH diterapkan.
// Terukur 2026-10-04: fungsi yang diimpor bukan mock (`vi.isMockFunction` ->
// false) dan lookup aslinya mengembalikan `null` (bukan `undefined`), sehingga
// `c === undefined` tidak pernah benar dan cabang fallback tidak pernah jalan.
// Itu sebabnya tes ini merah lama sambil terlihat seperti bug produk — padahal
// stub-nya sendiri memang mencatat (tes #2 dan #3 lulus).
vi.mock('../netlify/functions/_lib/db/candidates', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    findCandidateByWaFiltered: vi.fn(async () => undefined),
  };
});

/** Baris log `candidates.lookup-unavailable` yang tercetak. */
function unavailableLines(spy: ReturnType<typeof vi.spyOn>): string[] {
  return (spy.mock.calls as unknown[][])
    .map((c) => String(c[0] ?? ''))
    .filter((l) => l.includes('candidates.lookup-unavailable'));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('stub findCandidates() — kegagalan lookup harus terlihat di log', () => {
  it('jalur fallback memicu log, dan pemanggil tetap menerima null (degradasi, bukan pemadaman)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // `findCandidateByWaFiltered` -> `undefined` = "kolom WA tidak ada di skema".
    // Itu satu-satunya keadaan yang membuat pemanggil masuk ke `findCandidates()`.
    // Mock-nya di-hoist di kepala berkas; `vi.doMock` di sini tidak diterapkan
    // (lihat catatan di `vi.mock`), dan itulah sebab tes ini merah sejak lama.
    vi.resetModules();

    const { findCandidateRow } = await import(
      '../netlify/functions/contexts/documents/repository'
    );
    const row = await findCandidateRow('628123456789');

    // Perilaku TIDAK berubah: kandidat yang tidak bisa dibaca tetap `null`.
    expect(row).toBeNull();
    // Tapi keadaannya sekarang terlihat: stub mencatat bahwa ia dipanggil.
    const lines = unavailableLines(warnSpy);
    expect(lines.length).toBeGreaterThan(0);
    // Dan log-nya MENYEBUT dirinya stub, bukan menyamar sebagai hasil pencarian.
    expect(lines.join('\n')).toContain('findCandidates-stub');
  });

  it('stub tidak melakukan request (cabangnya tetap gratis)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('stub tidak boleh melakukan request');
    });

    // Stub-nya diekspor, jadi kita panggil LANGSUNG — bukan lewat pemanggil.
    // Kalau diukur lewat pemanggil, request milik lookup bertarget ikut terhitung
    // dan tesnya menuduh stub atas biaya yang bukan miliknya.
    const { findCandidates } = await import('../netlify/functions/_lib/db/candidates');
    const out = await findCandidates();

    expect(out.rows).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(unavailableLines(warnSpy).length).toBeGreaterThan(0);
  });

  it('pemanggil nyata (fallback bertarget) tetap menerima array kosong, bukan throw', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { findCandidates } = await import('../netlify/functions/_lib/db/candidates');
    // Bentuk hasilnya adalah kontrak yang diandalkan 14 pemanggil:
    // `found.rows.find(...)`. Mengubahnya jadi throw = pemadaman, bukan degradasi.
    await expect(findCandidates()).resolves.toMatchObject({
      table: expect.any(String),
      rows: [],
    });
  });
});
