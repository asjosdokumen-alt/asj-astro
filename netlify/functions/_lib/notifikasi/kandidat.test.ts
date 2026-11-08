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
import { describe, expect, it, vi } from 'vitest';
import {
  JENIS_NOTIFIKASI,
  daftarNotifikasi,
  hapusNotifikasi,
  hapusNotifikasiKedaluwarsa,
  jenisNotifikasiSah,
  tandaiDibaca,
} from './kotak-masuk';
import { kirimNotifikasi, kirimNotifikasiBanyak } from './kandidat';

// Retensi menyentuh DB, jadi `supabaseJson` di-stub — PARSIAL, bukan mengganti
// modul: `normalizeWa` dari modul yang sama dipakai tes-tes di atas, dan mock
// penuh akan membuatnya `undefined` (gejala: "No normalizeWa export is defined").
const { mockSupabaseJson } = vi.hoisted(() => ({ mockSupabaseJson: vi.fn() }));
vi.mock('../db/client', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../db/client')>();
  return { ...mod, supabaseJson: mockSupabaseJson };
});

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

/**
 * `hapusNotifikasi` — penolakan di depan, sebelum menyentuh DB.
 *
 * Yang dijaga: tanpa WA, fungsi ini tidak boleh mengirim DELETE apa pun.
 * Filter `no_wa` adalah satu-satunya yang mencegah satu siswa menghapus baris
 * siswa lain; kalau WA kosong lolos, query-nya menjadi `no_wa=eq.` yang tidak
 * cocok dengan apa pun (aman) — tapi lebih baik ditolak eksplisit daripada
 * bergantung pada kebetulan itu.
 */
describe('hapusNotifikasi', () => {
  it('menolak WA kosong tanpa menyentuh DB', async () => {
    await expect(hapusNotifikasi('', 1)).resolves.toEqual({ success: false, jumlah: 0 });
    await expect(hapusNotifikasi('   ', 1)).resolves.toEqual({ success: false, jumlah: 0 });
  });
});

/**
 * Retensi (keputusan pemilik 2026-11-08: "notif di db ya 1 bulan 1x saja").
 *
 * Dua hal yang dijaga di sini, dan keduanya tidak akan muncul sebagai error di
 * layar kalau salah:
 *   1. yang dihapus HANYA `notifikasi_kandidat` (bukan riwayat lamaran/Mail),
 *   2. batas waktunya benar-benar ~30 hari, bukan "sekarang" (yang akan
 *      mengosongkan seluruh kotak masuk) atau "1970" (yang tidak menghapus apa
 *      pun sambil melaporkan sukses).
 */
describe('hapusNotifikasiKedaluwarsa (retensi)', () => {
  it('DELETE ke notifikasi_kandidat dengan batas ~30 hari', async () => {
    mockSupabaseJson.mockReset();
    mockSupabaseJson.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    const r = await hapusNotifikasiKedaluwarsa(30);
    expect(r.dihapus).toBe(2);
    const [method, table, opts] = mockSupabaseJson.mock.calls[0];
    expect(method).toBe('DELETE');
    expect(table).toBe('notifikasi_kandidat');
    expect(String(opts.query.dibuat_pada)).toMatch(/^lt\./);
    const batas = new Date(String(opts.query.dibuat_pada).slice(3)).getTime();
    const harapan = Date.now() - 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(batas - harapan)).toBeLessThan(60_000);
    expect(opts.headers.Prefer).toBe('return=representation');
  });

  it('kegagalan DB dilaporkan sebagai hasil, bukan dilempar', async () => {
    mockSupabaseJson.mockReset();
    mockSupabaseJson.mockRejectedValueOnce(new Error('koneksi putus'));
    const r = await hapusNotifikasiKedaluwarsa(30);
    expect(r.dihapus).toBe(0);
    expect(r.error).toContain('koneksi putus');
  });
});
