/**
 * surfaces/registry.ts — Central surface registry with lazy loading
 *
 * ⚠️ DO NOT RENAME THIS FILE TO `index.ts`. Netlify deploys a direct
 * subdirectory of the functions root as a function when it contains an entry
 * file named `index.*` or `<dirname>.*`. This module has no handler, so as
 * `surfaces/index.ts` it shipped as a Lambda-COMPATIBILITY-MODE function with no
 * handler — and in that mode the 4 KB per-function environment ceiling still
 * applies, which is what killed every deploy on 2026-09-12 even after all 21 real
 * entry points had migrated to `runtimeAPIVersion: 2`. `registry` is neither
 * `index` nor `surfaces`, so it is not deployed at all.
 * Enforced by check 3b in `scripts/ci/verify-function-entries.mjs`.
 *
 * Maps action names to surface registries. Uses dynamic imports so only
 * the surface matching the requested action is loaded, reducing cold-start
 * bundle size from 14 surfaces to 1.
 *
 * Performance impact: On a typical request, only 1 surface module (~30-80 lines)
 * is imported instead of all 14 (451 lines + their transitive dependencies).
 * This reduces cold-start time by ~40-60% on Netlify Functions.
 */

import { log } from '../_lib/kernel/log';
import { metrics } from '../_lib/kernel/metrics';

// ── Action → Surface mapping ────────────────────────────────────────────────
// This static map tells the dispatcher WHICH surface to lazy-load.
// The actual surface module is only imported when an action from that surface
// is requested.

type SurfaceLoader = () => Promise<Record<string, (payload: unknown[], sessionToken?: string) => Promise<unknown>>>;

const ACTION_TO_SURFACE: Record<string, SurfaceLoader> = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  checkAdminMaster:     () => import('./auth').then(m => m.AUTH_ACTIONS),
  checkAdminPersonal:   () => import('./auth').then(m => m.AUTH_ACTIONS),
  refreshAdminSession:  () => import('./auth').then(m => m.AUTH_ACTIONS),
  loginKandidat:        () => import('./auth').then(m => m.AUTH_ACTIONS),
  refreshKandidatSession:() => import('./auth').then(m => m.AUTH_ACTIONS),
  daftarKandidat:       () => import('./auth').then(m => m.AUTH_ACTIONS),
  gantiPasswordKandidat:() => import('./auth').then(m => m.AUTH_ACTIONS),
  registerFcmToken:     () => import('./auth').then(m => m.AUTH_ACTIONS),
  logout:               () => import('./auth').then(m => m.AUTH_ACTIONS),

  // ── Public ────────────────────────────────────────────────────────────────
  getAppData:      () => import('./public').then(m => m.PUBLIC_ACTIONS),
  getMonthlyReport:() => import('./public').then(m => m.PUBLIC_ACTIONS),

  // ── Candidates ────────────────────────────────────────────────────────────
  getCandidatesPage:     () => import('./candidates').then(m => m.CANDIDATE_ACTIONS),
  updateCatatanKandidat: () => import('./candidates').then(m => m.CANDIDATE_ACTIONS),
  updateKandidatSuper:   () => import('./candidates').then(m => m.CANDIDATE_ACTIONS),

  // ── Mail ──────────────────────────────────────────────────────────────────
  reviewForm:    () => import('./mail').then(m => m.MAIL_ACTIONS),
  approveForm:   () => import('./mail').then(m => m.MAIL_ACTIONS),
  rejectForm:    () => import('./mail').then(m => m.MAIL_ACTIONS),
  deleteForm:    () => import('./mail').then(m => m.MAIL_ACTIONS),
  hapusFormTerpilih: () => import('./mail').then(m => m.MAIL_ACTIONS),
  tandaiDibacaForm:() => import('./mail').then(m => m.MAIL_ACTIONS),

  // ── Master ────────────────────────────────────────────────────────────────
  getMasterDataByWa:  () => import('./master').then(m => m.MASTER_ACTIONS),
  submitMasterForm:   () => import('./master').then(m => m.MASTER_ACTIONS),
  getDrafCvMaster:    () => import('./master').then(m => m.MASTER_ACTIONS),
  simpanUpdateMaster: () => import('./master').then(m => m.MASTER_ACTIONS),

  // ── Schedule ──────────────────────────────────────────────────────────────
  simpanJadwalBaru:    () => import('./schedule').then(m => m.SCHEDULE_ACTIONS),
  hapusJadwal:         () => import('./schedule').then(m => m.SCHEDULE_ACTIONS),
  tambahTugasBaru:     () => import('./schedule').then(m => m.SCHEDULE_ACTIONS),
  setTugasStatus:      () => import('./schedule').then(m => m.SCHEDULE_ACTIONS),
  hapusTugas:          () => import('./schedule').then(m => m.SCHEDULE_ACTIONS),
  checkAndSendAgendaReminders: () => import('./schedule').then(m => m.SCHEDULE_ACTIONS),

  // ── Config ────────────────────────────────────────────────────────────────
  updateSysConfig:     () => import('./config').then(m => m.CONFIG_ACTIONS),
  getRincianPresets:   () => import('./config').then(m => m.CONFIG_ACTIONS),
  saveRincianPreset:   () => import('./config').then(m => m.CONFIG_ACTIONS),
  deleteRincianPreset: () => import('./config').then(m => m.CONFIG_ACTIONS),

  // ── Register ──────────────────────────────────────────────────────────────
  getDaftarSiswaBaru:         () => import('./register').then(m => m.REGISTER_ACTIONS),
  submitDaftarSiswa:          () => import('./register').then(m => m.REGISTER_ACTIONS),
  getLinkSiswaBaru:           () => import('./register').then(m => m.REGISTER_ACTIONS),
  generateFormBridge:         () => import('./register').then(m => m.REGISTER_ACTIONS),
  generateLegacyMasterBridge: () => import('./register').then(m => m.REGISTER_ACTIONS),
  generateAiFormBridge:       () => import('./register').then(m => m.REGISTER_ACTIONS),

  // ── Notify ────────────────────────────────────────────────────────────────
  simpanWaTemplate:   () => import('./notify').then(m => m.NOTIFY_ACTIONS),
  hapusWaTemplate:    () => import('./notify').then(m => m.NOTIFY_ACTIONS),
  kirimSatuPesanFonnte:() => import('./notify').then(m => m.NOTIFY_ACTIONS),
  kirimTawaranMassal: () => import('./notify').then(m => m.NOTIFY_ACTIONS),

  // ── AI ────────────────────────────────────────────────────────────────────
  processAIChat:              () => import('./ai').then(m => m.AI_ACTIONS),
  processSiswaAIChat:         () => import('./ai').then(m => m.AI_ACTIONS),
  processAdminAIChat:         () => import('./ai').then(m => m.AI_ACTIONS),
  processAiInterview:         () => import('./ai').then(m => m.AI_ACTIONS),
  // Job-status polling: ai-chat.js and notify.js both allow it; dispatch runs
  // the same kernel read (handleGetJobStatus) whichever entry was polled.
  getJobStatus:               () => import('./ai').then(m => m.AI_ACTIONS),
  processUploadDoc:           () => import('./ai').then(m => m.AI_ACTIONS),
  generateWawancaraModel:     () => import('./ai').then(m => m.AI_ACTIONS),
  simpanHasilWawancara:       () => import('./ai').then(m => m.AI_ACTIONS),
  selesaikanWawancara:        () => import('./ai').then(m => m.AI_ACTIONS),
  getHasilWawancara:          () => import('./ai').then(m => m.AI_ACTIONS),
  getAdminAiContext:          () => import('./ai').then(m => m.AI_ACTIONS),
  buildAdminAiCandidateSummary:() => import('./ai').then(m => m.AI_ACTIONS),
  submitDataAsj:              () => import('./ai').then(m => m.AI_ACTIONS),
  simpanDataTtdNaitei:        () => import('./ai').then(m => m.AI_ACTIONS),
  saveSignature:              () => import('./ai').then(m => m.AI_ACTIONS),

  // ── Ingest ────────────────────────────────────────────────────────────────
  parseDokumenBiodata: () => import('./ingest').then(m => m.INGEST_ACTIONS),

  // ── Jobs ──────────────────────────────────────────────────────────────────
  simpanJobBaru:      () => import('./jobs').then(m => m.JOB_ACTIONS),
  editLokerFull:      () => import('./jobs').then(m => m.JOB_ACTIONS),
  ubahStatusJob:      () => import('./jobs').then(m => m.JOB_ACTIONS),
  hapusJobData:       () => import('./jobs').then(m => m.JOB_ACTIONS),
  updateTahapanDbJob: () => import('./jobs').then(m => m.JOB_ACTIONS),
  updateDokumenShare: () => import('./jobs').then(m => m.JOB_ACTIONS),
  tandaiGagalJob:     () => import('./jobs').then(m => m.JOB_ACTIONS),

  // ── Diagnostics ───────────────────────────────────────────────────────────
  getAppConfig:      () => import('./diagnostics').then(m => m.DIAGNOSTICS_ACTIONS),
  reportWebVital:    () => import('./diagnostics').then(m => m.DIAGNOSTICS_ACTIONS),
  // getHealth is DELIBERATELY NOT registered here.
  //
  // Anything in this map is answerable by every entry point that reaches the
  // router. getHealth is reachable from exactly one place — the /health entry
  // point, behind a shared secret that fails closed — and adding it here would
  // re-open it on bridge-links as well, where the only guard left would be the
  // admin check inside contexts/diagnostics. The handler exists
  // (handleGetHealth, re-exported by contexts/diagnostics) so the wiring is
  // explicit and greppable; the omission here is the access control.
  //
  // If you are here to "fix" a missing-action error from a client: that client
  // is not supposed to call it. See netlify/functions/health.js.

  // ── Docs ──────────────────────────────────────────────────────────────────
  shareData:                    () => import('./docs').then(m => m.DOCS_ACTIONS),
  submitFormPelamar:            () => import('./docs').then(m => m.DOCS_ACTIONS),
  cekDataPelamar:               () => import('./docs').then(m => m.DOCS_ACTIONS),
  getUploadUrls:                () => import('./docs').then(m => m.DOCS_ACTIONS),
  isJobRequiresCv:              () => import('./docs').then(m => m.DOCS_ACTIONS),
  submitApply:                  () => import('./docs').then(m => m.DOCS_ACTIONS),
  getExistingCandidateJsonByWa: () => import('./docs').then(m => m.DOCS_ACTIONS),
  simpanBiodataLengkap:         () => import('./master').then(m => m.MASTER_ACTIONS),
  simpanKandidatDanUpload:      () => import('./docs').then(m => m.DOCS_ACTIONS),
  simpanBerkasTahapan:          () => import('./docs').then(m => m.DOCS_ACTIONS),
  simpanRevisiKandidat:         () => import('./docs').then(m => m.DOCS_ACTIONS),
  downloadJobDocs:              () => import('./docs').then(m => m.DOCS_ACTIONS),
};

// ── Cached surface modules (loaded once per process lifetime) ────────────────
// After the first dynamic import, we cache the surface actions map
// so subsequent requests for the same surface skip the import.

const surfaceCache = new Map<string, Record<string, (payload: unknown[], sessionToken?: string) => Promise<unknown>>>();

// P24 fix: Build stable surface name keys from the import path pattern.
// All loaders follow `() => import('./<name>').then(...)` — extract <name>
// to use as cache key instead of loader.toString() (which depends on bundler).
const ACTION_SURFACE_NAME = new Map<string, string>();
for (const [action, loader] of Object.entries(ACTION_TO_SURFACE)) {
  const src = loader.toString();
  const m = src.match(/import\(['"]\.\/([^'"\/]+)['"]\)/);
  if (m) ACTION_SURFACE_NAME.set(action, m[1]);
}

/**
 * Get the handler for an action name.
 * Uses lazy loading: only imports the surface module when first accessed,
 * then caches it for subsequent calls.
 */
export async function getSurfaceHandler(
  action: string,
): Promise<((payload: unknown[], sessionToken?: string) => Promise<unknown>) | null> {
  const loader = ACTION_TO_SURFACE[action];
  if (!loader) return null;

  const stop = metrics.histogram('surface.load', { action });

  // P24 fix: Use extracted surface name as cache key instead of loader.toString().
  const surfaceKey = ACTION_SURFACE_NAME.get(action) || action;
  let surfaceActions = surfaceCache.get(surfaceKey);
  if (!surfaceActions) {
    try {
      surfaceActions = await loader();
      surfaceCache.set(surfaceKey, surfaceActions);
    } catch (err) {
      log.error('surface.load.error', { action, err: String(err) });
      stop();
      return null;
    }
  }

  stop();
  return surfaceActions[action] ?? null;
}

/**
 * Legacy support: synchronous SURFACE_HANDLERS map for code that still
 * imports it directly. Uses lazy loading under the hood via Proxy.
 *
 * @deprecated Use getSurfaceHandler(action) instead for optimal cold start.
 */
export const SURFACE_HANDLERS: Record<string, (payload: unknown[], sessionToken?: string) => Promise<unknown>> = new Proxy(
  {} as Record<string, (payload: unknown[], sessionToken?: string) => Promise<unknown>>,
  {
    get(_target, prop: string) {
      if (typeof prop !== 'string') return undefined;
      // Return a handler that lazy-loads the surface on first call
      return async (payload: unknown[], sessionToken?: string) => {
        const handler = await getSurfaceHandler(prop);
        if (!handler) {
          return { success: false, message: `Action '${prop}' not found.` };
        }
        return handler(payload, sessionToken);
      };
    },
    has(_target, prop: string) {
      return typeof prop === 'string' && prop in ACTION_TO_SURFACE;
    },
    ownKeys() {
      return Reflect.ownKeys(ACTION_TO_SURFACE);
    },
    getOwnPropertyDescriptor(_target, prop: string) {
      if (typeof prop === 'string' && prop in ACTION_TO_SURFACE) {
        return { configurable: true, enumerable: true, value: _target[prop as any] };
      }
      return undefined;
    },
  },
);

/** Number of actions routed through surfaces */
export const SURFACE_ACTION_COUNT = Object.keys(ACTION_TO_SURFACE).length;
