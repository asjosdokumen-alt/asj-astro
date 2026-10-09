/**
 * TESTS: biodataExport — berkas "Download Full Biodata" harus RAPI dan LENGKAP.
 *
 * KENAPA DI `e2e/`, BUKAN DI SEBELAH MODULNYA
 * -------------------------------------------
 * Sama alasannya dengan `e2e/ai-cv-submit.test.ts` dan
 * `e2e/tab-mail-labels.test.tsx`: `indexer` menghitung SELURUH berkas di bawah
 * `src/**` (semua ekstensi), jadi menambah satu `.test.ts` di sana memindahkan
 * counter beku (`files.length`, `fileCount`, `count('ts')`) yang hanya boleh
 * diedit team-lead. `.ts` di bawah `e2e/` tidak dihitung — tier `e2e/` hanya
 * memuat `mjs`/`cjs`/`js` — dan `vitest.config.ts` tetap menjalankannya di
 * project `frontend` (jsdom).
 *
 * APA YANG DIKUNCI
 * ----------------
 * Keluhan pemilik 2026-10-09: "fitur download biodata tolong rapikan dan semua
 * datanya masuk". Dua cacat nyata pada versi pertama (yang menyalin string
 * legacy apa adanya):
 *
 *   1. Kunci proyeksi mentah ikut tercetak — `ayah: BUDI`, `pt: PT. X`,
 *      `kk: https://…` — karena `berkas`/`bio` memang berkunci kode pendek.
 *   2. Blok "Job Yang Dilamar" TIDAK ADA di berkas, padahal blok itu tampil di
 *      modal admin DAN di kartu kandidat, tepat di atas tombol unduhnya.
 *
 * Tes ini menuntut label manusia, kehadiran blok lamaran, dan — sama
 * pentingnya — bahwa kolom admin-only TIDAK ikut, walau objek sumbernya
 * membawanya.
 */
import { describe, it, expect } from 'vitest';
import { buildBiodataText } from '../src/lib/biodataExport';

const CAND = {
  nama: 'ARIA UJI',
  wa: '6285700000001',
  idKandidat: 'ASJ00123',
  gender: 'LAKI-LAKI',
  usia: '24',
  fisik: '170 / 60',
  pendidikan: 'SMA',
  tmplahir: 'PONOROGO',
  tgllahir: '2001-05-05',
  email: 'aria@example.com',
  alamat: 'JL. MELATI 1',
  jft: 'A2',
  ssw: 'KAIGO',
  tahapan: 'PEMBERKASAN',
  status: 'LULUS',
  isVIP: true,
  isSiswaASJ: true,
  kelas: 'G',
  applications: [
    { code: 'TG658ASJ', kategori: '🍱 P. MAKANAN', status: 'LULUS' },
    { code: 'TG700ASJ', status: 'MENUNGGU' },
  ],
  berkas: { kk: 'https://x/kk.pdf', ktp: 'https://x/ktp.pdf', kosong: '' },
  bio: { ayah: 'BUDI', pt: 'PT. SAKURA', email: 'aria@example.com', pasport: 'X123' },
};

describe('biodataExport — berkas biodata rapi & lengkap', () => {
  const text = buildBiodataText(CAND);

  it('mencetak identitas dengan label manusia', () => {
    expect(text).toContain('BIODATA KANDIDAT');
    expect(text).toMatch(/Nama\s*: ARIA UJI/);
    expect(text).toMatch(/ID Kandidat\s*: ASJ00123/);
    expect(text).toMatch(/WhatsApp\s*: 6285700000001/);
    expect(text).toMatch(/Usia\s*: 24 Tahun/);
    expect(text).toMatch(/Tinggi \/ Berat\s*: 170 \/ 60/);
    expect(text).toMatch(/Pendidikan\s*: SMA/);
  });

  it('menyertakan blok "Job Yang Dilamar" — yang sebelumnya HILANG', () => {
    expect(text).toMatch(/JOB YANG DILAMAR/);
    expect(text).toContain('1. 🍱 P. MAKANAN (TG658ASJ) — LULUS');
    expect(text).toContain('2. TG700ASJ — MENUNGGU');
  });

  it('memakai label manusia untuk berkas, bukan kunci proyeksi', () => {
    expect(text).toContain('Kartu Keluarga');
    expect(text).toContain('KTP');
    expect(text).toContain('https://x/kk.pdf');
    // Bentuk lamanya: kunci mentah di awal baris.
    expect(text).not.toMatch(/^kk\s*:/m);
    expect(text).not.toMatch(/^ktp\s*:/m);
  });

  it('memakai label manusia untuk biodata detail, bukan kunci proyeksi', () => {
    expect(text).toContain('Nama Ayah');
    expect(text).toContain('Nama Perusahaan');
    expect(text).toContain('No. Paspor');
    expect(text).not.toMatch(/^ayah\s*:/m);
    expect(text).not.toMatch(/^pt\s*:/m);
  });

  it('tidak mencetak nilai yang sama dua kali (email ada di identitas DAN bio)', () => {
    const n = text.split('aria@example.com').length - 1;
    expect(n, `email muncul ${n} kali`).toBe(1);
  });

  it('mengisi identitas dari salinan master bila kolom barisnya kosong', () => {
    const t = buildBiodataText({ nama: 'X', bio: { email: 'only-master@x.com' } });
    expect(t).toMatch(/Email\s*: only-master@x\.com/);
    expect(t.split('only-master@x.com').length - 1).toBe(1);
  });

  it('jatuh ke daftar kode job ketika belum ada baris lamaran', () => {
    const t = buildBiodataText({ nama: 'X', jobs: ['TG1ASJ', 'GJ2ASJ'] });
    expect(t).toContain('1. TG1ASJ');
    expect(t).toContain('2. GJ2ASJ');
  });

  it('mengatakan bagian kosong, bukan menghilangkannya', () => {
    const t = buildBiodataText({ nama: 'X' });
    expect(t).toContain('(belum ada lamaran)');
    expect(t).toContain('(belum ada berkas)');
    expect(t).toContain('(belum ada biodata detail)');
    expect(t).toMatch(/VIP\s*: TIDAK/);
    expect(t).toMatch(/Siswa ASJ\s*: TIDAK/);
  });

  it('kolom baru tanpa label tetap muncul (fallback ke kunci mentah)', () => {
    const t = buildBiodataText({ nama: 'X', berkas: { dokumen_baru: 'https://x/y.pdf' } });
    expect(t).toContain('DOKUMEN_BARU');
    expect(t).toContain('https://x/y.pdf');
  });

  it('TIDAK memuat kolom admin-only walau objek sumbernya membawanya', () => {
    const withAdmin = {
      ...CAND,
      nik: '3512345678901234',
      catatanInternal: 'RAHASIA INTERNAL [VIP]',
      catatanExternal: 'PESAN PRIVAT',
      folderUrl: 'https://drive.example.com/folder-rahasia',
      passwordKandidat: 'rahasia123',
    };
    const t = buildBiodataText(withAdmin);
    expect(t).not.toContain('3512345678901234');
    expect(t).not.toContain('RAHASIA INTERNAL');
    expect(t).not.toContain('PESAN PRIVAT');
    expect(t).not.toContain('folder-rahasia');
    expect(t).not.toContain('rahasia123');
  });
});

// ── DATA MASTER (LENGKAP) ───────────────────────────────────────────────────
// Keluhan lanjutan pemilik 2026-10-09: "saya maunya semua data master nya ke
// download … jadi lengkap semua" — dengan contoh satu berkas CV berisi seluruh
// jawaban (data diri, keluarga, pendidikan, pekerjaan, sampai jawaban kanji).
// Blok ini yang memenuhinya: seluruh baris `master_database_candidate`, bukan
// hanya `bio` yang ikut di payload kandidat.
const MASTER = {
  identitas: {
    nama_lengkap: 'AZMATUL',
    katakana: 'アズマトゥル',
    tgl_lahir: '2007-01-08',
    umur: '19',
    ktp: '3502144801070001',
    alamat: 'DUKUH TAMANSARI',
  },
  fisik: { tb: '150', bb: '48' },
  medis: { golongan_darah: 'A' },
  wawancara: {
    hobi_id: 'VOLLY',
    hobi_jp: '趣味はバレーボール',
    kelebihan_id: 'CEPAT BELAJAR',
    kelebihan_jp: '私の長所は素早く覚えることです',
    // Dua pasangan kunci yang menunjuk kolom yang sama.
    rencana_setelah_pulang: 'RENCANA-UNIK',
    rencana_pulang_id: 'RENCANA-UNIK',
  },
  // `bahasa_jepang`/`nilai`/`lisensi` adalah alias kolom yang sama dengan
  // `jft`/`ssw` — nilainya tidak boleh tercetak dua kali. Nilainya sengaja
  // BERBEDA dari `CAND.jft`/`CAND.ssw` supaya hitungannya mengukur alias di
  // dalam master, bukan kemunculan di bagian ringkasan.
  sertifikasi: { jft: 'N4', bahasa_jepang: 'N4', nilai: 'N4', ssw: 'BIDANG-X', lisensi: 'BIDANG-X' },
  pendidikan: [
    { tingkat: 'SD', sekolah: 'SDN 1', nama_sekolah: 'SDN 1', masuk: '2013', tahun_masuk: '2013' },
    { tingkat: 'SMA', sekolah: 'MAN 1', jurusan_id: 'IPA', jurusan: 'IPA' },
  ],
  pekerjaan: [{ perusahaan: 'PT X', nama_perusahaan: 'PT X', jabatan: 'OPERATOR' }],
  keluarga: [{ nama: 'SUKATNO', umur: '54', usia: '54', hubungan: 'AYAH' }],
  kenalan_jepang: { nama_id: 'TANAKA' },
  uploads: { cv: 'https://x/cv.pdf', ktp: 'https://x/ktp.jpg' },
  AIDATAJSON: '{"blob":"RAW-JSON-JANGAN-CETAK"}',
  id_kandidat: 'ASJ00123',
};

describe('biodataExport — DATA MASTER (LENGKAP)', () => {
  const t = buildBiodataText({ ...CAND, master: MASTER });

  it('mencetak seluruh baris master, berkelompok', () => {
    expect(t).toContain('DATA MASTER (LENGKAP)');
    for (const g of [
      'IDENTITAS (MASTER)',
      'FISIK & UKURAN',
      'KESEHATAN & RIWAYAT MEDIS',
      'WAWANCARA & MOTIVASI',
      'SERTIFIKASI & BAHASA',
      'RIWAYAT PENDIDIKAN',
      'PENGALAMAN KERJA',
      'KELUARGA (SESUAI KK)',
      'KENALAN DI JEPANG',
      'DOKUMEN (MASTER)',
    ]) {
      expect(t, `grup hilang: ${g}`).toContain(g);
    }
  });

  it('memakai label manusia, termasuk field kanji', () => {
    expect(t).toMatch(/Nama Lengkap\s*: AZMATUL/);
    expect(t).toMatch(/Nama Katakana\s*: アズマトゥル/);
    expect(t).toMatch(/NIK KTP\s*: 3502144801070001/);
    expect(t).toContain('Hobi & Keterampilan (Kanji)');
    expect(t).toContain('趣味はバレーボール');
    expect(t).toContain('Kelebihan (Kanji)');
    expect(t).toContain('私の長所は素早く覚えることです');
  });

  it('mencetak riwayat sebagai daftar bernomor', () => {
    expect(t).toMatch(/RIWAYAT PENDIDIKAN[\s\S]*1\.[\s\S]*SDN 1/);
    expect(t).toMatch(/RIWAYAT PENDIDIKAN[\s\S]*2\.[\s\S]*MAN 1/);
    expect(t).toMatch(/PENGALAMAN KERJA[\s\S]*PT X/);
    expect(t).toMatch(/KELUARGA \(SESUAI KK\)[\s\S]*SUKATNO/);
  });

  it('tidak mencetak nilai yang sama dua kali (alias kolom)', () => {
    const count = (s: string) => t.split(s).length - 1;
    expect(count('SDN 1'), 'nama_sekolah vs sekolah').toBe(1);
    expect(count('IPA'), 'jurusan vs jurusan_id').toBe(1);
    expect(count('2013'), 'tahun_masuk vs masuk').toBe(1);
    expect(count('PT X'), 'nama_perusahaan vs perusahaan').toBe(1);
    expect(count('54'), 'usia vs umur').toBe(1);
    expect(count('A2'), 'bahasa_jepang/nilai vs jft').toBe(1);
    expect(count('N4'), 'bahasa_jepang/nilai vs jft (master)').toBe(1);
    expect(count('BIDANG-X'), 'lisensi vs ssw (master)').toBe(1);
    expect(count('RENCANA-UNIK'), 'rencana_pulang_id vs rencana_setelah_pulang').toBe(1);
  });

  it('membuang plumbing: AIDATAJSON tidak pernah ikut', () => {
    // Kontrol positif: master memang tercetak, jadi "tidak memuat" di bawah
    // bukan hasil dari master yang tidak pernah dirender sama sekali.
    expect(t).toContain('Nama Lengkap');
    expect(t).not.toContain('RAW-JSON-JANGAN-CETAK');
    expect(t).not.toContain('AIDATAJSON');
  });

  it('master menggantikan BIODATA DETAIL (bio adalah subset-nya)', () => {
    expect(t).not.toContain('BIODATA DETAIL');
  });

  it('jatuh kembali ke BIODATA DETAIL kalau master tidak tersedia', () => {
    const fallback = buildBiodataText(CAND);
    expect(fallback).toContain('BIODATA DETAIL');
    expect(fallback).not.toContain('DATA MASTER (LENGKAP)');
  });
});
