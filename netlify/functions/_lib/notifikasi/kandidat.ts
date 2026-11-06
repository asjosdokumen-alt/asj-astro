/**
 * _lib/notifikasi/kandidat.ts — TULIS + KIRIM pemberitahuan kandidat.
 *
 * KENAPA TABEL, BUKAN HANYA PUSH
 * ------------------------------
 * Push adalah kanal terbaik, bukan kanal satu-satunya. Dua batas nyata:
 *   • di iOS web push hanya bekerja untuk web app yang DIPASANG ke Layar Utama,
 *     dan izinnya harus diminta dari gestur pengguna (WebKit, Feb 2023);
 *   • push bisa gagal tanpa jejak — token mati, izin dicabut, perangkat mati
 *     lebih lama dari masa simpan FCM.
 * Kalau satu-satunya salinan pemberitahuan ada di push, kegagalan itu berarti
 * informasinya HILANG, bukan tertunda.
 *
 * Karena itu urutannya selalu: TULIS baris dulu, baru kirim push. Kalau push
 * gagal, barisnya tetap ada dan muncul di dasbor.
 *
 * SATU PINTU UNTUK SEMUA PEMBERITAHUAN KANDIDAT
 * ---------------------------------------------
 * Sebelum ini, push ditulis langsung di tiga tempat berbeda (approve/reject,
 * upload dokumen, reminder jadwal) dengan judul yang dirakit sendiri-sendiri.
 * Akibatnya tidak ada satu pun yang bisa menjawab "apa saja yang pernah
 * diberitahukan ke siswa ini?". Sekarang semua lewat sini.
 *
 * Modul ini KHUSUS sisi kirim. Sisi baca/tulis ada di `kotak-masuk.ts`, supaya
 * endpoint yang hanya membaca kotak masuk tidak ikut membawa tumpukan FCM
 * (terukur 2026-11-06: `notify.js` 91,7 → 127,4 KB karena keduanya menyatu).
 */

import {
  type InputNotifikasi,
  siapkan,
  siapkanDasar,
  tulisBanyak,
  tulisSatu,
} from './kotak-masuk';

export type { InputNotifikasi } from './kotak-masuk';

async function kirimPush(waList: string[], judul: string, isi: string, url: string): Promise<void> {
  try {
    const { getKandidatTokens } = await import('../fcm-helpers');
    const semua: string[] = [];
    for (const wa of waList) {
      const tokens = await getKandidatTokens(wa);
      for (const t of tokens) semua.push(t);
    }
    if (semua.length === 0) return;
    const fcm = await import('../fcm-server');
    await fcm.sendMulticast(semua, judul, isi, url);
  } catch {
    /* Push best-effort: barisnya sudah tersimpan, jadi tidak ada yang hilang. */
  }
}

/**
 * Simpan satu pemberitahuan, lalu kirim push. `success:false` hanya terjadi
 * kalau BARIS gagal disimpan — push yang gagal tidak mengubah hasil.
 */
export async function kirimNotifikasi(
  input: InputNotifikasi,
): Promise<{ success: boolean; id?: number }> {
  const baris = siapkan(input);
  if (!baris) return { success: false };
  const hasil = await tulisSatu(baris);
  if (hasil.success) await kirimPush([baris.wa], baris.judul, baris.isi, baris.url);
  return hasil;
}

/**
 * Kirim pemberitahuan yang SAMA ke banyak kandidat (mis. reminder jadwal).
 *
 * Penulisan barisnya satu POST berisi array (lihat `tulisBanyak`); push-nya
 * satu panggilan multicast untuk seluruh penerima.
 */
export async function kirimNotifikasiBanyak(
  waList: string[],
  input: Omit<InputNotifikasi, 'wa'>,
): Promise<{ success: boolean; jumlah: number }> {
  const dasar = siapkanDasar(input);
  if (!dasar) return { success: false, jumlah: 0 };
  const hasil = await tulisBanyak(waList, dasar);
  if (hasil.success && hasil.wa.length > 0) {
    await kirimPush(hasil.wa, dasar.judul, dasar.isi, dasar.url);
  }
  return { success: hasil.success, jumlah: hasil.jumlah };
}
