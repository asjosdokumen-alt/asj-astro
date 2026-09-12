/**
 * db/row-types.ts — Raw DB row interfaces for all tables
 *
 * These represent the EXACT shape returned by PostgREST queries.
 * Context repositories use these instead of `any` for type safety.
 *
 * Column names match the Supabase schema (snake_case).
 */

// ── database_candidate ──────────────────────────────────────────────────────

export interface CandidateRawRow {
  id?: number;
  id_kandidat?: string;
  nama_lengkap?: string;
  nama?: string;
  gender?: string;
  usia?: string;
  tb?: string;
  bb?: string;
  no_wa?: string;
  wa?: string;
  whatsapp?: string;
  id_loker_pilihan?: string;
  id_loker?: string;
  tahapan_seleksi?: string;
  status_kandidat?: string;
  catatan_internal?: string;
  catatan_external?: string;
  pas_photo?: string;
  jft?: string;
  ssw?: string;
  file_cv?: string;
  password_kandidat?: string;
  password_diubah?: boolean;
  tanggal_daftar?: string;
  pendidikan?: string;
  email?: string;
  updated_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

// ── master_database_candidate ───────────────────────────────────────────────

export interface MasterRawRow {
  id?: number;
  id_kandidat?: string;
  nama_lengkap?: string;
  nama?: string;
  gender?: string;
  usia?: string;
  tb?: string;
  bb?: string;
  no_wa?: string;
  wa?: string;
  pas_photo?: string;
  jft_url?: string;
  ssw_url?: string;
  file_cv?: string;
  ktp_url?: string;
  kk_url?: string;
  updated_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

// ── database_asj_form ───────────────────────────────────────────────────────

export interface FormRawRow {
  id?: number;
  index?: number;
  code_job?: string;
  nama_lengkap?: string;
  no_wa?: string;
  wa?: string;
  gender?: string;
  usia?: string;
  tb?: string;
  bb?: string;
  status?: string;
  keterangan?: string;
  feedback_berkas?: string;
  timestamp?: string;
  pas_photo?: string;
  jft?: string;
  ssw?: string;
  file_cv?: string;
  updated_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

// ── job_database ────────────────────────────────────────────────────────────

export interface JobRawRow {
  id?: number;
  code_job?: string;
  code?: string;
  pekerjaan?: string;
  status?: string;
  kategori?: string;
  gender?: string;
  lokasi?: string;
  kuota?: string;
  jumlah_kandidat?: string;
  syarat?: string;
  keterangan?: string;
  format_cv?: string;
  link_pamflet?: string;
  tahapan?: string;
  total_biaya?: string;
  rincian_biaya?: string;
  dokumen_share?: string;
  tsk?: string;
  updated_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

// ── database_schedule ───────────────────────────────────────────────────────

export interface ScheduleRawRow {
  id?: number;
  id_jadwal?: string;
  agenda?: string;
  lokasi?: string;
  waktu?: string;
  tsk?: string;
  zoom_link?: string;
  id_loker?: string;
  updated_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

// ── database_tugas ──────────────────────────────────────────────────────────

export interface TugasRawRow {
  id?: number;
  id_tugas?: string;
  tugas?: string;
  status?: string;
  assigned_to?: string;
  id_loker?: string;
  updated_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

// ── sys_config ──────────────────────────────────────────────────────────────

// NOTE: there is deliberately no `config_key` here. The live table does not have
// that column (PostgREST answers 42703), and declaring it is what let the
// share-token gate look plausible while being unable to ever mint a token.
// See docs/PHASE_D_DATA_LAYER.md and the SYS_CONFIG_COLS note in projections.ts.
export interface SysConfigRawRow {
  id?: number;
  config_type?: string;
  config_value?: string;
  value?: string;
  updated_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

// ── wa_templates ────────────────────────────────────────────────────────────

export interface WaTemplateRawRow {
  id?: number;
  nama?: string;
  template?: string;
  updated_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

// ── fcm_tokens ──────────────────────────────────────────────────────────────

export interface FcmTokenRawRow {
  id?: number;
  wa?: string;
  token?: string;
  updated_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

// ── Union type for generic row handling ─────────────────────────────────────

export type AnyRawRow =
  | CandidateRawRow
  | MasterRawRow
  | FormRawRow
  | SysConfigRawRow
  | WaTemplateRawRow
  | FcmTokenRawRow
  | Record<string, unknown>;
