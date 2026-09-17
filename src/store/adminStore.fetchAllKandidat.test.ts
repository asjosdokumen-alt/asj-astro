// ==========================================
// TESTS: adminStore.fetchAllKandidat — penjaga in-flight + jendela kesegaran (§26)
//
// Sebelumnya setiap mount TabDbJob dan setiap buka ListKandidatModal menembak
// ulang loop paginasi BERURUTAN (200 baris/halaman, 0,68–1,06 s per round trip)
// tanpa penjaga in-flight maupun cache. Invarian yang dipaku di sini:
//   1. Dua panggilan bersamaan → SATU paginasi (pemanggil kedua menumpang).
//   2. Hasil dipakai ulang dalam TTL untuk token yang sama.
//   3. `{ force: true }` menembus TTL — dipakai refresh setelah operasi tulis.
//   4. Token berbeda → cache tidak dipakai (ganti akun di tab sama tidak bocor).
//   5. Hasil kosong / gagal TIDAK dianggap segar (percobaan berikutnya jalan).
// ==========================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state: { isLoggedIn: boolean; sessionToken: string } = { isLoggedIn: true, sessionToken: '' };

vi.mock('./authReactive', () => ({
  authStore: { get: () => state, set: () => {}, listen: () => () => {} },
  logout: vi.fn(),
}));

import { allKandidatList, kandidatTotal, fetchAllKandidat } from './adminStore';

const PAGE_SIZE = 200;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Responder paginasi getCandidatesPage yang meniru bentuk balasan backend. */
function paginated(total: number) {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const page = body.payload[0].page as number;
    const start = (page - 1) * PAGE_SIZE;
    const rows: unknown[] = [];
    for (let i = start; i < Math.min(start + PAGE_SIZE, total); i++) {
      rows.push({ id: String(i), wa: '08' + i, nama: 'K' + i, idLoker: 'J1' });
    }
    return jsonResponse({ success: true, candidates: rows, total });
  });
}

beforeEach(() => {
  // Token unik per tes: cache hidup di scope modul, bukan di atom, jadi token
  // yang berbeda memastikan tidak ada tes yang menumpang hasil tes lain.
  state.sessionToken = 'tok-' + Math.random().toString(36).slice(2);
  allKandidatList.set([]);
  kandidatTotal.set(0);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchAllKandidat — penjaga in-flight + kesegaran (§26)', () => {
  it('dua panggilan bersamaan berbagi SATU paginasi (penjaga in-flight)', async () => {
    const f = paginated(300); // 2 halaman: 200 + 100
    vi.stubGlobal('fetch', f);

    const [a, b] = await Promise.all([fetchAllKandidat(), fetchAllKandidat()]);

    // Satu pass = 2 permintaan. Tanpa penjaga in-flight, dua pemanggil
    // bersamaan akan menghasilkan 4.
    expect(f).toHaveBeenCalledTimes(2);
    expect(a).toHaveLength(300);
    expect(b).toEqual(a);
  });

  it('panggilan kedua dalam TTL memakai ulang hasil tanpa menembak ulang', async () => {
    const f = paginated(50);
    vi.stubGlobal('fetch', f);

    const first = await fetchAllKandidat();
    expect(first).toHaveLength(50);
    expect(f).toHaveBeenCalledTimes(1);

    const again = await fetchAllKandidat();
    expect(f).toHaveBeenCalledTimes(1);
    expect(again).toHaveLength(50);
  });

  it('{ force: true } menembus jendela kesegaran', async () => {
    const f = paginated(50);
    vi.stubGlobal('fetch', f);

    await fetchAllKandidat();
    await fetchAllKandidat();
    expect(f).toHaveBeenCalledTimes(1);

    await fetchAllKandidat({ force: true });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('token berbeda → cache tidak dipakai (ganti akun tidak bocor)', async () => {
    const f = paginated(50);
    vi.stubGlobal('fetch', f);

    await fetchAllKandidat();
    expect(f).toHaveBeenCalledTimes(1);

    state.sessionToken = 'tok-admin-lain';
    await fetchAllKandidat();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('hasil kosong tidak dianggap segar — panggilan berikutnya menembak ulang', async () => {
    const f = paginated(0);
    vi.stubGlobal('fetch', f);

    const rows = await fetchAllKandidat();
    expect(rows).toHaveLength(0);
    expect(f).toHaveBeenCalledTimes(1);

    await fetchAllKandidat();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('kegagalan jaringan tidak di-cache — panggilan berikutnya mencoba lagi', async () => {
    const boom = vi.fn(async () => {
      throw new Error('offline');
    });
    vi.stubGlobal('fetch', boom);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const rows = await fetchAllKandidat();
    expect(rows).toHaveLength(0);
    expect(boom).toHaveBeenCalledTimes(1);

    await fetchAllKandidat();
    expect(boom).toHaveBeenCalledTimes(2);
  });

  it('dedupe by WA tetap berlaku (count akurat)', async () => {
    const f = vi.fn(async () =>
      jsonResponse({
        success: true,
        total: 2,
        candidates: [
          { id: '1', wa: '0811', nama: 'A', idLoker: 'J1' },
          { id: '2', wa: '0811', nama: 'A lagi', idLoker: 'J1' },
        ],
      }),
    );
    vi.stubGlobal('fetch', f);

    const rows = await fetchAllKandidat();
    expect(rows).toHaveLength(1);
    expect(kandidatTotal.get()).toBe(1);
  });
});
