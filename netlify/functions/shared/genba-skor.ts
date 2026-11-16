/**
 * genba-skor.ts — rumus skor Genba, SALINAN FISIK dari `src/lib/arcade.ts`.
 *
 * KENAPA DISALIN, BUKAN DIIMPOR
 *   Bundler Netlify tidak menjangkau `src/` (dan `verify:io` melarang
 *   `netlify/functions` mengimpor ke sana). Pola yang sama sudah dipakai
 *   `shared/wa-rules.ts`: dua berkas, satu aturan, paritas dipaku tes.
 *
 *   Tanpa salinan ini, server tidak bisa menghitung ulang skor dari ronde dan
 *   papan peringkat tetap menerima angka apa pun dari klien.
 *
 * ⚠️ JANGAN UBAH SENDIRIAN. Setiap perubahan di sini HARUS disalin ke
 *   `src/lib/arcade.ts` (dan sebaliknya). `shared/genba-skor.test.ts`
 *   membandingkan tabel, fungsi poin, kurva gelombang, dan hasil replay
 *   lintas implementasi — ia gagal begitu salah satu sisi bergerak sendiri.
 */

export type TingkatGenba = 'magang' | 'reguler' | 'veteran';

export interface AturanShift {
  id: TingkatGenba;
  pesanan: number;
  nyawa: number;
  durasi: readonly number[];
  pilihan: readonly number[];
  zona: readonly number[];
  zonaMaks: number;
  pengali: number;
}

/** Harus sama persis dengan `SHIFT_GENBA` di `src/lib/arcade.ts`. */
export const SHIFT_GENBA: Readonly<Record<TingkatGenba, AturanShift>> = {
  magang: { id: 'magang', pesanan: 8, nyawa: 4, durasi: [9000, 8000], pilihan: [4, 6], zona: [4, 4], zonaMaks: 6, pengali: 1 },
  reguler: { id: 'reguler', pesanan: 12, nyawa: 3, durasi: [8000, 7000, 6000], pilihan: [6, 6, 9], zona: [4, 4, 6], zonaMaks: 8, pengali: 1 },
  veteran: { id: 'veteran', pesanan: 12, nyawa: 2, durasi: [6000, 5000, 4500], pilihan: [9, 9, 9], zona: [6, 6, 6], zonaMaks: 8, pengali: 1.5 },
};

export const ULTIMATE = {
  pesananPerGelombang: 4,
  nyawa: 1,
  durasiMin: 2500,
  turunDurasi: 250,
  pilihanMaks: 9,
  zonaMaks: 8,
  kecepatanTtsMaks: 1.5,
  bonusGelombang: 100,
  bonusBenar: 25,
  pengaliGelombang: 0.1,
} as const;

export const PRESISI_MOD = 10_000;

export type NilaiShift = 'S' | 'A' | 'B' | 'C' | 'D';

export interface RingkasShift {
  selesai: boolean;
  benar: number;
  salah: number;
  sisaRata: number;
}

export interface AturanUltimate {
  gelombang: number;
  durasiMs: number;
  pilihan: number;
  zona: number;
  kecepatanTts: number;
}

export interface PoinGenba {
  tambah: number;
  bonusCepat: number;
  pengali: number;
}

export function gelombangShift(aturan: AturanShift, n: number): number {
  const i = Math.floor(Math.max(0, n) / 4);
  return Math.min(i, aturan.durasi.length - 1);
}

export function durasiShift(aturan: AturanShift, n: number): number {
  return aturan.durasi[gelombangShift(aturan, n)] ?? 8000;
}

export function poinGenba(sisaMs: number, batasMs: number, kombo: number): PoinGenba {
  const batas = Number.isFinite(batasMs) && batasMs > 0 ? Math.round(batasMs) : 1;
  const ms = Number.isFinite(sisaMs) ? Math.min(batas, Math.max(0, Math.round(sisaMs))) : 0;
  const bonusCepat = Math.round((ms / batas) * 50);
  const pengali = kombo >= 10 ? 3 : kombo >= 5 ? 2 : 1;
  return { tambah: (100 + bonusCepat) * pengali, bonusCepat, pengali };
}

export function nilaiShift(r: RingkasShift): NilaiShift {
  if (!r.selesai) return 'D';
  const percobaan = r.benar + r.salah;
  const akurasi = percobaan > 0 ? r.benar / percobaan : 0;
  if (akurasi >= 1 && r.sisaRata >= 50) return 'S';
  if (akurasi >= 0.9 && r.sisaRata >= 30) return 'A';
  if (akurasi >= 0.75) return 'B';
  return 'C';
}

export function skorShift(skor: number, aturan: AturanShift, selesai: boolean): number {
  if (!selesai) return skor;
  return Math.round((skor + 100 * aturan.pesanan) * aturan.pengali);
}

export function aturanUltimate(dasar: AturanShift, gelombang: number): AturanUltimate {
  const w = Math.max(0, Math.floor(Number.isFinite(gelombang) ? gelombang : 0));
  const durasiAkhir = dasar.durasi[dasar.durasi.length - 1] ?? 8000;
  const pilihanAkhir = dasar.pilihan[dasar.pilihan.length - 1] ?? 6;
  const zonaAkhir = dasar.zona[dasar.zona.length - 1] ?? 4;
  return {
    gelombang: w,
    durasiMs: Math.max(ULTIMATE.durasiMin, durasiAkhir - ULTIMATE.turunDurasi * w),
    pilihan: Math.min(ULTIMATE.pilihanMaks, pilihanAkhir + Math.floor(w / 2)),
    zona: Math.min(ULTIMATE.zonaMaks, zonaAkhir + (w >= 2 ? 2 : 0)),
    kecepatanTts: Math.min(
      ULTIMATE.kecepatanTtsMaks,
      0.9 + 0.06 * Math.max(0, dasar.durasi.length - 1) + 0.03 * w,
    ),
  };
}

export function bonusUltimate(gelombang: number, benar: number): number {
  const w = Math.max(0, Math.floor(Number.isFinite(gelombang) ? gelombang : 0));
  const b = Math.max(0, Math.floor(Number.isFinite(benar) ? benar : 0));
  return Math.round(
    (ULTIMATE.bonusGelombang * (w + 1) + ULTIMATE.bonusBenar * b) *
      (1 + ULTIMATE.pengaliGelombang * w),
  );
}

export function digitPresisi(sisaMs: number): number {
  if (!Number.isFinite(sisaMs) || sisaMs <= 0) return 0;
  return Math.floor(sisaMs) % PRESISI_MOD;
}

export interface HasilHitungGenba {
  skor: number;
  presisi: number;
  /** Gelombang loop yang SUDAH selesai (0 = baru shift dasar). */
  loop: number;
  /** Nomor gelombang yang sedang dimainkan (0 = belum masuk loop). */
  loopDimainkan: number;
  benar: number;
  salah: number;
  pesananAkhir: number;
  selesai: boolean;
  berhenti: boolean;
  nilai: NilaiShift;
}

export const RONDE_MAKS = 4000;

/**
 * Jalankan ulang satu shift Genba dari urutan `[benar, sisaMs]`.
 *
 * Kembaran `hitungGenba` di `src/lib/arcade.ts`. `null` = payload tidak layak
 * dipercaya (tingkat asing, event rusak, ronde kosong/terlalu panjang).
 */
export function hitungGenba(tingkat: unknown, ronde: unknown): HasilHitungGenba | null {
  if (typeof tingkat !== 'string' || !Object.hasOwn(SHIFT_GENBA, tingkat)) return null;
  const aturan = SHIFT_GENBA[tingkat as TingkatGenba];
  if (!aturan) return null;
  if (!Array.isArray(ronde) || ronde.length === 0 || ronde.length > RONDE_MAKS) return null;

  let skor = 0;
  let kombo = 0;
  let benar = 0;
  let salah = 0;
  let presisiMs = 0;
  let loop = 0;
  let pesanan = 0;
  let pesananLapor = 0;
  let nyawa = aturan.nyawa;
  let sisaTotal = 0;
  let benarGelombang = 0;
  let tahap: 'shift' | 'loop' = 'shift';
  let selesai = false;
  let berhenti = false;

  for (const ev of ronde) {
    if (!Array.isArray(ev) || ev.length < 2) return null;
    const b = ev[0];
    const msRaw = ev[1];
    if (b !== 0 && b !== 1) return null;
    if (typeof msRaw !== 'number' || !Number.isFinite(msRaw)) return null;
    if (berhenti) continue;

    /* Peralihan ke loop pada EVENT PERTAMA sesudah shift tuntas — lihat catatan
       kembarannya di `src/lib/arcade.ts`. */
    if (selesai && tahap === 'shift') tahap = 'loop';

    /* Kesabaran pelanggan dikirim klien di elemen ke-3 (antrian 2026-11-16).
       Dijepit ke rentang wajar supaya tidak bisa menggelembungkan bonus. */
    const batasDikirim = Number(ev[2]);
    const batas =
      Number.isFinite(batasDikirim) && batasDikirim >= 1000 && batasDikirim <= 30_000
        ? Math.round(batasDikirim)
        : tahap === 'loop'
          ? aturanUltimate(aturan, loop).durasiMs
          : durasiShift(aturan, pesanan);
    const ms = Math.min(batas, Math.max(0, Math.round(msRaw)));

    if (b === 1) {
      kombo += 1;
      skor += poinGenba(ms, batas, kombo).tambah;
      presisiMs += ms;
      benar += 1;
      pesanan += 1;
      benarGelombang += 1;
      sisaTotal += (ms / batas) * 100;
      pesananLapor = pesanan;
      const target = tahap === 'loop' ? ULTIMATE.pesananPerGelombang : aturan.pesanan;
      if (pesanan >= target) {
        if (tahap === 'loop') {
          skor += bonusUltimate(loop, benarGelombang);
          loop += 1;
          pesananLapor = 0;
        } else {
          skor = skorShift(skor, aturan, true);
          selesai = true;
        }
        pesanan = 0;
        benarGelombang = 0;
        kombo = 0;
        nyawa = ULTIMATE.nyawa;
      }
    } else {
      kombo = 0;
      salah += 1;
      nyawa -= 1;
      pesananLapor = pesanan;
      if (nyawa <= 0) berhenti = true;
    }
  }

  const sisaRata = benar > 0 ? sisaTotal / benar : 0;
  return {
    skor,
    presisi: digitPresisi(presisiMs),
    loop,
    loopDimainkan: loop + (tahap === 'loop' ? 1 : 0),
    benar,
    salah,
    pesananAkhir: pesananLapor,
    selesai,
    berhenti,
    nilai: nilaiShift({ selesai, benar, salah, sisaRata }),
  };
}
