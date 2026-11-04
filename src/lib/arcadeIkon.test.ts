/**
 * arcadeIkon.test.ts — setiap benda dan lokasi WAJIB punya ikon.
 *
 * KENAPA INI GATE, BUKAN KERAPIAN
 *   Ikon game dipilih lewat `id` (`hako`, `kue`, …). Kalau sebuah benda
 *   ditambahkan ke `GENBA_BARANG` tanpa ikon, `ArcadeIkon` mengembalikan `null`
 *   dan kartunya tampil TANPA gambar — tetapi teksnya tetap ada, jadi tidak ada
 *   error dan tidak ada yang menyadarinya sampai siswa mengeluh "barangnya
 *   kosong". Satu baris lupa = satu kartu rusak di 1 056 variasi perintah.
 */
import { describe, it, expect } from 'vitest';
import { GENBA_BARANG, GENBA_ZONA } from './arcade';
import { IKON_BARANG, IKON_ZONA } from './arcadeIkon';

/** Perintah SVG yang sah untuk sebuah `<path d>`. */
const PERINTAH_SAH = /^[Mm][\s\d.,-]/;

describe('arcadeIkon — kelengkapan', () => {
  it('setiap benda punya ikon', () => {
    const tanpaIkon = GENBA_BARANG.filter((b) => !IKON_BARANG[b.id]).map((b) => b.id);
    expect(tanpaIkon, 'benda tanpa ikon akan tampil kosong di kartu').toEqual([]);
  });

  it('setiap lokasi punya ikon', () => {
    const tanpaIkon = GENBA_ZONA.filter((z) => !IKON_ZONA[z.id]).map((z) => z.id);
    expect(tanpaIkon, 'rak tanpa ikon akan tampil kosong di tombol').toEqual([]);
  });

  it('tidak ada ikon yatim — entri yang tidak dipakai benda/lokasi mana pun', () => {
    /* Ikon yatim biasanya sisa dari benda yang sudah dihapus. Ia tidak merusak
       apa pun, tetapi membuat daftar ini tampak lebih lengkap daripada
       kenyataan dan menutupi ikon yang benar-benar hilang. */
    const idBarang = new Set(GENBA_BARANG.map((b) => b.id));
    const idZona = new Set(GENBA_ZONA.map((z) => z.id));
    expect(Object.keys(IKON_BARANG).filter((k) => !idBarang.has(k))).toEqual([]);
    expect(Object.keys(IKON_ZONA).filter((k) => !idZona.has(k))).toEqual([]);
  });
});

describe('arcadeIkon — bentuk jalur', () => {
  const semua = [
    ...Object.entries(IKON_BARANG).map(([id, j]) => ({ id, jalur: j, jenis: 'barang' })),
    ...Object.entries(IKON_ZONA).map(([id, j]) => ({ id, jalur: j, jenis: 'zona' })),
  ];

  it('setiap ikon punya minimal satu path', () => {
    const kosong = semua.filter((x) => !Array.isArray(x.jalur) || x.jalur.length === 0);
    expect(kosong.map((x) => x.id)).toEqual([]);
  });

  it('setiap path dimulai dengan perintah SVG yang sah', () => {
    /* `d` yang salah ketik tidak melempar error — SVG hanya menggambar lebih
       sedikit, atau tidak sama sekali. Pemeriksaan ini menangkap bentuk yang
       jelas rusak (mis. string kosong atau teks biasa) sebelum terlihat di
       layar. */
    const rusak: string[] = [];
    for (const x of semua) {
      for (const d of x.jalur) {
        if (typeof d !== 'string' || !PERINTAH_SAH.test(d.trim())) rusak.push(`${x.id}: ${d}`);
      }
    }
    expect(rusak).toEqual([]);
  });

  it('tidak ada jalur yang berisi warna atau gaya sendiri', () => {
    /* Warna HARUS datang dari `stroke="currentColor"` di komponennya. Jalur
       yang membawa `stroke=` sendiri akan tetap hitam di tema gelap dan tidak
       bisa mengikuti warna kartu. */
    const bercat: string[] = [];
    for (const x of semua) {
      for (const d of x.jalur) {
        if (/stroke|fill|style/i.test(d)) bercat.push(`${x.id}: ${d}`);
      }
    }
    expect(bercat).toEqual([]);
  });
});
