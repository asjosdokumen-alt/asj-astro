// =============================================================================
// TESTS: _lib/wawancara/bank — bank soal wawancara + sinkron kolom CV
//
// Yang dipaku di sini, dan kenapa:
//   1. Untuk soal yang dipetakan ke kolom CV (Jiko PR dan 7 lainnya), nilai CV
//      MENANG atas jawaban tersimpan. Itu inti sinkron dua arah yang diminta
//      pemilik: mengubah Jiko PR di CV AI harus langsung terlihat di wawancara.
//   2. Menyimpan jawaban soal ber-`kolom_cv` WAJIB ikut menulis kolom CV —
//      kalau tidak, dua tempat akan berbeda pendapat dan tidak ada yang tahu
//      mana yang benar.
//   3. Soal tanpa `kolom_cv` TIDAK boleh menyentuh master_database_candidate.
//   4. Tabel yang belum ter-expose (PGRST205) harus jadi galat yang menyebut
//      langkah perbaikannya, bukan daftar kosong tanpa sebab.
//   5. Terjemahan AI yang mengembalikan romaji di field `jp` harus DITOLAK,
//      jangan sampai masuk DB.
// =============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  /** Baris wawancara_soal yang dikembalikan. */
  soal: [] as Array<Record<string, unknown>>,
  /** Baris wawancara_jawaban yang dikembalikan. */
  jawaban: [] as Array<Record<string, unknown>>,
  /** Baris master_database_candidate untuk satu WA. */
  master: [] as Array<Record<string, unknown>>,
  /** true ⇒ setiap supabaseJson melempar PGRST205. */
  belumExpose: false,
  /** Catatan panggilan tulis: [method, table, body]. */
  tulis: [] as Array<{ method: string; table: string; body: unknown; query: unknown }>,
  /** Balasan model untuk terjemahan. */
  aiReply: '',
}));

vi.mock('../db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/client')>();
  return {
    ...actual,
    supabaseJson: vi.fn(async (method: string, table: string, opts: Record<string, unknown> = {}) => {
      if (m.belumExpose) {
        throw new Error(
          "PGRST205 Could not find the table 'public.wawancara_soal' in the schema cache",
        );
      }
      if (method === 'GET') {
        if (table === 'wawancara_soal') return m.soal;
        if (table === 'wawancara_jawaban') return m.jawaban;
        return [];
      }
      m.tulis.push({ method, table, body: opts.body, query: opts.query });
      return null;
    }),
  };
});

vi.mock('../db/master', () => ({
  fetchMasterByWa: async () => m.master,
}));

vi.mock('../ai/providers', () => ({
  geminiGenerate: async () => ({ reply: m.aiReply }),
  parseJsonLoose: (t: string) => {
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  },
}));

const bank = await import('./bank');

const SOAL_JIKO_PR = {
  kode: 'ms-009',
  tahap: 'Pembuka & Perkenalan Diri',
  urutan: 9,
  jp: 'じこアピールをしてください。',
  romaji: 'jiko apiiru o shite kudasai.',
  arti: 'Tolong promosikan diri Anda.',
  jawaban_jp: '私の名前はリザルです。',
  jawaban_romaji: 'watashi no namae wa rizaru desu.',
  jawaban_arti: 'Nama saya Rizal.',
  kolom_cv: 'promosi_diri',
  kolom_cv_jp: 'promosi_diri_jp',
};

const SOAL_BIASA = {
  kode: 'ms-001',
  tahap: 'Pembuka & Perkenalan Diri',
  urutan: 1,
  jp: 'お名前は？',
  romaji: 'onamae wa?',
  arti: 'Siapa nama Anda?',
  jawaban_jp: '田中です。',
  jawaban_romaji: 'tanaka desu.',
  jawaban_arti: 'Tanaka.',
  kolom_cv: null,
  kolom_cv_jp: null,
};

beforeEach(() => {
  m.soal = [SOAL_BIASA, SOAL_JIKO_PR];
  m.jawaban = [];
  m.master = [];
  m.belumExpose = false;
  m.tulis = [];
  m.aiReply = '';
});

describe('gabungBankDanJawaban — sinkron CV', () => {
  it('nilai kolom CV MENANG atas jawaban tersimpan', async () => {
    m.master = [{ promosi_diri: 'Saya pekerja keras.', promosi_diri_jp: '私は勤勉です。' }];
    m.jawaban = [
      { soal_kode: 'ms-009', jp: '古い', romaji: 'furui', arti: 'Lama', sumber: 'siswa' },
    ];

    const hasil = await bank.gabungBankDanJawaban('628111');
    const jiko = hasil.soal.find((s) => s.kode === 'ms-009');
    expect(jiko).toBeDefined();

    expect(jiko?.jawabanku.arti).toBe('Saya pekerja keras.');
    expect(jiko?.jawabanku.jp).toBe('私は勤勉です。');
    // romaji tidak punya kolom CV, jadi tetap dari jawaban tersimpan.
    expect(jiko?.jawabanku.romaji).toBe('furui');
    expect(jiko?.sinkron_cv).toBe(true);
  });

  it('CV kosong ⇒ jawaban tersimpan dipakai apa adanya', async () => {
    m.master = [{}];
    m.jawaban = [
      { soal_kode: 'ms-009', jp: '私です。', romaji: 'watashi desu.', arti: 'Saya.', sumber: 'ai' },
    ];

    const hasil = await bank.gabungBankDanJawaban('628111');
    const jiko = hasil.soal.find((s) => s.kode === 'ms-009');
    expect(jiko).toBeDefined();

    expect(jiko?.jawabanku.arti).toBe('Saya.');
    expect(jiko?.jawabanku.jp).toBe('私です。');
  });

  it('bank kosong tetap mengembalikan bentuk yang bisa dipakai UI', async () => {
    m.soal = [];
    const hasil = await bank.gabungBankDanJawaban('628111');
    expect(hasil.jumlah).toBe(0);
    expect(hasil.tahap).toEqual([]);
  });
});

describe('simpanJawaban — kolom CV ikut ditulis', () => {
  it('soal Jiko PR menulis promosi_diri + promosi_diri_jp lalu upsert jawaban', async () => {
    await bank.simpanJawaban('628111', 'ms-009', {
      jp: '私は勤勉です。',
      romaji: 'watashi wa kinben desu.',
      arti: 'Saya pekerja keras.',
    });

    const patch = m.tulis.find((t) => t.table === 'master_database_candidate');
    expect(patch).toBeDefined();
    expect(patch?.method).toBe('PATCH');
    expect(patch?.body).toMatchObject({
      promosi_diri: 'Saya pekerja keras.',
      promosi_diri_jp: '私は勤勉です。',
    });

    const upsert = m.tulis.find((t) => t.table === 'wawancara_jawaban');
    expect(upsert).toBeDefined();
    expect(upsert?.body).toMatchObject({
      wa: '628111',
      soal_kode: 'ms-009',
      romaji: 'watashi wa kinben desu.',
      sumber: 'siswa',
    });
    expect(upsert?.query).toMatchObject({ on_conflict: 'wa,soal_kode' });
  });

  it('soal biasa TIDAK menyentuh master_database_candidate', async () => {
    await bank.simpanJawaban('628111', 'ms-001', { jp: '田中です。', romaji: 'tanaka desu.', arti: 'Tanaka.' });

    expect(m.tulis.some((t) => t.table === 'master_database_candidate')).toBe(false);
    expect(m.tulis.some((t) => t.table === 'wawancara_jawaban')).toBe(true);
  });

  it('kode soal yang tidak ada ditolak sebelum menulis apa pun', async () => {
    await expect(bank.simpanJawaban('628111', 'ms-999', { arti: 'x' })).rejects.toThrow(
      /Soal tidak dikenal/,
    );
    expect(m.tulis).toHaveLength(0);
  });
});

describe('ambilBank — tabel belum ter-expose', () => {
  it('PGRST205 ⇒ galat yang menyebut langkah perbaikan, bukan daftar kosong', async () => {
    m.belumExpose = true;
    await expect(bank.ambilBank()).rejects.toThrow(/Refresh schema cache/i);
  });
});

describe('terjemahkanJawaban — validasi hasil model', () => {
  it('menyimpan hasil terjemahan yang sah', async () => {
    m.aiReply = JSON.stringify({
      jp: '私は料理が好きです。',
      romaji: 'watashi wa ryouri ga suki desu.',
      arti: 'Saya suka memasak.',
    });

    const hasil = await bank.terjemahkanJawaban('628111', 'ms-009', 'saya suka memasak');
    expect(hasil.jp).toBe('私は料理が好きです。');

    const patch = m.tulis.find((t) => t.table === 'master_database_candidate');
    expect(patch?.body).toMatchObject({ promosi_diri: 'Saya suka memasak.' });
    expect(m.tulis.find((t) => t.table === 'wawancara_jawaban')?.body).toMatchObject({
      sumber: 'ai',
    });
  });

  it('menolak kalau field jp berisi romaji (tidak boleh masuk DB)', async () => {
    m.aiReply = JSON.stringify({
      jp: 'watashi wa ryouri ga suki desu',
      romaji: 'watashi wa ryouri ga suki desu',
      arti: 'Saya suka memasak.',
    });

    await expect(bank.terjemahkanJawaban('628111', 'ms-009', 'saya suka memasak')).rejects.toThrow(
      /huruf Jepang|latin/i,
    );
    expect(m.tulis).toHaveLength(0);
  });

  it('menolak jawaban Indonesia yang kosong tanpa memanggil AI', async () => {
    await expect(bank.terjemahkanJawaban('628111', 'ms-009', '   ')).rejects.toThrow(
      /Bahasa Indonesianya/,
    );
  });
});

describe('linkWawancara', () => {
  it('membentuk URL dengan wa ternormalisasi', () => {
    const { url } = bank.linkWawancara('0812-3456-789', 'Budi', 'https://contoh.test/');
    expect(url).toBe('https://contoh.test/wawancara?wa=628123456789&nama=Budi');
  });
});
