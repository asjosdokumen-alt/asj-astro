/**
 * e2e/ai-cv-column-coverage.test.ts — GATE anti-drift antara CV AI dan kolom master.
 *
 * MASALAH YANG DIKUNCI
 * --------------------
 * Keluhan pemilik 2026-10-22: *"cv ai dan form master semua menulis dan sync ke
 * masterdatabase, harusnya datanya sama kok bisa beda"*. Betul: Form Master
 * menulis KOLOM (`buildMasterBody`), jalur CV AI hanya menulis `ai_data_json`.
 * Diukur lewat REST: 687 sel kosong di 56 baris.
 *
 * Perbaikannya (`masterColumnsFromAi`) hanya menutup kerusakan yang SUDAH
 * terjadi. Yang membuatnya tidak terulang adalah tes ini: setiap field yang
 * dikumpulkan form CV AI harus punya tujuan yang DISENGAJA — entah sebuah
 * kolom master, atau terdaftar eksplisit sebagai "tidak punya kolom".
 *
 * Tanpa gate ini, menambah satu field di `AiCvForm` (→ `AI_CV_PATHS`) diam-diam
 * mengulang bug yang sama: datanya masuk `ai_data_json`, kolomnya kosong, dan
 * tidak ada satu pun tes yang merah.
 *
 * MENGAPA DI e2e/
 * ---------------
 * Ia meng-import DUA dunia sekaligus: `src/lib/aiCvDraft.ts` (frontend) dan
 * `contexts/master-data` (backend). Tier `indexer` yang beku hanya menghitung
 * mjs/cjs/js di `e2e/`, jadi `.ts` di sini tidak memindahkan counter (R13f).
 * WAJIB terdaftar di `exclude` project `frontend` pada `vitest.config.ts`, atau
 * ia berjalan di jsdom dan terhitung dua kali (R13f-bis).
 */
import { describe, it, expect } from 'vitest';
import { AI_CV_PATHS } from '../src/lib/aiCvDraft';
import { AI_TO_MASTER_COLUMNS } from '../netlify/functions/contexts/master-data/service';
import { TABLE_COLUMNS } from '../netlify/functions/_lib/db/schema.generated';

/** Semua path `seksi.kunci` yang punya tujuan kolom di `masterColumnsFromAi`. */
function coveredPaths(): Set<string> {
  const out = new Set<string>();
  for (const [section, rows] of Object.entries(AI_TO_MASTER_COLUMNS)) {
    for (const row of rows) {
      const keys = row.slice(1) as string[];
      for (const k of keys) out.add(`${section}.${k}`);
    }
  }
  return out;
}

/**
 * Field CV AI yang SENGAJA tidak punya kolom master. Setiap entri butuh alasan;
 * daftar ini adalah tempat keputusan itu dicatat, bukan tempat menyembunyikan
 * kelalaian. Kalau sebuah field baru muncul di sini tanpa alasan, review-nya
 * gagal — itu memang tujuannya.
 */
const NO_COLUMN_BY_DESIGN: Record<string, string> = {
  'identitas.gender_jp': 'kolom gender_jp tidak ada di kontrak skema',
  'identitas.paspor_status': 'hanya penanda UI (ADA/TIDAK); kolomnya no_paspor',
  'identitas.sim_status': 'hanya penanda UI (ADA/TIDAK); kolomnya driver_license',
  'identitas.hp': 'WA kandidat; kolomnya no_wa dan itu kunci join — ditulis eksplisit, bukan dari peta',
  'identitas.no_wa': 'idem: kunci join, ditulis eksplisit oleh pemanggil',
  // `wawancara.lama` dan `wawancara.lama_di_jepang` SUDAH DIPINDAHKAN
  // (2026-10-27). Dulu keduanya di sini dengan alasan "tidak ada kolom";
  // migrasi 022 memberi kolom `lama_di_jepang`, jadi pemetaannya pindah ke
  // `AI_TO_MASTER_COLUMNS` — persis pola yang dipakai `kenalan_*` di 019.
  'wawancara.riwayat_jepang': 'kolomnya status_eks_jepang, dipetakan dari identitas.status_eks_jepang',
  // TIGA BARIS DI SINI SUDAH DIPINDAHKAN (2026-10-25). Dulu isinya: "kolom
  // kenalan_di_jepang_pekerjaan/usia/alamat tidak ada". Migrasi 019 MENAMBAH
  // ketiganya, jadi pemetaannya pindah ke `AI_TO_MASTER_COLUMNS` — persis seperti
  // yang diminta catatan lama ("kalau migrasi menambah kolomnya, pindahkan").
  // `identitas.hp_darurat` juga keluar dari daftar ini: `kontak_darurat_wa`
  // ternyata tidak pernah ditulis jalur mana pun selain dari sini.
};

describe('CV AI → kolom master: tidak ada field yang diam-diam hilang', () => {
  it('setiap path yang dikumpulkan CV AI punya tujuan yang disengaja', () => {
    const covered = coveredPaths();
    const expected = new Set(Object.values(AI_CV_PATHS).flat());
    const uncovered = [...expected].filter((p) => !covered.has(p)).sort();
    const allowed = Object.keys(NO_COLUMN_BY_DESIGN).sort();
    expect(uncovered).toEqual(allowed);
  });

  it('kontrol: peta kolom benar-benar terbaca (bukan himpunan kosong)', () => {
    // Tanpa ini, `coveredPaths()` yang mengembalikan set kosong akan membuat
    // tes di atas membandingkan SEMUA path dengan allow-list dan hasilnya
    // kebetulan sama-sama panjang — hijau tanpa arti.
    const covered = coveredPaths();
    expect(covered.size).toBeGreaterThan(30);
    expect(covered.has('fisik.topi')).toBe(true);
    expect(covered.has('medis.mata_kiri')).toBe(true);
  });

  it('setiap kolom tujuan ada di kontrak skema (kunci hantu = 400 PGRST204)', () => {
    const known = TABLE_COLUMNS.master_database_candidate;
    const cols = new Set<string>();
    for (const rows of Object.values(AI_TO_MASTER_COLUMNS)) for (const row of rows) cols.add(row[0]);
    expect([...cols].filter((c) => !known.includes(c))).toEqual([]);
  });

  it('allow-list tidak menyimpan path yang sebenarnya SUDAH dipetakan', () => {
    // Kalau sebuah path kemudian dipetakan, entri allow-list-nya harus dihapus —
    // kalau tidak, daftar itu perlahan berubah jadi tempat sampah.
    const covered = coveredPaths();
    const stale = Object.keys(NO_COLUMN_BY_DESIGN).filter((p) => covered.has(p));
    expect(stale).toEqual([]);
  });
});
