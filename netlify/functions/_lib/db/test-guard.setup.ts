/**
 * test-guard.setup.ts — dipasang sebagai `setupFiles` project backend.
 *
 * Satu tugas: menggagalkan berkas tes yang MENULIS ke database non-lokal.
 * Penjelasan lengkap ada di `./test-guard.ts`.
 *
 * Sengaja di `afterAll`, bukan `afterEach`: satu pelanggaran sudah cukup untuk
 * memerahkan berkasnya, dan mengulang pesan yang sama untuk setiap tes hanya
 * menenggelamkan yang pertama.
 */
import { afterAll } from 'vitest';
import { ambilPelanggaranDb, bersihkanPelanggaranDb } from './test-guard';

afterAll(() => {
  const daftar = ambilPelanggaranDb();
  bersihkanPelanggaranDb();
  if (daftar.length === 0) return;
  throw new Error(
    `Suite ini MENULIS ke database non-lokal (${daftar.length} operasi).\n` +
      daftar
        .slice(0, 10)
        .map((d) => `  - ${d}`)
        .join('\n') +
      (daftar.length > 10 ? `\n  … dan ${daftar.length - 10} lagi` : '') +
      '\n\nMock jalur tulisnya (contoh: `vi.mock(\'../../_lib/notifikasi/kandidat\')`), ' +
      'atau arahkan tes ke database lokal. `.env.local` menunjuk PRODUKSI.',
  );
});
