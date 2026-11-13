/**
 * documentColumns.ts — SINGLE OWNER of the client file-key → payload-key map.
 *
 * Design pass (2026-09-05): the same mapping existed verbatim as
 * FILE_TO_PAYLOAD (MasterFullForm) and DOC_TO_PAYLOAD (AiCvForm); the backend
 * persists the payload keys via MASTER_FILE_COLUMNS in
 * netlify/functions/contexts/master-data/service.ts (NOT changed here).
 * Adding a document type now touches exactly one client file + the backend
 * map instead of two inline copies.
 */

/** Master-full form (C02): uploads state key → flat submitMasterForm payload key. */
export const MASTER_FILE_COLUMNS: Record<string, string> = {
  photo: 'photoFile', jft: 'jftFile', ssw: 'sswFile',
  ijazahSd: 'ijazahSdFile', ijazahSmp: 'ijazahSmpFile', ijazahSma: 'ijazahSmaFile',
  univ: 'univFile', ktpFile: 'ktpFile', kk: 'kkFile',
};

/** Ai-cv form (C03): uploads state key → nested submitDataAsj payload key. */
export const AI_FILE_COLUMNS: Record<string, string> = {
  foto: 'fotoFile', jft: 'jftFile', ssw: 'sswFile',
  ktp: 'ktpFile', kk: 'kkFile',
  ijazahSd: 'ijazahSdFile', ijazahSmp: 'ijazahSmpFile',
  ijazahSma: 'ijazahSmaFile', univ: 'univFile',
  /* SIM A — permintaan pemilik 2026-11-13: sel kosong di samping "Sertifikat
     SSW" diisi tempat unggah SIM. Berbeda dari delapan berkas di atas, SIM
     TIDAK punya kolom di `master_database_candidate` (kolom `driver_license`
     hanya menyimpan NOMORNYA). Karena itu server menyimpannya di
     `ai_data_json.berkas.sim_url`, bukan di kolom — supaya tidak perlu migrasi
     dan tidak ada risiko PGRST204 pada deploy. */
  sim: 'simFile',
};

/** Siswa-baru form (C04): identity map (state key == payload key). */
export const SISWA_FILE_COLUMNS: Record<string, string> = {
  ktp: 'ktp', kk: 'kk', ijazah: 'ijazah',
};

