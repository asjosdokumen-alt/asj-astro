/**
 * test-guard.ts — pagar: suite tes tidak boleh MENULIS ke database non-lokal.
 *
 * KENAPA ADA
 * ----------
 * `.env.local` di repo ini menunjuk database PRODUKSI (Neon). Tidak ada yang
 * salah dengan itu untuk `netlify dev` — tapi artinya setiap tes yang lupa
 * mem-mock jalur tulis akan menulis ke data siswa sungguhan, dan tidak ada
 * satu pun tanda bahwa itu terjadi.
 *
 * Terukur 2026-11-07: dua suite menulis 35 baris `notifikasi_kandidat` ke
 * produksi selama beberapa hari tanpa ada yang menyadarinya — termasuk 8 baris
 * untuk kandidat asli. Yang membongkar bukan error, melainkan hitungan baris
 * yang bergerak setiap kali suite dijalankan.
 *
 * CARA KERJA
 * ----------
 * `supabaseJson` mencatat setiap operasi NON-GET yang tujuannya bukan
 * localhost/127.0.0.1 saat berjalan di dalam vitest. `test-guard.setup.ts`
 * (dipasang sebagai `setupFiles` project backend) memeriksa catatan itu di
 * `afterAll` dan menggagalkan berkas tes yang melakukannya.
 *
 * Kenapa `afterAll` dan bukan `throw` langsung: banyak pemanggil menelan error
 * tulis (`kirimNotifikasi` mengembalikan `{success:false}`), jadi lemparan di
 * titik itu akan hilang diam-diam. Pemeriksaan di akhir membuat pelanggarannya
 * TERLIHAT, apa pun yang dilakukan pemanggil.
 *
 * Kenapa hanya NON-GET: membaca dari produksi saat tes memang tidak ideal,
 * tapi tidak merusak. Yang harus berhenti adalah menulis.
 */

const pelanggaran: string[] = [];

/** Apakah proses ini berjalan di dalam vitest. */
export function dalamTes(): boolean {
  return Boolean(process.env.VITEST || process.env.NODE_ENV === 'test');
}

/** Host loopback = boleh: server uji lokal adalah tujuan yang sah. */
export function urlLokal(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1';
  } catch {
    return false;
  }
}

export function catatTulisDb(method: string, pathname: string, url: string): void {
  pelanggaran.push(`${String(method).toUpperCase()} ${pathname || '(root)'} -> ${url}`);
}

export function ambilPelanggaranDb(): string[] {
  return [...pelanggaran];
}

export function bersihkanPelanggaranDb(): void {
  pelanggaran.length = 0;
}
