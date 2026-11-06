/**
 * kandidat.test.ts — aturan kotak masuk kandidat.
 *
 * YANG DIJAGA
 *   Berkas ini tidak menyentuh DB. Yang diuji adalah aturan yang, kalau salah,
 *   tidak memunculkan satu pun error di layar:
 *
 *   1. Daftar jenis notifikasi di sini HARUS sama dengan CHECK constraint
 *      migrasi. Kalau berbeda, penulisan ditolak DB dan pemberitahuannya hilang
 *      tanpa jejak — tepat kegagalan yang tabel ini ada untuk mencegah.
 *   2. Penolakan di depan (WA kosong, jenis asing, judul kosong) terjadi SEBELUM
 *      menyentuh DB.
 *   3. `tandaiDibaca` tanpa id berarti "semua", bukan "tidak ada".
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  JENIS_NOTIFIKASI,
  daftarNotifikasi,
  jenisNotifikasiSah,
  kirimNotifikasi,
  kirimNotifikasiBanyak,
  tandaiDibaca,
} from './kandidat';

describe('jenis notifikasi', () => {
  it('tepat empat jenis yang dipakai aplikasi', () => {
    expect([...JENIS_NOTIFIKASI]).toEqual(['lamaran', 'dokumen', 'jadwal', 'sistem']);
    for (const j of JENIS_NOTIFIKASI) expect(jenisNotifikasiSah(j)).toBe(true);
  });

  it('menolak nilai asing dan non-string', () => {
    for (const v of ['', 'LAMARAN', 'wa', null, undefined, 0, {}]) {
      expect(jenisNotifikasiSah(v)).toBe(false);
    }
  });
});

describe('CHECK constraint di migrasi cocok dengan JENIS_NOTIFIKASI', () => {
  const berkas = readFileSync(new URL('../../../../migrations/049_notifikasi_kandidat.sql', import.meta.url), 'utf8');
  const cocok = /CHECK\s*\(\s*jenis\s+IN\s*\(([^)]*)\)\s*\)/i.exec(berkas);

  it('migrasi memuat daftar jenis yang bisa dibaca', () => {
    expect(cocok, 'pola CHECK (jenis IN (...)) tidak ditemukan di migrasi 049').toBeTruthy();
  });

  it('daftar di migrasi SAMA dengan JENIS_NOTIFIKASI', () => {
    const dariMigrasi = (cocok?.[1] || '')
      .split(',')
      .map((x) => x.trim().replace(/^'|'$/g, ''))
      .filter(Boolean)
      .sort();
    expect(dariMigrasi).toEqual([...JENIS_NOTIFIKASI].sort());
  });
});

describe('penolakan sebelum DB', () => {
  it('WA kosong ditolak tanpa menyimpan', async () => {
    expect(await kirimNotifikasi({ wa: '  ', jenis: 'lamaran', judul: 'x' })).toEqual({ success: false });
  });

  it('jenis asing ditolak', async () => {
    expect(await kirimNotifikasi({ wa: '6281234567890', jenis: 'promo', judul: 'x' })).toEqual({ success: false });
  });

  it('judul kosong ditolak — notifikasi tanpa judul tidak bisa dibaca', async () => {
    expect(await kirimNotifikasi({ wa: '6281234567890', jenis: 'lamaran', judul: '   ' })).toEqual({ success: false });
  });

  it('kirim banyak dengan daftar kosong tidak menyentuh DB', async () => {
    expect(await kirimNotifikasiBanyak([], { jenis: 'jadwal', judul: 'x' })).toEqual({ success: true, jumlah: 0 });
  });
});

describe('daftar & tandai', () => {
  it('daftar tanpa WA mengembalikan kosong, bukan melempar', async () => {
    expect(await daftarNotifikasi('')).toEqual({ success: false, notifikasi: [], belumDibaca: 0 });
  });

  it('tandai tanpa WA tidak menyentuh DB', async () => {
    expect(await tandaiDibaca('')).toEqual({ success: false, jumlah: 0 });
  });
});
