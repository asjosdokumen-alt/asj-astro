/**
 * e2e/identity-sync.test.ts — GATE sinkronisasi biodata dua tabel.
 *
 * MASALAH YANG DIKUNCI (keluhan pemilik 2026-10-25)
 *   *"cv mini yg sekarang … TT TB ada yg belum ke isi padahal sudah isi cv ai
 *   itu lengkap"*. Sebabnya bukan AI dan bukan "menunggu approve": setiap jalur
 *   simpan menulis `database_candidate` dengan DAFTAR KOLOM SENDIRI-SENDIRI yang
 *   ditulis tangan, dan daftar jalur CV AI sudah tertinggal — `tb`/`bb` tidak
 *   pernah ikut, padahal `master_database_candidate.tb` berisi. `mapCandidate`
 *   membaca `tb`/`bb` dari baris kandidat, jadi layar menampilkan kosong.
 *
 *   Sekarang daftarnya satu (`_lib/db/identity-sync.ts`). Tes ini menjaga dua
 *   hal yang bisa merusaknya tanpa suara:
 *     1. setiap kolom di daftar itu BENAR-BENAR ADA di kontrak kedua tabel
 *        (salah ejaan = PATCH ditolak 400 dan SELURUH body hilang), dan
 *     2. nilai kosong tidak pernah ikut, supaya simpan parsial tidak menghapus
 *        data yang sudah benar di tabel lain.
 *
 * MENGAPA DI e2e/
 *   Ia meng-import `netlify/functions/**` (backend). `.ts` di `e2e/` tidak
 *   dihitung counter beku `indexer` (R15/R13f), tetapi WAJIB terdaftar di
 *   `exclude` project `frontend` pada `vitest.config.ts` — tanpa itu ia berjalan
 *   di jsdom dan dihitung dua kali (R13f-bis).
 */
import { describe, it, expect } from 'vitest';
import {
  MASTER_TO_CANDIDATE_IDENTITY,
  MASTER_TO_CANDIDATE_FILES,
  PENDIDIKAN_LEVELS,
  candidateIdentityPatch,
  masterIdentityPatch,
} from '../netlify/functions/_lib/db/identity-sync';
import { TABLE_COLUMNS } from '../netlify/functions/_lib/db/schema.generated';

const MASTER = 'master_database_candidate';
const CANDIDATE = 'database_candidate';

describe('identitas: kolom yang disalin benar-benar ada di kedua tabel', () => {
  it('setiap pasangan ada di kontrak skema (salah ejaan = 400 PGRST204)', () => {
    const masterCols = new Set(TABLE_COLUMNS[MASTER] || []);
    const candCols = new Set(TABLE_COLUMNS[CANDIDATE] || []);
    const missing: string[] = [];
    for (const [m, c] of [...MASTER_TO_CANDIDATE_IDENTITY, ...MASTER_TO_CANDIDATE_FILES]) {
      if (!masterCols.has(m)) missing.push(`${MASTER}.${m}`);
      if (!candCols.has(c)) missing.push(`${CANDIDATE}.${c}`);
    }
    expect(missing).toEqual([]);
  });

  it('kontrol: kedua tabel memang terbaca dari kontrak (bukan himpunan kosong)', () => {
    // Tanpa ini, kontrak yang gagal dimuat membuat tes di atas lolos hampa.
    expect((TABLE_COLUMNS[MASTER] || []).length).toBeGreaterThan(100);
    expect((TABLE_COLUMNS[CANDIDATE] || []).length).toBeGreaterThan(20);
  });
});

describe('candidateIdentityPatch — master → baris operasional', () => {
  it('menyalin tb & bb (regresi yang dilaporkan: CV Mini kosong)', () => {
    const p = candidateIdentityPatch({ tb: '170', bb: '60' });
    expect(p.tb).toBe('170');
    expect(p.bb).toBe('60');
  });

  it('nilai kosong / "-" tidak pernah menghasilkan kunci', () => {
    const p = candidateIdentityPatch({ tb: '', bb: '-', email: '   ', nik: null, gender: undefined });
    expect(p).toEqual({});
  });

  it('ejaan paspor yang berbeda dipetakan dengan benar', () => {
    expect(candidateIdentityPatch({ no_paspor: 'C1234' }).no_pasport).toBe('C1234');
  });

  it('jenjang hanya disalin kalau memang salah satu jenjang yang dikenal', () => {
    expect(candidateIdentityPatch({ pendidikan_1_tingkat: 'smk' }).pendidikan).toBe('SMK');
    // Nilai nyata di DB yang BUKAN jenjang — jangan sampai masuk kolom kandidat.
    expect(candidateIdentityPatch({ pendidikan_1_tingkat: 'SMA/SMK' }).pendidikan).toBeUndefined();
    expect(candidateIdentityPatch({ pendidikan_1_tingkat: '小学校' }).pendidikan).toBeUndefined();
  });

  it('daftar jenjang yang dikenal tidak kosong (kontrol)', () => {
    expect(PENDIDIKAN_LEVELS.size).toBeGreaterThan(3);
  });

  it('berkas ikut disalin dengan nama kolom yang berbeda', () => {
    const p = candidateIdentityPatch({ pas_photo: 'u1', jft_url: 'u2', ssw_url: 'u3', file_cv: 'u4' });
    expect(p).toEqual({ pas_photo: 'u1', jft: 'u2', ssw: 'u3', file_cv: 'u4' });
  });
});

describe('masterIdentityPatch — baris operasional → master', () => {
  it('nama disimpan huruf besar, seperti semua jalur tulis master', () => {
    expect(masterIdentityPatch({ nama_lengkap: 'budi santoso' }).nama_lengkap).toBe('BUDI SANTOSO');
  });

  it('no_pasport kembali ke ejaan master', () => {
    expect(masterIdentityPatch({ no_pasport: 'C999' }).no_paspor).toBe('C999');
  });

  it('tidak menyalin pendidikan (tiga bentuk di baris kandidat)', () => {
    expect(masterIdentityPatch({ pendidikan: '[{"tingkat":"SMA"}]' }).pendidikan_1_tingkat).toBeUndefined();
  });

  it('tidak menyalin jft/ssw (teks sertifikasi, bukan URL)', () => {
    const p = masterIdentityPatch({ jft: 'JFT-BASIC', ssw: 'KAIGO' });
    expect(p.jft_url).toBeUndefined();
    expect(p.ssw_url).toBeUndefined();
  });

  it('bolak-balik: nilai yang sama tidak berubah bentuk', () => {
    const fromMaster = candidateIdentityPatch({ tb: '170', bb: '60', no_paspor: 'C1', email: 'a@b.c' });
    const back = masterIdentityPatch(fromMaster);
    expect(back).toMatchObject({ tb: '170', bb: '60', no_paspor: 'C1', email: 'a@b.c' });
  });

  /* ── Menghapus lewat modal edit admin ──────────────────────────────────────
     Sebelum 2026-10-30 `masterIdentityPatch` mengabaikan SEMUA nilai kosong,
     jadi admin yang menghapus tinggi/berat hanya mengubah layar: kolom master
     tetap berisi, dan CV cetak + form CV AI memakai nilai lama. Sekarang
     penghapusan diteruskan — TAPI hanya kalau nilai lama di baris kandidat
     memang ada (lihat tes kedua). */
  it('field yang DIKOSONGKAN admin menghapus kolom master (kalau sebelumnya ada)', () => {
    const sebelum = { tb: '170', bb: '60', email: 'a@b.c' };
    const p = masterIdentityPatch({ tb: '', bb: '', email: '' }, sebelum);
    expect(p.tb).toBe('');
    expect(p.bb).toBe('');
    expect(p.email).toBe('');
  });

  it('field yang MEMANG sudah kosong tidak menghapus master (baris legacy)', () => {
    // `database_candidate` bisa kosong sementara master berisi (baris lama yang
    // hanya pernah diisi lewat CV AI). Mengosongkan di sini = menghapus data
    // yang tidak pernah dilihat admin.
    const p = masterIdentityPatch({ tb: '', bb: '' }, { tb: '', bb: '' });
    expect('tb' in p).toBe(false);
    expect('bb' in p).toBe(false);
  });

  it('tanpa baris lama, perilaku lama dipertahankan (tidak menghapus apa pun)', () => {
    const p = masterIdentityPatch({ tb: '', bb: '' });
    expect('tb' in p).toBe(false);
    expect('bb' in p).toBe(false);
  });

  it('field yang TIDAK dikirim tidak disentuh walau ada yang dikosongkan', () => {
    const p = masterIdentityPatch({ tb: '' }, { tb: '170', email: 'a@b.c' });
    expect(p.tb).toBe('');
    expect('email' in p).toBe(false);
  });
});
