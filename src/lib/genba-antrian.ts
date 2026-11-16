/**
 * genba-antrian.ts — antrian pelanggan Genba.
 *
 * KENAPA ADA (2026-11-16)
 *   Genba lama melayani SATU pesanan pada satu waktu. Itu latihan mencocokkan
 *   kata, bukan permainan: tidak ada yang harus dipilih, tidak ada yang bisa
 *   hilang. Dengan tiga pelanggan yang kesabarannya menipis bersamaan, pemain
 *   harus memutuskan siapa dulu — dan keputusan itu punya harga.
 *
 * KONTRAK SKOR TIDAK BERUBAH
 *   Satu pelanggan tetap satu pesanan. Yang berubah hanya batas waktunya:
 *   kesabaran pelanggan (2× batas gelombang) dikirim per event, bukan
 *   diturunkan dari nomor pesanan. Karena itu replay server tetap bisa
 *   memutar ulang tanpa aturan baru — lihat `[benar, sisaMs, batasMs]`.
 *
 * Fungsi di sini MURNI: tanpa DOM, tanpa timer. Komponen hanya menyimpan state
 * dan memanggil `tick`.
 */
import {
  aturanUltimate,
  buatPerintah,
  durasiShift,
  type AturanShift,
  type Perintah,
} from './arcade';

/** Sabar pelanggan = 2× batas satu pesanan. */
export const SABAR_KALI = 2;

/** Jumlah pelanggan yang terlihat sekaligus. */
export const ANTRIAN_MAKS = 3;

export interface Pelanggan {
  id: number;
  perintah: Perintah;
  /** Sisa kesabaran dalam milidetik. */
  sisaMs: number;
  /** Kesabaran penuh saat pelanggan ini datang — dasar bonus kecepatan. */
  batasMs: number;
}

/**
 * Kesabaran penuh untuk pelanggan yang datang pada pesanan ke-`urutanKe`.
 * Mengikuti kurva gelombang yang sama dengan timer lama, lalu dikali
 * `SABAR_KALI` supaya tiga pelanggan bisa hidup bersamaan.
 */
export function batasPelanggan(aturan: AturanShift, urutanKe: number, loop: number): number {
  const dasar =
    loop > 0 ? aturanUltimate(aturan, loop - 1).durasiMs : durasiShift(aturan, urutanKe);
  return Math.round(dasar * SABAR_KALI);
}

export function buatPelanggan(
  id: number,
  urutanKe: number,
  aturan: AturanShift,
  loop: number,
): Pelanggan {
  const batasMs = batasPelanggan(aturan, urutanKe, loop);
  return { id, perintah: buatPerintah(), sisaMs: batasMs, batasMs };
}

/**
 * Majukan waktu `deltaMs` untuk SELURUH antrian.
 *
 * Mengembalikan daftar baru + id yang kesabarannya habis. Pelanggan yang habis
 * TIDAK dibuang di sini: pemanggil yang memutuskan hukumannya (nyawa, kombo,
 * pengganti) supaya modul ini tetap murni.
 */
export function tick(
  daftar: readonly Pelanggan[],
  deltaMs: number,
): { daftar: Pelanggan[]; kabur: number[] } {
  const kabur: number[] = [];
  const hasil = daftar.map((c) => {
    const sisaMs = Math.max(0, c.sisaMs - deltaMs);
    if (sisaMs <= 0 && c.sisaMs > 0) kabur.push(c.id);
    return sisaMs === c.sisaMs ? c : { ...c, sisaMs };
  });
  return { daftar: hasil, kabur };
}

/** Pelanggan paling mendesak (sisa kesabaran terkecil), untuk auto-pilih. */
export function palingMendesak(daftar: readonly Pelanggan[]): Pelanggan | null {
  if (!daftar.length) return null;
  return daftar.reduce((a, b) => (b.sisaMs < a.sisaMs ? b : a));
}
