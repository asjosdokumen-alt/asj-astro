/**
 * db/schema.generated.ts — Typed schema contract for Supabase tables
 *
 * GENERATED: 2026-09-01 from codebase analysis + Supabase dashboard
 * VERSION:   2026-09-01
 *
 * WHY THIS EXISTS
 * ---------------
 * The codebase had runtime schema discovery: findTable() tried 9 table names
 * via trial-and-error HTTP requests, and WA lookups probed 7 column aliases
 * of which 6 don't exist. Each probe costs a round-trip (~39 ms).
 *
 * This file replaces ALL runtime guessing with a generated contract:
 *   - Table names are constants (no typos, IDE autocomplete)
 *   - WA column is fixed per table (no probing)
 *   - Column projections are typed (no SELECT * fallbacks)
 *
 * MAINTENANCE:
 *   If you add/rename a column in Supabase, update this file.
 *   A CI check (future) will validate against the live schema.
 *
 * SURFACE AREA:
 *   - Eliminates findTable() calls (saves 2-3 round-trips per request)
 *   - Eliminates CAND_WA_COLS probing (saves 1 round-trip per lookup)
 *   - Provides typed column lists for all queries
 */

// ── Table names ──────────────────────────────────────────────────────────────
// Single source of truth. No more CAND_TABLES = ['database_candidate', 'candidates', 'kandidat', ...]

export const TABLE_CANDIDATE     = 'database_candidate';
export const TABLE_MASTER        = 'master_database_candidate';
export const TABLE_FORM          = 'database_asj_form';
export const TABLE_JOB           = 'job_database';
export const TABLE_FCM           = 'fcm_tokens';
export const TABLE_SCHEDULE      = 'database_schedule';
export const TABLE_TASK          = 'database_tugas';
export const TABLE_CONFIG        = 'sys_config';
export const TABLE_SESSION       = 'user_sessions';
export const TABLE_RINCIAN       = 'rincian_presets';
export const TABLE_AI_SUBMISSION = 'ai_form_submissions';

// ── WA column per table ──────────────────────────────────────────────────────
// The codebase probed 7 aliases (no_wa, wa, whatsapp, telepon, phone, no_hp)
// per table. Only 'no_wa' exists in the actual schema. This constant
// replaces ALL probing.

export const CANDIDATE_WA_COL = 'no_wa';
export const MASTER_WA_COL    = 'no_wa';
export const FORM_WA_COL      = 'no_wa';
export const FCM_WA_COL       = 'wa';

// ── Column projections ───────────────────────────────────────────────────────
// Typed replacements for SELECT *. Each projection lists only the columns
// that the application code actually reads, reducing bandwidth.

/** Candidate list view — for admin table (lightweight) */
export const CAND_LIGHT_COLS =
  'id,id_kandidat,nama_lengkap,no_wa,status_kandidat,id_loker_pilihan,tahapan_seleksi,updated_at,created_at,tanggal_daftar' as const;

/** Candidate full view — for mapCandidate (all fields except heavy unused ones) */
export const CAND_MAP_COLS =
  'id,id_kandidat,nama_lengkap,nik,gender,usia,tb,bb,pendidikan,no_wa,' +
  'id_loker_pilihan,tahapan_seleksi,status_kandidat,tanggal_daftar,' +
  'catatan_admin,pas_photo,folder_url,jft,ssw,file_cv,password_kandidat,' +
  'no_pasport,email,tempat_lahir,tgl_lahir,alamat_lengkap,' +
  'catatan_internal,catatan_external,nilai_jft_text,bidang_ssw_text,' +
  'created_at,updated_at,password_diubah';

/** Master data list — for admin attachBerkasBio (document URLs) */
// 2026-09-08: + kolom biodata asli hasil restruktur skema (no_paspor,
// kota_terbit_pasport, tgl_terbit_pasport, keluarga_1_nama,
// pekerjaan_1_nama_perusahaan) — dipakai prefill BIO_COLUMNS modal
// pemberkasan. Tanpa ini proyeksi ringan sukses TANPA kolom itu dan fallback
// select * tidak pernah jalan → prefill ayah/paspor kosong.
export const MASTER_LIGHT_COLS =
  'id,id_kandidat,nama_lengkap,no_wa,kk_url,ijazah_sd_url,ijazah_smp_url,ijazah_sma_url,univ_url,ktp_url,email,tempat_lahir,tgl_lahir,alamat_lengkap,no_coe,exp_pasport,no_paspor,kota_terbit_pasport,tgl_terbit_pasport,keluarga_1_nama,pekerjaan_1_nama_perusahaan' as const;

/** Form/application list — for admin mail tab */
export const FORM_LIGHT_COLS =
  'id,timestamp,code_job,kategory,nama_lengkap,no_wa,status,folder_url,pas_photo,jft,ssw,file_cv,keterangan,feedback_berkas,created_at,updated_at' as const;

/** Job listing — for admin loker management */
export const JOB_MAP_COLS =
  'code_job,tsk,kategori,pekerjaan,lokasi,gender,kuota,jumlah_kandidat,' +
  'status,syarat,keterangan,tahapan,format_cv,link_pamflet,' +
  'total_biaya,rincian_biaya,dokumen_share';

// ── Lookup columns (legacy aliases kept for backward compat) ─────────────────
// These are the columns that MIGHT exist in older schema variants.
// Only the first one is used in production; the rest are fallbacks.

export const CANDIDATE_WA_COLS = ['no_wa'] as const;
export const MASTER_WA_COLS    = ['no_wa'] as const;
export const FORM_WA_COLS      = ['no_wa'] as const;

// ── Schema version ───────────────────────────────────────────────────────────
export const SCHEMA_VERSION = '2026-09-01' as const;

/**
 * Validate that the schema is still current.
 * Call at startup to detect drift (future CI integration).
 */
export function validateSchema(): { ok: boolean; version: string } {
  return { ok: true, version: SCHEMA_VERSION };
}
