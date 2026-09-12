/**
 * db/projections.ts — the column projections this codebase asks PostgREST for.
 *
 * WHY THIS FILE EXISTS
 *   `select=*` is not a convenience here, it is a cost: `master_database_candidate`
 *   is 169 columns / ~1.14 KB per row, and the public board reads 500 rows in one
 *   go. The codebase used to carry `select: '*'` in 36 places plus several
 *   implicit wildcards (`supabaseJson` calls with no `select` at all — PostgREST
 *   defaults to `*`).
 *
 *   Worse, the narrow projections that did exist were paired with a silent
 *   fallback: if the projection was rejected, the same function retried with no
 *   projection and the full row came back anyway. A typo in a projection
 *   therefore did not fail — it quietly restored the read the projection was
 *   written to remove.
 *
 * HOW IT IS ENFORCED
 *   1. `supabaseJson()` resolves every read through `schema.generated.ts`, so a
 *      wildcard cannot reach the wire even if a call site asks for one.
 *   2. `npm run verify:projections` fails the build on any literal `select: '*'`
 *      in `netlify/functions/**`.
 *   3. `projections.test.ts` checks every entry below against the generated
 *      contract — a name that is not in the live schema is a red test, not a
 *      silent full-table read.
 *
 * SHAPE
 *   Each projection is stored once, as the comma-joined `select=` value, with
 *   the table it belongs to beside it. The named exports at the bottom are just
 *   aliases, so a column list is never written twice — this module is bundled
 *   into every function, and the previous two-copies-per-projection layout cost
 *   ~2.5 KB per bundle for no extra information.
 *
 * ADDING A PROJECTION
 *   Add an entry to `PROJECTIONS` with the table it belongs to and exactly the
 *   columns the consuming code reads, then export it by name. The test does the
 *   rest.
 */

import type { TableName } from './schema.generated';

/**
 * Every projection, keyed by the constant name the rest of the code imports.
 * `table` is what the test validates `columns` against.
 */
export const PROJECTIONS = {
  /** Admin candidate list — dedupe by WA, keyword filter, sort by updated_at. */
  CAND_LIGHT_COLS: {
    table: 'database_candidate',
    columns: 'id,id_kandidat,nama_lengkap,no_wa,status_kandidat,id_loker_pilihan,tahapan_seleksi,updated_at,created_at,tanggal_daftar',
  },
  /** Everything `mapCandidate()` reads. */
  CAND_MAP_COLS: {
    table: 'database_candidate',
    columns: 'id,id_kandidat,nama_lengkap,nik,gender,usia,tb,bb,pendidikan,no_wa,id_loker_pilihan,tahapan_seleksi,status_kandidat,tanggal_daftar,catatan_admin,pas_photo,folder_url,jft,ssw,file_cv,password_kandidat,no_pasport,email,tempat_lahir,tgl_lahir,alamat_lengkap,catatan_internal,catatan_external,nilai_jft_text,bidang_ssw_text,created_at,updated_at,password_diubah',
  },
  /** Login / refresh: the four columns auth actually reads. */
  CAND_AUTH_COLS: {
    table: 'database_candidate',
    columns: 'id,no_wa,nama_lengkap,password_kandidat',
  },
  /**
   * Master rows for `attachBerkasBio` — BERKAS_COLUMNS (*_url) + BIO_COLUMNS +
   * the WA matcher. Deliberately narrow: the full row is 169 columns.
   */
  MASTER_LIGHT_COLS: {
    table: 'master_database_candidate',
    columns: 'id,id_kandidat,nama_lengkap,no_wa,kk_url,ijazah_sd_url,ijazah_smp_url,ijazah_sma_url,univ_url,ktp_url,email,tempat_lahir,tgl_lahir,alamat_lengkap,no_coe,exp_pasport,no_paspor,kota_terbit_pasport,tgl_terbit_pasport,keluarga_1_nama,pekerjaan_1_nama_perusahaan',
  },
  /** Mail inbox row — everything `mapForm()` reads. */
  FORM_LIGHT_COLS: {
    table: 'database_asj_form',
    columns: 'id,timestamp,code_job,kategory,nama_lengkap,no_wa,status,folder_url,pas_photo,jft,ssw,file_cv,keterangan,feedback_berkas,created_at,updated_at',
  },
  /** Everything `mapJob()` reads. */
  JOB_MAP_COLS: {
    table: 'job_database',
    columns: 'code_job,tsk,kategori,pekerjaan,lokasi,gender,kuota,jumlah_kandidat,status,syarat,keterangan,tahapan,format_cv,link_pamflet,total_biaya,rincian_biaya,dokumen_share',
  },
  /** Agenda rows for the admin schedule list. */
  SCHEDULE_MAP_COLS: {
    table: 'database_schedule',
    columns: 'id,id_jadwal,nama_agenda,id_loker_terkait,tanggal_waktu,lokasi_link,daftar_kandidat,tsk,status_jadwal',
  },
  /** Active schedules + the reminder bookkeeping the reminder job reads. */
  SCHEDULE_REMINDER_COLS: {
    table: 'database_schedule',
    columns: 'id,id_jadwal,nama_agenda,id_loker_terkait,tanggal_waktu,lokasi_link,daftar_kandidat,tsk,status_jadwal,reminder_sent,reminder_h7_sent,reminder_h1_sent,created_at,updated_at',
  },
  /** Task rows for the admin task list. */
  TASK_MAP_COLS: {
    table: 'database_tugas',
    columns: 'id,id_tugas,nama_tugas,dibuat_oleh,waktu_dibuat,status',
  },
  /** WA template rows. */
  WA_TEMPLATE_COLS: {
    table: 'wa_templates',
    columns: 'id,nama,isi,created_at,updated_at',
  },
  /**
   * sys_config KV rows. Note: there is no `config_key` column in this table —
   * `_lib/db/shareTokens.ts` filters on `config_type` and then reads a
   * `config_key` field that does not exist (see docs/PHASE_D_DATA_LAYER.md).
   */
  SYS_CONFIG_COLS: {
    table: 'sys_config',
    columns: 'id,config_type,config_value,deskripsi,is_active,created_at',
  },
  /** Cost-breakdown presets. */
  RINCIAN_PRESET_COLS: {
    table: 'rincian_presets',
    columns: 'id,kategori,item,created_at',
  },
  /** Checklist rows — the document columns BERKAS_COLUMNS looks for. */
  PEMBERKASAN_COLS: {
    table: 'pemberkasan_checklist',
    columns: 'id,created_at,updated_at,wa,nama_lengkap,tahap,kk_url,akte_url,sd_url,smp_url,sma_url,pasport_url,mcu_url,kontrak_url,cert_url,ktp_url,foto2_url,ijinortu_url,cpmi_url,kawin_url,sehat_url,bpjs_url,psikotes_url,univ_url',
  },
  /** AI/interview submissions. `ai_data_json` is the payload, so the row is small. */
  AI_SUBMISSION_COLS: {
    table: 'ai_form_submissions',
    columns: 'id,created_at,updated_at,wa,nama_lengkap,mode,job_code,bidang,status,ai_data_json,ai_updated_at,photo_url,jft_url,ssw_url,submitted_via',
  },
  /** E-signature rows. */
  ESIGNATURE_COLS: {
    table: 'esignatures',
    columns: 'id,created_at,updated_at,wa,nama_kandidat,ttd1_url,nama1_url,ttd2_url,nama2_url,submitted_via',
  },
  /** Queue row for status polling — `payload` carries the result. */
  JOB_QUEUE_COLS: {
    table: 'job_queue',
    columns: 'id,type,payload,idempotency_key,status,attempts,max_attempts,run_after,locked_until,last_error,created_at',
  },
  /** Idempotency replay row. */
  IDEMPOTENCY_KEY_COLS: {
    table: 'idempotency_keys',
    columns: 'key,result,created_at',
  },
  /** Push tokens for a set of WA numbers. */
  FCM_TOKEN_COLS: {
    table: 'fcm_tokens',
    columns: 'token,wa,last_used_at',
  },
} as const satisfies Record<string, { table: TableName; columns: string }>;

export type ProjectionName = keyof typeof PROJECTIONS;

export const CAND_LIGHT_COLS = PROJECTIONS.CAND_LIGHT_COLS.columns;
export const CAND_MAP_COLS = PROJECTIONS.CAND_MAP_COLS.columns;
export const CAND_AUTH_COLS = PROJECTIONS.CAND_AUTH_COLS.columns;
export const MASTER_LIGHT_COLS = PROJECTIONS.MASTER_LIGHT_COLS.columns;
export const FORM_LIGHT_COLS = PROJECTIONS.FORM_LIGHT_COLS.columns;
export const JOB_MAP_COLS = PROJECTIONS.JOB_MAP_COLS.columns;
export const SCHEDULE_MAP_COLS = PROJECTIONS.SCHEDULE_MAP_COLS.columns;
export const SCHEDULE_REMINDER_COLS = PROJECTIONS.SCHEDULE_REMINDER_COLS.columns;
export const TASK_MAP_COLS = PROJECTIONS.TASK_MAP_COLS.columns;
export const WA_TEMPLATE_COLS = PROJECTIONS.WA_TEMPLATE_COLS.columns;
export const SYS_CONFIG_COLS = PROJECTIONS.SYS_CONFIG_COLS.columns;
export const RINCIAN_PRESET_COLS = PROJECTIONS.RINCIAN_PRESET_COLS.columns;
export const PEMBERKASAN_COLS = PROJECTIONS.PEMBERKASAN_COLS.columns;
export const AI_SUBMISSION_COLS = PROJECTIONS.AI_SUBMISSION_COLS.columns;
export const ESIGNATURE_COLS = PROJECTIONS.ESIGNATURE_COLS.columns;
export const JOB_QUEUE_COLS = PROJECTIONS.JOB_QUEUE_COLS.columns;
export const IDEMPOTENCY_KEY_COLS = PROJECTIONS.IDEMPOTENCY_KEY_COLS.columns;
export const FCM_TOKEN_COLS = PROJECTIONS.FCM_TOKEN_COLS.columns;
