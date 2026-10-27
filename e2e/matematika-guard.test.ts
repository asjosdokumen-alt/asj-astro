/**
 * TESTS: gerbang server bank soal matematika — `getBankMatematika`
 * (`surfaces/ai.ts`).
 *
 * KENAPA ADA
 * ----------
 * `MatematikaGame` punya gerbang login dan kartu "khusus siswa", tapi keduanya
 * hanya cermin: yang menentukan adalah apakah SERVER mengirim banknya. Tanpa tes
 * ini, gerbangnya bisa dibalik (mis. `requireAdmin` dilonggarkan, atau
 * `tolakKecualiSiswa` dilewati "sementara") dan seluruh suite tetap hijau
 * sementara 69 soal cerita beserta pembahasannya mengalir ke kandidat biasa.
 *
 * ATURAN YANG DIKUNCI (sama dengan `/wawancara` dan `/kotoba`, keputusan pemilik
 * 2026-10-26/27):
 *   • tanpa sesi            → ditolak, tanpa satu soal pun;
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

describe('getBankMatematika — siswa ASJ saja', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bankMock.statusVip.mockImplementation(async (wa: string) => wa === SISWA);
  });

  it('tanpa sesi: ditolak, dan bank tidak dikirim', async () => {
    const r = (await AI_ACTIONS.getBankMatematika([SISWA], undefined)) as Record<string, unknown>;
    expect(r.success).toBe(false);
    expect(r.sessionInvalid).toBe(true);
    expect(r.cerita).toBeUndefined();
  });

  it('kandidat login yang bukan siswa: ditolak dengan isVip:false, tanpa satu soal pun', async () => {
    const r = (await AI_ACTIONS.getBankMatematika([BIASA], 'tok-biasa')) as Record<string, unknown>;
    expect(r.success).toBe(false);
    expect(r.isVip).toBe(false);
    /* Bukan "sesi tidak valid": UI harus bisa membedakan dari belum login. */
    expect(r.sessionInvalid).toBeUndefined();
    expect(r.cerita).toBeUndefined();
  });

  it('kandidat siswa ASJ: boleh, dan banknya benar-benar dikirim', async () => {
    const r = (await AI_ACTIONS.getBankMatematika([SISWA], 'tok-siswa')) as Record<string, unknown>;
    expect(r.success).toBe(true);
    expect(r.isVip).toBe(true);

    const soal = r.cerita as Array<Record<string, unknown>>;
    /* Bukan sekadar "ada array": harus ada isinya, kalau tidak gerbangnya
       lulus hanya karena mengirim daftar kosong. Ambang 60 = di atas bank
       versi HTML aslinya (8 soal), jadi tes ini juga menolak regresi ke bank
       kecil yang dikeluhkan pemilik. */
    expect(soal.length).toBeGreaterThanOrEqual(60);
    expect(typeof r.jumlah).toBe('number');
    expect(r.jumlah).toBe(soal.length);

    /* Bentuk satu baris — kunci-kunci ini yang dibaca MatematikaGame. */
    const satu = soal[0];
    for (const f of ['kode', 'tag', 'diff', 'q', 'ans', 'unit', 'exp']) expect(satu).toHaveProperty(f);

    /* Enam modul, dan tiap modul membawa durasinya sendiri: 15 soal cerita
       dalam 120 detik akan mengukur keberanian menebak, bukan hitungan. */
    const kategori = r.kategori as Array<Record<string, unknown>>;
    expect(kategori.length).toBe(10);
    const cerita = kategori.find((k) => k.id === 'cerita');
    expect(cerita?.detik).toBeGreaterThan(300);
    for (const k of kategori) {
      expect(typeof k.jp).toBe('string');
      expect(Number(k.soal)).toBeGreaterThan(0);
      expect(Number(k.detik)).toBeGreaterThan(0);
    }
  });

  it('admin: boleh untuk WA siapa pun (panel TabPelamar)', async () => {
    const r = (await AI_ACTIONS.getBankMatematika([BIASA], 'tok-admin')) as Record<string, unknown>;
    expect(r.success).toBe(true);
    expect((r.cerita as unknown[]).length).toBeGreaterThan(0);
  });

  it('kandidat tidak bisa membuka WA orang lain, walau dia sendiri siswa', async () => {
    const r = (await AI_ACTIONS.getBankMatematika([BIASA], 'tok-siswa')) as Record<string, unknown>;
    expect(r.success).toBe(false);
    expect(r.sessionInvalid).toBe(true);
    expect(r.cerita).toBeUndefined();
  });

  it('pemeriksaan status gagal (DB mati) tidak menuduh kandidat "bukan siswa"', async () => {
    bankMock.statusVip.mockResolvedValue(null);
    const r = (await AI_ACTIONS.getBankMatematika([SISWA], 'tok-siswa')) as Record<string, unknown>;
    expect(r.success).toBe(false);
    expect(r.isVip).toBeUndefined();
    expect(String(r.message)).toMatch(/Gagal memeriksa status siswa/);
  });
});
