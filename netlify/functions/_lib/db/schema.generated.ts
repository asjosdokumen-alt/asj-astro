/**
 * db/schema.generated.ts — AUTO-GENERATED — DO NOT EDIT BY HAND.
 *
 * Source  : PostgREST OpenAPI document of the live database
 * Digest  : sha256:c027ef1e05d5f7a354ad7d617314dcf0259fe3112e25b4b11daab07934b64136
 * Tables  : 25
 *
 * Regenerate : npm run db:schema
 * Verify     : npm run verify:schema   (pre-deploy; needs SUPABASE_URL +
 *                                        SUPABASE_SERVICE_ROLE_KEY)
 *
 * The column lists below are the ONLY column names this codebase may put in a
 * `select=` projection. Naming anything else makes PostgREST answer 400, and
 * the surrounding code falls back to a full-table read — silently undoing the
 * projection it was asked to use. That is why this file is generated rather
 * than curated, and why drift is a build failure.
 */

/** sha256 over `table:col,col,…` for every table, sorted by table name. */
export const SCHEMA_FINGERPRINT = 'sha256:c027ef1e05d5f7a354ad7d617314dcf0259fe3112e25b4b11daab07934b64136' as const;

/**
 * The contract, one line per table: `<table>:<col>,<col>,…`.
 *
 * Stored as a string rather than an object literal on purpose: this module is
 * bundled into every one of the 19 entry points, and the literal form (quoted
 * key, quoted column, comma, indent — per column) cost ~4 KB more per bundle
 * for exactly the same information. Parsed once, at module load.
 */
const SCHEMA_LINES = `
ai_form_submissions:id,created_at,updated_at,wa,nama_lengkap,mode,job_code,bidang,status,ai_data_json,ai_updated_at,photo_url,jft_url,ssw_url,submitted_via
data_archive:id,source_sheet,archived_at,row_data
database_asj_form:id,timestamp,code_job,kategory,nama_lengkap,no_wa,gender,usia,tb,bb,pas_photo,jft,ssw,file_cv,folder_name,folder_id,folder_url,status,email,tempat_lahir,tgl_lahir,alamat_lengkap,created_at,updated_at,keterangan,ai_data_json,feedback_berkas
database_candidate:id,id_kandidat,nama_lengkap,nik,gender,usia,tb,bb,pendidikan,no_wa,id_loker_pilihan,tahapan_seleksi,status_kandidat,tanggal_daftar,catatan_admin,pas_photo,folder_url,jft,ssw,file_cv,password_kandidat,no_pasport,email,tempat_lahir,tgl_lahir,alamat_lengkap,catatan_internal,catatan_external,nilai_jft_text,bidang_ssw_text,created_at,updated_at,password_diubah
database_schedule:id,id_jadwal,nama_agenda,id_loker_terkait,tanggal_waktu,lokasi_link,daftar_kandidat,tsk,status_jadwal,created_at,updated_at,reminder_sent,reminder_h7_sent,reminder_h1_sent
database_tugas:id,id_tugas,nama_tugas,dibuat_oleh,waktu_dibuat,dikerjakan_oleh,status,waktu_selesai,created_at,updated_at
dependency_calls:id,ts,dep,action,budget_ms,duration_ms,outcome,status_code,attempts,breaker_state
esignatures:id,created_at,updated_at,wa,nama_kandidat,ttd1_url,nama1_url,ttd2_url,nama2_url,submitted_via
fcm_tokens:id,wa,token,device_info,created_at,last_used_at
idempotency_keys:key,result,created_at
job_database:code_job,tsk,kategori,pekerjaan,lokasi,gender,kuota,jumlah_kandidat,status,syarat,keterangan,tahapan,format_cv,link_pamflet,total_biaya,rincian_biaya,dokumen_share
job_queue:id,type,payload,idempotency_key,status,attempts,max_attempts,run_after,locked_until,last_error,created_at
master_database_candidate:id,id_kandidat,nama_lengkap,furigana,namapanggilan,panggilan_katakana,gender,tgl_lahir,tempat_lahir,tempat_lahir_jp,usia,golongan_darah,agama,religion,agama_jp,status_pernikahan,status_pernikahan_jp,pasangan,jumlah_anak,nik,no_paspor,driver_license,status_eks_jepang,alamat_lengkap,alamat_jp,no_wa,email,kontak_darurat_nama,kontak_darurat_wa,tb,bb,ukuranbaju,ukuransepatu,ukuran_topi,tangandominan,mata_kiri,mata_kanan,kacamata,buta_warna,tahan_ac,tato,tindik,merokok,minum_alkohol,alergi,alergi_jp,riwayat_penyakit,riwayat_medis_jp,riwayat_kecelakaan,riwayat_kecelakaan_jp,bahasa,jft,ssw,bidang,lamakerjadiharapkan,harapan_gaji_yen,harapan_tabungan,keluarga_1_nama,keluarga_1_usia,keluarga_1_hubungan,keluarga_1_hubungan_jp,keluarga_1_pekerjaan,keluarga_1_pekerjaan_jp,promosi_diri,promosi_diri_jp,kelebihan,kelebihan_jp,kekurangan,kekurangan_jp,hobi_dan_keterampilan,hobi_jp,keahlian_khusus,keahlian_khusus_jp,motivasi_ke_jepang,motivasi_ke_jepang_jp,alasan_memilih_bidang,alasan_memilih_bidang_jp,tujuan_ke_jepang,keinginan_pribadi,rencana_setelah_pulang,rencana_setelah_pulang_jp,riwayatpendidikan,pendidikan_1_tingkat,pendidikan_1_nama_sekolah,pendidikan_1_sekolah_jp,pendidikan_1_tahun_masuk,pendidikan_1_tahun_lulus,pendidikan_2_tingkat,pendidikan_2_nama_sekolah,pendidikan_2_sekolah_jp,pendidikan_2_tahun_masuk,pendidikan_2_tahun_lulus,pendidikan_3_tingkat,pendidikan_3_nama_sekolah,pendidikan_3_sekolah_jp,pendidikan_3_jurusan_id,pendidikan_3_jurusan_jp,pendidikan_3_tahun_masuk,pendidikan_3_tahun_lulus,pekerjaan_1_nama_perusahaan,pekerjaan_1_perusahaan_jp,pekerjaan_1_jabatan,pekerjaan_1_jabatan_jp,pekerjaan_1_tahun_masuk,pekerjaan_1_tahun_keluar,pekerjaan_1_gaji,pekerjaan_2_nama_perusahaan,pekerjaan_2_perusahaan_jp,pekerjaan_2_jabatan,pekerjaan_2_jabatan_jp,pekerjaan_2_tahun_masuk,pekerjaan_2_tahun_keluar,pekerjaan_3_nama_perusahaan,pekerjaan_3_jabatan,pekerjaan_3_tahun_masuk,pekerjaan_3_tahun_keluar,ai_data_json,ai_updated_at,pas_photo,file_cv,jft_url,ssw_url,folder_url,alasan_memilih_bidang_jp_1,bidangssw,created_at,updated_at,keinginan_pribadi_jp,tujuan_ke_jepang_jp,kontak_darurat_hubungan,kenalan_di_jepang_nama,kenalan_di_jepang_hubungan,tgl_terbit_pasport,exp_pasport,kota_terbit_pasport,no_coe,riwayat_pekerjaan_json,riwayat_keluarga_json,pendidikan_4_tingkat,pendidikan_4_nama_sekolah,pendidikan_4_sekolah_jp,pendidikan_4_tahun_masuk,pendidikan_4_tahun_lulus,pendidikan_5_tingkat,pendidikan_5_nama_sekolah,pendidikan_5_sekolah_jp,pendidikan_5_tahun_masuk,pendidikan_5_tahun_lulus,ijazah_sd_url,ijazah_smp_url,ijazah_sma_url,univ_url,ktp_url,kk_url,pendidikan_1_jurusan_jp,pendidikan_2_jurusan_jp,pendidikan_4_jurusan_jp,pendidikan_5_jurusan_jp,pekerjaan_3_jabatan_jp,pekerjaan_3_perusahaan_jp,keluarga_2_hubungan_jp,keluarga_3_hubungan_jp,keluarga_4_hubungan_jp,keluarga_5_hubungan_jp,kenalan_di_jepang_nama_jp,kenalan_di_jepang_hubungan_jp,kenalan_di_jepang_pekerjaan_jp,kenalan_di_jepang_usia_jp,kenalan_di_jepang_alamat_jp
meta_rev:domain,rev,updated_at
netlify_logs:id,ts,source,payload
pemberkasan_checklist:id,created_at,updated_at,wa,nama_lengkap,tahap,kk_url,akte_url,sd_url,smp_url,sma_url,pasport_url,mcu_url,kontrak_url,cert_url,ktp_url,foto2_url,ijinortu_url,cpmi_url,kawin_url,sehat_url,bpjs_url,psikotes_url,univ_url
rate_counters:bucket,window_start,count,fails,locked_until
respon_siswa_baru:id,timestamp,nama_lengkap,alamat_email,jenis_kelamin,alamat_lengkap,tempat_tanggal_lahir,agama,nomor_wa_peserta,nomor_wa_orangtua,pendidikan_terakhir,file_ktp,file_kk,file_ijazah,created_at,updated_at
rincian_presets:id,kategori,item,created_at
schedule_reminders:id,created_at,schedule_id,nama_agenda,target_admin,sent_at,status
schema_migrations:version,name,checksum,applied_at,applied_by,execution_ms
siswa_baru_docs:id,created_at,wa_siswa,nama_lengkap,ktp_url,kk_url,ijazah_url,submitted_via
sys_config:id,config_type,config_value,deskripsi,is_active,created_at
user_sessions:id,session_token,mode,identifier,created_at,expires_at,last_active,ip_address
wa_templates:id,nama,isi,created_at,updated_at
`;

/** Table name → column names, in PostgREST order. */
export const TABLE_COLUMNS: Record<string, readonly string[]> = Object.freeze(
  Object.fromEntries(
    SCHEMA_LINES.trim().split('\n').map((line) => {
      const i = line.indexOf(':');
      return [line.slice(0, i), Object.freeze(line.slice(i + 1).split(','))];
    }),
  ),
);

/** Every table this database exposes over PostgREST. */
export type TableName =
  | "ai_form_submissions"
  | "data_archive"
  | "database_asj_form"
  | "database_candidate"
  | "database_schedule"
  | "database_tugas"
  | "dependency_calls"
  | "esignatures"
  | "fcm_tokens"
  | "idempotency_keys"
  | "job_database"
  | "job_queue"
  | "master_database_candidate"
  | "meta_rev"
  | "netlify_logs"
  | "pemberkasan_checklist"
  | "rate_counters"
  | "respon_siswa_baru"
  | "rincian_presets"
  | "schedule_reminders"
  | "schema_migrations"
  | "siswa_baru_docs"
  | "sys_config"
  | "user_sessions"
  | "wa_templates"
  ;

/** Named table constants, emitted only while the table is exposed. */
export const TABLE_CANDIDATE = "database_candidate" as const;
export const TABLE_MASTER = "master_database_candidate" as const;
export const TABLE_FORM = "database_asj_form" as const;
export const TABLE_JOB = "job_database" as const;
export const TABLE_FCM = "fcm_tokens" as const;
export const TABLE_SCHEDULE = "database_schedule" as const;
export const TABLE_TASK = "database_tugas" as const;
export const TABLE_CONFIG = "sys_config" as const;
export const TABLE_SESSION = "user_sessions" as const;
export const TABLE_RINCIAN = "rincian_presets" as const;
export const TABLE_AI_SUBMISSION = "ai_form_submissions" as const;

/**
 * The WA column per table. Derived from the live column list — the codebase
 * used to probe seven aliases per table, six of which do not exist, paying a
 * failed round-trip each time.
 */
export const CANDIDATE_WA_COL = "no_wa" as const;
export const MASTER_WA_COL = "no_wa" as const;
export const FORM_WA_COL = "no_wa" as const;
export const FCM_WA_COL = "wa" as const;

/** Column names for `table`, or undefined when the table is not exposed. */
export function columnsOf(table: string): readonly string[] | undefined {
  return TABLE_COLUMNS[table];
}

/** True when `table` is exposed and has a column named `column`. */
export function hasColumn(table: string, column: string): boolean {
  const cols = columnsOf(table);
  return !!cols && cols.includes(column);
}

/**
 * Build a PostgREST `select=` value from an explicit column list.
 *
 * Throws when a name is not in the live schema: a projection that names a
 * column PostgREST does not have is not a smaller read, it is a failed
 * request that the caller then retries unfiltered. Failing here is the point.
 */
export function project(table: string, columns: readonly string[]): string {
  const known = columnsOf(table);
  if (!known) throw new Error(`project(): unknown table ${table}`);
  for (const c of columns) {
    if (!known.includes(c)) {
      throw new Error(`project(): ${table} has no column ${c}`);
    }
  }
  return columns.join(',');
}

/** Every column of `table` — for reads that genuinely need the whole row.
 *  It is still an explicit list, so it stays checkable; list endpoints should
 *  prefer a named projection from ./projections.ts. */
export function allColumns(table: string): string {
  const known = columnsOf(table);
  if (!known) throw new Error(`allColumns(): unknown table ${table}`);
  return known.join(',');
}
