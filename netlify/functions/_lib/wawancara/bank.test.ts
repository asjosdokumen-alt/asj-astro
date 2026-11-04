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
  /** Berapa kali bank soal DIBACA (untuk menguji cache). */
  bacaBank: 0,
  /** Query GET terakhir per tabel — untuk memeriksa `limit`/`aktif`. */
  bacaQuery: {} as Record<string, Record<string, unknown>>,
  /** Balasan model untuk terjemahan. */
  aiReply: '',
  /** Baris yang dikembalikan PATCH master. `null` = tidak ada baris cocok. */
  patchRows: null as unknown,
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
        m.bacaQuery[table] = (opts.query || {}) as Record<string, unknown>;
        if (table === 'wawancara_soal') {
          m.bacaBank++;
          return m.soal;
        }
        if (table === 'master_database_candidate') return m.master;
        if (table === 'wawancara_jawaban') return m.jawaban;
        return [];
      }
      m.tulis.push({ method, table, body: opts.body, query: opts.query });
      if (method === 'PATCH' && table === 'master_database_candidate') return m.patchRows;
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
  m.bacaBank = 0;
  m.bacaQuery = {};
  m.aiReply = '';
  /* Cache bank adalah state MODUL: tanpa dibersihkan, tes pertama yang mengisi
     cache akan menentukan isi bank untuk semua tes berikutnya. */
  bank.lupakanBankSoal();
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

  /* Pemilik 2026-11-03: *"bila edit wawancara cv ai berubah bila edit cv ai
     wawancara ikut berubah kan tertaut bukan menangin salah 1"*.
     Arah wawancara -> CV bergantung pada PATCH yang benar-benar mengenai baris.
     PATCH yang tidak menemukan baris dijawab 204 TANPA galat, jadi dengan
     `return=minimal` kode lama melaporkan `sinkron_cv: true` untuk perubahan
     yang tidak pernah terjadi — kandidat mengira CV-nya sudah terisi. */
  it('sinkron_cv jujur: PATCH tanpa baris master TIDAK dilaporkan tersinkron', async () => {
    m.patchRows = []; // tidak ada baris cocok, dan bukan galat
    const r1 = await bank.simpanJawaban('628111', 'ms-009', {
      jp: '私は勤勉です。', romaji: 'watashi wa kinben desu.', arti: 'Saya pekerja keras.',
    });
    expect(r1.sinkron_cv).toBe(false);
    // Jawabannya TETAP tersimpan — hanya klaim sinkronisasinya yang jujur.
    expect(m.tulis.some((t) => t.table === 'wawancara_jawaban')).toBe(true);

    m.patchRows = [{ id: 1 }]; // baris master ada
    const r2 = await bank.simpanJawaban('628111', 'ms-009', {
      jp: '私は勤勉です。', romaji: 'watashi wa kinben desu.', arti: 'Saya pekerja keras.',
    });
    expect(r2.sinkron_cv).toBe(true);

    m.patchRows = null;
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

  /* ── kolom CV TIDAK boleh dikosongkan oleh simpanan parsial ────────────────
   *
   * Aturan repo ini (lihat MEMORY.md): menghapus isi field = MENULIS '', dan
   * itu hanya boleh terjadi dari form yang memang punya niat menghapus
   * (`formLengkap: true`). `simpanJawaban` dipanggil dari `onBlur` SETIAP kolom
   * di `/wawancara` — jadi menyimpan baris yang kolom Indonesianya kebetulan
   * kosong tidak boleh ikut menghapus Jiko PR di CV kandidat.
   *
   * Terukur: sebelum perbaikan, `body.promosi_diri = ''` ikut terkirim dan
   * PATCH-nya menghapus jawaban CV yang sudah ada. */
  it('arti kosong TIDAK mengosongkan kolom CV (hanya jp yang ditulis)', async () => {
    await bank.simpanJawaban('628111', 'ms-009', {
      jp: '私は勤勉です。',
      romaji: 'watashi wa kinben desu.',
      arti: '   ',
    });

    const patch = m.tulis.find((t) => t.table === 'master_database_candidate');
    expect(patch).toBeDefined();
    expect(patch?.body).not.toHaveProperty('promosi_diri');
    expect(patch?.body).toMatchObject({ promosi_diri_jp: '私は勤勉です。' });

    // Jawaban tetap tersimpan apa adanya — yang dilewati hanya kolom CV.
    expect(m.tulis.find((t) => t.table === 'wawancara_jawaban')?.body).toMatchObject({ arti: '' });
  });

  it('jp dan arti sama-sama kosong ⇒ master_database_candidate tidak disentuh', async () => {
    await bank.simpanJawaban('628111', 'ms-009', { jp: '', romaji: 'romaji saja', arti: '' });

    expect(m.tulis.some((t) => t.table === 'master_database_candidate')).toBe(false);
    expect(m.tulis.find((t) => t.table === 'wawancara_jawaban')?.body).toMatchObject({
      romaji: 'romaji saja',
    });
  });

  /* ── BATAS PANJANG ────────────────────────────────────────────────────────
   *
   * `terjemahkanJawaban` membatasi INPUT 600 karakter, tetapi `simpanJawaban`
   * — aksi yang dipanggil langsung dari klien — tidak membatasi apa pun, dan
   * untuk 8 soal ber-`kolom_cv` nilainya masuk ke kolom CV (text tanpa batas).
   * Body request dibatasi platform (~6 MB), jadi "tidak ada batas" berarti
   * "sampai 6 MB masuk ke CV kandidat". */
  it('nilai kepanjangan ditolak sebelum menulis apa pun', async () => {
    await expect(
      bank.simpanJawaban('628111', 'ms-009', { jp: 'あ'.repeat(2001), romaji: 'x', arti: 'x' }),
    ).rejects.toThrow(/terlalu panjang/i);
    expect(m.tulis).toHaveLength(0);
  });

  it('2000 karakter masih diterima (batasnya inklusif)', async () => {
    await bank.simpanJawaban('628111', 'ms-009', { jp: 'あ'.repeat(2000), romaji: 'x', arti: 'x' });
    expect(m.tulis.some((t) => t.table === 'wawancara_jawaban')).toBe(true);
  });
});

describe('ambilBank — tabel belum ter-expose', () => {
  it('PGRST205 ⇒ galat yang menyebut langkah perbaikan, bukan daftar kosong', async () => {
    m.belumExpose = true;
    await expect(bank.ambilBank()).rejects.toThrow(/Refresh schema cache/i);
  });
});

/* ── CACHE BANK ────────────────────────────────────────────────────────────
 *
 * Satu muat halaman `/wawancara` membaca bank soal; `simpanJawaban` dan
 * `terjemahkanJawaban` membacanya LAGI untuk mencari soal. Bank berubah hanya
 * saat admin menyuntingnya lewat SQL/console — tidak ada jalur tulis di kode —
 * jadi membacanya berulang pada setiap simpanan adalah biaya tanpa manfaat.
 */
describe('ambilBank — cache 5 menit', () => {
  it('dua permintaan berurutan hanya membaca bank sekali', async () => {
    await bank.ambilBank();
    await bank.ambilBank();
    expect(m.bacaBank).toBe(1);
  });

  it('kedaluwarsa setelah TTL, bukan selamanya', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
      await bank.ambilBank();
      vi.setSystemTime(new Date('2026-11-01T00:04:00Z'));
      await bank.ambilBank();
      expect(m.bacaBank).toBe(1);

      vi.setSystemTime(new Date('2026-11-01T00:06:00Z'));
      await bank.ambilBank();
      expect(m.bacaBank).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('membaca hanya soal aktif, dengan batas yang tidak memotong bank sekarang', async () => {
    await bank.ambilBank();
    /* `aktif` sudah lama ada di query tanpa satu pun tes yang menjaganya —
       mematikannya akan mengirim soal yang sengaja disembunyikan admin. */
    expect(m.bacaQuery.wawancara_soal).toMatchObject({ aktif: 'eq.true', limit: '500' });
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
    /* `arti` = teks SISWA, bukan keluaran model — lihat tes di bawah. */
    expect(patch?.body).toMatchObject({ promosi_diri: 'saya suka memasak' });
    expect(m.tulis.find((t) => t.table === 'wawancara_jawaban')?.body).toMatchObject({
      sumber: 'ai',
    });
  });

  /* ── TEKS SISWA TIDAK BOLEH DITIMPA MODEL ────────────────────────────────
   *
   * `arti` adalah jawaban kandidat dalam Bahasa Indonesia, dan untuk 8 soal
   * ber-`kolom_cv` ia langsung menjadi isi CV (Jiko PR, kelebihan, …). Versi
   * lama memakai `parsed.arti` dari model, sehingga:
   *   • kalimat siswa bisa DIUBAH MAKNANYA oleh model kecil, lalu tersimpan
   *     sebagai jawaban resmi di CV;
   *   • teks siswa masuk ke prompt sebagai data, tetapi keluarannya yang
   *     menentukan isi kolom — permukaan prompt-injection yang tidak perlu.
   * Model tetap dipakai untuk `jp` + `romaji`; itu bagian yang memang tidak
   * bisa dikerjakan siswa sendiri. */
  it('arti disimpan dari teks siswa, bukan dari keluaran model', async () => {
    m.aiReply = JSON.stringify({
      jp: '私は料理が好きです。',
      romaji: 'watashi wa ryouri ga suki desu.',
      arti: 'Saya SANGAT suka memasak dan bekerja di restoran.',
    });

    const hasil = await bank.terjemahkanJawaban('628111', 'ms-009', 'saya suka memasak');
    expect(hasil.arti).toBe('saya suka memasak');
    expect(m.tulis.find((t) => t.table === 'master_database_candidate')?.body).toMatchObject({
      promosi_diri: 'saya suka memasak',
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
  it('membentuk URL dengan wa ternormalisasi, memakai bentuk kanonik /wawancara/', () => {
    const { url } = bank.linkWawancara('0812-3456-789', 'Budi', 'https://contoh.test/');
    /* Garis miring di akhir mengikuti bentuk yang dituju Netlify (301 dari
       `/wawancara`), supaya tautan yang dibagikan tidak membayar lompatan. */
    expect(url).toBe('https://contoh.test/wawancara/?wa=628123456789&nama=Budi');
  });
});

/* ── Soal perkenalan → kolom CV (2026-11-05) ────────────────────────────────
 * Tujuh soal pertama tidak punya `kolom_cv` karena jawabannya kalimat. Nilainya
 * DIEKSTRAK, dan hanya mengisi kolom yang masih kosong — kalimat bebas tidak
 * boleh menimpa nama yang sudah dikoreksi tangan.
 */
describe('soal perkenalan mengisi kolom identitas', () => {
  beforeEach(() => {
    m.tulis.length = 0;
    m.master = [];
  });

  it('nama: kalimat sopan dipangkas jadi nama, bukan kalimat', () => {
    expect(bank.namaDariKalimat('Nama saya Agus Susilo. Mohon bantuan.')).toBe('AGUS SUSILO');
    expect(bank.namaDariKalimat('Saya bernama Agustina Mega Safitri.')).toBe('AGUSTINA MEGA SAFITRI');
  });

  it('nama: kalimat yang BUKAN perkenalan tidak menghasilkan apa pun', () => {
    expect(bank.namaDariKalimat('Saya berasal dari Ponorogo.')).toBe('');
    expect(bank.namaDariKalimat('Tanaka.')).toBe('');
  });

  it('usia & tanggal lahir diekstrak dari kalimat', () => {
    expect(bank.usiaDariKalimat('Usia saya 36 tahun.')).toBe('36');
    expect(bank.usiaDariKalimat('Saya berusia 21 tahun.')).toBe('21');
    expect(bank.usiaDariKalimat('Tanggal 5 Oktober.')).toBe(''); // 5 bukan usia wajar
    expect(bank.tanggalDariKalimat('Tanggal 4 Agustus 2005.')).toBe('2005-08-04');
    expect(bank.tanggalDariKalimat('Tanggal 5 Oktober.')).toBe(''); // tahun tidak ada
  });

  it('kota: hanya nama kota, bukan kalimat lengkap', () => {
    expect(bank.kotaDariKalimat('Saya berasal dari Ponorogo, Provinsi Jawa Timur.')).toBe('PONOROGO');
    expect(bank.kotaDariKalimat('Kota asal saya adalah Ngawi.')).toBe('NGAWI');
  });

  it('simpan ms-001 mengisi nama_lengkap saat kolom masih kosong', async () => {
    m.master = [{ id: 7, nama_lengkap: '' }];
    await bank.simpanJawaban('628111', 'ms-001', { arti: 'Nama saya Agus Susilo. Mohon bantuan.' });
    const patch = m.tulis.find(
      (t) => t.table === 'master_database_candidate' && t.method === 'PATCH',
    );
    expect(patch?.body).toMatchObject({ nama_lengkap: 'AGUS SUSILO' });
  });

  it('TIDAK menimpa nama yang sudah ada (kolom menang)', async () => {
    m.master = [{ id: 7, nama_lengkap: 'AGUS SUSILO' }];
    await bank.simpanJawaban('628111', 'ms-001', { arti: 'Nama saya Agus Susilo. Mohon bantuan.' });
    expect(
      m.tulis.some((t) => t.table === 'master_database_candidate' && t.method === 'PATCH'),
    ).toBe(false);
  });
});
