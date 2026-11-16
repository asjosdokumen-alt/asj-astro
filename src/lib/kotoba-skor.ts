/**
 * kotoba-skor.ts — replay skor Kotoba dari urutan jawaban.
 *
 * KENAPA ADA
 *   Sampai 2026-11-16 skor Kotoba dihitung di komponen dan dikirim sebagai
 *   angka. Papan peringkat menerimanya apa adanya selama ≤ 1.000.000, jadi
 *   klien yang dimodifikasi bisa mengirim angka apa pun tanpa menjawab satu
 *   soal pun. Fungsi ini membuat skor menjadi FUNGSI dari jawaban, bukan dari
 *   angka kiriman — server memakai hasilnya.
 *
 * KENAPA TIAP EVENT MEMBAWA PENANDA TINGKAT & MODE
 *   Panel filter (termasuk chip Santai/Normal/Ketat) bisa diubah DI TENGAH
 *   ronde, dan mode bisa berpindah tab tanpa mereset skor. Kalau tingkat/mode
 *   hanya dikirim sekali di `detail`, replay akan memakai nilai terakhir untuk
 *   seluruh riwayat dan menolak skor yang sah. Karena itu setiap event membawa
 *   dua bit itu sendiri:
 *
 *     [tepat, sisa, bonusOn, ketikOn]
 *       tepat  1 = benar, 0 = salah
 *       sisa   0–100 (persen waktu tersisa)
 *       bonusOn 1 bila tingkat === 'ketat' (bonus kecepatan berlaku)
 *       ketikOn 1 bila mode === 'ketik' (poin dasar 15, bukan 10)
 *
 * RUMUS (dari `terapkan` di `KotobaGame.tsx`):
 *   bonus = bonusOn ? round(sisa/10) : 0
 *   poin  = (ketikOn ? 15 : 10) + kombo×2 + bonus + (kombo ≥ 5 ? 5 : 0)
 *   kombo naik 1 saat benar, kembali 0 saat salah. `kombo` yang dipakai adalah
 *   nilai SEBELUM jawaban ini.
 *
 * ⚠️ SALINAN: `netlify/functions/shared/game-skor.ts`. Paritas dipaku
 * `shared/game-skor.test.ts`.
 */

/** Batas jumlah jawaban satu kiriman; ronde terpanjang wajar ~200. */
export const RONDE_MAKS_KOTOBA = 4000;

export interface HasilHitungKotoba {
  skor: number;
  benar: number;
  salah: number;
  /** Kombo tertinggi — dibandingkan dengan `detail.kombo` kiriman. */
  komboMaks: number;
  /** Kombo terakhir, untuk mendeteksi ronde yang terpotong. */
  kombo: number;
}

/**
 * Jalankan ulang satu ronde Kotoba. `null` = payload tidak layak dipercaya.
 */
export function hitungKotoba(ronde: unknown): HasilHitungKotoba | null {
  if (!Array.isArray(ronde) || ronde.length === 0 || ronde.length > RONDE_MAKS_KOTOBA) return null;

  let skor = 0;
  let kombo = 0;
  let komboMaks = 0;
  let benar = 0;
  let salah = 0;

  for (const ev of ronde) {
    if (!Array.isArray(ev) || ev.length < 4) return null;
    const tepat = ev[0];
    const sisaRaw = ev[1];
    const bonusOn = ev[2];
    const ketikOn = ev[3];
    if (tepat !== 0 && tepat !== 1) return null;
    if (bonusOn !== 0 && bonusOn !== 1) return null;
    if (ketikOn !== 0 && ketikOn !== 1) return null;
    if (typeof sisaRaw !== 'number' || !Number.isFinite(sisaRaw)) return null;
    const sisa = Math.min(100, Math.max(0, Math.round(sisaRaw)));

    if (tepat === 1) {
      const bonus = bonusOn ? Math.round(sisa / 10) : 0;
      skor += (ketikOn ? 15 : 10) + kombo * 2 + bonus + (kombo >= 5 ? 5 : 0);
      kombo += 1;
      komboMaks = Math.max(komboMaks, kombo);
      benar += 1;
    } else {
      kombo = 0;
      salah += 1;
    }
  }

  return { skor, benar, salah, komboMaks, kombo };
}
