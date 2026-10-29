/**
 * ai/chat — kontrak PAYLOAD `processAIChat` / `processSiswaAIChat`.
 *
 * Kenapa tes ini ada: klien mengirim `payload` lewat `apiClient`, yang SELALU
 * membungkus argumen jadi array (`payload: [args]`). Dua handler ini membaca
 * `p.history` / `p.currentData` langsung dari objek, jadi bentuk `[{...}]`
 * membuat keduanya `undefined`:
 *
 *   - `history` jatuh ke `[]`  -> Jeklin kehilangan SELURUH riwayat percakapan;
 *   - `currentData` undefined  -> `buildRingkasData(undefined)` kosong, jadi
 *     blok "DATA KANDIDAT SAAT INI" tidak pernah masuk system prompt dan
 *     instruksi "JANGAN menanyakan ulang data yang sudah terisi" mustahil
 *     dipatuhi.
 *
 * `handleProcessAiInterview` sudah lebih dulu kena bentuk yang sama (A16:
 * "every sibling handler unwraps payload[0]; this one did not, so
 * wa/candidateName/history were dropped on every turn") dan diperbaiki dengan
 * `unwrapInterviewPayload`. Kedua handler chat ini tidak pernah ikut diperbaiki,
 * dan tidak ada tes yang memaku bentuk payload-nya — `chat.vip.test.ts` hanya
 * memanggilnya dengan OBJEK, yaitu bentuk yang kebetulan berhasil.
 *
 * Tes ini memaku KEDUANYA: array (apiClient) dan objek (legacy/GAS), supaya
 * normalisasi di handler tidak bisa dihapus tanpa suara.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const geminiMock = vi.fn();

vi.mock('./providers', () => ({
  geminiGenerate: (...a: unknown[]) => geminiMock(...a),
  parseJsonLoose: (t: string) => JSON.parse(t),
}));

vi.mock('../db/candidates', () => ({
  findCandidateByIdFiltered: vi.fn(async () => null),
  findCandidateByWaFiltered: vi.fn(async () => null),
  findCandidates: vi.fn(async () => ({ rows: [] })),
}));

vi.mock('../session', () => ({
  verifyToken: vi.fn(() => ({ role: 'admin', wa: '6285700000001', exp: Date.now() + 60_000 })),
}));

// Tanpa `error` -> dianggap admin -> gate VIP (flow=master) dilewati, sehingga
// tes ini mengukur kontrak payload dan bukan kebijakan VIP.
vi.mock('../../contexts/identity', () => ({
  requireRole: vi.fn(() => ({ token: { wa: '6285700000001', role: 'admin' } })),
}));

import { handleProcessAIChat, handleProcessSiswaAIChat } from './chat';

/** currentData minimal yang PASTI muncul di ringkasan system prompt.
 *  Sejak 2026-10-29 `nama_lengkap` juga memicu tugas KATAKANA
 *  (`identitas.nama_lengkap` → `identitas.katakana`), jadi satu giliran chat
 *  memanggil model DUA kali: terjemahan lebih dulu, lalu balasan. Tes di bawah
 *  karena itu memilih panggilan balasan berdasarkan isinya, bukan indeks. */
const CURRENT = { identitas: { nama_lengkap: 'BUDI' }, fisik: { tb: '170' } };
const HISTORY = [
  { role: 'user', content: 'nama saya Budi' },
  { role: 'assistant', content: 'Halo Budi!' },
];

/** Jawaban model: JSON valid supaya jalur `{reply, data}` benar-benar dilewati. */
const AI_JSON = JSON.stringify({ reply: 'Halo Budi!', data: { medis: { alergi_id: 'Udang' } } });

describe('processAIChat — kontrak payload (array dari apiClient, objek dari legacy)', () => {
  beforeEach(() => {
    geminiMock.mockReset();
    geminiMock.mockResolvedValue({ reply: AI_JSON });
  });

  const shapes: Array<[string, unknown]> = [
    ['array (apiClient: payload = [args])', [{ history: HISTORY, currentData: CURRENT }]],
    ['objek (legacy / panggilan langsung)', { history: HISTORY, currentData: CURRENT }],
  ];

  for (const [label, payload] of shapes) {
    it(`${label} → history DAN currentData sampai ke model`, async () => {
      const res = (await handleProcessAIChat(payload, 'tok-admin')) as { reply?: string; data?: unknown };

      // Giliran ini memanggil model dua kali (terjemahan latar + balasan);
      // yang diuji adalah panggilan BALASAN.
      const replyCall = geminiMock.mock.calls.find((c) => !String(c[0]).includes('Terjemahkan'));
      expect(replyCall, 'balasan chat harus memanggil model').toBeTruthy();
      const [system, history] = replyCall as [string, unknown];

      // 1. currentData benar-benar membangun blok konteks CV.
      expect(system).toContain('DATA KANDIDAT SAAT INI');
      expect(system).toContain('Nama lengkap: BUDI');
      expect(system).toContain('Tinggi badan: 170 cm');
      // 2. history diteruskan apa adanya — bukan array kosong.
      expect(history).toEqual(HISTORY);
      // 3. Data hasil ekstraksi AI dikembalikan di kunci `data` (kunci yang
      //    dibaca sisi klien), bukan `cvData`.
      expect(res.data).toEqual({ medis: { alergi_id: 'Udang' } });
    });
  }
});

describe('processSiswaAIChat — kontrak payload', () => {
  beforeEach(() => {
    geminiMock.mockReset();
    geminiMock.mockResolvedValue({ reply: AI_JSON });
  });

  it('array (apiClient) → history sampai ke model', async () => {
    await handleProcessSiswaAIChat([{ history: HISTORY, currentData: CURRENT }]);
    expect(geminiMock).toHaveBeenCalledTimes(1);
    const [, history] = geminiMock.mock.calls[0] as [string, unknown];
    expect(history).toEqual(HISTORY);
  });

  it('objek (legacy) → history sampai ke model', async () => {
    await handleProcessSiswaAIChat({ history: HISTORY, currentData: CURRENT });
    expect(geminiMock).toHaveBeenCalledTimes(1);
    const [, history] = geminiMock.mock.calls[0] as [string, unknown];
    expect(history).toEqual(HISTORY);
  });
});

// ==========================================
// TESTS: auto-terjemahan dijalankan PARALEL (T7) — dan karena itu harus
// BEST-EFFORT.
//
// Terjemahan dipanggil lebih dulu, dan `geminiGenerate` memanggil
// `breaker.check()` secara sinkron sebelum await pertamanya. Dengan kunci
// breaker yang sama, dua hal terjadi pada satu giliran pengguna:
//
//   1. saat breaker `gemini` sudah `open` melewati cooldown, TERJEMAHAN yang
//      mengambil probe `half-open` — dan balasan yang ditunggu pengguna ditolak
//      `SERVICE_UNAVAILABLE` padahal providernya sehat;
//   2. satu giliran yang gagal menyumbang DUA kegagalan (ambang breaker `gemini`
//      adalah 3), jadi pengguna berjaringan buruk membuka breaker dua kali
//      lebih cepat — amplifikasi yang sama dengan T1, dimasukkan kembali oleh
//      perbaikan T7.
// ==========================================
describe('processAIChat — auto-terjemahan adalah panggilan best-effort', () => {
  beforeEach(() => {
    geminiMock.mockReset();
    geminiMock.mockResolvedValue({ reply: AI_JSON });
  });

  it('panggilan terjemahan ditandai bestEffort (breaker terpisah, tanpa Grok)', async () => {
    // `alergi_id` terisi sementara `alergi_jp` kosong — pasangan di
    // AI_ID_JP_PAIRS, jadi autoTranslateMissingJp benar-benar memanggil model.
    const currentData = { medis: { alergi_id: 'Udang' } };

    await handleProcessAIChat([{ history: HISTORY, currentData }], 'tok-admin');

    expect(geminiMock).toHaveBeenCalledTimes(2);
    const translation = geminiMock.mock.calls.find((c) =>
      String(c[0]).includes('Terjemahkan Bahasa Indonesia'),
    );
    expect(translation, 'terjemahan harus benar-benar memanggil model').toBeTruthy();
    expect(translation?.[2]).toMatchObject({ bestEffort: true });

    // Dan balasan yang ditunggu pengguna TIDAK ditandai best-effort — ia yang
    // berhak atas breaker utama dan provider cadangan.
    const reply = geminiMock.mock.calls.find((c) => !String(c[0]).includes('Terjemahkan'));
    expect(reply?.[2]).toBeUndefined();
  });
});

// ==========================================
// 2026-10-29 — kelengkapan auto-terjemahan.
//
// Laporan pemilik: "terjemahkan semua kolom banyak yg ga berhasil kayah nama
// keluarga katakana pekerjaan dan lain lain". Tiga sebab, semuanya diukur di
// sini:
//   1. `katakana` (nama orang) tidak ada di daftar pasangan mana pun;
//   2. baris pendidikan/pekerjaan/keluarga diterjemahkan lalu DIBUANG, karena
//      penggabungan balik hanya mengenal pasangan skalar;
//   3. `identitas.gender_jp` juga tidak punya pasangan.
// ==========================================
import { kumpulkanTugasTerjemah, terapkanHasilTerjemah } from './chat';

describe('auto-terjemahan — cakupan tugas', () => {
  it('nama orang jadi tugas KATAKANA, bukan terjemahan biasa', () => {
    const tugas = kumpulkanTugasTerjemah({
      identitas: { nama_lengkap: 'BUDI SANTO', panggilan: 'BUDI' },
    });
    const kata = tugas.filter((x) => x.jenis === 'kata').map((x) => x.path.join('.'));
    expect(kata).toEqual(['identitas.katakana', 'identitas.panggilan_katakana']);
  });

  it('baris keluarga ikut: hubungan, pekerjaan, DAN katakana nama', () => {
    const tugas = kumpulkanTugasTerjemah({
      keluarga: [{ nama: 'SITI', hubungan_id: 'IBU', pekerjaan: 'PETANI' }],
    });
    const path = tugas.map((x) => `${x.path.join('.')}:${x.jenis}`);
    expect(path).toContain('keluarga.0.hubungan_jp:jp');
    expect(path).toContain('keluarga.0.pekerjaan_jp:jp');
    expect(path).toContain('keluarga.0.katakana:kata');
  });

  it('yang sudah terisi tidak ditugaskan ulang; gender punya pasangan', () => {
    const tugas = kumpulkanTugasTerjemah({
      identitas: { alamat: 'PONOROGO', alamat_jp: '〒63453 ポノロゴ', gender: 'LAKI-LAKI' },
    });
    const path = tugas.map((x) => x.path.join('.'));
    expect(path).not.toContain('identitas.alamat_jp');
    expect(path).toContain('identitas.gender_jp');
  });

  it('batas dipatuhi (giliran chat tidak boleh menunggu 40 kolom)', () => {
    const tugas = kumpulkanTugasTerjemah({
      medis: { alergi_id: 'A', riwayat_medis_id: 'B', riwayat_kecelakaan_id: 'C' },
      wawancara: { hobi_id: 'D', kelebihan_id: 'E', kekurangan_id: 'F' },
    }, 2);
    expect(tugas).toHaveLength(2);
  });
});

describe('auto-terjemahan — hasil yang tidak layak DIBUANG, bukan ditulis', () => {
  const data: Record<string, unknown> = {};
  const tugas = kumpulkanTugasTerjemah({
    identitas: { alamat: 'PONOROGO', nama_lengkap: 'BUDI' },
  });

  it('field _jp berisi huruf latin ditolak', () => {
    data.identitas = { alamat: 'PONOROGO' };
    const { jumlah } = terapkanHasilTerjemah(data, tugas, { 0: 'Ponorogo city' });
    expect(jumlah).toBe(0);
    expect((data.identitas as Record<string, string>).alamat_jp).toBeUndefined();
  });

  it('field katakana menolak kanji (nama orang harus kana)', () => {
    const d: Record<string, unknown> = { identitas: { nama_lengkap: 'BUDI' } };
    const t2 = kumpulkanTugasTerjemah(d);
    const idx = t2.findIndex((x) => x.path.join('.') === 'identitas.katakana');
    const { jumlah } = terapkanHasilTerjemah(d, t2, { [String(idx)]: '武士' });
    expect(jumlah).toBe(0);
    expect((d.identitas as Record<string, string>).katakana).toBeUndefined();
  });

  it('nilai Jepang yang sah ditulis ke path yang benar', () => {
    const d: Record<string, unknown> = { identitas: { nama_lengkap: 'BUDI' } };
    const t2 = kumpulkanTugasTerjemah(d);
    const idx = t2.findIndex((x) => x.path.join('.') === 'identitas.katakana');
    const { jumlah } = terapkanHasilTerjemah(d, t2, { [String(idx)]: 'ブディ' });
    expect(jumlah).toBe(1);
    expect((d.identitas as Record<string, string>).katakana).toBe('ブディ');
  });
});

// ==========================================
// 2026-10-29 — hasil terjemahan BARIS tidak boleh dibuang.
//
// `autoTranslateMissingJp` sudah lama menerjemahkan baris pendidikan/pekerjaan/
// keluarga, tetapi penggabungan balik hanya menyalin pasangan SKALAR. Jadi
// hasilnya dihitung, dibayar, lalu hilang — dan klien tidak pernah menerimanya.
// Tes ini memaku bahwa baris ikut dikembalikan, termasuk saat model tidak
// mengembalikan array sama sekali.
// ==========================================
describe('processAIChat — terjemahan baris ikut dikembalikan', () => {
  beforeEach(() => {
    geminiMock.mockReset();
  });

  it('keluarga[].hubungan_jp sampai ke klien walau model tidak mengirim array', async () => {
    geminiMock.mockImplementation(async (prompt: string) => {
      if (String(prompt).includes('Terjemahkan')) return { reply: JSON.stringify({ '0': '母' }) };
      return { reply: AI_JSON };
    });

    const res = (await handleProcessAIChat(
      [{ history: HISTORY, currentData: { keluarga: [{ hubungan_id: 'IBU' }] } }],
      'tok-admin',
    )) as { data?: { keluarga?: Array<Record<string, string>> } };

    expect(res.data?.keluarga?.[0]?.hubungan_jp).toBe('母');
  });
});

// ==========================================
// 2026-10-29 — aksi "Terjemahkan semua kolom" (deterministik).
//
// Dulu tombolnya mengirim kalimat ke `processAIChat`; kelengkapannya bergantung
// pada model. Aksi ini membangun daftar tugas dari DATA, jadi yang kosong
// diisi tanpa bergantung pada niat model — dan baris/katakana ikut.
// ==========================================
describe('terjemahkanKolomCv — semua kolom, termasuk baris & katakana', () => {
  beforeEach(() => {
    geminiMock.mockReset();
  });

  it('mengisi katakana + baris keluarga, dan TIDAK menimpa yang sudah ada', async () => {
    const { handleTerjemahkanKolomCv } = await import('./chat');
    // Urutan tugas: pasangan skalar → katakana → baris.
    geminiMock.mockResolvedValue({
      reply: JSON.stringify({ '0': 'ブディ', '1': '母', '2': '農業' }),
    });

    const res = (await handleTerjemahkanKolomCv(
      [{
        data: {
          identitas: { nama_lengkap: 'BUDI', katakana: '' },
          keluarga: [{ hubungan_id: 'IBU', pekerjaan: 'PETANI', hubungan_jp: '', pekerjaan_jp: '' }],
        },
      }],
      'tok-admin',
    )) as { success?: boolean; jumlah?: number; data?: Record<string, unknown> };

    expect(res.success).toBe(true);
    const identitas = res.data?.identitas as Record<string, string>;
    const keluarga = ((res.data?.keluarga as Array<Record<string, string>>) ?? [])[0] as Record<string, string>;
    expect(identitas.katakana).toBe('ブディ');
    expect(keluarga.hubungan_jp).toBe('母');
    expect(keluarga.pekerjaan_jp).toBe('農業');
    // Sisi Indonesia tidak disentuh.
    expect(keluarga.pekerjaan).toBe('PETANI');
    expect(res.jumlah).toBe(3);
  });

  it('tidak memanggil model sama sekali kalau tidak ada yang kosong', async () => {
    const { handleTerjemahkanKolomCv } = await import('./chat');
    const res = (await handleTerjemahkanKolomCv(
      [{ data: { identitas: { alamat: 'PONOROGO', alamat_jp: '〒63453 ポノロゴ' } } }],
      'tok-admin',
    )) as { success?: boolean; jumlah?: number };

    expect(geminiMock).not.toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(res.jumlah).toBe(0);
  });
});
