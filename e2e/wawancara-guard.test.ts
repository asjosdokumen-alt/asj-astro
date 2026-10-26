/**
 * TESTS: gerbang server bank soal wawancara — `tolakKecualiSiswa` (surfaces/ai.ts).
 *
 * KENAPA ADA: kartu di UI (`MensetsuForm`) hanya cermin. Yang benar-benar
 * menahan bank 177 soal adalah tiga aksi di surface ini, dan sebelum
 * 2026-10-26 tidak ada satu pun tes yang memanggilnya. Tes UI bisa hijau
 * sementara server tetap mengirim soal ke siapa pun yang punya sesi.
 *
 * ATURAN YANG DIKUNCI (keputusan pemilik 2026-10-26):
 *   • tanpa sesi            → ditolak, tanpa satu soal pun;
 *   • kandidat bukan siswa  → ditolak dengan `isVip:false` (bukan "sesi tidak valid",
 *                             supaya UI bisa membedakan "belum login" dari "bukan siswa");
 *   • kandidat siswa ASJ    → boleh, dan bank soalnya benar-benar dikirim;
 *   • admin                 → boleh untuk WA siapa pun (panel TabPelamar).
 *
 * KENAPA DI `e2e/` DAN BUKAN DI `netlify/functions/`: berkas `*.test.ts` di dalam
 * `netlify/functions/` ikut dianggap function oleh Netlify (lihat catatan
 * `share-data.test.ts` di vitest.config.ts), dan berkas `.ts` baru di sana juga
 * memindahkan counter beku `indexer`. Tier `e2e` tidak menghitung `.ts`.
 * WAJIB terdaftar di `exclude` project 'frontend' (jsdom) — kalau tidak, suite
 * backend ini jalan dua kali di lingkungan yang salah (R13f-bis).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const BUDI = '628999170623'; // ASJ00188, catatan_internal "[VIP]"
const BIASA = '628111222333';

const { bankMock } = vi.hoisted(() => ({
  bankMock: {
    statusVip: vi.fn(),
    gabungBankDanJawaban: vi.fn(),
    simpanJawaban: vi.fn(),
    terjemahkanJawaban: vi.fn(),
  },
}));

vi.mock('../netlify/functions/contexts/identity', () => ({
  requireAdmin: (t: string) =>
    t === 'tok-admin'
      ? { token: { role: 'admin' } }
      : { error: { success: false, sessionInvalid: true, message: 'Sesi admin tidak valid' } },
  isOwnerOrAdmin: (t: string | undefined, wa: string) =>
    t === 'tok-admin' || (t === 'tok-budi' && wa === BUDI) || (t === 'tok-biasa' && wa === BIASA),
}));

vi.mock('../netlify/functions/_lib/wawancara/bank', () => bankMock);

const { AI_ACTIONS } = await import('../netlify/functions/surfaces/ai');

describe('getBankWawancara — siswa ASJ saja', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bankMock.statusVip.mockImplementation(async (wa: string) => wa === BUDI);
    bankMock.gabungBankDanJawaban.mockResolvedValue({
      wa: BUDI,
      isVip: true,
      jumlah: 1,
      tahap: ['Pertanyaan & Pemahaman Diri'],
      soal: [{ kode: 'W01', tahap: 'Pertanyaan & Pemahaman Diri', urutan: 1 }],
    });
    bankMock.simpanJawaban.mockResolvedValue({ success: true });
    bankMock.terjemahkanJawaban.mockResolvedValue({ success: true, jp: 'はい' });
  });

  it('tanpa sesi: ditolak, dan bank soal tidak pernah dimuat', async () => {
    const r = (await AI_ACTIONS.getBankWawancara([BUDI], undefined)) as Record<string, unknown>;
    expect(r.success).toBe(false);
    expect(r.sessionInvalid).toBe(true);
    expect(bankMock.gabungBankDanJawaban).not.toHaveBeenCalled();
  });

  it('kandidat login yang bukan siswa: ditolak dengan isVip:false, tanpa soal', async () => {
    const r = (await AI_ACTIONS.getBankWawancara([BIASA], 'tok-biasa')) as Record<string, unknown>;
    expect(r.success).toBe(false);
    expect(r.isVip).toBe(false);
    /* Bukan "sesi tidak valid": UI harus bisa membedakan dari belum login. */
    expect(r.sessionInvalid).toBeUndefined();
    expect(r.soal).toBeUndefined();
    expect(bankMock.gabungBankDanJawaban).not.toHaveBeenCalled();
  });

  it('kandidat VIP: boleh, dan bank soalnya benar-benar dikirim', async () => {
    const r = (await AI_ACTIONS.getBankWawancara([BUDI], 'tok-budi')) as Record<string, unknown>;
    expect(r.success).toBe(true);
    expect(Array.isArray(r.soal)).toBe(true);
    expect((r.soal as unknown[]).length).toBe(1);
  });

  it('admin: boleh untuk WA siapa pun (panel TabPelamar)', async () => {
    const r = (await AI_ACTIONS.getBankWawancara([BIASA], 'tok-admin')) as Record<string, unknown>;
    expect(r.success).toBe(true);
  });

  it('kandidat tidak bisa membuka WA orang lain, walau dia sendiri siswa', async () => {
    const r = (await AI_ACTIONS.getBankWawancara([BIASA], 'tok-budi')) as Record<string, unknown>;
    expect(r.success).toBe(false);
    expect(r.sessionInvalid).toBe(true);
  });

  it('jalur simpan & terjemah memakai gerbang yang sama', async () => {
    const simpan = (await AI_ACTIONS.simpanJawabanWawancara(
      [BIASA, 'W01', { arti: 'halo' }],
      'tok-biasa',
    )) as Record<string, unknown>;
    expect(simpan.success).toBe(false);
    expect(bankMock.simpanJawaban).not.toHaveBeenCalled();

    const terjemah = (await AI_ACTIONS.terjemahkanJawabanWawancara(
      [BIASA, 'W01', 'halo'],
      'tok-biasa',
    )) as Record<string, unknown>;
    expect(terjemah.success).toBe(false);
    expect(bankMock.terjemahkanJawaban).not.toHaveBeenCalled();

    /* Dan VIP memang bisa menyimpan — kalau tidak, gerbangnya cuma "semua ditolak". */
    const ok = (await AI_ACTIONS.simpanJawabanWawancara(
      [BUDI, 'W01', { arti: 'halo' }],
      'tok-budi',
    )) as Record<string, unknown>;
    expect(ok.success).toBe(true);
    expect(bankMock.simpanJawaban).toHaveBeenCalled();
  });

  it('pemeriksaan status gagal (DB mati) tidak menuduh kandidat "bukan siswa"', async () => {
    bankMock.statusVip.mockResolvedValue(null);
    const r = (await AI_ACTIONS.getBankWawancara([BUDI], 'tok-budi')) as Record<string, unknown>;
    expect(r.success).toBe(false);
    expect(r.isVip).toBeUndefined();
    expect(String(r.message)).toMatch(/Gagal memeriksa status siswa/);
  });
});
