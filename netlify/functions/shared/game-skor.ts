/**
 * game-skor.ts — replay skor untuk Matematika, Kotoba, dan Combo.
 *
 * KENAPA DISALIN, BUKAN DIIMPOR
 *   Bundler Netlify tidak menjangkau `src/` (dan `verify:io` melarang
 *   `netlify/functions` mengimpor ke sana). Pola yang sama dipakai
 *   `genba-skor.ts` dan `shared/wa-rules.ts`: dua berkas, satu aturan, paritas
 *   dipaku tes (`shared/game-skor.test.ts`).
 *
 *   Genba punya berkas sendiri karena rumusnya paling panjang (kurva gelombang,
 *   bonus loop, presisi). Berkas ini menampung tiga game lain — semuanya
 *   dihitung ulang dari ronde, bukan dari angka kiriman.
 */

/**
 * Poin per jawaban benar Matematika.
 *
 * HARUS sama dengan `SKOR_PER_BENAR` di `src/lib/matematika.ts`. Kalau salah
 * satu berubah, `shared/game-skor.test.ts` merah.
 */
export const SKOR_PER_BENAR = 50;

/**
 * Batas jumlah jawaban satu ronde Matematika.
 *
 * Ronde terpanjang yang benar-benar ada di aplikasi adalah 20 soal (simulasi
 * campuran) dan modul tunggal 20 soal. Batas 200 memberi ruang untuk modul
 * yang lebih panjang tanpa membuka pintu kiriman raksasa.
 */
export const RONDE_MAKS_MATEMATIKA = 200;

export interface HasilHitungMatematika {
  skor: number;
  benar: number;
  total: number;
}

/**
 * Hitung ulang skor Matematika dari hasil tiap soal.
 *
 * `ronde` = array `0 | 1` berurutan. Skor tidak bergantung waktu, jadi array
 * boolean sudah cukup — tidak ada alasan mempercayai angka kiriman.
 */
export function hitungMatematika(ronde: unknown, totalKlien?: unknown): HasilHitungMatematika | null {
  if (!Array.isArray(ronde) || ronde.length === 0 || ronde.length > RONDE_MAKS_MATEMATIKA) {
    return null;
  }
  const total = ronde.length;
  const totalDikirim = Number(totalKlien);
  if (Number.isFinite(totalDikirim) && Math.round(totalDikirim) !== total) return null;

  let benar = 0;
  for (const v of ronde) {
    if (v !== 0 && v !== 1) return null;
    benar += v;
  }
  return { skor: benar * SKOR_PER_BENAR, benar, total };
}

/* ── KOTOBA ─────────────────────────────────────────────────────────────────
 * Kembaran `src/lib/kotoba-skor.ts`. Event `[tepat, sisa, bonusOn, ketikOn]`;
 * dua bit terakhir ikut per event karena tingkat/mode bisa berubah di tengah
 * ronde.
 */

export const RONDE_MAKS_KOTOBA = 4000;

export interface HasilHitungKotoba {
  skor: number;
  benar: number;
  salah: number;
  komboMaks: number;
  kombo: number;
}

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

/* ── COMBO ──────────────────────────────────────────────────────────────────
 * Kembaran `hitungCombo` di `src/lib/arcade.ts`. Ronde `[jenis, nilai, kode]`:
 *   1 = kartu benar        nilai 0
 *   0 = kartu salah        nilai 0
 *   2 = kalimat selesai    nilai = sisa 0–100, kode = 0 normal / 1 sulit / 2 hell
 * Level ikut di event karena pemain bisa mengganti level di tengah sesi tanpa
 * mereset skor.
 */

/** Harus sama dengan `KOMBO_MAKS` di `src/lib/arcade.ts`. */
export const KOMBO_MAKS = 10;
export const RONDE_MAKS_COMBO = 4000;

export interface HasilHitungCombo {
  skor: number;
  kalimat: number;
  kombo: number;
}

export function hitungCombo(ronde: unknown): HasilHitungCombo | null {
  if (!Array.isArray(ronde) || ronde.length === 0 || ronde.length > RONDE_MAKS_COMBO) return null;

  let skor = 0;
  let kombo = 1;
  let kalimat = 0;
  let benarSejak = 0;

  for (const ev of ronde) {
    if (!Array.isArray(ev) || ev.length < 2) return null;
    const jenis = ev[0];
    const nilai = ev[1];
    if (jenis === 1) {
      if (nilai !== 0) return null;
      kombo = Math.min(KOMBO_MAKS, kombo + 1);
      skor += 50 * kombo;
      benarSejak += 1;
    } else if (jenis === 0) {
      if (nilai !== 0) return null;
      kombo = 1;
    } else if (jenis === 2) {
      if (typeof nilai !== 'number' || !Number.isFinite(nilai)) return null;
      const kode = ev[2];
      if (kode !== 0 && kode !== 1 && kode !== 2) return null;
      /* Kalimat tanpa satu kartu benar bukan penyelesaian yang sah. */
      if (benarSejak === 0) return null;
      const sisa = Math.min(100, Math.max(0, nilai));
      const dasar = kode === 2 ? 300 : kode === 1 ? 200 : 100;
      skor += dasar + Math.round((sisa / 100) * 100 * (benarSejak / 5));
      kalimat += 1;
      benarSejak = 0;
    } else {
      return null;
    }
  }

  return { skor, kalimat, kombo };
}
