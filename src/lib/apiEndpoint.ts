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
  // Added 2026-10-29 with session revocation: `logout` used to be a no-op that
  // nobody called, so it was never mapped and fell through to `bridge-links`
  // (the ~1.5 MB catch-all). The client now calls it on every logout to kill the
  // refresh token, and it belongs on the narrow auth surface like its siblings.
  logout: '/.netlify/functions/auth',
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
  /* Kotak masuk kandidat (2026-11-06) — entry `notify`, bukan `ai-chat`:
     action-nya membaca/menandai satu tabel kecil dan tidak menyentuh model. */
  getNotifikasiKandidat: '/.netlify/functions/notify',
  tandaiNotifikasiDibaca: '/.netlify/functions/notify',
  tandaiSemuaNotifikasiDibaca: '/.netlify/functions/notify',
  hapusNotifikasi: '/.netlify/functions/notify',
  getStatusNotifikasiAdmin: '/.netlify/functions/notify',

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
  getJawabanWawancaraAdmin: '/.netlify/functions/ai-chat',
  ekstrakBiodataDariTeks: '/.netlify/functions/ai-chat',
  getAdminAiContext: '/.netlify/functions/ai-chat',
  buildAdminAiCandidateSummary: '/.netlify/functions/ai-chat',
  submitDataAsj: '/.netlify/functions/ai-chat',
  simpanDataTtdNaitei: '/.netlify/functions/ai-chat',
  saveSignature: '/.netlify/functions/ai-chat',

  // Bank soal wawancara (mensetsu). Satu entri `ai-chat` yang sudah ada, BUKAN
  // fungsi baru: menambah entry function berarti menambah cold start + bobot
  // bundle yang harus di-baseline ulang di gate bundle:size.
  getBankWawancara: '/.netlify/functions/ai-chat',
  simpanJawabanWawancara: '/.netlify/functions/ai-chat',
  terjemahkanJawabanWawancara: '/.netlify/functions/ai-chat',
  // "Terjemahkan semua kolom" CV AI — menumpang `ai-chat` karena alasannya
  // sama dengan bank soal di atas: fungsi baru = cold start + bobot bundle.
  terjemahkanKolomCv: '/.netlify/functions/ai-chat',
  transkripsikanSuara: '/.netlify/functions/ai-chat',
  getLinkWawancara: '/.netlify/functions/ai-chat',

  // Bank kosakata (kotoba) — minigame hafalan, menumpang `ai-chat` dengan
  // alasan yang sama seperti bank soal wawancara di atas. Gerbangnya juga sama
  // (`tolakKecualiSiswa`), jadi menaruhnya di fungsi lain hanya menambah satu
  // cold start tanpa memisahkan apa pun.
  getBankKotoba: '/.netlify/functions/kotoba',

  // Bank kosakata bidang kerja (SSW) — 16 bidang 特定技能. Menumpang `ai-chat`
  // dengan alasan yang sama: penjaganya sama, dan fungsi terpisah hanya
  // menambah satu cold start tanpa memisahkan apa pun.
  getBankSsw: '/.netlify/functions/kotoba',

  // Bank soal matematika (/matematika) — menumpang `ai-chat` dengan alasan yang
  // sama seperti dua bank di atas: satu fungsi tambahan berarti satu cold start
  // tambahan dan bobot bundle yang harus di-baseline ulang di gate bundle:size.
  getBankMatematika: '/.netlify/functions/kotoba',
  /* Tes mandiri siswa (2026-11-06): MBTI & Tes Mata Pra-MCU. Menumpang entry
     `kotoba` — entry itu sudah memuat surface latihan siswa, dan tes ini
     beban kerjanya sama (satu query pendek). Fungsi baru = cold start baru +
     baseline bundle baru untuk empat action yang tidak pernah dipanggil
     bersamaan dengan chat. */
  getStatusTes: '/.netlify/functions/kotoba',
  simpanHasilTes: '/.netlify/functions/kotoba',
  getHasilTesAdmin: '/.netlify/functions/kotoba',
  setTesAktif: '/.netlify/functions/kotoba',
  /* Asesmen penalaran (2026-11-07). Sama seperti dua tes di atas: menumpang
     `kotoba`. Tanpa tiga baris ini semuanya jatuh ke catch-all `bridge-links`
     dan mengulang lewat 404 — fiturnya tetap jalan, jadi tidak ada yang
     menyadari sampai ada yang membuka tab Network. Gerbangnya di
     `action-registry.test.ts`. */
  getSoalIq: '/.netlify/functions/kotoba',
  simpanHasilIq: '/.netlify/functions/kotoba',
  resetHasilIq: '/.netlify/functions/kotoba',
  tulisMataKeCv: '/.netlify/functions/kotoba',
  /* Papan peringkat game (2026-11-04). Tanpa dua baris ini keduanya jatuh ke
     catch-all `bridge-links` dan mengulang lewat 404 — fiturnya tetap jalan,
     jadi tidak ada yang menyadari. Gerbangnya di `action-registry.test.ts`. */
  simpanSkorGame: '/.netlify/functions/ai-chat',
  getPapanSkor: '/.netlify/functions/ai-chat',

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
  downloadJobDocs: '/.netlify/functions/job-docs',
};

const FALLBACK = '/.netlify/functions/bridge-links';

/** Get the endpoint URL for a given action name */
export function getEndpoint(action: string): string {
  return SURFACE_ENDPOINTS[action] || FALLBACK;
}
