/**
 * leaderboard.ts — papan peringkat game (kotoba · arcade · matematika).
 *
 * KENAPA ADA
 *   Sebelum ini skor ketiga game hanya hidup di `localStorage` per perangkat.
 *   Dua akibatnya nyata: siswa yang bermain di HP teman (atau setelah membersihkan
 *   data peramban) kehilangan rekornya, dan pengajar TIDAK PUNYA cara melihat
 *   siapa yang benar-benar berlatih — padahal itu justru yang ingin dipantau.
 *
 * BENTUK DATA
 *   `game_scores` menyimpan RIWAYAT (satu baris per kiriman), bukan satu baris
 *   per siswa. Papan peringkat mengambil skor TERTINGGI per (no_wa, game);
 *   riwayatnya tetap utuh untuk melihat perkembangan.
 *
 * `nama` DAN `kelas` DIAMBIL DARI DB, BUKAN DARI KLIEN
 *   Kalau klien yang mengirim, seorang siswa bisa mengirim nama orang lain atau
 *   kelas yang bukan kelasnya, dan papan peringkat akan menampilkan data palsu
 *   tanpa satu pun error. Server mencari sendiri lewat `no_wa` yang SUDAH
 *   diverifikasi gerbang sesi.
 */

import { supabaseJson, normalizeWa } from '../db/client';

/**
 * Nama game yang sah — HARUS sama dengan CHECK constraint di migrasi 043.
 *
 * `genba` dan `combo` sengaja TERPISAH meski keduanya hidup di halaman
 * `/arcade`: skala skornya berbeda jauh (Genba ~ratusan, Combo ~puluhan ribu),
 * jadi satu papan bersama akan selalu dimenangkan pemain Combo dan papan Genba
 * berhenti berarti.
 */
export const GAME_SAH = ['kotoba', 'genba', 'combo', 'matematika'] as const;
export type GameId = (typeof GAME_SAH)[number];

export function gameSah(v: unknown): v is GameId {
  return typeof v === 'string' && (GAME_SAH as readonly string[]).includes(v);
}

/**
 * Batas skor yang diterima.
 *
 * BUKAN pengaman anti-curang — skor dihitung di klien, jadi klien yang
 * dimodifikasi selalu bisa mengirim angka apa pun. Angka ini hanya menolak
 * kiriman yang jelas mustahil (mis. `1e9` dari bug atau `NaN`), supaya papan
 * peringkat tidak dipenuhi sampah yang membuat semua orang berhenti peduli.
 * Kalau nanti skor perlu dipercaya, ia harus dihitung ulang di server.
 */
const SKOR_MAKS = 1_000_000;

interface BarisSkor {
  no_wa: string;
  nama: string;
  kelas: string;
  game: string;
  skor: number;
  detail: Record<string, unknown>;
  dibuat_pada: string;
}

/** Identitas siswa dari DB — sumber `nama`/`kelas` yang dipakai saat menyimpan. */
async function identitas(wa: string): Promise<{ nama: string; kelas: string } | null> {
  try {
    const rows = await supabaseJson('GET', 'database_candidate', {
      query: {
        select: 'nama_lengkap,kelas,catatan_internal',
        no_wa: `eq.${normalizeWa(wa)}`,
        limit: '1',
      },
    });
    if (!Array.isArray(rows) || !rows.length) return null;
    const r = rows[0] as { nama_lengkap?: unknown; kelas?: unknown; catatan_internal?: unknown };
    const kelasKolom = String(r.kelas ?? '').trim().toUpperCase();
    /* Cadangan tag `[KELAS xx]`: kandidat lama menyimpan kelasnya di memo.
       Tanpa cadangan ini, papan peringkat kelas akan mengelompokkan mereka
       sebagai "(tanpa kelas)" padahal kelasnya ada. */
    const tag = /\[KELAS\s*([A-Z0-9]+)\]/i.exec(String(r.catatan_internal ?? ''));
    return {
      nama: String(r.nama_lengkap ?? '').trim(),
      kelas: kelasKolom || (tag ? tag[1].toUpperCase() : ''),
    };
  } catch {
    return null;
  }
}

/**
 * Simpan satu skor. Mengembalikan skor terbaik siswa itu untuk game tersebut,
 * supaya klien bisa langsung menampilkan "rekor kamu" tanpa permintaan kedua.
 */
export async function simpanSkor(input: {
  wa: string;
  game: unknown;
  skor: unknown;
  detail?: unknown;
}): Promise<Record<string, unknown>> {
  const wa = normalizeWa(String(input.wa ?? ''));
  if (!wa) return { success: false, message: 'Nomor WA kosong.' };
  if (!gameSah(input.game)) {
    return { success: false, message: 'Nama game tidak dikenal.' };
  }
  const skor = Number(input.skor);
  if (!Number.isFinite(skor) || skor < 0 || skor > SKOR_MAKS) {
    return { success: false, message: 'Skor tidak masuk akal.' };
  }

  const id = await identitas(wa);
  if (!id) return { success: false, message: 'Kandidat tidak ditemukan.' };

  const detail =
    input.detail && typeof input.detail === 'object' && !Array.isArray(input.detail)
      ? (input.detail as Record<string, unknown>)
      : {};

  try {
    await supabaseJson('POST', 'game_scores', {
      body: {
        no_wa: wa,
        nama: id.nama,
        kelas: id.kelas,
        game: input.game,
        // Dibulatkan: skor pecahan (mis. rata-rata) akan tampil aneh di papan.
        skor: Math.round(skor),
        detail,
      },
      headers: { Prefer: 'return=minimal' },
    });
  } catch {
    return { success: false, message: 'Gagal menyimpan skor. Coba lagi.' };
  }

  const terbaik = await rekorTerbaik(wa, input.game);
  return { success: true, game: input.game, skor: Math.round(skor), terbaik };
}

async function rekorTerbaik(wa: string, game: GameId): Promise<number> {
  try {
    const rows = await supabaseJson('GET', 'game_scores', {
      query: { select: 'skor', no_wa: `eq.${wa}`, game: `eq.${game}`, order: 'skor.desc', limit: '1' },
    });
    if (!Array.isArray(rows) || !rows.length) return 0;
    return Number((rows[0] as { skor?: unknown }).skor) || 0;
  } catch {
    return 0;
  }
}

/**
 * Papan peringkat satu game.
 *
 * `limit` dibatasi di sisi server: tanpa batas, permintaan "semua" akan menarik
 * seluruh riwayat dan memuatnya ke memori fungsi.
 */
export async function papanPeringkat(game: unknown, limit = 50): Promise<Record<string, unknown>> {
  if (!gameSah(game)) return { success: false, message: 'Nama game tidak dikenal.' };
  const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
  try {
    /* Diambil lebih banyak daripada `n` karena penyaringan "satu baris per
       siswa" terjadi setelah ini — seorang siswa dengan sepuluh kiriman bisa
       menghabiskan seluruh jatah kalau diambil tepat `n`. */
    const rows = await supabaseJson('GET', 'game_scores', {
      query: {
        select: 'no_wa,nama,kelas,game,skor,detail,dibuat_pada',
        game: `eq.${game}`,
        order: 'skor.desc,dibuat_pada.asc',
        limit: String(Math.min(n * 20, 2000)),
      },
    });
    if (!Array.isArray(rows)) return { success: true, game, peringkat: [] };

    const terlihat = new Set<string>();
    const peringkat: BarisSkor[] = [];
    for (const r of rows as BarisSkor[]) {
      if (terlihat.has(r.no_wa)) continue;
      terlihat.add(r.no_wa);
      peringkat.push(r);
      if (peringkat.length >= n) break;
    }
    return { success: true, game, peringkat };
  } catch {
    return { success: false, message: 'Gagal memuat papan peringkat.' };
  }
}

/**
 * Ringkasan ketiga game sekaligus — yang dipakai tab admin.
 *
 * Dijalankan berurutan, bukan paralel: satu koneksi DB yang sama, dan tiga
 * permintaan bersamaan tidak membuatnya lebih cepat di fungsi serverless.
 */
export async function ringkasPapan(limit = 10): Promise<Record<string, unknown>> {
  const hasil: Record<string, unknown> = {};
  for (const g of GAME_SAH) {
    const r = await papanPeringkat(g, limit);
    hasil[g] = r.success ? (r.peringkat as BarisSkor[]) : [];
  }
  return { success: true, papan: hasil };
}
