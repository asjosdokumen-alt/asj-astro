/**
 * TESTS: gerbang server bank kosakata — `getBankKotoba` (surfaces/ai.ts).
 *
 * KENAPA ADA
 * ----------
 * `KotobaGame` punya gerbang login dan kartu "khusus siswa", tapi keduanya
 * hanya cermin: yang menentukan adalah apakah SERVER mengirim banknya. Sebelum
 * tes ini, tidak ada satu pun yang memanggil `getBankKotoba`, jadi gerbangnya
 * bisa dibalik (mis. `requireAdmin` dilonggarkan, atau `tolakKecualiSiswa`
 * dilewati "sementara") dan seluruh suite tetap hijau sementara 216 kosakata
 * mengalir ke kandidat biasa.
 *
 * ATURAN YANG DIKUNCI (sama dengan `/wawancara`, keputusan pemilik 2026-10-26):
 *   • tanpa sesi            → ditolak, tanpa satu kata pun;
 *   • kandidat bukan siswa  → ditolak dengan `isVip:false` (BUKAN
 *                             `sessionInvalid`, supaya UI bisa membedakan
 *                             "belum login" dari "bukan siswa");
 *   • kandidat siswa ASJ    → boleh, dan banknya benar-benar dikirim;
 *   • admin                 → boleh untuk WA siapa pun (panel TabPelamar);
 *   • status tidak terbaca  → "gagal memeriksa", bukan menuduh "bukan siswa".
 *
 * KENAPA DI `e2e/`: berkas `.test.ts` di dalam `netlify/functions/` ikut
 * dianggap function oleh Netlify, dan berkas `.ts` baru di sana memindahkan
 * counter beku `indexer`. Tier `e2e` tidak menghitung `.ts` (R13f-bis).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const SISWA = '628999170623';
const BIASA = '628111222333';

const { bankMock } = vi.hoisted(() => ({
  bankMock: { statusVip: vi.fn() },
}));

vi.mock('../netlify/functions/contexts/identity', () => ({
  requireAdmin: (t: string) =>
    t === 'tok-admin'
      ? { token: { role: 'admin' } }
      : { error: { success: false, sessionInvalid: true, message: 'Sesi admin tidak valid' } },
  isOwnerOrAdmin: (t: string | undefined, wa: string) =>
    t === 'tok-admin' || (t === 'tok-siswa' && wa === SISWA) || (t === 'tok-biasa' && wa === BIASA),
}));

vi.mock('../netlify/functions/_lib/wawancara/bank', () => bankMock);

const { AI_ACTIONS } = await import('../netlify/functions/surfaces/ai');

describe('getBankKotoba — siswa ASJ saja', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bankMock.statusVip.mockImplementation(async (wa: string) => wa === SISWA);
  });

  it('tanpa sesi: ditolak, dan bank tidak dikirim', async () => {
    const r = (await AI_ACTIONS.getBankKotoba([SISWA], undefined)) as Record<string, unknown>;
    expect(r.success).toBe(false);
    expect(r.sessionInvalid).toBe(true);
    expect(r.kosakata).toBeUndefined();
  });

  it('kandidat login yang bukan siswa: ditolak dengan isVip:false, tanpa satu kata pun', async () => {
    const r = (await AI_ACTIONS.getBankKotoba([BIASA], 'tok-biasa')) as Record<string, unknown>;
    expect(r.success).toBe(false);
    expect(r.isVip).toBe(false);
    /* Bukan "sesi tidak valid": UI harus bisa membedakan dari belum login. */
    expect(r.sessionInvalid).toBeUndefined();
    expect(r.kosakata).toBeUndefined();
  });

  it('kandidat siswa ASJ: boleh, dan banknya benar-benar dikirim', async () => {
    const r = (await AI_ACTIONS.getBankKotoba([SISWA], 'tok-siswa')) as Record<string, unknown>;
    expect(r.success).toBe(true);
    expect(r.isVip).toBe(true);
    const kata = r.kosakata as Array<Record<string, unknown>>;
    /* Bukan sekadar "ada array": harus ada isinya, kalau tidak gerbangnya
       lulus hanya karena mengirim daftar kosong. */
    expect(kata.length).toBeGreaterThan(200);
    expect(typeof r.jumlah).toBe('number');
    expect(r.jumlah).toBe(kata.length);
    /* Bentuk satu baris — kunci-kunci ini yang dibaca KotobaGame. */
    const satu = kata[0];
    for (const f of ['b', 'pos', 'k', 'h', 'r', 'id']) expect(satu).toHaveProperty(f);
    /* Dan daftar bab diturunkan dari data, bukan ditulis 1..25. */
    expect(Array.isArray(r.bab)).toBe(true);
    expect((r.bab as number[]).length).toBeGreaterThan(0);
  });

  it('admin: boleh untuk WA siapa pun (panel TabPelamar)', async () => {
    const r = (await AI_ACTIONS.getBankKotoba([BIASA], 'tok-admin')) as Record<string, unknown>;
    expect(r.success).toBe(true);
  });

  it('kandidat tidak bisa membuka WA orang lain, walau dia sendiri siswa', async () => {
    const r = (await AI_ACTIONS.getBankKotoba([BIASA], 'tok-siswa')) as Record<string, unknown>;
    expect(r.success).toBe(false);
    expect(r.sessionInvalid).toBe(true);
  });

  it('pemeriksaan status gagal (DB mati) tidak menuduh kandidat "bukan siswa"', async () => {
    bankMock.statusVip.mockResolvedValue(null);
    const r = (await AI_ACTIONS.getBankKotoba([SISWA], 'tok-siswa')) as Record<string, unknown>;
    expect(r.success).toBe(false);
    expect(r.isVip).toBeUndefined();
    expect(String(r.message)).toMatch(/Gagal memeriksa status siswa/);
  });
});

/**
 * Bank BIDANG KERJA (SSW) — penjaga yang sama, endpoint terpisah.
 *
 * KENAPA TES INI ADA, padahal `getBankKotoba` sudah diuji di atas: penjaga yang
 * dipakai bersama hanya aman kalau SETIAP endpoint yang memakainya diuji.
 * Kalau `getBankSsw` ditambahkan tanpa tes, seseorang bisa menyalin aksinya dan
 * lupa memanggil `tolakKecualiSiswa` — dan 382 kata bidang mengalir ke kandidat
 * biasa tanpa satu gate pun berbunyi. Persis lubang yang ditutup tes di atas
 * untuk bank buku.
 */
describe('getBankSsw — siswa ASJ saja', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bankMock.statusVip.mockImplementation(async (wa: string) => wa === SISWA);
  });

  it('tanpa sesi: ditolak, dan tidak ada satu bidang pun terkirim', async () => {
    const r = (await AI_ACTIONS.getBankSsw([SISWA], undefined)) as Record<string, unknown>;
    expect(r.success).toBe(false);
    expect(r.sessionInvalid).toBe(true);
    expect(r.bidang).toBeUndefined();
  });

  it('kandidat bukan siswa: ditolak dengan isVip:false, tanpa data bidang', async () => {
    const r = (await AI_ACTIONS.getBankSsw([BIASA], 'tok-biasa')) as Record<string, unknown>;
    expect(r.success).toBe(false);
    expect(r.isVip).toBe(false);
    expect(r.sessionInvalid).toBeUndefined();
    expect(r.bidang).toBeUndefined();
  });

  it('kandidat siswa: 16 bidang terkirim, tiap bidang berisi kata', async () => {
    const r = (await AI_ACTIONS.getBankSsw([SISWA], 'tok-siswa')) as Record<string, unknown>;
    expect(r.success).toBe(true);
    expect(r.isVip).toBe(true);
    const bidang = r.bidang as Array<Record<string, unknown>>;
    expect(bidang.length).toBe(16);
    /* Bukan sekadar "ada 16 entri": tiap bidang harus benar-benar berisi, kalau
       tidak gerbangnya lulus hanya karena mengirim kerangka kosong. */
    for (const b of bidang) {
      const kata = b.kata as Array<Record<string, unknown>>;
      expect(Array.isArray(kata)).toBe(true);
      expect(kata.length).toBeGreaterThan(14);
      expect(typeof b.id).toBe('string');
      expect(typeof b.namaJp).toBe('string');
      for (const f of ['b', 'pos', 'k', 'h', 'r', 'id']) expect(kata[0]).toHaveProperty(f);
    }
    expect(typeof r.jumlah).toBe('number');
    expect(r.jumlah).toBe(bidang.reduce((n, b) => n + (b.kata as unknown[]).length, 0));
  });

  it('kandidat tidak bisa membuka WA orang lain, walau dia sendiri siswa', async () => {
    const r = (await AI_ACTIONS.getBankSsw([BIASA], 'tok-siswa')) as Record<string, unknown>;
    expect(r.success).toBe(false);
    expect(r.sessionInvalid).toBe(true);
  });

  it('pemeriksaan status gagal (DB mati) tidak menuduh kandidat "bukan siswa"', async () => {
    bankMock.statusVip.mockResolvedValue(null);
    const r = (await AI_ACTIONS.getBankSsw([SISWA], 'tok-siswa')) as Record<string, unknown>;
    expect(r.success).toBe(false);
    expect(r.isVip).toBeUndefined();
    expect(String(r.message)).toMatch(/Gagal memeriksa status siswa/);
  });
});
