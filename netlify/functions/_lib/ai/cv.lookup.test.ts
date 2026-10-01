// ==========================================
// TESTS: ai/cv — lookup kandidat membedakan "tidak ada" dari "lookup tidak bisa
// jalan", dan MENGATAKAN yang kedua.
//
// `findCandidateByWaFiltered` / `findCandidateByIdFiltered` punya tiga hasil:
// row | null (query jalan, tidak ada) | undefined (query tidak bisa jalan).
// Setiap pemanggil di lapisan AI dulu menangani `undefined` dengan
// `findCandidates()` — stub yang mengembalikan `{ rows: [] }` tanpa syarat
// (`db/candidates.ts:90`) — sehingga "fallback" itu tidak pernah bisa
// menemukan apa pun. Kegagalannya senyap: dengan skema yang bergeser, Jeklin
// kehilangan seluruh blok "DATA KANDIDAT SAAT INI", gate VIP/KELAS membaca
// catatan kosong, dan wawancara jatuh ke BIDANG_DEFAULT, semuanya sambil tetap
// menjawab normal.
//
// Tes ini memaku bahwa jalur degradasi itu sekarang BERISIK, dan bahwa hasilnya
// tetap `null` (AI degradasi) — bukan melempar, yang akan mengubah kegagalan
// senyap menjadi pemadaman total.
// ==========================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  byWa: vi.fn(),
  byId: vi.fn(),
}));

vi.mock('../db/candidates.ts', () => ({
  findCandidateByWaFiltered: mocks.byWa,
  findCandidateByIdFiltered: mocks.byId,
  findCandidates: vi.fn(async () => ({ table: 'database_candidate', rows: [] })),
}));

import { findCandidateByWaOrNull, findCandidateByIdOrNull } from './cv';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.byWa.mockReset();
  mocks.byId.mockReset();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

/** Baris log `ai.candidate-lookup-unavailable`, kalau ada. */
function lookupWarnings(): string[] {
  return warn.mock.calls
    .map((c: unknown[]) => String(c[0]))
    .filter((l: string) => l.includes('ai.candidate-lookup-unavailable'));
}

describe('lookup kandidat — "tidak ada" vs "lookup tidak bisa jalan"', () => {
  it('kandidat tidak ada (null) → null, dan TIDAK ada peringatan', async () => {
    mocks.byWa.mockResolvedValue(null);
    expect(await findCandidateByWaOrNull('6285700000001')).toBe(null);
    // Ini keadaan normal: kandidatnya memang belum terdaftar. Tidak boleh
    // berisik, atau peringatannya jadi tidak berguna.
    expect(lookupWarnings()).toEqual([]);
  });

  it('kandidat ketemu → barisnya, tanpa peringatan', async () => {
    mocks.byWa.mockResolvedValue({ id: 7, no_wa: '6285700000001' });
    expect(await findCandidateByWaOrNull('6285700000001')).toMatchObject({ id: 7 });
    expect(lookupWarnings()).toEqual([]);
  });

  it('lookup TIDAK BISA JALAN (undefined) → null, DAN ada peringatan', async () => {
    mocks.byWa.mockResolvedValue(undefined);
    expect(await findCandidateByWaOrNull('6285700000001')).toBe(null);
    expect(lookupWarnings()).toHaveLength(1);
  });

  it('versi by-id berperilaku sama', async () => {
    mocks.byId.mockResolvedValue(undefined);
    expect(await findCandidateByIdOrNull('ASJ00123')).toBe(null);
    expect(lookupWarnings()).toHaveLength(1);
  });

  it('WA di-hash di log — nomor kandidat tidak boleh masuk log mentah', async () => {
    mocks.byWa.mockResolvedValue(undefined);
    await findCandidateByWaOrNull('6285700000001');
    const line = lookupWarnings()[0] ?? '';
    expect(line).not.toContain('6285700000001');
    // Hash-nya tetap ada, supaya beberapa kejadian bisa dikorelasikan.
    expect(line).toContain('wa');
  });

  it('`undefined` TIDAK melempar — degradasi, bukan pemadaman', async () => {
    mocks.byWa.mockResolvedValue(undefined);
    // Melempar di sini akan mengubah "AI kehilangan konteks" menjadi "AI mati".
    // Pemanggil memang membungkusnya dengan try/catch fail-open, tapi pemanggil
    // yang tidak membungkusnya (mis. resolveProfilKandidat) akan ikut jatuh.
    await expect(findCandidateByWaOrNull('6285700000001')).resolves.toBe(null);
  });

  it('error DB sungguhan TETAP naik ke pemanggil', async () => {
    mocks.byWa.mockRejectedValue(new Error('PostgREST down'));
    // Kegagalan transport bukan "tidak bisa jalan" — itu harus tetap terlihat
    // sebagai kegagalan, bukan ditelan jadi null.
    await expect(findCandidateByWaOrNull('6285700000001')).rejects.toThrow('PostgREST down');
  });
});
