/**
 * iq-scorer.ts — penilai Asesmen Penalaran. SELURUH angka lahir di sini.
 *
 * KENAPA PENILAIAN TIDAK DI KLIEN
 * -------------------------------
 * Tes ini punya jawaban benar, jadi klien yang menghitung skornya berarti
 * klien yang menentukan hasilnya. Cukup buka DevTools dan kirim "40/40" untuk
 * mendapat skor tertinggi tanpa menjawab satu soal pun. Karena itu klien hanya
 * mengirim JAWABAN MENTAH; bank + kunci tetap di server (`iq-bank.ts`), dan
 * fungsi inilah satu-satunya tempat angka terbentuk.
 *
 * KENAPA SISWA TIDAK MENERIMA ANGKA PENUH
 * ---------------------------------------
 * Keputusan pemilik 2026-11-07: siswa melihat 4 subskor + kekuatan/kelemahan;
 * skor mentah dan skala penuh hanya di panel admin. `tampilanIqSiswa()`
 * memotongnya secara eksplisit — bukan dengan menghapus satu per satu di
 * pemanggil, karena pemanggil yang lupa menghapus adalah cara angka bocor.
 *
 * SOAL NORMA — BACA SEBELUM MENGGANTI ANGKA
 * -----------------------------------------
 * Skala 70–130 di bawah BUKAN norma populasi dan tidak divalidasi psikolog.
 * Ia pemetaan linier dari proporsi benar, ditulis terbuka supaya bisa
 * diperiksa dan dikalibrasi ulang saat datanya cukup. Karena itu setiap
 * tampilan membawa `catatan` yang menyebutnya apa adanya: asesmen internal,
 * bukan diagnosis.
 */
import { KUOTA_IQ, VERSI_BANK_IQ, kunciIq, type KategoriIq } from './iq-bank';

export type SubskorIq = 1 | 2 | 3 | 4 | 5;

export const CATATAN_IQ =
  'Asesmen penalaran internal ASJ. Skala 70–130 dihitung dari proporsi jawaban benar ' +
  'dengan norma internal — bukan tes IQ klinis dan bukan diagnosis psikologis.';

const LABEL_KATEGORI: Record<KategoriIq, string> = {
  verbal: 'Pemahaman verbal & instruksi',
  numerik: 'Ketelitian numerik & hitungan kerja',
  spasial: 'Orientasi spasial & pola visual',
  logika: 'Penalaran logis & urutan SOP',
};

const KATEGORI: KategoriIq[] = ['verbal', 'numerik', 'spasial', 'logika'];

export interface RincianKategori {
  benar: number;
  total: number;
  subskor: SubskorIq;
}

/** Yang disimpan di `candidate_assessments.hasil` dan dibaca panel admin. */
export interface HasilIqLengkap {
  versi: string;
  catatan: string;
  benar: number;
  maks: number;
  skala: number;
  klasifikasi: string;
  subskor: Record<KategoriIq, SubskorIq>;
  rincian: Record<KategoriIq, RincianKategori>;
  kekuatan: string[];
  latihan: string[];
  durasiDetik: number;
  dikerjakanPada: string;
}

/** Yang boleh dilihat siswa. Perhatikan apa yang TIDAK ada di sini. */
export interface TampilanIqSiswa {
  catatan: string;
  subskor: Record<KategoriIq, SubskorIq>;
  kekuatan: string[];
  latihan: string[];
  dikerjakanPada: string;
}

function subskorDari(benar: number, total: number): SubskorIq {
  if (total <= 0) return 1;
  const rasio = benar / total;
  if (rasio >= 0.85) return 5;
  if (rasio >= 0.68) return 4;
  if (rasio >= 0.48) return 3;
  if (rasio >= 0.28) return 2;
  return 1;
}

/**
 * Pemetaan terbuka: 0 benar = 70, separuh benar = 100, semua benar = 130.
 * Ditulis sebagai fungsi, bukan tabel 41 baris, supaya tidak ada satu pun angka
 * yang "hilang" di antara baris tabel.
 */
export function skalaDariProporsi(benar: number, maks: number): number {
  const aman = Math.max(0, Math.min(benar, maks));
  const rasio = maks > 0 ? aman / maks : 0;
  return Math.round(70 + rasio * 60);
}

function klasifikasi(skala: number): string {
  if (skala >= 120) return 'Sangat tinggi (di atas rata-rata norma internal)';
  if (skala >= 110) return 'Tinggi (cepat menangkap instruksi kompleks)';
  if (skala >= 95) return 'Rata-rata standar kerja (memenuhi kualifikasi umum)';
  if (skala >= 85) return 'Cukup (perlu pengulangan instruksi awal)';
  return 'Perlu pendampingan intensif';
}

/**
 * Nilai satu kiriman. `jawaban` mentah dari klien: `{ 'v-001': 1, ... }`.
 *
 * Yang dihitung HANYA soal yang memang dijatahkan untuk WA ini (`kunciIq`).
 * ID asing diabaikan, jadi siswa tidak bisa menambah soal yang ia hafal dari
 * temannya untuk menaikkan skor.
 */
export function nilaiIq(wa: string, jawaban: unknown, durasiDetik: unknown): HasilIqLengkap {
  const peta = kunciIq(wa);
  const masuk =
    jawaban && typeof jawaban === 'object' && !Array.isArray(jawaban)
      ? (jawaban as Record<string, unknown>)
      : {};

  const benarPer: Record<KategoriIq, number> = { verbal: 0, numerik: 0, spasial: 0, logika: 0 };

  for (const [id, nilai] of Object.entries(masuk)) {
    const soal = peta.get(id);
    if (!soal) continue;
    const n = Number(nilai);
    if (!Number.isInteger(n) || n < 0 || n > 3) continue;
    if (n === soal.kunci) benarPer[soal.kategori] += 1;
  }

  const rincian = {} as Record<KategoriIq, RincianKategori>;
  const subskor = {} as Record<KategoriIq, SubskorIq>;
  let benar = 0;
  let maks = 0;

  for (const kat of KATEGORI) {
    const total = KUOTA_IQ[kat];
    const b = Math.min(benarPer[kat], total);
    subskor[kat] = subskorDari(b, total);
    rincian[kat] = { benar: b, total, subskor: subskor[kat] };
    benar += b;
    maks += total;
  }

  const kekuatan = KATEGORI.filter((k) => subskor[k] >= 4).map((k) => LABEL_KATEGORI[k]);
  const latihan = KATEGORI.filter((k) => subskor[k] <= 2).map((k) => LABEL_KATEGORI[k]);
  if (!kekuatan.length) kekuatan.push('Penalaran cukup merata di seluruh bagian.');
  if (!latihan.length) latihan.push('Pertahankan ketelitian dan kecepatan mengerjakan.');

  const durasi = Number(durasiDetik);
  const skala = skalaDariProporsi(benar, maks);

  return {
    versi: VERSI_BANK_IQ,
    catatan: CATATAN_IQ,
    benar,
    maks,
    skala,
    klasifikasi: klasifikasi(skala),
    subskor,
    rincian,
    kekuatan,
    latihan,
    durasiDetik: Number.isFinite(durasi) ? Math.max(0, Math.min(Math.round(durasi), 7200)) : 0,
    dikerjakanPada: new Date().toISOString(),
  };
}

/**
 * Potong semua angka. `null` bila bentuk tersimpan tidak dikenali — pemanggil
 * harus memperlakukan itu sebagai "tidak ada hasil", bukan menampilkan angka
 * kosong yang terbaca seperti skor nol.
 */
export function tampilanIqSiswa(nilai: unknown): TampilanIqSiswa | null {
  if (!nilai || typeof nilai !== 'object') return null;
  const h = nilai as Partial<HasilIqLengkap>;
  const sub = h.subskor;
  if (!sub || typeof sub !== 'object') return null;
  const bersih = {} as Record<KategoriIq, SubskorIq>;
  for (const kat of KATEGORI) {
    const v = Number((sub as Record<string, unknown>)[kat]);
    if (!Number.isInteger(v) || v < 1 || v > 5) return null;
    bersih[kat] = v as SubskorIq;
  }
  return {
    catatan: typeof h.catatan === 'string' && h.catatan ? h.catatan : CATATAN_IQ,
    subskor: bersih,
    kekuatan: Array.isArray(h.kekuatan) ? h.kekuatan.filter((x): x is string => typeof x === 'string') : [],
    latihan: Array.isArray(h.latihan) ? h.latihan.filter((x): x is string => typeof x === 'string') : [],
    dikerjakanPada: typeof h.dikerjakanPada === 'string' ? h.dikerjakanPada : '',
  };
}

/** Satu baris untuk daftar admin. Angka penuh boleh ada di sini — admin saja. */
export function ringkasIq(h: HasilIqLengkap): string {
  const s = h.subskor;
  return `${h.benar}/${h.maks} · skala ${h.skala} · V${s.verbal} N${s.numerik} S${s.spasial} L${s.logika}`;
}
