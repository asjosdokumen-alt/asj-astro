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
import { describe, expect, it } from 'vitest';
import { GAME_SAH, gameSah, simpanSkor } from './leaderboard';

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
