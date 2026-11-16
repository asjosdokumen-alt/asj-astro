/**
 * leaderboard.test.ts — papan peringkat game.
 *
 * APA YANG DIJAGA
 *   Berkas ini TIDAK menguji DB (tidak ada koneksi di sini). Yang diuji adalah
 *   dua hal yang bisa salah tanpa satu pun error muncul:
 *
 *   1. Daftar game yang sah di sini HARUS sama dengan CHECK constraint di
 *      migrasi. Kalau keduanya berbeda, `simpanSkor` akan meloloskan nilai yang
 *      ditolak DB — pengiriman skor gagal dengan pesan "coba lagi" yang tidak
 *      pernah berhasil, dan tidak ada yang tahu sebabnya.
 *   2. Penolakan di depan (game asing, skor mustahil, WA kosong) harus terjadi
 *      SEBELUM menyentuh DB. Tanpa ini, kiriman sampah masuk ke tabel dan
 *      papan peringkat penuh angka yang tidak berarti.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GAME_SAH,
  gameSah,
  simpanSkor,
  batasSkor,
  bandingPapan,
  kunciPapan,
  skorTampil,
} from './leaderboard';

describe('game_sah', () => {
  it('menerima tepat empat game yang dipakai aplikasi', () => {
    expect([...GAME_SAH]).toEqual(['kotoba', 'genba', 'combo', 'matematika']);
    for (const g of GAME_SAH) expect(gameSah(g)).toBe(true);
  });

  it('menolak `arcade` — papan itu sudah dipecah jadi genba + combo', () => {
    /* `arcade` pernah sah (migrasi 042) lalu dipecah (043). Kalau ia lolos lagi,
       skor Genba dan Combo tercampur di satu papan dan papan Genba selalu
       dimenangkan pemain Combo. */
    expect(gameSah('arcade')).toBe(false);
  });

  it('menolak nilai bukan-string dan string kosong', () => {
    for (const v of [null, undefined, '', 0, {}, [], 'KOTOBA ']) {
      expect(gameSah(v)).toBe(false);
    }
  });
});

describe('CHECK constraint di migrasi cocok dengan GAME_SAH', () => {
  /**
   * Membaca migrasi TERAKHIR yang mendefinisikan constraint ini — bukan nomor
   * tetap. Kalau nanti ada migrasi 044 yang mengubahnya lagi, tes ini harus
   * ikut membaca yang baru, bukan terus memeriksa 043 yang sudah basi.
   */
  const berkas = readFileSync(new URL('../../../../migrations/043_papan_skor_genba_combo.sql', import.meta.url), 'utf8');
  const cocok = /CHECK\s*\(\s*game\s+IN\s*\(([^)]*)\)\s*\)/i.exec(berkas);

  it('migrasi memuat daftar game yang bisa dibaca', () => {
    expect(cocok, 'pola CHECK (game IN (...)) tidak ditemukan di migrasi 043').toBeTruthy();
  });

  it('daftar di migrasi SAMA dengan GAME_SAH', () => {
    const dariMigrasi = (cocok?.[1] || '')
      .split(',')
      .map((x) => x.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)
      .sort();
    expect(dariMigrasi).toEqual([...GAME_SAH].sort());
  });
});

describe('simpanSkor menolak kiriman buruk sebelum menyentuh DB', () => {
  /* Semua kasus di bawah harus ditolak TANPA koneksi DB. Kalau salah satunya
     lolos ke DB, tes ini akan menggantung atau gagal karena jaringan — dan itu
     justru sinyal yang benar: penolakannya tidak jalan. */

  it('WA kosong ditolak', async () => {
    const r = await simpanSkor({ wa: '', game: 'kotoba', skor: 10 });
    expect(r.success).toBe(false);
  });

  it('game asing ditolak', async () => {
    const r = await simpanSkor({ wa: '081234567890', game: 'pacman', skor: 10 });
    expect(r.success).toBe(false);
    expect(String(r.message)).toMatch(/game/i);
  });

  it('skor negatif, NaN, dan tak terhingga ditolak', async () => {
    for (const skor of [-1, Number.NaN, Number.POSITIVE_INFINITY, 'banyak']) {
      const r = await simpanSkor({ wa: '081234567890', game: 'kotoba', skor });
      expect(r.success, `skor ${String(skor)} seharusnya ditolak`).toBe(false);
    }
  });

  it('skor di atas batas ditolak', async () => {
    /* Bukan pengaman anti-curang (skor dihitung di klien), tapi penjaga agar
       papan tidak dipenuhi angka mustahil yang membuatnya berhenti berarti. */
    const r = await simpanSkor({ wa: '081234567890', game: 'kotoba', skor: 1_000_001 });
    expect(r.success).toBe(false);
  });
});

/* ── DB palsu untuk jalur simpan ───────────────────────────────────────────
 * Sampai 2026-11-16 berkas ini hanya menguji penolakan SEBELUM DB, karena
 * `simpanSkor` tidak pernah boleh menyentuh DB pada kasus buruk. Sejak skor
 * Genba dihitung ulang dari ronde, jalur simpannya sendiri harus diuji — dan
 * itu menuntut DB palsu, bukan koneksi. Tidak ada satu pun permintaan jaringan
 * di sini. */
const db = vi.hoisted(() => ({
  panggilan: [] as Array<{ method: string; table: string; body?: unknown }>,
  kandidat: [{ nama_lengkap: 'Siswa Uji', kelas: 'a', catatan_internal: '' }],
  rekor: [{ skor: 4650 }],
}));

vi.mock('../db/client', async (importOriginal) => {
  const asli = await importOriginal<typeof import('../db/client')>();
  return {
    ...asli,
    supabaseJson: vi.fn(async (method: string, table: string, opts: { body?: unknown } = {}) => {
      db.panggilan.push({ method, table, body: opts.body });
      if (table === 'database_candidate') return db.kandidat;
      if (table === 'game_scores' && method === 'GET') return db.rekor;
      return null;
    }),
  };
});

/* ── ULTIMATE LOOP: tidak ada posisi seri di papan ───────────────────────── */
describe('papan peringkat — urutan total tanpa seri', () => {
  type Baris = Parameters<typeof bandingPapan>[0];
  const baris = (no_wa: string, skor: number, presisi: number, loop: number, dibuat_pada: string): Baris => ({
    no_wa,
    nama: `Siswa ${no_wa}`,
    kelas: 'A',
    game: 'genba',
    skor,
    detail: { presisi, loop, ultimate: loop > 0 },
    dibuat_pada,
  });

  it('plafon Ultimate Loop hanya berlaku bila ada kedalaman loop', () => {
    expect(batasSkor({})).toBe(1_000_000);
    expect(batasSkor({ loop: 1 })).toBe(10_000_000);
    expect(batasSkor({ loop: 0 })).toBe(1_000_000);
    expect(batasSkor({ loop: 'bukan angka' })).toBe(1_000_000);
  });

  it('skor sama tapi reaksi beda 1 ms → urutan berbeda', () => {
    const a = baris('0811', 6600, 3711, 0, '2026-11-15T10:00:00Z');
    const b = baris('0812', 6600, 3712, 0, '2026-11-15T10:00:00Z');
    expect(kunciPapan(a)).not.toBe(kunciPapan(b));
    expect(bandingPapan(b, a)).toBeLessThan(0); // b di depan a
    expect(skorTampil(b)).toBe('6.600,3712');
  });

  it('skor lebih tinggi menang walau presisi lawan maksimal', () => {
    const tinggi = baris('0811', 6601, 0, 0, '2026-11-15T11:00:00Z');
    const rendah = baris('0812', 6600, 9999, 99, '2026-11-15T09:00:00Z');
    expect(bandingPapan(tinggi, rendah)).toBeLessThan(0);
  });

  it('presisi sama → loop lebih dalam menang; loop sama → yang lebih dulu menang', () => {
    const dangkal = baris('0811', 6600, 100, 2, '2026-11-15T09:00:00Z');
    const dalam = baris('0812', 6600, 100, 5, '2026-11-15T10:00:00Z');
    expect(bandingPapan(dalam, dangkal)).toBeLessThan(0);
    const awal = baris('0811', 6600, 100, 5, '2026-11-15T09:00:00Z');
    const akhir = baris('0812', 6600, 100, 5, '2026-11-15T10:00:00Z');
    expect(bandingPapan(awal, akhir)).toBeLessThan(0);
  });

  it('semua komponen identik → nomor WA jadi pemecah seri deterministik', () => {
    const a = baris('0811000000', 6600, 100, 5, '2026-11-15T09:00:00Z');
    const b = baris('0812000000', 6600, 100, 5, '2026-11-15T09:00:00Z');
    expect(bandingPapan(a, b)).not.toBe(0);
    expect(bandingPapan(a, b)).toBe(-bandingPapan(b, a));
    expect(bandingPapan(a, a)).toBe(0);
  });

  it('presisi dari klien dibatasi 0..9999 supaya tidak menyelundup angka liar', () => {
    const liar = baris('0811', 6600, 99_999_999, 0, '2026-11-15T09:00:00Z');
    expect(kunciPapan(liar)).toBe(6600 * 10_000 + 9999);
  });
});

/* ── SKOR DIHITUNG ULANG DI SERVER (2026-11-16) ────────────────────────────
 * Keluhan yang dijawab: sampai 2026-11-15 papan peringkat menerima angka apa
 * pun. Klien yang dimodifikasi bisa mengirim 999.999 tanpa memainkan satu
 * ronde, dan tidak ada satu pun error yang muncul. Sekarang server memutar
 * ulang ronde Genba dan memakai hasilnya.
 */
describe('simpanSkor — Genba dihitung ulang dari ronde', () => {
  /** 12 pesanan sempurna di reguler; hasil replay = 4.650 (lihat arcade.test.ts). */
  const ronde = Array.from({ length: 12 }, (_, i) =>
    [1, [8000, 8000, 8000, 8000, 7000, 7000, 7000, 7000, 6000, 6000, 6000, 6000][i]] as [number, number],
  );

  beforeEach(() => {
    db.panggilan.length = 0;
  });

  it('kiriman Genba TANPA ronde ditolak — angka klien tidak lagi dipercaya', async () => {
    const r = await simpanSkor({
      wa: '081234567890',
      game: 'genba',
      skor: 999_999,
      detail: { tingkat: 'reguler', pesanan: 12, loop: 0 },
    });
    expect(r.success).toBe(false);
    expect(String(r.message)).toMatch(/ronde/i);
    /* Ditolak SEBELUM menyentuh DB: tidak ada satu pun panggilan. */
    expect(db.panggilan).toHaveLength(0);
  });

  it('angka 999.999 diabaikan; yang disimpan hasil replay 4.650', async () => {
    const r = await simpanSkor({
      wa: '081234567890',
      game: 'genba',
      skor: 999_999,
      detail: { tingkat: 'reguler', pesanan: 12, loop: 0, presisi: 9999, ronde },
    });
    expect(r.success).toBe(true);
    expect(r.skor).toBe(4650);
    const post = db.panggilan.find((p) => p.method === 'POST');
    const body = post?.body as {
      skor: number;
      detail: Record<string, unknown>;
    };
    expect(body.skor).toBe(4650);
    /* Presisi pun dari replay (84.000 ms → 4.000), bukan 9.999 kiriman. */
    expect(body.detail.presisi).toBe(4000);
    expect(body.detail.diverifikasi).toBe(true);
    expect(body.detail.ronde).toBe(12);
    /* Angka klien tetap disimpan untuk audit selisih — bukan untuk dipakai. */
    expect(body.detail.skorKlien).toBe(999_999);
  });

  it('ronde yang tidak cocok dengan jumlah pesanan ditolak', async () => {
    const r = await simpanSkor({
      wa: '081234567890',
      game: 'genba',
      skor: 450,
      detail: { tingkat: 'reguler', pesanan: 12, loop: 0, ronde: ronde.slice(0, 3) },
    });
    expect(r.success).toBe(false);
    expect(String(r.message)).toMatch(/ronde|pesanan/i);
    expect(db.panggilan).toHaveLength(0);
  });

  it('kedalaman loop yang diklaim harus sama dengan hasil replay', async () => {
    const r = await simpanSkor({
      wa: '081234567890',
      game: 'genba',
      skor: 4650,
      detail: { tingkat: 'reguler', pesanan: 12, loop: 7, ronde },
    });
    expect(r.success).toBe(false);
    expect(db.panggilan).toHaveLength(0);
  });

  it('tingkat asing ditolak, bukan diam-diam dianggap reguler', async () => {
    const r = await simpanSkor({
      wa: '081234567890',
      game: 'genba',
      skor: 4650,
      detail: { tingkat: 'dewa', pesanan: 12, loop: 0, ronde },
    });
    expect(r.success).toBe(false);
  });

  it('gugur di gelombang loop pertama DITERIMA, bukan ditolak', async () => {
    /* Regresi yang dijaga: klien mengirim `loop: 1` (gelombang berjalan)
       sedangkan replay melaporkan 0 gelombang TUNTAS. Perbandingan yang naif
       akan menolak setiap kematian di gelombang pertama — yaitu akhir yang
       paling sering terjadi di Ultimate Loop. */
    const rondeLoop: Array<[number, number]> = [...ronde, [1, 6000], [0, 0]];
    const r = await simpanSkor({
      wa: '081234567890',
      game: 'genba',
      skor: 4800,
      detail: { tingkat: 'reguler', pesanan: 1, loop: 1, ronde: rondeLoop },
    });
    expect(r.success).toBe(true);
    expect(r.skor).toBe(4800);
    const post = db.panggilan.find((p) => p.method === 'POST');
    const body = post?.body as { detail: Record<string, unknown> };
    expect(body.detail.loop).toBe(1);
    expect(body.detail.ultimate).toBe(true);
  });

  it('Kotoba dan Combo tanpa ronde juga ditolak', async () => {
    /* Sejak 2026-11-16 keempat game memakai replay. Tidak ada lagi jalur
       "terima angka klien" — kalau ada, celahnya cuma berpindah ke sana. */
    for (const game of ['kotoba', 'combo'] as const) {
      const r = await simpanSkor({
        wa: '081234567890',
        game,
        skor: 120,
        detail: { level: 2, kombo: 5, kalimat: 1 },
      });
      expect(r.success, `${game} seharusnya ditolak tanpa ronde`).toBe(false);
      expect(String(r.message)).toMatch(/ronde/i);
    }
    expect(db.panggilan).toHaveLength(0);
  });
});

/* ── KOTOBA: skor dari urutan jawaban ────────────────────────────────────── */
describe('simpanSkor — Kotoba dihitung ulang dari ronde', () => {
  /** [tepat, sisa, bonusOn(ketat), ketikOn] → 10 + 12 + 0 + 18 = 40. */
  const ronde = [
    [1, 100, 0, 0],
    [1, 100, 0, 0],
    [0, 0, 0, 0],
    [1, 80, 1, 0],
  ];

  beforeEach(() => {
    db.panggilan.length = 0;
  });

  it('999.999 diabaikan; ronde di atas bernilai 40', async () => {
    const r = await simpanSkor({
      wa: '081234567890',
      game: 'kotoba',
      skor: 999_999,
      detail: { mode: 'kuis', tingkat: 'ketat', benar: 3, kombo: 2, ronde },
    });
    expect(r.success).toBe(true);
    expect(r.skor).toBe(40);
    const post = db.panggilan.find((p) => p.method === 'POST');
    const body = post?.body as { skor: number; detail: Record<string, unknown> };
    expect(body.skor).toBe(40);
    expect(body.detail.diverifikasi).toBe(true);
    expect(body.detail.kombo).toBe(2);
    expect(body.detail.ronde).toBe(4);
  });

  it('jumlah benar yang diklaim tidak cocok → ditolak', async () => {
    const r = await simpanSkor({
      wa: '081234567890',
      game: 'kotoba',
      skor: 40,
      detail: { mode: 'kuis', tingkat: 'ketat', benar: 4, kombo: 2, ronde },
    });
    expect(r.success).toBe(false);
    expect(db.panggilan).toHaveLength(0);
  });

  it('kombo tertinggi yang diklaim tidak cocok → ditolak', async () => {
    const r = await simpanSkor({
      wa: '081234567890',
      game: 'kotoba',
      skor: 40,
      detail: { mode: 'kuis', tingkat: 'ketat', benar: 3, kombo: 9, ronde },
    });
    expect(r.success).toBe(false);
  });
});

/* ── COMBO: skor dari urutan ketukan ─────────────────────────────────────── */
describe('simpanSkor — Combo dihitung ulang dari ronde', () => {
  /** Dua kartu benar (×2, ×3) lalu kalimat selesai penuh: 100 + 150 + 140. */
  const ronde = [
    [1, 0],
    [1, 0],
    [2, 100, 0],
  ];

  beforeEach(() => {
    db.panggilan.length = 0;
  });

  it('999.999 diabaikan; ronde di atas bernilai 390', async () => {
    const r = await simpanSkor({
      wa: '081234567890',
      game: 'combo',
      skor: 999_999,
      detail: { level: 'normal', kombo: 3, kalimat: 1, ronde },
    });
    expect(r.success).toBe(true);
    expect(r.skor).toBe(390);
    const post = db.panggilan.find((p) => p.method === 'POST');
    const body = post?.body as { detail: Record<string, unknown> };
    expect(body.detail.diverifikasi).toBe(true);
    expect(body.detail.kalimat).toBe(1);
    expect(body.detail.kombo).toBe(3);
  });

  it('jumlah kalimat yang diklaim tidak cocok → ditolak', async () => {
    const r = await simpanSkor({
      wa: '081234567890',
      game: 'combo',
      skor: 390,
      detail: { level: 'normal', kombo: 3, kalimat: 5, ronde },
    });
    expect(r.success).toBe(false);
    expect(db.panggilan).toHaveLength(0);
  });
});

/* ── MATEMATIKA: skor = benar × 50, dihitung dari hasil soal ─────────────── */
describe('simpanSkor — Matematika dihitung ulang dari ronde', () => {
  const ronde15 = [...Array(15).fill(1), ...Array(5).fill(0)];

  beforeEach(() => {
    db.panggilan.length = 0;
  });

  it('kiriman tanpa ronde ditolak sebelum DB', async () => {
    const r = await simpanSkor({
      wa: '081234567890',
      game: 'matematika',
      skor: 999_999,
      detail: { benar: 20, total: 20, grade: 'S' },
    });
    expect(r.success).toBe(false);
    expect(String(r.message)).toMatch(/ronde/i);
    expect(db.panggilan).toHaveLength(0);
  });

  it('999.999 diabaikan; 15/20 disimpan sebagai 750', async () => {
    const r = await simpanSkor({
      wa: '081234567890',
      game: 'matematika',
      skor: 999_999,
      detail: { benar: 15, total: 20, akurasi: 100, grade: 'S', ronde: ronde15 },
    });
    expect(r.success).toBe(true);
    expect(r.skor).toBe(750);
    const post = db.panggilan.find((p) => p.method === 'POST');
    const body = post?.body as { skor: number; detail: Record<string, unknown> };
    expect(body.skor).toBe(750);
    expect(body.detail.akurasi).toBe(75);
    expect(body.detail.diverifikasi).toBe(true);
    expect(body.detail.skorKlien).toBe(999_999);
  });

  it('jumlah benar yang diklaim tidak cocok dengan ronde → ditolak', async () => {
    const r = await simpanSkor({
      wa: '081234567890',
      game: 'matematika',
      skor: 1000,
      detail: { benar: 20, total: 20, ronde: ronde15 },
    });
    expect(r.success).toBe(false);
    expect(String(r.message)).toMatch(/benar/i);
    expect(db.panggilan).toHaveLength(0);
  });
});
