/**
 * tes.test.ts — aturan backend dua tes mandiri.
 *
 * YANG DIJAGA
 *   Berkas ini tidak menyentuh DB. Yang diuji adalah aturan yang, kalau salah,
 *   tidak memunculkan satu pun error di layar:
 *
 *   1. Daftar jenis tes di sini HARUS sama dengan CHECK constraint migrasi.
 *      Kalau berbeda, `simpanHasil` meloloskan nilai yang ditolak DB dan siswa
 *      menerima "coba lagi" yang tidak akan pernah berhasil.
 *   2. GAGAL-TERTUTUP: saat `sys_config` tidak terbaca (DB mati / env kosong),
 *      sakelar harus dibaca NONAKTIF. Kebalikannya membuka tes yang pemiliknya
 *      sedang tutup — dan tes ini hanya boleh dikerjakan sekali, jadi kesalahan
 *      itu tidak bisa dibatalkan.
 *   3. Penolakan di depan (WA kosong, jenis asing) terjadi SEBELUM menyentuh DB.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TES_SAH, bacaSakelar, jenisTesSah, setAktif, simpanHasil } from './tes';

describe('jenis tes', () => {
  it('tepat dua jenis yang dipakai aplikasi', () => {
    expect([...TES_SAH]).toEqual(['mbti', 'mata']);
    for (const j of TES_SAH) expect(jenisTesSah(j)).toBe(true);
  });

  it('menolak nilai asing dan non-string', () => {
    for (const v of ['', 'MBTI', 'eye', null, undefined, 0, {}]) {
      expect(jenisTesSah(v)).toBe(false);
    }
  });
});

describe('CHECK constraint di migrasi cocok dengan TES_SAH', () => {
  const berkas = readFileSync(new URL('../../../../migrations/048_asesmen_tes.sql', import.meta.url), 'utf8');
  const cocok = /CHECK\s*\(\s*jenis\s+IN\s*\(([^)]*)\)\s*\)/i.exec(berkas);

  it('migrasi memuat daftar jenis yang bisa dibaca', () => {
    expect(cocok, 'pola CHECK (jenis IN (...)) tidak ditemukan di migrasi 048').toBeTruthy();
  });

  it('daftar di migrasi SAMA dengan TES_SAH', () => {
    const dariMigrasi = (cocok?.[1] || '')
      .split(',')
      .map((x) => x.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)
      .sort();
    expect(dariMigrasi).toEqual([...TES_SAH].sort());
  });

  it('ada constraint unik (no_wa, jenis) — aturan "sekali per siswa"', () => {
    expect(/UNIQUE\s*\(\s*no_wa\s*,\s*jenis\s*\)/i.test(berkas)).toBe(true);
  });
});

describe('gagal-tertutup', () => {
  /* Tanpa env DB di test, `supabaseJson` melempar dan `bacaSakelar` menangkapnya.
     Itu justru jalur yang diuji: gangguan DB tidak boleh membuka tes. */
  it('sakelar dibaca nonaktif saat DB tidak terbaca', async () => {
    const s = await bacaSakelar();
    expect(s).toEqual({ mbti: false, mata: false });
  });

  it('simpanHasil menolak dengan `nonaktif` saat sakelar tidak terbaca', async () => {
    const r = await simpanHasil({
      wa: '6281234567890',
      jenis: 'mbti',
      hasil: { tipe: 'INTJ', persentase: { E: 10, I: 90, S: 20, N: 80, T: 70, F: 30, J: 60, P: 40 }, jumlahTerjawab: 40 },
    });
    expect(r.success).toBe(false);
    expect(r.nonaktif).toBe(true);
  });
});

describe('penolakan sebelum DB', () => {
  it('WA kosong ditolak', async () => {
    const r = await simpanHasil({ wa: '  ', jenis: 'mbti', hasil: {} });
    expect(r).toEqual({ success: false, message: 'Nomor WA kosong.' });
  });

  it('jenis asing ditolak', async () => {
    const r = await simpanHasil({ wa: '6281234567890', jenis: 'iq', hasil: {} });
    expect(r.success).toBe(false);
    expect(String(r.message)).toContain('Jenis tes');
  });

  it('setAktif menolak jenis asing tanpa menyentuh DB', async () => {
    const r = await setAktif('iq', true);
    expect(r.success).toBe(false);
    expect(String(r.message)).toContain('Jenis tes');
  });
});
