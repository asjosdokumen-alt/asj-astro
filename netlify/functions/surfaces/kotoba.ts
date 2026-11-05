/**
 * surfaces/kotoba.ts — bank soal latihan (kosakata, SSW, matematika).
 *
 * KENAPA SURFACE SENDIRI (2026-11-05)
 * -----------------------------------
 * Ketiganya dulu menumpang `AI_ACTIONS`. Isinya data besar yang tidak pernah
 * dipakai jalur chat:
 *   `_lib/kotoba/ssw.ts`   200 KB
 *   `_lib/kotoba/bank.ts`  120 KB
 *   `_lib/kotoba/n5.ts`     24 KB
 *   `_lib/matematika/bank.ts` 15 KB
 * Esbuild menamai import dinamis menjadi bagian bundle entry yang sama, jadi
 * `ai-chat.js` menanggung ~344 KB itu dan melewati plafon 600 KB
 * (terukur 603,5 KB). Dipindah ke entry sendiri: jalur chat kembali ringan,
 * dan bank hanya dimuat halaman game yang memang membutuhkannya.
 *
 * Penjaganya TETAP `tolakKecualiSiswa` — satu penjaga, satu tempat yang bisa
 * salah. Kalau aturan "siswa ASJ" berubah, ia berubah di `_lib/siswa-gate.ts`
 * dan berlaku untuk wawancara, kosakata, SSW, dan matematika sekaligus.
 */
import { tolakKecualiSiswa } from '../_lib/siswa-gate';

export const KOTOBA_ACTIONS: Record<
  string,
  (payload: unknown[], sessionToken?: string) => Promise<unknown>
> = {
  // Bank kosakata TIDAK dikirim ke non-siswa — bukan cuma disembunyikan di UI.
  // Isinya materi belajar, bukan rahasia, tapi gerbang yang hanya kosmetik akan
  // membuat label "khusus siswa" di dasbor jadi klaim kosong.
  getBankKotoba: async (p: unknown[], s?: string) => {
    const wa = String(p?.[0] ?? '').trim();
    const tolak = await tolakKecualiSiswa(s, wa);
    if (tolak) return tolak;
    const { BANK_KOTOBA, BAB_KOTOBA, JUMLAH_KOTOBA } = await import('../_lib/kotoba/bank');
    /* N5 ikut di respons ini, bukan endpoint sendiri: gerbangnya SAMA
       (`tolakKecualiSiswa`), dan 250 kata hanya menambah ~20 KB pada permintaan
       yang toh sudah mengambil 1 440 kata. Endpoint ketiga berarti salinan
       ketiga dari logika sesi/VIP yang sama. */
    const { N5_KATA, JUMLAH_N5 } = await import('../_lib/kotoba/n5');
    return {
      success: true,
      wa,
      isVip: true,
      jumlah: JUMLAH_KOTOBA,
      bab: BAB_KOTOBA,
      kosakata: BANK_KOTOBA,
      n5: N5_KATA,
      jumlahN5: JUMLAH_N5,
    };
  },
  // ── Bank kosakata bidang kerja (SSW) — modul latihan per bidang ──────────
  // Dipisah dari `getBankKotoba` karena dua alasan yang keduanya praktis:
  //   • ukuran — 320 kata bidang tidak perlu ikut terkirim ke siswa yang cuma
  //     ingin menghafal bab buku, dan sebaliknya;
  //   • umur data — kata bidang berubah saat bidangnya berubah, sedangkan bank
  //     buku berubah saat silabusnya berubah. Satu endpoint untuk keduanya
  //     berarti setiap perubahan kecil menggeser dua hal sekaligus.
  //
  // `bidang` diambil dari daftar tertutup di `ssw.ts` — argumen dari klien
  // TIDAK dipakai untuk memilih data, jadi tidak ada jalur "kirim id sembarang"
  // ke data lain.
  getBankSsw: async (p: unknown[], s?: string) => {
    const wa = String(p?.[0] ?? '').trim();
    const tolak = await tolakKecualiSiswa(s, wa);
    if (tolak) return tolak;
    const { BIDANG_SSW, JUMLAH_SSW } = await import('../_lib/kotoba/ssw');
    return {
      success: true,
      wa,
      isVip: true,
      jumlah: JUMLAH_SSW,
      bidang: BIDANG_SSW,
    };
  },
  // ── Bank soal matematika (`/matematika`) — simulasi tes seleksi ───────────
  // Gerbang SAMA PERSIS dengan bank kosakata di atas. Yang dikirim hanya ke
  // siswa ASJ adalah SOAL CERITA + pembahasannya; generator angka hidup di
  // klien karena soal aritmetika acak tak terbatas tidak punya nilai rahasia —
  // yang punya nilai adalah soal pabrik dan cara mengerjakannya.
  getBankMatematika: async (p: unknown[], s?: string) => {
    const wa = String(p?.[0] ?? '').trim();
    const tolak = await tolakKecualiSiswa(s, wa);
    if (tolak) return tolak;
    const { ringkasBank } = await import('../_lib/matematika/bank');
    return { success: true, wa, isVip: true, ...ringkasBank() };
  },
};
