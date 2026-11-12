/**
 * candidates.test.ts — `attachApplications` must let the UI tell a JOB
 * APPLICATION apart from a BIODATA/DOCUMENT row.
 *
 * WHY THIS MATTERS
 *   `database_asj_form` holds two different kinds of row in one table:
 *
 *     (a) a real job application   -> `code_job` is filled ('KODE-JOB')
 *     (b) a biodata/document update -> `code_job` is empty, and the row carries
 *         a marker in `feedback_berkas`: '[BIODATA] …' or '[UPLOAD <LABEL>]'
 *
 *   Both reach the SAME admin approval path, so approving a passport scan wrote
 *   `status = 'LULUS'` on a row that is not an application at all. The candidate
 *   dashboard then rendered "Telah disetujui admin" for it, and because the
 *   stage machine is driven off the same status, the selection pipeline appeared
 *   to advance off a document review.
 *
 *   Migration 013 gives the DOCUMENT verdict its own column (`status_biodata`).
 *   Until that column is projected to the client, the only available signal is
 *   the row marker — so it has to survive `attachApplications` instead of being
 *   dropped on the floor. That is exactly what these tests pin.
 *
 * WHAT IS ASSERTED
 *   · `feedback_berkas` is carried through as `feedback`
 *   · a marked row with an empty `code_job` is distinguishable from a real one
 *   · the discriminator does NOT depend on `status` (a document row and an
 *     application row can both read 'LULUS'; that is the whole defect)
 *   · the shape stays additive — existing consumers keep their fields
 *
 * DB-free and network-free: `attachApplications` is a pure function over two
 * arrays. No mocking, because there is nothing to mock.
 */
import { describe, it, expect } from 'vitest';
import { attachApplications, mapCandidate } from './candidates';
import { normalizePekerjaan, pekerjaanDariSlot } from './pekerjaan';

/** A candidate row as the caller would supply it (WA is the join key). */
const cand = (wa: string, extra: Record<string, unknown> = {}) => ({
  wa,
  tahapan: 'CHECK KAIWA',
  ...extra,
});

/** A real job application: code_job filled, no biodata marker. */
const realApp = (wa: string, status = 'LULUS') => ({
  no_wa: wa,
  code_job: 'JOB-001',
  status,
  kategory: 'TOKUTEI',
  timestamp: '2026-09-01T00:00:00Z',
  nama_lengkap: 'BUDI',
  file_cv: 'cv.pdf',
  feedback_berkas: '',
});

/** A biodata / document row: code_job EMPTY, marker present. */
const bioRow = (wa: string, status = 'LULUS', marker = '[BIODATA] paspor, ktp') => ({
  no_wa: wa,
  code_job: '',
  status,
  kategory: '',
  timestamp: '2026-09-02T00:00:00Z',
  nama_lengkap: 'BUDI',
  file_cv: '',
  feedback_berkas: marker,
});

describe('attachApplications', () => {
  it('attaches applications to the matching candidate by WA', () => {
    const out = attachApplications([cand('628111')], [realApp('628111')]);
    expect(out[0].applications).toHaveLength(1);
    expect(out[0].applications[0].code).toBe('JOB-001');
  });

  it('carries feedback_berkas through as `feedback`', () => {
    const out = attachApplications([cand('628111')], [bioRow('628111')]);
    expect(out[0].applications[0].feedback).toBe('[BIODATA] paspor, ktp');
  });

  it('carries an empty feedback as an empty string, not undefined', () => {
    const out = attachApplications([cand('628111')], [realApp('628111')]);
    // A consumer testing `feedback.includes(...)` must not have to guard for
    // undefined — the projection guarantees a string.
    expect(out[0].applications[0].feedback).toBe('');
  });

  // ── the defect itself ────────────────────────────────────────────────────
  // Both rows below read status 'LULUS'. A UI that keys off status alone cannot
  // tell them apart, which is why the marker must reach the client. This test
  // exists to make that impossibility explicit rather than implied.
  it('distinguishes a document approval from an application approval, at equal status', () => {
    const out = attachApplications(
      [cand('628111')],
      [realApp('628111', 'LULUS'), bioRow('628111', 'LULUS')],
    );
    const apps = out[0].applications;
    expect(apps).toHaveLength(2);

    const isBiodataRow = (a: { code: string; feedback: string }) =>
      !String(a.code || '').trim() && /\[BIODATA\]|\[UPLOAD /.test(a.feedback);

    const bio = apps.filter(isBiodataRow);
    // The parameter is annotated for the same reason the two lines above are:
    // `attachApplications` returns `Record<string, any>[]`, so `apps` is `any`
    // and an unannotated arrow parameter gets NO contextual type — which is a
    // hard TS7006 under this repo's `noImplicitAny`, not a style preference.
    const real = apps.filter((a: { code: string; feedback: string }) => !isBiodataRow(a));

    expect(bio).toHaveLength(1);
    expect(real).toHaveLength(1);
    // Same status, different meaning — the client can now separate them.
    expect(bio[0].status).toBe(real[0].status);
  });

  it('recognises the [UPLOAD <LABEL>] marker too, not only [BIODATA]', () => {
    const out = attachApplications([cand('628111')], [bioRow('628111', 'LULUS', '[UPLOAD PASPOR]')]);
    const a = out[0].applications[0];
    expect(/\[BIODATA\]|\[UPLOAD /.test(a.feedback)).toBe(true);
    expect(String(a.code || '').trim()).toBe('');
  });

  // ── additive-only ───────────────────────────────────────────────────────
  it('keeps every field existing consumers read', () => {
    const out = attachApplications([cand('628111')], [realApp('628111')]);
    const a = out[0].applications[0];
    for (const field of ['code', 'kategori', 'status', 'timestamp', 'nama', 'cv']) {
      expect(a, `missing field ${field}`).toHaveProperty(field);
    }
  });

  it('still stamps the candidate tahapan onto each application', () => {
    const out = attachApplications([cand('628111', { tahapan: 'MCU' })], [realApp('628111')]);
    expect(out[0].applications[0].tahapan).toBe('MCU');
  });

  it('returns the candidate list unchanged when forms is not an array', () => {
    const cands = [cand('628111')];
    expect(attachApplications(cands, undefined as unknown as [])).toBe(cands);
  });
});

// ==========================================
// `_lib/db/pekerjaan` — satu-satunya aturan normalisasi riwayat kerja.
//
// Sejak migrasi 032 riwayat kerja hidup di `candidate_pekerjaan`, bukan lagi di
// kolom `pekerjaan_1..3`. Empat salinan lama (kolom, `ai_data_json.pekerjaan[]`,
// `database_candidate`, `riwayat_pekerjaan_json`) menghasilkan 70 entri tapi
// hanya 65 unik, dengan `masuk` dan `tahun_masuk` saling bertentangan di dalam
// SATU objek. Tes di bawah mengunci aturan yang menggantikannya.
// ==========================================
describe('pekerjaan — normalisasi sebelum menyentuh tabel', () => {
  it('membuang baris tanpa nama perusahaan (kolomnya NOT NULL + CHECK)', () => {
    const out = normalizePekerjaan([
      { perusahaan: 'PT A', masuk: '2020' },
      { perusahaan: '   ', masuk: '2021' },
      { perusahaan: '-', masuk: '2022' },
      { nama_perusahaan: '' },
      null,
      'bukan objek',
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.perusahaan).toBe('PT A');
  });

  it('mendedupe dengan kunci yang SAMA dengan UNIQUE INDEX di DB', () => {
    // Beda huruf besar dan spasi ganda tetap satu baris — kalau tidak, DB yang
    // menolak dan seluruh penyimpanan gagal.
    const out = normalizePekerjaan([
      { perusahaan: 'PT LAMDA UTAMA KONSULT', masuk: '2025-05' },
      { perusahaan: '  pt lamda utama   konsult ', masuk: '2025-05' },
      { perusahaan: 'PT LAMDA UTAMA KONSULT', masuk: '2024-07' },
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((p) => p.tahun_masuk)).toEqual(['2024-07', '2025-05']);
  });

  it('`masuk` menang atas `tahun_masuk` yang bertentangan', () => {
    // Terukur pada ASJ00095: masuk=2024-07 tapi tahun_masuk=2025-05 dalam satu
    // objek. `sortRiwayatKronologis` membaca `masuk` lebih dulu, jadi memilih
    // yang lain akan membuat urutan cetak berbeda dari yang tersimpan.
    const out = normalizePekerjaan([{ perusahaan: 'PT X', masuk: '2024-07', tahun_masuk: '2025-05' }]);
    expect(out[0]?.tahun_masuk).toBe('2024-07');
  });

  it('mengurutkan kronologis, yang tanpa tahun di akhir', () => {
    const out = normalizePekerjaan([
      { perusahaan: 'TERBARU', masuk: '2021' },
      { perusahaan: 'TANPA TAHUN' },
      { perusahaan: 'LAMA', masuk: 'Juli 2015' },
      { perusahaan: 'TENGAH', masuk: '2018-09' },
    ]);
    expect(out.map((p) => p.perusahaan)).toEqual(['LAMA', 'TENGAH', 'TERBARU', 'TANPA TAHUN']);
  });

  it('TIDAK memotong daftar di 3 — batas kolom bukan batas data', () => {
    // Data nyata: ASJ00184 punya 8 pekerjaan, ASJ00132 punya 5. Dulu lima di
    // antaranya hilang saat simpan karena hanya 3 kolom slot yang ditulis.
    const banyak = Array.from({ length: 8 }, (_, i) => ({ perusahaan: `PT ${i}`, masuk: String(2000 + i) }));
    expect(normalizePekerjaan(banyak)).toHaveLength(8);
  });

  it('pekerjaanDariSlot membaca kolom 1..3 dengan ejaan kolom', () => {
    const out = pekerjaanDariSlot({
      pekerjaan_1_nama_perusahaan: 'PT A', pekerjaan_1_tahun_masuk: '2019', pekerjaan_1_jabatan: 'Operator',
      pekerjaan_2_nama_perusahaan: 'PT B', pekerjaan_2_tahun_masuk: '2021',
      pekerjaan_3_nama_perusahaan: '', pekerjaan_3_tahun_masuk: '2022',
    });
    expect(out.map((p) => p.perusahaan)).toEqual(['PT A', 'PT B']);
    expect(out[0]?.jabatan).toBe('Operator');
    expect(out[0]?.tahun_keluar).toBeNull();
  });

  it('idempoten: masukan yang sama menghasilkan keluaran yang sama', () => {
    const src = [{ perusahaan: 'PT B', masuk: '2020' }, { perusahaan: 'PT A', masuk: '2018' }];
    expect(normalizePekerjaan(normalizePekerjaan(src))).toEqual(normalizePekerjaan(src));
  });
});

// ==========================================
// KELAS: kolom vs tag `[KELAS xx]`
//
// Sampai migrasi 042 kelas hanya hidup sebagai teks di `catatan_internal`, dan
// 117 siswa diisi kelasnya lewat KOLOM baru. Dua hal bisa salah tanpa error:
//
//   • kolomnya tidak dibaca  -> siswa kehilangan kelas DAN gerbang VIP-nya
//     tertutup (statusVip dulu hanya membaca catatan);
//   • tag berhenti dibaca    -> 39 kandidat lama kehilangan kelasnya.
//
// Keduanya harus benar SEKALIGUS, jadi keduanya diuji.
// ==========================================
describe('mapCandidate — kelas dari kolom, tag sebagai cadangan', () => {
  const dasar = { id_kandidat: 'K-1', nama_lengkap: 'BUDI', no_wa: '081234567890' };

  it('kolom `kelas` terbaca walau catatan kosong', () => {
    const c = mapCandidate({ ...dasar, kelas: 'K', catatan_internal: '' });
    expect(c.kelas).toBe('K');
    /* isSiswaASJ dihitung dari kelas juga — tanpa ini lencana "Siswa Resmi ASJ"
       hilang untuk 117 siswa yang kelasnya hanya ada di kolom. */
    expect(c.isSiswaASJ).toBe(true);
  });

  it('tag `[KELAS G]` tetap terbaca saat kolom kosong', () => {
    const c = mapCandidate({ ...dasar, kelas: null, catatan_internal: '[KELAS G] siap' });
    expect(c.kelas).toBe('G');
    expect(c.isSiswaASJ).toBe(true);
  });

  it('KOLOM menang atas tag yang berbeda', () => {
    /* Kalau tag menang, memindahkan siswa ke kelas lain lewat kolom tidak akan
       berpengaruh apa pun selama tag lamanya masih ada — dan tidak ada yang
       menyadarinya sampai siswa itu mengeluh kelasnya salah. */
    const c = mapCandidate({ ...dasar, kelas: 'B', catatan_internal: '[KELAS G]' });
    expect(c.kelas).toBe('B');
  });

  it('kode kelas dinormalkan ke huruf besar dan dirapikan spasinya', () => {
    const c = mapCandidate({ ...dasar, kelas: '  k ', catatan_internal: '' });
    expect(c.kelas).toBe('K');
  });

  it('tanpa kolom dan tanpa tag kurung: kelas kosong, bukan siswa ASJ', () => {
    const c = mapCandidate({ ...dasar, kelas: null, catatan_internal: 'sudah mcu, berkas lengkap' });
    expect(c.kelas).toBe('');
    expect(c.isSiswaASJ).toBe(false);
  });

  it('CATATAN: tag kurung NON-KELAS tetap dihitung sebagai siswa ASJ', () => {
    /* Ini perilaku LAMA yang dipertahankan, bukan yang saya inginkan: komentar
       di `mapCandidate` menyebut "a class tag is [KELAS XX] or a bare [TAG]",
       jadi `[MCU]` pun membuat `isSiswaASJ` true. Tes ini mengunci keadaan itu
       supaya tidak berubah diam-diam — kalau nanti dilonggarkan/diperketat,
       perubahan itu harus disengaja. */
    const c = mapCandidate({ ...dasar, kelas: null, catatan_internal: '[MCU] sudah' });
    expect(c.kelas).toBe('');
    expect(c.isSiswaASJ).toBe(true);
  });
});

/* ── Regresi 2026-11-12: `jft`/`ssw` menyimpan DUA hal ───────────────────────
   Kolom yang sama dipakai untuk URL berkas DAN untuk teks nilai sertifikasi.
   Terukur di produksi: ASJ00188 `jft = "233"`, ASJ00133 `"A1"`,
   ASJ00194 `"A2/205"`. Alias `jftUrl` dipakai dossier sebagai tautan pratinjau,
   jadi tombol "SERTIF JFT" membuka alamat "233" — tautan mati yang terlihat
   seperti berkas rusak. Alias `*Url` hanya boleh berisi URL; teks mentahnya
   tetap tersedia di `jft`/`ssw`. */
describe('mapCandidate — alias *Url hanya berisi URL', () => {
  it('nilai ujian di kolom jft tidak menjadi tautan', () => {
    const c = mapCandidate({ no_wa: '6281', jft: '233', ssw: 'A1', file_cv: 'https://x/y.pdf' });
    expect(c.jftUrl).toBe('');
    expect(c.sswUrl).toBe('');
    expect(c.jft).toBe('233');
    expect(c.cvUrl).toBe('https://x/y.pdf');
  });

  it('URL sah tetap diteruskan', () => {
    const c = mapCandidate({ no_wa: '6281', jft: 'https://cdn/x.pdf' });
    expect(c.jftUrl).toBe('https://cdn/x.pdf');
  });
});
