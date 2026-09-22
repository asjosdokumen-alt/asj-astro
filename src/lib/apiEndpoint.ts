/**
 * apiEndpoint.ts — Action-to-endpoint resolver
 *
 * Shared between apiClient.ts and components with raw fetch calls.
 * Maps action names to surface-specific Netlify function endpoints.
 *
 * Usage:
 *   import { getEndpoint } from '../lib/apiEndpoint';
 *   fetch(getEndpoint('loginKandidat'), { ... });
 */

const SURFACE_ENDPOINTS: Record<string, string> = {
  // Auth
  checkAdminMaster: '/.netlify/functions/auth',
  checkAdminPersonal: '/.netlify/functions/auth',
  refreshAdminSession: '/.netlify/functions/auth',
  loginKandidat: '/.netlify/functions/auth',
  refreshKandidatSession: '/.netlify/functions/auth',
  daftarKandidat: '/.netlify/functions/auth',
  gantiPasswordKandidat: '/.netlify/functions/auth',
  registerFcmToken: '/.netlify/functions/auth',

  // Public
  getAppData: '/.netlify/functions/get-app-data',
  getMonthlyReport: '/.netlify/functions/get-app-data',

  // Contact — the public contact form. Routed to its own entry so a burst of
  // submissions cannot take concurrency from the job-board reads, and so the
  // write never inherits the public surface's shared 60s CDN cache.
  kirimPesanKontak: '/.netlify/functions/kontak',

  // Candidates
  getCandidatesPage: '/.netlify/functions/candidates',
  updateCatatanKandidat: '/.netlify/functions/candidates',
  updateKandidatSuper: '/.netlify/functions/candidates',

  // Mail
  reviewForm: '/.netlify/functions/mail',
  approveForm: '/.netlify/functions/mail',
  rejectForm: '/.netlify/functions/mail',
  deleteForm: '/.netlify/functions/mail',
  hapusFormTerpilih: '/.netlify/functions/mail',
  tandaiDibacaForm: '/.netlify/functions/mail',

  // Master
  getMasterDataByWa: '/.netlify/functions/master-data',
  submitMasterForm: '/.netlify/functions/master-data',
  getDrafCvMaster: '/.netlify/functions/master-data',
  simpanUpdateMaster: '/.netlify/functions/master-data',

  // Config
  updateSysConfig: '/.netlify/functions/config',
  getRincianPresets: '/.netlify/functions/config',
  saveRincianPreset: '/.netlify/functions/config',
  deleteRincianPreset: '/.netlify/functions/config',

  // Schedule
  simpanJadwalBaru: '/.netlify/functions/schedule',
  hapusJadwal: '/.netlify/functions/schedule',
  tambahTugasBaru: '/.netlify/functions/schedule',
  setTugasStatus: '/.netlify/functions/schedule',
  hapusTugas: '/.netlify/functions/schedule',
  checkAndSendAgendaReminders: '/.netlify/functions/schedule',

  // Register
  getDaftarSiswaBaru: '/.netlify/functions/register',
  submitDaftarSiswa: '/.netlify/functions/register',
  getLinkSiswaBaru: '/.netlify/functions/register',
  generateFormBridge: '/.netlify/functions/register',
  generateLegacyMasterBridge: '/.netlify/functions/register',
  generateAiFormBridge: '/.netlify/functions/register',

  // Notify
  simpanWaTemplate: '/.netlify/functions/notify',
  hapusWaTemplate: '/.netlify/functions/notify',
  kirimSatuPesanFonnte: '/.netlify/functions/notify',
  kirimTawaranMassal: '/.netlify/functions/notify',
  getJobStatus: '/.netlify/functions/notify',

  // AI
  processAIChat: '/.netlify/functions/ai-chat',
  processSiswaAIChat: '/.netlify/functions/ai-chat',
  processAdminAIChat: '/.netlify/functions/ai-chat',
  processAiInterview: '/.netlify/functions/ai-chat',
  processUploadDoc: '/.netlify/functions/ai-chat',
  generateWawancaraModel: '/.netlify/functions/ai-chat',
  simpanHasilWawancara: '/.netlify/functions/ai-chat',
  selesaikanWawancara: '/.netlify/functions/ai-chat',
  getHasilWawancara: '/.netlify/functions/ai-chat',
  getAdminAiContext: '/.netlify/functions/ai-chat',
  buildAdminAiCandidateSummary: '/.netlify/functions/ai-chat',
  submitDataAsj: '/.netlify/functions/ai-chat',
  simpanDataTtdNaitei: '/.netlify/functions/ai-chat',
  saveSignature: '/.netlify/functions/ai-chat',

  // Ingestion — admin AI Copilot (parse CV/Excel/PDF lalu submitMasterForm).
  // Sebelum 2026-09-12 action ini TIDAK terdaftar di sini, sehingga jatuh ke
  // FALLBACK (catch-all bridge-links) — fitur yang benar-benar dipakai
  // menggantung pada catch-all. Sekarang dirutekan langsung ke fungsi ingest,
  // yang memang satu-satunya tempat library berat (pdf/xlsx/mammoth) dibundel.
  parseDokumenBiodata: '/.netlify/functions/ingest',

  // Diagnostics — getAppConfig (admin, diagnostik koneksi backend) dan
  // reportWebVital (telemetri Core Web Vitals, publik by design).
  // Keduanya dulu hanya terjangkau lewat catch-all bridge-links. reportWebVital
  // khususnya dipanggil klien pada SETIAP page view, jadi menaruhnya di fungsi
  // terberat repo itu keliru. Lihat netlify/functions/diagnostics.js.
  getAppConfig: '/.netlify/functions/diagnostics',
  reportWebVital: '/.netlify/functions/diagnostics',

  // Jobs
  simpanJobBaru: '/.netlify/functions/jobs',
  editLokerFull: '/.netlify/functions/jobs',
  ubahStatusJob: '/.netlify/functions/jobs',
  hapusJobData: '/.netlify/functions/jobs',
  updateTahapanDbJob: '/.netlify/functions/jobs',
  updateDokumenShare: '/.netlify/functions/jobs',
  tandaiGagalJob: '/.netlify/functions/jobs',

  // Docs
  shareData: '/.netlify/functions/files',
  submitFormPelamar: '/.netlify/functions/files',
  cekDataPelamar: '/.netlify/functions/files',
  getUploadUrls: '/.netlify/functions/files',
  isJobRequiresCv: '/.netlify/functions/files',
  submitApply: '/.netlify/functions/files',
  getExistingCandidateJsonByWa: '/.netlify/functions/files',
  simpanBiodataLengkap: '/.netlify/functions/files',
  simpanKandidatDanUpload: '/.netlify/functions/files',
  simpanBerkasTahapan: '/.netlify/functions/files',
  simpanRevisiKandidat: '/.netlify/functions/files',
  downloadJobDocs: '/.netlify/functions/files',
};

const FALLBACK = '/.netlify/functions/bridge-links';

/** Get the endpoint URL for a given action name */
export function getEndpoint(action: string): string {
  return SURFACE_ENDPOINTS[action] || FALLBACK;
}
