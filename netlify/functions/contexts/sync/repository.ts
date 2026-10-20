/**
 * contexts/sync/repository.ts — Delta queries for the local-first store
 *
 * Owns: nothing. It READS the four tables migration 017 prepared.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * KENAPA BERKAS INI ADA (terukur 2026-10-20, bukan perkiraan)
 * ═════════════════════════════════════════════════════════════════════════════
 * `getAppData` adalah SATU permintaan yang membawa seluruh dashboard admin:
 * 159 job + 226 kandidat + berkas + jadwal + tugas + template WA. Setiap mount
 * menarik semuanya lagi. Cache 30 detik di apiClient menekan pengulangan, tapi
 * 30 detik bukan selamanya — dan seorang admin yang membiarkan tab terbuka
 * tetap menarik payload penuh berulang kali.
 *
 * Delta-sync membutuhkan dua hal, dan keduanya sudah ADA:
 *   (a) kolom waktu yang benar-benar diperbarui saat baris diubah,
 *   (b) index yang melayaninya.
 * Migrasi 017 memasang keduanya (job_database.updated_at + trigger, tiga index
 * updated_at). Terukur atas DB live setelah 017:
 *
 *   job_database              159 baris  updated_at + idx_job_updated_at
 *   master_database_candidate 234 baris  updated_at + idx_master_updated_at
 *   database_asj_form          51 baris  updated_at + idx_form_updated_at
 *   database_candidate        226 baris  updated_at + idx_cand_updated_at (001)
 *
 * Konsekuensi yang HARUS dicatat: pada delta PERTAMA semua 159 job terlihat
 * "baru", karena kolom updated_at pada job_database baru dibuat dan nilainya
 * satu untuk semua baris lama. Itu memang maksudnya — tarikan pertama tetap
 * penuh, yang hilang adalah PENGULANGAN.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { supabaseJson } from '../../_lib/db/client';

/** Kolom kunci tiap tabel yang boleh disinkronkan. */
export const SYNC_TABLES = {
  jobs: { table: 'job_database', key: 'code_job' },
  master: { table: 'master_database_candidate', key: 'id_kandidat' },
  forms: { table: 'database_asj_form', key: 'id' },
  candidates: { table: 'database_candidate', key: 'id_kandidat' },
} as const;

/**
 * Proyeksi per tabel — delta TIDAK BOLEH `select: '*'`.
 *
 *  `master_database_candidate` punya 169 kolom. Delta yang menarik semuanya
 *  adalah persis biaya yang dihindari local-first, dan super database di
 *  jalur RPC (`MASTER_LIGHT_COLS`) sudah membuktikan bentuk ringannya.
 *
 *  ⚠ `database_candidate` dan `database_asj_form` sengaja `*`: keduanya
 *  diteruskan apa adanya oleh jalur baca (`mapCandidate` membaca kolom apa pun,
 *  dan `allForms` tidak didekorasi). Yang ringan memang yang ringan.
 */
const SYNC_SELECT: Record<SyncKey, string> = {
  jobs: '*',
  master: 'id_kandidat,nama_lengkap,no_wa,gender,tb,bb,email,status_proses,tahapan,id_loker,updated_at',
  forms: '*',
  candidates: '*',
};

export type SyncKey = keyof typeof SYNC_TABLES;

/** Semua nama tabel yang sah, untuk validasi payload. */
export const SYNC_KEYS = Object.keys(SYNC_TABLES) as SyncKey[];

export function isSyncKey(v: unknown): v is SyncKey {
  return typeof v === 'string' && Object.hasOwn(SYNC_TABLES, v);
}

/**
 * Batas keras baris per delta.
 *
 * Bukan selera: satu delta yang membawa 226 kandidat TERPROYEKSI (±24 kolom)
 * sudah ±180 KB. Kalau setiap perubahan mengubah banyak baris sekaligus,
 * jawaban tetap dipotong di sini dan klien diberi `since` berikutnya lewat
 * `nextSince` — bukan penolakan, dan bukan payload tak terbatas.
 */
export const SYNC_LIMIT = 200;

/** Airmark per tabel: jumlah baris + `max(updated_at)`.
 *
 *  SATU permintaan per tabel, bukan tiga. Bentuknya sengaja begini:
 *    - `order=updated_at.desc` → baris pertama adalah watermark;
 *    - `select` hanya kunci + updated_at → dua kolom per baris, bukan 169;
 *    - `limit=1000` → jumlah baris SEKALIGUS jadi hitungan.
 *
 *  Sengaja TIDAK memakai angka dari cache apa pun: probe ini justru dipakai
 *  untuk MENDETEKSI penghapusan, jadi ia harus menjawab keadaan sebenarnya
 *  saat itu. `updated_at` punya index di keempat tabel, jadi order-nya
 *  hitungan, bukan seq scan.
 *
 *  ⚠ BATAS 1000: kalau suatu tabel melewatinya, panjang array MENEMPAT BATAS
 *  dan hitungannya jadi batas bawah (`count: -1` dikembalikan sebagai tanda
 *  "tidak diketahui"). Klien memperlakukan -1 sebagai "resync penuh", BUKAN
 *  sebagai nol — ibarat nol akan membuatnya menganggap seluruh tabel kosong.
 */
export async function syncWatermarks(): Promise<Record<string, { count: number; watermark: string | null }>> {
  const out: Record<string, { count: number; watermark: string | null }> = {};
  for (const key of SYNC_KEYS) {
    const { table, key: k } = SYNC_TABLES[key];
    try {
      const rows = await supabaseJson('GET', table, {
        query: {
          select: `${k},updated_at`,
          order: 'updated_at.desc.nullslast',
          limit: '1000',
        },
      });
      if (!Array.isArray(rows)) {
        out[key] = { count: -1, watermark: null };
        continue;
      }
      out[key] = {
        count: rows.length >= 1000 ? -1 : rows.length,
        watermark: rows[0]?.updated_at || null,
      };
    } catch {
      // Tabel tak terjangkau: jangan batalkan seluruh probe karena satu tabel.
      // Klien memperlakukan entri -1 sebagai "tidak diketahui" dan memakai
      // data lokal, bukan menganggap semuanya nol.
      out[key] = { count: -1, watermark: null };
    }
  }
  return out;
}

/** Baris yang berubah sejak `since` (INKLUSIF — lihat alasan di service.ts). */
export async function syncRowsSince(key: SyncKey, since: string) {
  const { table } = SYNC_TABLES[key];
  return supabaseJson('GET', table, {
    query: {
      select: SYNC_SELECT[key],
      order: 'updated_at.asc.nullslast',
      limit: String(SYNC_LIMIT),
      updated_at: `gte.${since}`,
    },
  });
}

/**
 * Manifest ringkas: satu pasangan (kunci, watermark) per baris.
 *
 *  Dipakai HANYA ketika jumlah baris lokal ≠ jumlah baris server — yaitu
 *  ketika ada penghapusan. Tanpa manifest, satu-satunya cara mengetahui baris
 *  mana yang hilang adalah menarik seluruh tabel, yang justru biaya yang
 *  dihindari delta-sync.
 */
export async function syncManifest(key: SyncKey) {
  const { table, key: k } = SYNC_TABLES[key];
  return supabaseJson('GET', table, {
    query: { select: `${k},updated_at`, limit: '1000', order: `${k}.asc` },
  });
}
