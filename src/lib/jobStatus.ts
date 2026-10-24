/**
 * jobStatus.ts — SATU pemilik aturan status lowongan untuk sisi tampilan.
 *
 * ── MASALAH YANG DIKUNCI (diukur 2026-10-25) ────────────────────────────────
 * Kolom `job_database.status` berisi teks bebas dari sistem lama, bukan enum:
 *   `❌ CLOSE` (151 baris) · `CLOSE` · `SELESAI / CLOSE` · `PROSES INTERVIEW` ·
 *   `PEMBERKASAN` · `APPROVED` · string kosong.
 * Panel admin menampilkan nilai MENTAH itu di kolom Status, sementara warnanya
 * dicari lewat pencocokan persis (`STATUS_BADGE[s.toUpperCase()]`). Akibatnya
 * `❌ CLOSE` tidak cocok dengan kunci `CLOSE`, jatuh ke warna default, dan teks
 * yang terlihat tetap `❌ CLOSE` — persis yang dilaporkan pemilik: "kok ada yang
 * beda penulisan close-nya".
 *
 * ── HUBUNGAN DENGAN BACKEND ────────────────────────────────────────────────
 * Aturan yang sama sudah ada di backend: `normalizeStatus()` di
 * `netlify/functions/_lib/db/client.ts`. Berkas ini adalah SALINAN untuk
 * tampilan, disengaja seperti `shared/wa-rules.ts` (dua salinan + paritas
 * dipaku tes) karena bundel Netlify tidak menjangkau `src/` dan sebaliknya.
 * Kalau aturan backend berubah, ubah di sini juga — `e2e/job-status.test.ts`
 * memaku tabel kasusnya.
 *
 * ── YANG DITULIS BALIK KE DATABASE ─────────────────────────────────────────
 * Tombol admin menulis nilai KANONIK (`OPEN` / `CLOSE`), bukan emoji. Itu
 * sebabnya baris yang pernah ditekan berubah jadi `CLOSE` polos sementara
 * 151 baris warisan masih `❌ CLOSE`. Data lama TIDAK dimigrasikan otomatis:
 * `PROSES INTERVIEW`, `PEMBERKASAN`, `APPROVED` adalah tahap pipeline yang
 * nyata (lihat `database_candidate.status_kandidat`), jadi memaksanya jadi
 * OPEN/CLOSE akan menghapus informasi.
 */

export type JobStatusKey = 'OPEN' | 'CLOSE' | 'URGENT';

/**
 * Nilai mentah → kunci kanonik. Urutannya penting: URGENT menang atas
 * segalanya, string kosong dianggap CLOSE (sama seperti backend: lowongan tanpa
 * status tidak boleh tampil sebagai "buka").
 */
export function jobStatusKey(raw: unknown): JobStatusKey {
  const s = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (s.includes('URGENT')) return 'URGENT';
  if (s === '') return 'CLOSE';
  if (s.includes('CLOSE') || s.includes('TUTUP') || s.includes('SELESAI')) return 'CLOSE';
  return 'OPEN';
}

/** Kunci i18n untuk label yang ditampilkan (lihat `status.*` di `store/i18n.ts`). */
export const JOB_STATUS_LABEL_KEY: Record<JobStatusKey, string> = {
  OPEN: 'status.open',
  CLOSE: 'status.close',
  URGENT: 'status.urgent',
};

/** Nilai yang dikirim ke backend saat admin menekan tombol status. */
export const JOB_STATUS_WRITE: Record<'OPEN' | 'CLOSE', string> = {
  OPEN: 'OPEN',
  CLOSE: 'CLOSE',
};

/** Kelas pill untuk tabel admin (tema gelap). */
export function jobStatusBadgeClass(key: JobStatusKey): string {
  if (key === 'OPEN') return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  if (key === 'URGENT') return 'bg-red-500/20 text-red-300 border-red-500/40';
  return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
}

/**
 * Teks pendek untuk tempat yang tidak punya akses i18n (mis. tabel statis yang
 * dibekukan saat build). Sengaja bahasa-netral: ini DATA, bukan label UI.
 */
export function jobStatusText(raw: unknown): string {
  return jobStatusKey(raw);
}
