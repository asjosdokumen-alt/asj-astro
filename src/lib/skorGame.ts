/**
 * skorGame.ts — kirim & muat skor game ke/dari papan peringkat.
 *
 * KENAPA DIPISAH
 *   Ketiga game (kotoba, arcade, matematika) sama-sama perlu mengirim skor, dan
 *   masing-masing sudah punya `localStorage` sendiri untuk rekor lokal. Menulis
 *   pemanggilan `apiClient` di tiga tempat berarti tiga kesempatan untuk lupa
 *   menangani sesi kedaluwarsa, tiga salinan batas nilai, dan tiga cara berbeda
 *   memperlakukan kegagalan.
 *
 * ATURAN YANG DIPEGANG DI SINI
 *   • Kegagalan mengirim skor TIDAK BOLEH mengganggu permainan. Skor lokal sudah
 *     tersimpan lebih dulu; papan peringkat adalah lapisan tambahan, bukan syarat
 *     bermain. Jadi semua kegagalan ditelan — tapi hasilnya dikembalikan supaya
 *     pemanggil bisa memberi tahu bila perlu.
 *   • Satu ronde hanya dikirim SEKALI. Tanpa penjaga ini, efek yang bergantung
 *     pada `fase` bisa berjalan dua kali (Preact StrictMode / render ulang) dan
 *     mengirim skor ganda — papan peringkat akan tampak seperti siswa bermain
 *     dua kali lebih banyak.
 */

import { apiClient } from './apiClient';
import { authStore } from '../store/authReactive';

/**
 * Harus sama dengan `GAME_SAH` di `_lib/game/leaderboard.ts` dan CHECK
 * constraint migrasi 043. `genba` dan `combo` terpisah meski satu halaman
 * (`/arcade`): skala skornya beda jauh, jadi satu papan bersama akan selalu
 * dimenangkan pemain Combo.
 */
export type GameSkor = 'kotoba' | 'genba' | 'combo' | 'matematika';

/** Satu baris papan skor yang diterima klien. */
export interface BarisPapanGame {
  no_wa: string;
  nama: string;
  kelas: string;
  skor: number;
  detail?: Record<string, unknown>;
  dibuat_pada?: string;
}

/** Nomor WA siswa yang sedang masuk, atau '' bila tidak ada. */
export function waSiswa(): string {
  try {
    return String(authStore.get().wa || '').trim();
  } catch {
    return '';
  }
}

/**
 * Kirim satu skor. Aman dipanggil kapan saja: tidak pernah melempar.
 *
 * @returns skor terbaik siswa untuk game itu menurut server, atau `null` bila
 *          pengiriman gagal (offline, sesi habis, server menolak).
 */
export async function kirimSkor(
  game: GameSkor,
  skor: number,
  detail?: Record<string, unknown>,
): Promise<number | null> {
  const wa = waSiswa();
  if (!wa) return null;
  if (!Number.isFinite(skor) || skor < 0) return null;
  try {
    const r = await apiClient<{ success?: boolean; terbaik?: number }>(
      'simpanSkorGame',
      [wa, game, Math.round(skor), detail || {}],
      // `'throw'`, bukan `'logout'`: gagal mengirim skor tidak boleh
      // mengeluarkan siswa dari sesinya di tengah latihan.
      { onSessionInvalid: 'throw', silent: true },
    );
    if (!r || r.success === false) return null;
    return typeof r.terbaik === 'number' ? r.terbaik : null;
  } catch {
    return null;
  }
}

/**
 * Ambil 10 besar papan peringkat satu game untuk ditampilkan langsung di dalam
 * halaman game (`/arcade` dan `/kotoba`). Tidak pernah melempar error.
 */
export async function ambilPapanGame(game: GameSkor, limit = 10): Promise<BarisPapanGame[]> {
  const wa = waSiswa();
  try {
    const r = await apiClient<{ success?: boolean; peringkat?: BarisPapanGame[] }>(
      'getPapanSkor',
      [game, limit, wa],
      { onSessionInvalid: 'throw', silent: true },
    );
    return Array.isArray(r?.peringkat) ? r.peringkat : [];
  } catch {
    return [];
  }
}

/**
 * Penjaga "kirim sekali per ronde".
 *
 * Kuncinya string bebas (mis. `kotoba:12`), dan setiap kunci hanya lolos sekali
 * selama halaman hidup. Sengaja TIDAK memakai `Set` global tanpa batas: kunci
 * berisi nomor ronde, jadi jumlahnya tumbuh selama sesi bermain. Batas 200
 * entri cukup untuk satu sesi latihan dan mencegah kebocoran memori bila
 * seseorang meninggalkan halaman terbuka berjam-jam.
 */
const sudahKirim = new Set<string>();

export function bolehKirim(kunci: string): boolean {
  if (sudahKirim.has(kunci)) return false;
  if (sudahKirim.size > 200) sudahKirim.clear();
  sudahKirim.add(kunci);
  return true;
}
