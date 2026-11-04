/**
 * arcadeIkon.ts — ikon SVG untuk benda & lokasi Genba Order Rush.
 *
 * KENAPA MENGGANTI EMOJI
 *   Versi sebelumnya memakai emoji (`📦`, `🔑`, `✂️`). Tiga masalah nyata:
 *
 *   1. TIDAK SERAGAM. Emoji dirender oleh font sistem — di Android jadi satu
 *      gaya, di Windows gaya lain, dan di sebagian perangkat `✂️` muncul sebagai
 *      kotak kosong. Untuk game yang harus terbaca dalam sekejap, bentuk yang
 *      berubah-ubah antar perangkat adalah cacat, bukan selera.
 *   2. TIDAK IKUT WARNA. Kartu barang berwarna (merah/biru/kuning/putih), dan
 *      emoji tidak bisa dibuat kontras otomatis terhadap latarnya.
 *   3. UKURAN TIDAK TERKENDALI. Emoji punya tinggi baris sendiri, jadi ikon
 *      bergeser naik-turun antar kartu.
 *
 *   Ikon di sini digambar dengan `stroke="currentColor"`, jadi warnanya ikut
 *   teks di kartu (putih di kartu gelap, gelap di kartu terang) tanpa satu pun
 *   kelas warna tambahan — penting karena gerbang `verify:shim` menghitung
 *   setiap utilitas `bg-*` ber-alpha yang dipakai di `src/`.
 *
 *   Semua digambar pada kotak 24x24 dengan tebal garis 2, jadi berat visualnya
 *   sama di semua benda.
 *
 * ATURAN MENAMBAH BENDA
 *   Setiap `id` di `GENBA_BARANG`/`GENBA_ZONA` WAJIB punya entri di sini.
 *   `arcade-ikon.test.ts` gagal kalau ada yang lupa — tanpa ikon, kartunya
 *   tampil kosong dan siswa tidak tahu benda apa yang harus diambil.
 */

/** Satu ikon = daftar `d` untuk `<path>`. */
export type Ikon = readonly string[];

/** Benda yang bisa "ditaruh" (16). */
export const IKON_BARANG: Readonly<Record<string, Ikon>> = {
  hako: ['M3 7l9-4 9 4v10l-9 4-9-4z', 'M3 7l9 4 9-4', 'M12 11v10'],
  kagi: ['M8 12a4 4 0 100-8 4 4 0 000 8z', 'M11 11l9 9', 'M17 17l2-2', 'M20 20l2-2'],
  hasami: ['M6 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5z', 'M6 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z', 'M8 7l11 10', 'M8 17L19 7'],
  kutsu: ['M3 17h13l4 2h2v2H3z', 'M3 17v-6h3l3 4'],
  kaban: ['M5 9h14l-1 11H6z', 'M9 9V6a3 3 0 016 0v3'],
  kasa: ['M3 12a9 9 0 0118 0z', 'M12 12v7a2 2 0 004 0'],
  hon: ['M5 5a2 2 0 012-2h12v18H7a2 2 0 01-2-2z', 'M9 3v18'],
  tokei: ['M12 18a6 6 0 100-12 6 6 0 000 12z', 'M12 9v3l2 2', 'M9 3h6', 'M9 21h6'],
  nooto: ['M6 3h13v18H6z', 'M9 3v18', 'M12 8h4', 'M12 12h4'],
  pen: ['M4 20l4-1 9-9-3-3-9 9z', 'M14 6l3 3', 'M4 20l1-4'],
  koppu: ['M6 5h11l-1 12a3 3 0 01-3 3h-3a3 3 0 01-3-3z', 'M6 9h11'],
  sara: ['M12 20a8 8 0 100-16 8 8 0 000 16z', 'M12 16a4 4 0 100-8 4 4 0 000 8z'],
  taoru: ['M5 4h14v16H5z', 'M5 9h14', 'M5 15h14'],
  boushi: ['M4 15a8 8 0 0116 0z', 'M2 15h20v2H2z'],
  saifu: ['M4 6h16v13H4z', 'M4 10h16', 'M16 14h3'],
  megane: ['M7 17a3 3 0 100-6 3 3 0 000 6z', 'M17 17a3 3 0 100-6 3 3 0 000 6z', 'M10 14h4', 'M4 13L3 9', 'M20 13l1-4'],
};

/**
 * Lokasi tujuan (11).
 *
 * `kaban` di sini adalah "dalam tas" — id-nya sama dengan benda `kaban` karena
 * keduanya memang tas. Dipisah per peta supaya tidak saling menimpa.
 */
export const IKON_ZONA: Readonly<Record<string, Ikon>> = {
  ue: ['M3 13h18', 'M12 10V3', 'M9 6l3-3 3 3'],
  shita: ['M3 11h18', 'M12 14v7', 'M9 18l3 3 3-3'],
  hidari: ['M4 4v16', 'M20 12H8', 'M11 9l-3 3 3 3'],
  migi: ['M20 4v16', 'M4 12h12', 'M13 9l3 3-3 3'],
  tsukue: ['M3 10h18', 'M5 10v9', 'M19 10v9', 'M8 10V7h8v3'],
  isu: ['M7 4v10h10', 'M7 14v6', 'M17 14v6'],
  doa: ['M6 3h12v18H6z', 'M15 12h.01'],
  mado: ['M4 4h16v16H4z', 'M12 4v16', 'M4 12h16'],
  kaban: ['M5 9h14l-1 11H6z', 'M9 9V6a3 3 0 016 0v3'],
  hiki: ['M4 4h16v16H4z', 'M4 10h16', 'M4 15h16', 'M10 7h4', 'M10 12.5h4'],
  yuka: ['M3 15h18', 'M3 19h18', 'M7 15v4', 'M12 15v4', 'M17 15v4'],
};

/** Semua id yang punya ikon — dipakai tes untuk mendeteksi yang lupa. */
export function idBerikon(): { barang: string[]; zona: string[] } {
  return { barang: Object.keys(IKON_BARANG), zona: Object.keys(IKON_ZONA) };
}
