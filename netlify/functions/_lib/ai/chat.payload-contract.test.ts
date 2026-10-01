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
 *  Sengaja tanpa field ber-akhiran `_id` yang punya pasangan `_jp`: kalau ada,
 *  autoTranslateMissingJp ikut memanggil model dan indeks panggilan bergeser. */
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

      expect(geminiMock).toHaveBeenCalledTimes(1);
      const [system, history] = geminiMock.mock.calls[0] as [string, unknown];

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
